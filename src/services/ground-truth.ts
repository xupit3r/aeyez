import prisma from '../lib/db';
import { insertEmbedding } from '../lib/db';
import { getStorage } from '../lib/storage';
import Crawler from './crawler';
import ContentExtractor from './extractor';
import { createProvider } from './ai';
import { generateId, chunkText, countTokens } from '../lib/utils';
import { ExtractedClaim } from '../types';
import path from 'path';

export class GroundTruthService {
  private crawler: Crawler;
  private extractor: ContentExtractor;
  private storage = getStorage();

  constructor() {
    this.crawler = new Crawler();
    this.extractor = new ContentExtractor();
  }

  async crawlSite(siteId: string, maxPages: number = 50): Promise<void> {
    // Get site
    const site = await prisma.site.findUnique({
      where: { id: siteId },
    });

    if (!site) {
      throw new Error(`Site ${siteId} not found`);
    }

    // Update status
    await prisma.site.update({
      where: { id: siteId },
      data: { status: 'CRAWLING' },
    });

    try {
      await this.crawler.initialize();

      // Crawl pages
      const crawlResults = await this.crawler.crawlSite(site.domain, maxPages);

      // Save pages
      for (const result of crawlResults) {
        // Store HTML in file storage
        const htmlPath = `sites/${siteId}/pages/${generateId()}/raw.html`;
        await this.storage.put(htmlPath, result.rawHtml);

        // Save page record (upsert to handle re-runs)
        await prisma.page.upsert({
          where: {
            siteId_url: { siteId, url: result.url },
          },
          update: {
            title: result.title,
            httpStatus: result.httpStatus,
            etag: result.etag,
            lastModified: result.lastModified,
            rawHtmlPath: htmlPath,
            crawledAt: result.crawledAt,
          },
          create: {
            siteId,
            url: result.url,
            title: result.title,
            httpStatus: result.httpStatus,
            etag: result.etag,
            lastModified: result.lastModified,
            rawHtmlPath: htmlPath,
            crawledAt: result.crawledAt,
          },
        });
      }

      // Update site status
      await prisma.site.update({
        where: { id: siteId },
        data: {
          status: 'READY',
          lastCrawlAt: new Date(),
        },
      });

      console.log(`✓ Successfully crawled ${crawlResults.length} pages for ${site.domain}`);
    } catch (error) {
      // Update status on error
      await prisma.site.update({
        where: { id: siteId },
        data: { status: 'ERROR' },
      });

      throw error;
    } finally {
      await this.crawler.close();
    }
  }

  async extractContent(siteId: string): Promise<void> {
    console.log(`Extracting content for site ${siteId}...`);

    // Fetch site once for domain
    const site = await prisma.site.findUnique({ where: { id: siteId } });
    if (!site) {
      throw new Error(`Site ${siteId} not found`);
    }

    // Clean up old chunks (and their claims) for re-runs
    const oldChunks = await prisma.chunk.findMany({
      where: { page: { siteId } },
      select: { id: true },
    });
    if (oldChunks.length > 0) {
      const chunkIds = oldChunks.map(c => c.id);
      await prisma.claim.deleteMany({ where: { chunkId: { in: chunkIds } } });
      await prisma.chunk.deleteMany({ where: { id: { in: chunkIds } } });
      console.log(`Cleaned up ${oldChunks.length} old chunks and their claims`);
    }

    // Also clean up schema-level claims (chunkId: null) for re-runs
    await prisma.claim.deleteMany({
      where: {
        page: { siteId },
        chunkId: null,
        source: 'schema',
      },
    });

    // Get all pages for site
    const pages = await prisma.page.findMany({
      where: { siteId },
      orderBy: { crawledAt: 'asc' },
    });

    let processedCount = 0;

    for (const page of pages) {
      if (!page.rawHtmlPath) {
        console.log(`Skipping page ${page.id} - no HTML stored`);
        continue;
      }

      try {
        // Load HTML from storage
        const htmlBuffer = await this.storage.get(page.rawHtmlPath);
        const html = htmlBuffer.toString('utf-8');

        // Extract chunks
        const chunks = this.extractor.extractChunks(html, page.url);

        // Save chunks and collect IDs for embedding generation
        const savedChunks: Array<{ id: string; text: string }> = [];
        for (const chunkData of chunks) {
          const saved = await prisma.chunk.create({
            data: {
              pageId: page.id,
              text: chunkData.text,
              heading: chunkData.heading,
              sectionType: chunkData.sectionType,
              depth: chunkData.depth,
              tokenCount: chunkData.tokenCount,
              position: chunkData.position,
            },
          });
          savedChunks.push({ id: saved.id, text: chunkData.text });
        }

        // Generate and persist embeddings for chunks
        await this.generateAndPersistEmbeddings(savedChunks);

        // Extract structured data and generate claims from it
        const structuredData = this.extractor.extractStructuredData(html);
        const structuredClaims = this.extractClaimsFromStructuredData(structuredData, site.domain);

        // Save structured data claims (chunkId: null — schema claims don't belong to a specific chunk)
        for (const claim of structuredClaims) {
          await prisma.claim.create({
            data: {
              pageId: page.id,
              chunkId: null,
              statement: claim.statement,
              subject: claim.subject,
              predicate: claim.predicate,
              object: claim.object,
              claimType: claim.claimType,
              confidence: claim.confidence,
              source: claim.source,
            },
          });
        }

        if (structuredClaims.length > 0) {
          console.log(`  → ${structuredClaims.length} claims from structured data`);
        }

        // Update page extraction status
        await prisma.page.update({
          where: { id: page.id },
          data: {
            extractedAt: new Date(),
            extractionVersion: '1.0',
          },
        });

        processedCount++;
        console.log(`Processed ${processedCount}/${pages.length}: ${page.url}`);
      } catch (error) {
        console.error(`Failed to extract content from ${page.url}:`, error);
      }
    }

    console.log(`✓ Extracted content from ${processedCount} pages`);
  }

