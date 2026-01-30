## Implementation Status

⚠️ **Partially Implemented** - Crawler and chunker work, but claim extraction is a placeholder

See source code:
- Database schema: `prisma/schema.prisma`
- Services: `src/services/crawler.ts`, `src/services/extractor.ts`, `src/services/ground-truth.ts`
- CLI: `src/cli/index.ts`
- Types: `src/types/index.ts`

### Implementation Review (2026-01-30)

**What works:**
- Sitemap parsing with recursive index handling
- Playwright-based crawling with JS rendering, rate limiting, timeout handling
- HTML → chunk extraction via Cheerio with heading hierarchy and section typing
- JSON-LD, OpenGraph, and meta tag extraction
- Raw HTML stored to local filesystem
- Site status tracking (PENDING → CRAWLING → READY/ERROR)

**Critical gap — Claim extraction:**
The spec calls for a hybrid NLP + LLM fact extractor producing structured subject/predicate/object triples with confidence scores. The current implementation (`ground-truth.ts`) simply splits text on sentence delimiters (`.!?`) and treats each sentence >20 characters as a "claim" with no subject/predicate/object parsing, no confidence scoring, and no claim type classification. This is the single highest-impact gap in the system because both completeness scoring and accuracy scoring depend on claim quality. Garbage claims produce garbage scores.

**Recommended fix:** Use the existing OpenAI integration to send chunks with the LLM extraction prompt already defined in this spec (Section 4). The `QueryGeneratorService` already follows this pattern and can serve as a template. Start with LLM-only extraction; add NLP entity extraction later if cost becomes a concern.

**Structured data extracted but unused:**
The extractor pulls JSON-LD, OpenGraph, and meta tags from pages, but this data is never saved to the database or used for claim generation. This is low-hanging fruit — schema.org data often contains precise, structured facts (founding date, employee count, product names) that would produce high-quality claims without LLM costs.

**Embeddings not generated during extraction:**
The spec describes an embedding step after chunking. The Prisma schema and raw SQL helpers exist (`insertEmbedding`, `findSimilarChunks` in `db.ts`), but they are never called. Embeddings are generated on-the-fly during analysis and discarded. Persisting them would avoid redundant API calls across runs.

**Token counting is approximate:**
Token count uses `text.length / 4`, which can be off by 30-50% depending on content. Not critical for MVP but worth noting for cost estimates.

---

# Ground Truth Extractor - Technical Specification

## Overview
The Ground Truth Extractor is responsible for crawling a website and establishing a structured knowledge base of "what is true" about the site. This ground truth is used to evaluate AI agent responses for accuracy, completeness, and attribution.

## Responsibilities
1. Crawl website pages based on sitemap.xml
2. Render JavaScript to capture dynamically-loaded content
3. Extract content in multiple layers (raw → chunks → structured)
4. Store extracted data in document store + vector index
5. Maintain freshness through smart change detection

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Ground Truth Extractor                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   Sitemap    │───▶│   Crawler    │───▶│   Content    │      │
│  │   Parser     │    │  (Playwright) │    │   Extractor  │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│                                                  │               │
│                                                  ▼               │
│                      ┌───────────────────────────────────────┐  │
│                      │         Extraction Pipeline           │  │
│                      │  ┌─────────┐ ┌─────────┐ ┌─────────┐ │  │
│                      │  │  Raw    │▶│ Chunker │▶│  Fact   │ │  │
│                      │  │  Text   │ │         │ │Extractor│ │  │
│                      │  └─────────┘ └─────────┘ └─────────┘ │  │
│                      └───────────────────────────────────────┘  │
│                                                  │               │
│                                                  ▼               │
│                      ┌───────────────────────────────────────┐  │
│                      │           Storage Layer               │  │
│                      │  ┌─────────────┐  ┌─────────────┐    │  │
│                      │  │  Document   │  │   Vector    │    │  │
│                      │  │   Store     │  │   Index     │    │  │
│                      │  └─────────────┘  └─────────────┘    │  │
│                      └───────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Components

### 1. Sitemap Parser
**Purpose**: Discover pages to crawl from sitemap.xml

**Input**: 
- Domain URL (e.g., `https://example.com`)

**Output**:
- List of page URLs to crawl
- Page metadata (lastmod, changefreq, priority)

**Behavior**:
- Fetch `/sitemap.xml` and `/sitemap_index.xml`
- Handle nested/split sitemaps
- Respect `<lastmod>` for change detection
- Fall back to robots.txt sitemap reference if direct fetch fails

