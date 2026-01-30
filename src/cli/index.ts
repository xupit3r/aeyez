#!/usr/bin/env node

import { Command } from 'commander';
import prisma from '../lib/db';
import GroundTruthService from '../services/ground-truth';
import QueryGeneratorService from '../services/query-generator';
import AnalysisRunner from '../services/analysis-runner';
import { SiteConfig } from '../types';

const program = new Command();

program
  .name('aeyez')
  .description('AI Site Interpretation Analyzer')
  .version('1.0.0');

// Site management commands
program
  .command('site:add <domain>')
  .description('Add a new site to monitor')
  .option('-n, --name <name>', 'Site name')
  .option('-t, --topics <topics>', 'Comma-separated topics', 'general')
  .action(async (domain: string, options) => {
    try {
      const config: SiteConfig = {
        topics: options.topics.split(',').map((t: string) => t.trim()),
        providers: ['openai', 'google'],
        queriesPerRun: 50,
      };

      const site = await prisma.site.create({
        data: {
          domain: domain.replace(/^https?:\/\//, '').replace(/\/$/, ''),
          name: options.name || domain,
          config: config as any,
          status: 'PENDING',
        },
      });

      console.log(`✓ Added site: ${site.domain} (ID: ${site.id})`);
      console.log(`  Name: ${site.name}`);
      console.log(`  Topics: ${config.topics.join(', ')}`);
    } catch (error) {
      console.error('Error adding site:', (error as Error).message);
      process.exit(1);
    } finally {
      await prisma.$disconnect();
    }
  });

program
  .command('site:list')
  .description('List all monitored sites')
  .action(async () => {
    try {
      const sites = await prisma.site.findMany({
        orderBy: { createdAt: 'desc' },
      });

      if (sites.length === 0) {
        console.log('No sites found. Add a site with: aeyez site:add <domain>');
        return;
      }

      console.log('\nMonitored Sites:\n');
      for (const site of sites) {
        console.log(`  ${site.domain}`);
        console.log(`    ID: ${site.id}`);
        console.log(`    Status: ${site.status}`);
        console.log(`    Last crawl: ${site.lastCrawlAt?.toISOString() || 'Never'}`);
        console.log('');
      }
    } catch (error) {
      console.error('Error listing sites:', (error as Error).message);
      process.exit(1);
    } finally {
      await prisma.$disconnect();
    }
  });

// Crawl commands
program
  .command('crawl <siteId>')
  .description('Crawl a site and build ground truth')
  .option('-p, --pages <number>', 'Max pages to crawl', '50')
  .action(async (siteId: string, options) => {
    try {
      const maxPages = parseInt(options.pages, 10);
      const service = new GroundTruthService();

      await service.buildGroundTruth(siteId, maxPages);
    } catch (error) {
      console.error('Error during crawl:', (error as Error).message);
      process.exit(1);
    } finally {
      await prisma.$disconnect();
    }
  });

// Query generation
program
  .command('generate-queries <siteId>')
  .description('Generate test queries for a site')
  .option('-c, --count <number>', 'Number of queries to generate', '50')
  .action(async (siteId: string, options) => {
    try {
      const count = parseInt(options.count, 10);
      const service = new QueryGeneratorService();

      await service.generateQueries(siteId, count);
    } catch (error) {
      console.error('Error generating queries:', (error as Error).message);
      process.exit(1);
    } finally {
      await prisma.$disconnect();
    }
  });

// Analysis
program
  .command('analyze <siteId>')
  .description('Run AI analysis on a site')
  .option('-p, --providers <providers>', 'Comma-separated provider names', 'openai,google')
  .option('-c, --count <number>', 'Number of queries to analyze', '50')
  .action(async (siteId: string, options) => {
    try {
      const providers = options.providers.split(',').map((p: string) => p.trim()) as ('openai' | 'google')[];
      const count = parseInt(options.count, 10);
      
      const runner = new AnalysisRunner();
      await runner.runAnalysis(siteId, providers, count);
    } catch (error) {
      console.error('Error during analysis:', (error as Error).message);
      process.exit(1);
    } finally {
      await prisma.$disconnect();
    }
  });

// Results
program
  .command('results <runId>')
  .description('Show results from an analysis run')
  .option('--json', 'Output as JSON')
  .action(async (runId: string, options) => {
    try {
      const runner = new AnalysisRunner();
      const run = await runner.getRunResults(runId);

      if (!run) {
        console.error(`Run ${runId} not found`);
        process.exit(1);
      }

      if (options.json) {
        console.log(JSON.stringify(run, null, 2));
        return;
      }

      console.log(`\nRun: ${run.id}`);
      console.log(`Site: ${run.site.domain}`);
      console.log(`Status: ${run.status}`);
      console.log(`Started: ${run.startedAt?.toISOString()}`);
      console.log(`Completed: ${run.completedAt?.toISOString()}`);
      console.log(`\nSummary Scores:`);
      const scores = run.summaryScores as any;
      if (scores) {
        console.log(`  Accuracy: ${scores.accuracy}%`);
        console.log(`  Completeness: ${scores.completeness}%`);
        console.log(`  Attribution: ${scores.attribution}%`);
      }

      console.log(`\nResults (${run.results.length}):`);
      console.log(`Showing worst performers:\n`);
      
      for (const result of run.results.slice(0, 10)) {
        console.log(`  Query: ${result.query.canonical}`);
        console.log(`  Provider: ${result.provider}`);
        console.log(`  Scores: A=${result.accuracyScore}% C=${result.completenessScore}% Attr=${result.attributionScore}%`);
        console.log('');
      }
    } catch (error) {
      console.error('Error fetching results:', (error as Error).message);
      process.exit(1);
    } finally {
      await prisma.$disconnect();
    }
  });

// Stats command
program
  .command('stats <siteId>')
  .description('Show statistics for a site')
  .action(async (siteId: string) => {
    try {
      const site = await prisma.site.findUnique({
        where: { id: siteId },
        include: {
          pages: true,
          queries: true,
          runs: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      if (!site) {
        console.error(`Site ${siteId} not found`);
        process.exit(1);
      }

      const chunkCount = await prisma.chunk.count({
        where: {
          page: {
            siteId,
          },
        },
      });

      const claimCount = await prisma.claim.count({
        where: {
          page: {
            siteId,
          },
        },
      });

      console.log(`\n${site.domain} Statistics:\n`);
      console.log(`  Status: ${site.status}`);
      console.log(`  Pages: ${site.pages.length}`);
      console.log(`  Chunks: ${chunkCount}`);
      console.log(`  Claims: ${claimCount}`);
      console.log(`  Queries: ${site.queries.length}`);
      console.log(`  Last crawl: ${site.lastCrawlAt?.toISOString() || 'Never'}`);
      console.log(`  Last run: ${site.lastRunAt?.toISOString() || 'Never'}`);

      if (site.runs.length > 0) {
        const latestRun = site.runs[0];
        const scores = latestRun.summaryScores as any;
        if (scores) {
          console.log(`\n  Latest Scores:`);
          console.log(`    Accuracy: ${scores.accuracy}%`);
          console.log(`    Completeness: ${scores.completeness}%`);
          console.log(`    Attribution: ${scores.attribution}%`);
        }
      }
      console.log('');
    } catch (error) {
      console.error('Error fetching stats:', (error as Error).message);
      process.exit(1);
    } finally {
      await prisma.$disconnect();
    }
  });

// Pipeline command (all-in-one)
program
  .command('pipeline <siteId>')
  .description('Run the full pipeline: crawl → generate queries → analyze')
  .option('-p, --pages <number>', 'Max pages to crawl', '50')
  .option('-q, --queries <number>', 'Number of queries to generate', '50')
  .option('--providers <providers>', 'Comma-separated provider names', 'openai,google')
  .action(async (siteId: string, options) => {
    try {
      const maxPages = parseInt(options.pages, 10);
      const queryCount = parseInt(options.queries, 10);
      const providers = options.providers.split(',').map((p: string) => p.trim()) as ('openai' | 'google')[];

      console.log('='.repeat(60));
      console.log('AEYEZ ANALYSIS PIPELINE');
      console.log('='.repeat(60));

      // Step 1: Crawl
      console.log('\n[1/3] Crawling site...\n');
      const groundTruthService = new GroundTruthService();
      await groundTruthService.buildGroundTruth(siteId, maxPages);

      // Step 2: Generate queries
      console.log('\n[2/3] Generating queries...\n');
      const queryService = new QueryGeneratorService();
      await queryService.generateQueries(siteId, queryCount);

      // Step 3: Analyze
      console.log('\n[3/3] Running analysis...\n');
      const runner = new AnalysisRunner();
      const runId = await runner.runAnalysis(siteId, providers, queryCount);

      console.log('\n' + '='.repeat(60));
      console.log('PIPELINE COMPLETE');
      console.log('='.repeat(60));
      console.log(`\nView results with: npm run dev results ${runId}`);
    } catch (error) {
      console.error('Pipeline error:', (error as Error).message);
      process.exit(1);
    } finally {
      await prisma.$disconnect();
    }
  });

// Database commands
program
  .command('db:setup')
  .description('Set up the database (run migrations)')
  .action(async () => {
    console.log('To set up the database, run:');
    console.log('  npm run db:migrate');
  });

program.parse(process.argv);
