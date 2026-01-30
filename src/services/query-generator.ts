import prisma from '../lib/db';
import { createProvider } from './ai';
import { ExpectedAnswer } from '../types';
import { generateId } from '../lib/utils';

export class QueryGeneratorService {
  async generateQueries(siteId: string, queryCount: number = 50): Promise<void> {
    console.log(`\n=== Generating queries for site ${siteId} ===\n`);

    // Get site and its ground truth
    const site = await prisma.site.findUnique({
      where: { id: siteId },
      include: {
        pages: {
          include: {
            chunks: true,
            claims: true,
          },
        },
      },
    });

    if (!site) {
      throw new Error(`Site ${siteId} not found`);
    }

    if (site.pages.length === 0) {
      throw new Error(`Site has no crawled pages. Run crawl first.`);
    }

    console.log(`Site: ${site.domain}`);
    console.log(`Pages: ${site.pages.length}`);

    // Extract key topics from chunks
    const allChunks = site.pages.flatMap(p => p.chunks);
    const allClaims = site.pages.flatMap(p => p.claims);

    console.log(`Chunks: ${allChunks.length}`);
    console.log(`Claims: ${allClaims.length}`);

    // Get site config
    const config = site.config as any;
    const topics = config.topics || ['general'];

    // Generate queries using AI
    const provider = createProvider('openai'); // Use OpenAI for query generation

    if (!provider.isAvailable()) {
      throw new Error('OpenAI provider not available. Set OPENAI_API_KEY in .env');
    }

    // Sample content for context
    const sampleContent = allChunks
      .slice(0, 10)
      .map(c => `${c.heading || 'Content'}: ${c.text.substring(0, 200)}...`)
      .join('\n\n');

    const sampleClaims = allClaims
      .slice(0, 20)
      .map(c => c.statement)
      .join('\n- ');

    const prompt = `You are helping to generate test queries for analyzing how AI systems represent a website.

Website: ${site.domain}
Topics: ${topics.join(', ')}

Sample Content:
${sampleContent}

Sample Claims:
- ${sampleClaims}

Generate ${queryCount} diverse queries that users might ask about this site. For each query, provide:
1. The query text
2. Query type (INFORMATIONAL, NAVIGATIONAL, COMPARISON, or TRANSACTIONAL)
3. Difficulty (EASY, MEDIUM, or HARD)
4. 3-5 key claims that should appear in a good answer
5. Must-include keywords

Return as a JSON array with this structure:
[
  {
    "query": "What is Example Company?",
    "type": "INFORMATIONAL",
    "difficulty": "EASY",
    "topic": "company",
    "keyClaims": ["claim1", "claim2", "claim3"],
    "keywords": ["keyword1", "keyword2"]
  }
]

Focus on queries that test accuracy, completeness, and attribution.`;

    console.log('\nGenerating queries with AI...');

    const response = await provider.query({
      messages: [
        {
          role: 'system',
          content: 'You are a query generation assistant. Always respond with valid JSON only.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.8,
      maxTokens: 4096,
    });

    console.log(`AI response received (${response.inputTokens} input, ${response.outputTokens} output tokens)`);
    console.log(`Cost: $${response.cost.toFixed(4)}`);

    // Parse response
    let generatedQueries: any[];
    try {
      // Try to extract JSON from markdown code blocks
      let jsonText = response.content;
      const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1];
      }
      generatedQueries = JSON.parse(jsonText);
    } catch (error) {
      console.error('Failed to parse AI response as JSON');
      console.error('Response:', response.content);
      throw error;
    }

    // Save queries to database
    console.log(`\nSaving ${generatedQueries.length} queries...`);

    for (const q of generatedQueries) {
      const expectedAnswer: ExpectedAnswer = {
        keyClaims: q.keyClaims || [],
        keywords: q.keywords || [],
        mustInclude: q.mustInclude || [],
        shouldInclude: q.shouldInclude || [],
      };

      await prisma.query.create({
        data: {
          siteId,
          canonical: q.query,
          variations: [],
          queryType: q.type || 'INFORMATIONAL',
          topic: q.topic || 'general',
          difficulty: q.difficulty || 'MEDIUM',
          priorityScore: this.calculatePriority(q.difficulty || 'MEDIUM'),
          expectedAnswer: expectedAnswer as any,
          sourcePageUrls: [],
          sourceClaimIds: [],
          groundTruthVersion: '1.0',
        },
      });
    }

    console.log(`✓ Generated and saved ${generatedQueries.length} queries`);
  }

  private calculatePriority(difficulty: string): number {
    switch (difficulty) {
      case 'EASY':
        return 1.0;
      case 'MEDIUM':
        return 0.7;
      case 'HARD':
        return 0.4;
      default:
        return 0.5;
    }
  }
}

export default QueryGeneratorService;