  async extractClaims(siteId: string): Promise<void> {
    console.log(`Extracting claims for site ${siteId}...`);

    // Fetch site for domain
    const site = await prisma.site.findUnique({ where: { id: siteId } });
    if (!site) {
      throw new Error(`Site ${siteId} not found`);
    }

    // Get all chunks for site
    const chunks = await prisma.chunk.findMany({
      where: {
        page: {
          siteId,
        },
      },
      include: {
        page: true,
      },
    });

    console.log(`Processing ${chunks.length} chunks...`);

    let claimCount = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      // Use LLM-based extraction with fallback to simple extraction
      const claims = await this.extractClaimsWithLLM(chunk.text, site.domain);

      for (const claim of claims) {
        await prisma.claim.create({
          data: {
            pageId: chunk.pageId,
            chunkId: chunk.id,
            statement: claim.statement,
            subject: claim.subject,
            predicate: claim.predicate,
            object: claim.object,
            claimType: claim.claimType,
            confidence: claim.confidence,
            source: claim.source,
          },
        });

        claimCount++;
      }

      if ((i + 1) % 10 === 0 || i === chunks.length - 1) {
        console.log(`  Processed ${i + 1}/${chunks.length} chunks (${claimCount} claims so far)`);
      }
    }

    console.log(`✓ Extracted ${claimCount} claims`);
  }

  private async extractClaimsWithLLM(chunkText: string, domain: string): Promise<ExtractedClaim[]> {
    // Guard against oversized chunks — split if >1500 tokens
    const tokenCount = countTokens(chunkText);
    if (tokenCount > 1500) {
      const subChunks = chunkText.length > 0 ? chunkText.split(/\n\n+/).filter(s => s.trim().length > 0) : [];
      if (subChunks.length > 1) {
        const allClaims: ExtractedClaim[] = [];
        for (const sub of subChunks) {
          const claims = await this.extractClaimsWithLLM(sub, domain);
          allClaims.push(...claims);
        }
        return allClaims;
      }
    }

    // Skip very short chunks
    if (chunkText.trim().length < 30) {
      return [];
    }

    // Set up provider (OpenAI with Google fallback)
    let provider = createProvider('openai');
    if (!provider.isAvailable()) {
      provider = createProvider('google');
    }

    if (!provider.isAvailable()) {
      console.log('No AI provider available for claim extraction, falling back to simple extraction');
      return this.extractSimpleClaims(chunkText);
    }

    const prompt = `Extract factual claims from the following text about ${domain}.
Return claims as a JSON array with: statement, subject, predicate, object, confidence (0-1).
Focus on verifiable facts: dates, numbers, names, features, capabilities.
Ignore opinions, marketing language, and vague statements.

Text:
${chunkText}

Return ONLY valid JSON. Example format:
[
  {
    "statement": "Company was founded in 2020",
    "subject": "Company",
    "predicate": "founded in",
    "object": "2020",
    "confidence": 0.95
  }
]`;

    const queryRequest = {
      messages: [
        {
          role: 'system' as const,
          content: 'You are a fact extraction assistant. Always respond with valid JSON only. Extract only verifiable factual claims.',
        },
        {
          role: 'user' as const,
          content: prompt,
        },
      ],
      temperature: 0.3,
      maxTokens: 2048,
    };

    let response;
    try {
      response = await provider.query(queryRequest);
    } catch (error: any) {
      // If OpenAI fails, try Google fallback
      if (provider.name === 'openai') {
        const fallback = createProvider('google');
        if (fallback.isAvailable()) {
          try {
            response = await fallback.query(queryRequest);
          } catch {
            return this.extractSimpleClaims(chunkText);
          }
        } else {
          return this.extractSimpleClaims(chunkText);
        }
      } else {
        return this.extractSimpleClaims(chunkText);
      }
    }

    // Parse response — strip markdown code blocks if present
    try {
      let jsonText = response.content;
      const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1];
      }

      const parsed = JSON.parse(jsonText);

      if (!Array.isArray(parsed)) {
        return this.extractSimpleClaims(chunkText);
      }

      return parsed.map((item: any) => ({
        statement: item.statement || '',
        subject: item.subject || undefined,
        predicate: item.predicate || undefined,
        object: item.object || undefined,
        claimType: 'fact' as const,
        confidence: typeof item.confidence === 'number' ? item.confidence : 0.8,
        source: 'llm' as const,
      })).filter((c: ExtractedClaim) => c.statement.length > 0);
    } catch {
      // JSON parse failure — fall back to simple extraction
      return this.extractSimpleClaims(chunkText);
    }
  }

  private extractSimpleClaims(text: string): ExtractedClaim[] {
    const claims: ExtractedClaim[] = [];
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);

    for (const sentence of sentences) {
      const trimmed = sentence.trim();

      // Skip very short sentences
      if (trimmed.length < 20) continue;

      // Fallback claims get lower confidence
      claims.push({
        statement: trimmed,
        claimType: 'fact',
        confidence: 0.5,
        source: 'nlp',
      });
    }

    return claims;
  }

  private extractClaimsFromStructuredData(
    structuredData: Record<string, any>,
    domain: string
  ): ExtractedClaim[] {
    const claims: ExtractedClaim[] = [];

    // Process JSON-LD
    if (structuredData.jsonLd && Array.isArray(structuredData.jsonLd)) {
      for (const item of structuredData.jsonLd) {
        this.extractJsonLdClaims(item, domain, claims);
      }
    }

    // Process OpenGraph meta
    if (structuredData.meta) {
      const meta = structuredData.meta;

      if (meta.title && meta.title.length > 5) {
        claims.push({
          statement: `The page title is "${meta.title}"`,
          subject: domain,
          predicate: 'has page title',
          object: meta.title,
          claimType: 'fact',
          confidence: 0.9,
          source: 'schema',
        });
      }

      if (meta.description && meta.description.length > 10) {
        claims.push({
          statement: `${domain} describes itself as: ${meta.description}`,
          subject: domain,
          predicate: 'describes itself as',
          object: meta.description,
          claimType: 'fact',
          confidence: 0.85,
          source: 'schema',
        });
      }
    }

    // Process microdata items
    if (structuredData.microdata && Array.isArray(structuredData.microdata)) {
      for (const item of structuredData.microdata) {
        const itemType = item.type || 'unknown';

        for (const [key, value] of Object.entries(item)) {
          if (key === 'type' || typeof value !== 'string' || (value as string).length < 2) continue;

          claims.push({
            statement: `${domain} has ${key}: ${value}`,
            subject: domain,
            predicate: `has ${key}`,
            object: value as string,
            claimType: 'fact',
            confidence: 0.85,
            source: 'schema',
          });
        }
      }
    }

    return claims;
  }

  private extractJsonLdClaims(
    item: any,
    domain: string,
    claims: ExtractedClaim[]
  ): void {
    if (!item || typeof item !== 'object') return;

    // Handle @graph arrays
    if (item['@graph'] && Array.isArray(item['@graph'])) {
      for (const subItem of item['@graph']) {
        this.extractJsonLdClaims(subItem, domain, claims);
      }
      return;
    }

    const type = item['@type'] || '';
    const name = item.name || item['@name'] || '';

    if (name) {
      claims.push({
        statement: `${domain} is named "${name}"`,
        subject: domain,
        predicate: 'is named',
        object: name,
        claimType: 'fact',
        confidence: 0.95,
        source: 'schema',
      });
    }

    if (item.description) {
      claims.push({
        statement: `${name || domain} is described as: ${item.description}`,
        subject: name || domain,
        predicate: 'is described as',
        object: item.description,
        claimType: 'fact',
        confidence: 0.9,
        source: 'schema',
      });
    }

    if (item.foundingDate) {
      claims.push({
        statement: `${name || domain} was founded on ${item.foundingDate}`,
        subject: name || domain,
        predicate: 'was founded on',
        object: item.foundingDate,
        claimType: 'fact',
        confidence: 0.95,
        source: 'schema',
      });
    }

    if (item.numberOfEmployees) {
      const count = typeof item.numberOfEmployees === 'object'
        ? item.numberOfEmployees.value || JSON.stringify(item.numberOfEmployees)
        : item.numberOfEmployees;
      claims.push({
        statement: `${name || domain} has ${count} employees`,
        subject: name || domain,
        predicate: 'has employees',
        object: String(count),
        claimType: 'fact',
        confidence: 0.9,
        source: 'schema',
      });
    }

    if (item.address) {
      const addr = typeof item.address === 'object'
        ? [item.address.streetAddress, item.address.addressLocality, item.address.addressRegion, item.address.postalCode]
            .filter(Boolean).join(', ')
        : item.address;
      if (addr) {
        claims.push({
          statement: `${name || domain} is located at ${addr}`,
          subject: name || domain,
          predicate: 'is located at',
          object: addr,
          claimType: 'fact',
          confidence: 0.9,
          source: 'schema',
        });
      }
    }

    // Extract product/offer info
    if (item.offers || item.hasOfferCatalog) {
      const offers = item.offers || item.hasOfferCatalog?.itemListElement || [];
      const offerList = Array.isArray(offers) ? offers : [offers];

      for (const offer of offerList) {
        if (offer.name) {
          claims.push({
            statement: `${name || domain} offers ${offer.name}`,
            subject: name || domain,
            predicate: 'offers',
            object: offer.name,
            claimType: 'fact',
            confidence: 0.9,
            source: 'schema',
          });
        }
        if (offer.price) {
          claims.push({
            statement: `${offer.name || 'Product'} is priced at ${offer.priceCurrency || '$'}${offer.price}`,
            subject: offer.name || 'Product',
            predicate: 'is priced at',
            object: `${offer.priceCurrency || '$'}${offer.price}`,
            claimType: 'fact',
            confidence: 0.9,
            source: 'schema',
          });
        }
      }
    }

    // Handle Product type
    if (type === 'Product' || type === 'Service') {
      if (item.brand) {
        const brandName = typeof item.brand === 'object' ? item.brand.name : item.brand;
        if (brandName) {
          claims.push({
            statement: `${name || 'Product'} is made by ${brandName}`,
            subject: name || 'Product',
            predicate: 'is made by',
            object: brandName,
            claimType: 'fact',
            confidence: 0.9,
            source: 'schema',
          });
        }
      }
    }
  }

  private async generateAndPersistEmbeddings(
    chunks: Array<{ id: string; text: string }>
  ): Promise<void> {
    // Use OpenAI only — text-embedding-3-small produces 1536d vectors matching the DB column
    const provider = createProvider('openai');
    if (!provider.isAvailable()) {
      console.log('  ⚠ OpenAI not available for embeddings — skipping (Google produces 768d, incompatible with schema)');
      return;
    }

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      try {
        const embedding = await provider.generateEmbedding(chunk.text);
        await insertEmbedding(chunk.id, 'text-embedding-3-small', embedding);
      } catch (error: any) {
        console.error(`  ⚠ Failed to generate embedding for chunk ${chunk.id}: ${error.message}`);
        // Continue with other chunks — one failure shouldn't stop the batch
      }

      if ((i + 1) % 10 === 0) {
        console.log(`  Embeddings: ${i + 1}/${chunks.length}`);
      }
    }
  }

  async buildGroundTruth(siteId: string, maxPages: number = 50): Promise<void> {
    console.log(`\n=== Building ground truth for site ${siteId} ===\n`);

    // Step 1: Crawl site
    console.log('Step 1: Crawling site...');
    await this.crawlSite(siteId, maxPages);

    // Step 2: Extract content
    console.log('\nStep 2: Extracting content...');
    await this.extractContent(siteId);

    // Step 3: Extract claims
    console.log('\nStep 3: Extracting claims...');
    await this.extractClaims(siteId);

    console.log('\n✓ Ground truth build complete!');
  }
}

export default GroundTruthService;
