import * as cheerio from 'cheerio';
import { ContentChunk } from '../types';
import { cleanText, countTokens } from '../lib/utils';

export class ContentExtractor {
  extractChunks(html: string, url: string): ContentChunk[] {
    const $ = cheerio.load(html);
    const chunks: ContentChunk[] = [];
    let position = 0;

    // Remove unwanted elements
    $('script, style, nav, header, footer, iframe, noscript').remove();

    // Extract main content
    const mainContent = $('main, article, [role="main"], .content, #content').first();
    const contentRoot = mainContent.length > 0 ? mainContent : $('body');

    // Process headings and their content
    contentRoot.find('h1, h2, h3, h4, h5, h6').each((i, elem) => {
      const heading = $(elem);
      const headingText = cleanText(heading.text());
      const depth = parseInt(elem.tagName[1]);

      // Get content until next heading of same or higher level
      const content: string[] = [];
      let next = heading.next();

      while (next.length > 0) {
        const tagName = next.prop('tagName')?.toLowerCase();
        
        // Stop at next heading of same or higher level
        if (tagName?.match(/^h[1-6]$/)) {
          const nextDepth = parseInt(tagName[1]);
          if (nextDepth <= depth) {
            break;
          }
        }

        const text = cleanText(next.text());
        if (text.length > 0) {
          content.push(text);
        }

        next = next.next();
      }

      const fullText = content.join('\n');
      
      if (fullText.length > 0) {
        chunks.push({
          text: fullText,
          heading: headingText,
          sectionType: this.getSectionType(depth),
          depth,
          tokenCount: countTokens(fullText),
          position: position++,
        });
      }
    });

    // Extract hero/intro content (before first heading)
    const heroElements: string[] = [];
    contentRoot.children().each((i, elem) => {
      const tagName = $(elem).prop('tagName')?.toLowerCase();
      
      // Stop at first heading
      if (tagName?.match(/^h[1-6]$/)) {
        return false;
      }

      const text = cleanText($(elem).text());
      if (text.length > 0) {
        heroElements.push(text);
      }
    });

    if (heroElements.length > 0) {
      chunks.unshift({
        text: heroElements.join('\n'),
        heading: undefined,
        sectionType: 'hero',
        depth: 0,
        tokenCount: countTokens(heroElements.join('\n')),
        position: -1,
      });
    }

    // Re-number positions
    chunks.forEach((chunk, idx) => {
      chunk.position = idx;
    });

    return chunks;
  }

  private getSectionType(depth: number): string {
    if (depth === 1) return 'title';
    if (depth === 2) return 'section';
    if (depth === 3) return 'subsection';
    return 'content';
  }

  extractStructuredData(html: string): Record<string, any> {
    const $ = cheerio.load(html);
    const structuredData: Record<string, any> = {};

    // Extract JSON-LD
    $('script[type="application/ld+json"]').each((i, elem) => {
      try {
        const data = JSON.parse($(elem).html() || '{}');
        structuredData.jsonLd = structuredData.jsonLd || [];
        structuredData.jsonLd.push(data);
      } catch {
        // Ignore parse errors
      }
    });

    // Extract meta tags
    structuredData.meta = {
      title: $('meta[property="og:title"]').attr('content') || $('title').text(),
      description: 
        $('meta[property="og:description"]').attr('content') ||
        $('meta[name="description"]').attr('content'),
      image: $('meta[property="og:image"]').attr('content'),
      type: $('meta[property="og:type"]').attr('content'),
      url: $('meta[property="og:url"]').attr('content'),
    };

    // Extract schema.org microdata
    const microdataItems: any[] = [];
    $('[itemscope]').each((i, elem) => {
      const item: Record<string, any> = {};
      item.type = $(elem).attr('itemtype');
      
      $(elem).find('[itemprop]').each((j, prop) => {
        const propName = $(prop).attr('itemprop');
        const propValue = $(prop).attr('content') || $(prop).text();
        if (propName) {
          item[propName] = cleanText(propValue);
        }
      });
      
      microdataItems.push(item);
    });

    if (microdataItems.length > 0) {
      structuredData.microdata = microdataItems;
    }

    return structuredData;
  }
}

export default ContentExtractor;
