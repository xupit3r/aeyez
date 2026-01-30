#!/usr/bin/env node

import { Command } from 'commander';
import prisma from '../lib/db';
import GroundTruthService from '../services/ground-truth';
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
      console.log(`  Last crawl: ${site.lastCrawlAt?.toISOString() || 'Never'}`);
      console.log('');
    } catch (error) {
      console.error('Error fetching stats:', (error as Error).message);
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