**Interface**:
```typescript
interface SitemapEntry {
  url: string;
  lastModified?: Date;
  changeFrequency?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: number;
}

interface SitemapParser {
  parse(domain: string): Promise<SitemapEntry[]>;
}
```

---

### 2. Crawler (Playwright-based)
**Purpose**: Fetch and render web pages with full JavaScript execution

**Input**:
- URL to crawl
- Crawl configuration (timeout, wait conditions)

**Output**:
- Rendered HTML content
- HTTP metadata (status, headers, ETag, Last-Modified)
- Page metadata (title, meta tags, structured data)

**Behavior**:
- Use Playwright with Chromium for JS rendering
- Wait for network idle or configurable selector
- Extract HTTP caching headers for smart refresh
- Handle common anti-bot measures gracefully
- Respect robots.txt directives
- Rate limit requests to avoid overloading target sites

**Interface**:
```typescript
interface CrawlResult {
  url: string;
  html: string;
  httpStatus: number;
  etag?: string;
  lastModified?: string;
  contentType: string;
  crawledAt: Date;
}

interface CrawlOptions {
  timeout?: number;          // Default: 30000ms
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
  waitForSelector?: string;  // Optional: wait for specific element
  userAgent?: string;
}

interface Crawler {
  crawl(url: string, options?: CrawlOptions): Promise<CrawlResult>;
  crawlBatch(urls: string[], options?: CrawlOptions): AsyncGenerator<CrawlResult>;
}
```

---

### 3. Content Extractor
**Purpose**: Parse HTML and extract content in multiple layers

**Input**:
- Raw HTML from crawler

**Output**:
- Extracted content at three layers

**Layers**:

#### Layer 1: Raw Text
- Strip HTML tags, scripts, styles
- Preserve basic structure (paragraphs, headings)
- Extract visible text content

#### Layer 2: Semantic Chunks
- Split content into meaningful sections
- Preserve hierarchy (H1 → H2 → paragraphs)
- Include metadata per chunk (heading, section type)
- Target chunk size: 500-1000 tokens (configurable)

#### Layer 3: Structured Data
- Schema.org / JSON-LD extraction
- Open Graph metadata
- Meta tags (description, keywords)
- Detected entities (via NLP)
- Extracted claims/facts (via LLM)

**Interface**:
```typescript
interface RawContent {
  text: string;
  wordCount: number;
}

interface ContentChunk {
  id: string;
  text: string;
  heading?: string;
  sectionType: 'hero' | 'navigation' | 'content' | 'sidebar' | 'footer' | 'other';
  depth: number;           // Heading hierarchy depth
  tokenCount: number;
}

interface StructuredData {
  schemaOrg: object[];     // JSON-LD objects
  openGraph: Record<string, string>;
  metaTags: Record<string, string>;
  entities: Entity[];
  claims: Claim[];
}

interface Entity {
  text: string;
  type: 'organization' | 'person' | 'product' | 'location' | 'date' | 'money' | 'other';
  confidence: number;
}

interface Claim {
  statement: string;       // e.g., "Company was founded in 2020"
  subject: string;         // e.g., "Company"
  predicate: string;       // e.g., "founded in"
  object: string;          // e.g., "2020"
  sourceChunkId: string;   // Reference to originating chunk
  confidence: number;
}

interface ExtractedContent {
  url: string;
  raw: RawContent;
  chunks: ContentChunk[];
  structured: StructuredData;
}

interface ContentExtractor {
  extract(html: string, url: string): Promise<ExtractedContent>;
}
```

---

### 4. Fact Extractor (Hybrid NLP + LLM)
**Purpose**: Extract structured claims/facts from content chunks

**Approach**:
1. **NLP Layer** (fast, cheap): Named Entity Recognition for entities
   - Use compromise.js or similar lightweight NLP library
   - Extract: organizations, people, products, locations, dates, numbers

2. **LLM Layer** (slower, more accurate): Complex claim extraction
   - Send chunks to LLM with extraction prompt
   - Extract factual claims as subject-predicate-object triples
   - Assign confidence scores

**LLM Prompt Template**:
```
Extract factual claims from the following text about {domain}.
Return claims as JSON array with: statement, subject, predicate, object, confidence (0-1).
Focus on verifiable facts: dates, numbers, names, features, capabilities.
Ignore opinions, marketing language, and vague statements.

Text:
{chunk_text}
```

**Interface**:
```typescript
interface FactExtractor {
  extractEntities(text: string): Promise<Entity[]>;
  extractClaims(chunk: ContentChunk, domain: string): Promise<Claim[]>;
}
```

---

### 5. Embedding Provider (Abstracted)
**Purpose**: Generate vector embeddings for semantic search

