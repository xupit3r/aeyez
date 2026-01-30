import prisma from '../lib/db';
import { getStorage } from '../lib/storage';
import Crawler from './crawler';
import ContentExtractor from './extractor';
import { generateId } from '../lib/utils';
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

        // Save chunks
        for (const chunkData of chunks) {
          await prisma.chunk.create({
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
        }

        // Extract structured data
        const structuredData = this.extractor.extractStructuredData(html);

        // TODO: Process structured data for claims

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

    // Simple rule-based claim extraction
    // TODO: Enhance with NLP or LLM-based extraction

    let claimCount = 0;

    for (const chunk of chunks) {
      const claims = this.extractSimpleClaims(chunk.text);

      for (const claim of claims) {
        await prisma.claim.create({
          data: {
            pageId: chunk.pageId,
            chunkId: chunk.id,
            statement: claim.statement,
            subject: claim.subject,
            predicate: claim.predicate,
            object: claim.object,
            claimType: 'fact',
            confidence: 0.8,
            source: 'nlp',
          },
        });

        claimCount++;
      }
    }

    console.log(`✓ Extracted ${claimCount} claims`);
  }

  private extractSimpleClaims(text: string): Array<{
    statement: string;
    subject?: string;
    predicate?: string;
    object?: string;
  }> {
    const claims: Array<any> = [];
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);

    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      
      // Skip very short sentences
      if (trimmed.length < 20) continue;

      // For now, treat each sentence as a claim
      claims.push({
        statement: trimmed,
      });
    }

    return claims;
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
