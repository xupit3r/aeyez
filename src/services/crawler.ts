import { chromium, Browser, Page } from 'playwright';
import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import { CrawlResult } from '../types';
import { normalizeUrl, sleep, extractDomain } from '../lib/utils';
import config from '../lib/config';

export class Crawler {
  private browser: Browser | null = null;

  async initialize(): Promise<void> {
    if (!this.browser) {
      this.browser = await chromium.launch({ headless: true });
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async fetchSitemap(domain: string): Promise<string[]> {
    const sitemapUrls = [
      `https://${domain}/sitemap.xml`,
      `https://${domain}/sitemap_index.xml`,
      `http://${domain}/sitemap.xml`,
    ];

    for (const sitemapUrl of sitemapUrls) {
      try {
        const response = await axios.get(sitemapUrl, {
          timeout: config.crawl.timeout,
          headers: {
            'User-Agent': config.crawl.userAgent,
          },
        });

        const parsed = await parseStringPromise(response.data);
        const urls: string[] = [];

        // Handle sitemap index
        if (parsed.sitemapindex) {
          const sitemaps = parsed.sitemapindex.sitemap || [];
          for (const sitemap of sitemaps) {
            const sitemapLoc = sitemap.loc?.[0];
            if (sitemapLoc) {
              const childUrls = await this.fetchSitemap(sitemapLoc);
              urls.push(...childUrls);
            }
          }
        }

        // Handle urlset
        if (parsed.urlset) {
          const urlEntries = parsed.urlset.url || [];
          for (const entry of urlEntries) {
            const loc = entry.loc?.[0];
            const priority = entry.priority?.[0];
            if (loc) {
              urls.push(normalizeUrl(loc));
            }
          }
        }

        return urls;
      } catch (error) {
        console.log(`Failed to fetch ${sitemapUrl}:`, (error as Error).message);
        continue;
      }
    }

    // Fallback: just return the homepage
    return [`https://${domain}`];
  }

  async crawlPage(url: string): Promise<CrawlResult> {
    if (!this.browser) {
      await this.initialize();
    }

    const page: Page = await this.browser!.newPage({
      userAgent: config.crawl.userAgent,
    });

    try {
      const response = await page.goto(url, {
        timeout: config.crawl.timeout,
        waitUntil: 'networkidle',
      });

      if (!response) {
        throw new Error('No response from page');
      }

      const title = await page.title();
      const rawHtml = await page.content();
      const httpStatus = response.status();
      const headers = response.headers();

      return {
        url: normalizeUrl(url),
        title,
        httpStatus,
        etag: headers['etag'],
        lastModified: headers['last-modified'],
        rawHtml,
        crawledAt: new Date(),
      };
    } finally {
      await page.close();
    }
  }

  async crawlSite(domain: string, maxPages: number = 50): Promise<CrawlResult[]> {
    console.log(`Starting crawl of ${domain}...`);

    // Get URLs from sitemap
    const urls = await this.fetchSitemap(domain);
    console.log(`Found ${urls.length} URLs in sitemap`);

    // Limit to maxPages
    const urlsToCrawl = urls.slice(0, maxPages);
    const results: CrawlResult[] = [];

    for (let i = 0; i < urlsToCrawl.length; i++) {
      const url = urlsToCrawl[i];
      console.log(`Crawling ${i + 1}/${urlsToCrawl.length}: ${url}`);

      try {
        const result = await this.crawlPage(url);
        results.push(result);
        
        // Rate limiting
        await sleep(1000);
      } catch (error) {
        console.error(`Failed to crawl ${url}:`, (error as Error).message);
      }
    }

    console.log(`Completed crawl: ${results.length}/${urlsToCrawl.length} pages`);
    return results;
  }
}

export default Crawler;