**Interface**:
```typescript
interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  readonly dimensions: number;
  readonly modelName: string;
}

// Implementations
class OpenAIEmbedding implements EmbeddingProvider { }
class LocalEmbedding implements EmbeddingProvider { }  // sentence-transformers via ONNX
```

**Default**: OpenAI `text-embedding-3-small` (1536 dimensions)
**Fallback**: Local model for cost-sensitive or offline use

---

### 6. Storage Layer
**Purpose**: Persist extracted content and enable retrieval

#### Document Store
- Store full extracted content per page
- Enable queries by URL, domain, date
- Track extraction history for change detection

**Schema**:
```typescript
interface StoredPage {
  id: string;
  domain: string;
  url: string;
  crawledAt: Date;
  httpEtag?: string;
  httpLastModified?: string;
  raw: RawContent;
  chunks: ContentChunk[];
  structured: StructuredData;
  extractionVersion: string;  // Track schema changes
}
```

#### Vector Index
- Store embeddings for each chunk
- Enable semantic similarity search
- Support filtering by domain/URL

**Schema**:
```typescript
interface VectorEntry {
  id: string;              // Matches chunk ID
  pageId: string;          // Reference to StoredPage
  domain: string;
  embedding: number[];
  text: string;            // For hybrid search
}
```

**Technology Options**:
- Document Store: PostgreSQL (JSONB) or MongoDB
- Vector Index: pgvector (PostgreSQL extension) or Qdrant
- MVP: SQLite + sqlite-vss for simplicity

---

## Smart Refresh Logic

**Purpose**: Minimize re-crawling by detecting unchanged pages

**Algorithm**:
```
for each page in sitemap:
  if page not in store:
    crawl and extract (new page)
  else:
    fetch HEAD request for page
    if ETag differs OR Last-Modified newer OR sitemap lastmod newer:
      crawl and extract (changed page)
    else:
      skip (unchanged)
```

**Interface**:
```typescript
interface RefreshResult {
  url: string;
  action: 'crawled' | 'skipped' | 'failed';
  reason?: string;
}

interface GroundTruthExtractor {
  extractSite(domain: string): AsyncGenerator<RefreshResult>;
  extractPage(url: string, force?: boolean): Promise<ExtractedContent>;
  getGroundTruth(domain: string): Promise<StoredPage[]>;
}
```

---

## Configuration

```typescript
interface ExtractorConfig {
  // Crawler settings
  crawl: {
    concurrency: number;       // Default: 3
    timeout: number;           // Default: 30000ms
    respectRobotsTxt: boolean; // Default: true
    rateLimitMs: number;       // Default: 1000ms between requests
  };
  
  // Extraction settings
  extraction: {
    chunkSize: number;         // Target tokens per chunk, default: 750
    chunkOverlap: number;      // Overlap between chunks, default: 100
    extractClaims: boolean;    // Use LLM for claims, default: true
  };
  
  // Storage settings
  storage: {
    documentStore: 'postgres' | 'mongodb' | 'sqlite';
    vectorStore: 'pgvector' | 'qdrant' | 'sqlite-vss';
    connectionString: string;
  };
  
  // Provider settings
  providers: {
    llm: 'openai' | 'anthropic';
    embedding: 'openai' | 'local';
    llmModel?: string;         // Default: gpt-4o-mini
    embeddingModel?: string;   // Default: text-embedding-3-small
  };
}
```

---

## Error Handling

| Error Type | Handling |
|------------|----------|
| Sitemap not found | Fall back to homepage crawl, warn user |
| Page 404/5xx | Log error, continue with other pages |
| JavaScript timeout | Return partial content, flag for review |
| Rate limited (429) | Exponential backoff, retry |
| LLM API error | Skip claim extraction for page, use cached |
| Storage error | Fail extraction, surface to user |

---

## Metrics & Logging

Track:
- Pages crawled per domain
- Extraction time per page
- LLM tokens used (cost tracking)
- Cache hit rate (skipped vs crawled)
- Error rate by type

---

## Dependencies

```json
{
  "dependencies": {
    "playwright": "^1.40.0",
    "cheerio": "^1.0.0",
    "compromise": "^14.0.0",
    "openai": "^4.0.0",
    "@anthropic-ai/sdk": "^0.10.0"
  }
}
```

---

## Open Questions

- [ ] How to handle authentication-required pages?
- [ ] Should we support custom extraction rules per domain?
- [ ] How to handle very large sites (>10k pages)?
- [ ] PDF/document extraction in scope?

---

*Spec Version: 1.0*
*Created: 2026-01-30*
*Status: Draft*
