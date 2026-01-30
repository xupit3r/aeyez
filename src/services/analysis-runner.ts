import prisma from '../lib/db';
import { createProvider, getRateLimiter } from './ai';
import ResponseAnalyzer from './response-analyzer';
import { RunConfig } from '../types';

export class AnalysisRunner {
  private analyzer = new ResponseAnalyzer();

  async runAnalysis(
    siteId: string,
    providers: ('openai' | 'google')[] = ['openai', 'google'],
    queryCount: number = 50
  ): Promise<string> {
    console.log(`\n=== Starting analysis run for site ${siteId} ===\n`);

    // Get site
    const site = await prisma.site.findUnique({
      where: { id: siteId },
    });

    if (!site) {
      throw new Error(`Site ${siteId} not found`);
    }

    // Get queries for this site
    const queries = await prisma.query.findMany({
      where: {
        siteId,
        enabled: true,
      },
      orderBy: { priorityScore: 'desc' },
      take: queryCount,
    });

    if (queries.length === 0) {
      throw new Error('No queries found. Run query generation first.');
    }

    console.log(`Site: ${site.domain}`);
    console.log(`Queries: ${queries.length}`);
    console.log(`Providers: ${providers.join(', ')}`);

    // Create run record
    const config: RunConfig = {
      providers,
      queryCount: queries.length,
      temperature: 0.7,
      maxRetries: 3,
    };

    const run = await prisma.run.create({
      data: {
        siteId,
        config: config as any,
        status: 'PENDING',
        total: queries.length * providers.length,
        progress: 0,
      },
    });

    console.log(`Run ID: ${run.id}\n`);

    // Update status to running
    await prisma.run.update({
      where: { id: run.id },
      data: {
        status: 'RUNNING',
        startedAt: new Date(),
      },
    });

    try {
      let completedCount = 0;
      const totalQueries = queries.length * providers.length;

      // Process each query with each provider
      for (const query of queries) {
        for (const providerName of providers) {
          try {
            console.log(`[${completedCount + 1}/${totalQueries}] ${providerName}: ${query.canonical}`);

            // Get provider
            const provider = createProvider(providerName);

            if (!provider.isAvailable()) {
              console.log(`  ⚠ ${providerName} not available, skipping`);
              completedCount++;
              continue;
            }

            // Rate limiting
            const rateLimiter = getRateLimiter(providerName);
            await rateLimiter.waitIfNeeded(1000);

            // Query AI
            const response = await provider.query({
              messages: [
                {
                  role: 'user',
                  content: query.canonical,
                },
              ],
              temperature: 0.7,
              maxTokens: 2048,
            });

            console.log(`  Response: ${response.content.substring(0, 100)}...`);
            console.log(`  Tokens: ${response.inputTokens}/${response.outputTokens}, Cost: $${response.cost.toFixed(4)}`);

            // Analyze response
            const expectedAnswer = query.expectedAnswer as any;
            const scores = await this.analyzer.analyzeResponse(
              query.canonical,
              expectedAnswer,
              response.content,
              site.domain
            );

            console.log(`  Scores: Accuracy=${scores.accuracy.score}%, Completeness=${scores.completeness.score}%, Attribution=${scores.attribution.score}%`);

            // Save result
            await prisma.result.create({
              data: {
                runId: run.id,
                queryId: query.id,
                provider: response.provider,
                model: response.model,
                response: response.content,
                inputTokens: response.inputTokens,
                outputTokens: response.outputTokens,
                cost: response.cost,
                latencyMs: response.latencyMs,
                accuracyScore: scores.accuracy.score,
                completenessScore: scores.completeness.score,
                attributionScore: scores.attribution.score,
                feedback: {
                  accuracy: scores.accuracy.details,
                  completeness: scores.completeness.details,
                  attribution: scores.attribution.details,
                } as any,
                respondedAt: response.respondedAt,
              },
            });

            completedCount++;

            // Update progress
            await prisma.run.update({
              where: { id: run.id },
              data: { progress: completedCount },
            });
          } catch (error) {
            console.error(`  ✗ Error:`, (error as Error).message);
            completedCount++;
          }
        }
      }

      // Calculate summary scores
      const results = await prisma.result.findMany({
        where: { runId: run.id },
      });

      const summaryScores = {
        accuracy: Math.round(
          results.reduce((sum, r) => sum + r.accuracyScore, 0) / results.length
        ),
        completeness: Math.round(
          results.reduce((sum, r) => sum + r.completenessScore, 0) / results.length
        ),
        attribution: Math.round(
          results.reduce((sum, r) => sum + r.attributionScore, 0) / results.length
        ),
      };

      // Update run with completion status
      await prisma.run.update({
        where: { id: run.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          summaryScores: summaryScores as any,
        },
      });

      // Update site lastRunAt
      await prisma.site.update({
        where: { id: siteId },
        data: { lastRunAt: new Date() },
      });

      console.log(`\n✓ Analysis complete!`);
      console.log(`\nSummary Scores:`);
      console.log(`  Accuracy: ${summaryScores.accuracy}%`);
      console.log(`  Completeness: ${summaryScores.completeness}%`);
      console.log(`  Attribution: ${summaryScores.attribution}%`);

      return run.id;
    } catch (error) {
      // Mark run as failed
      await prisma.run.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          error: (error as Error).message,
        },
      });

      throw error;
    }
  }

  async getRunResults(runId: string): Promise<any> {
    const run = await prisma.run.findUnique({
      where: { id: runId },
      include: {
        site: true,
        results: {
          include: {
            query: true,
          },
          orderBy: {
            accuracyScore: 'asc', // Show worst results first
          },
        },
      },
    });

    return run;
  }
}

export default AnalysisRunner;
