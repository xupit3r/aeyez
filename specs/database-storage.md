# Database & Storage Layer - Technical Specification

## Overview
The storage layer provides persistent data storage for all system components using PostgreSQL with pgvector for embeddings, Redis for caching and job queues, and configurable file storage for large objects.

## Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| Primary Database | PostgreSQL 15+ | Relational data, JSONB for flexible structures |
| Vector Storage | pgvector extension | Embedding storage and similarity search |
| ORM | Prisma | Type-safe database access, migrations |
| Cache | Redis | Query caching, session storage |
| Job Queue | Redis (Bull/BullMQ) | Background job processing |
| File Storage | Local / S3 | Large files (HTML, exports, reports) |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Application Layer                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Prisma Client                          │   │
│  │         (Type-safe queries, transactions)                │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│         ┌────────────────────┼────────────────────┐             │
│         │                    │                    │             │
│         ▼                    ▼                    ▼             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐        │
│  │ PostgreSQL  │    │    Redis    │    │File Storage │        │
│  │ + pgvector  │    │Cache + Queue│    │ Local / S3  │        │
│  └─────────────┘    └─────────────┘    └─────────────┘        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### Entity Relationship Diagram

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│    sites    │───┬───│    pages    │───┬───│   chunks    │
└─────────────┘   │   └─────────────┘   │   └─────────────┘
                  │                     │          │
                  │                     │          │
                  │   ┌─────────────┐   │   ┌─────────────┐
                  ├───│   queries   │   │   │ embeddings  │
                  │   └─────────────┘   │   └─────────────┘
                  │          │          │
                  │          │          │
                  │   ┌─────────────┐   │   ┌─────────────┐
                  ├───│    runs     │───┼───│   claims    │
                  │   └─────────────┘   │   └─────────────┘
                  │          │          │
                  │          │          │
                  │   ┌─────────────┐   │
                  └───│  results    │───┘
                      └─────────────┘
```

---

### Core Tables

#### `sites`
Monitored websites.

```prisma
model Site {
  id          String   @id @default(cuid())
  domain      String   @unique
  name        String?
  
  // Configuration
  config      Json     // SiteConfig: topics, providers, query count
  
  // Status
  status      SiteStatus @default(PENDING)
  lastCrawlAt DateTime?
  lastRunAt   DateTime?
  
  // Timestamps
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  // Relations
  pages       Page[]
  queries     Query[]
  runs        Run[]
  
  @@index([domain])
  @@index([status])
}

enum SiteStatus {
  PENDING      // Not yet crawled
  CRAWLING     // Crawl in progress
  READY        // Ready for analysis
  ERROR        // Crawl failed
}
```

#### `pages`
Crawled pages from a site.

```prisma
model Page {
  id              String   @id @default(cuid())
  siteId          String
  site            Site     @relation(fields: [siteId], references: [id], onDelete: Cascade)
  
  // Page info
  url             String
  title           String?
  
  // Crawl metadata
  httpStatus      Int?
  etag            String?
  lastModified    String?
  sitemapPriority Float?
  
  // Content (stored in file storage, reference here)
  rawHtmlPath     String?  // Path to stored HTML file
  
  // Extraction status
  extractedAt     DateTime?
  extractionVersion String?
  
  // Timestamps
  crawledAt       DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  // Relations
  chunks          Chunk[]
  claims          Claim[]
  
  @@unique([siteId, url])
  @@index([siteId, crawledAt])
}
```

#### `chunks`
Content chunks extracted from pages.

```prisma
model Chunk {
  id          String   @id @default(cuid())
  pageId      String
  page        Page     @relation(fields: [pageId], references: [id], onDelete: Cascade)
  
  // Content
  text        String
  heading     String?
  sectionType String   // 'hero', 'content', 'sidebar', etc.
  depth       Int      // Heading hierarchy depth
  tokenCount  Int
  
  // Position in page
  position    Int      // Order within page
  
  // Timestamps
  createdAt   DateTime @default(now())
  
  // Relations
  embeddings  Embedding[]
  claims      Claim[]
  
  @@index([pageId, position])
}
```

#### `embeddings`
Vector embeddings for semantic search.

```prisma
model Embedding {
  id        String   @id @default(cuid())
  chunkId   String
  chunk     Chunk    @relation(fields: [chunkId], references: [id], onDelete: Cascade)
  
  // Embedding data
  modelName String   // e.g., 'text-embedding-3-small'
  vector    Unsupported("vector(1536)")  // pgvector type
  
  // Timestamps
  createdAt DateTime @default(now())
  
  @@unique([chunkId, modelName])
  @@index([chunkId])
}
```

**Note**: For pgvector, we'll need raw SQL for the HNSW index:
```sql
CREATE INDEX embeddings_vector_idx ON embeddings 
USING hnsw (vector vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```

#### `claims`
Extracted factual claims from content.

```prisma
model Claim {
  id          String   @id @default(cuid())
  pageId      String
  page        Page     @relation(fields: [pageId], references: [id], onDelete: Cascade)
  chunkId     String?
  chunk       Chunk?   @relation(fields: [chunkId], references: [id], onDelete: SetNull)
  
  // Claim content
  statement   String   // Full claim text
  subject     String?  // e.g., "Company"
  predicate   String?  // e.g., "founded in"
  object      String?  // e.g., "2020"
  
  // Metadata
  claimType   String   // 'fact', 'feature', 'statistic', etc.
  confidence  Float    // 0-1 extraction confidence
  source      String   // 'nlp', 'llm', 'schema'
  
  // Timestamps
  createdAt   DateTime @default(now())
  
  @@index([pageId])
  @@index([chunkId])
}
```

#### `queries`
Generated test queries for a site.

```prisma
model Query {
  id            String   @id @default(cuid())
  siteId        String
  site          Site     @relation(fields: [siteId], references: [id], onDelete: Cascade)
  
  // Query content
  canonical     String   // Primary query text
  variations    String[] // Alternative phrasings
  
  // Classification
  queryType     QueryType
  topic         String
  difficulty    Difficulty
  priorityScore Float
  
  // Expected answer
  expectedAnswer Json    // ExpectedAnswer object
  
  // Source tracking
  sourcePageUrls String[]
  sourceClaimIds String[]
  clusterId      String?
  
  // Status
  enabled       Boolean  @default(true)
  
  // Versioning
  groundTruthVersion String
  
  // Timestamps
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  // Relations
  results       Result[]
  
  @@index([siteId, enabled])
  @@index([siteId, queryType])
  @@index([priorityScore])
}

enum QueryType {
  INFORMATIONAL
  NAVIGATIONAL
  COMPARISON
  TRANSACTIONAL
}

enum Difficulty {
  EASY
  MEDIUM
  HARD
}
```

#### `runs`
Analysis run records.

```prisma
model Run {
  id          String    @id @default(cuid())
  siteId      String
  site        Site      @relation(fields: [siteId], references: [id], onDelete: Cascade)
  
  // Run configuration
  config      Json      // RunConfig: providers, query count, etc.
  
  // Status
  status      RunStatus @default(PENDING)
  progress    Int       @default(0)  // Completed queries
  total       Int       @default(0)  // Total queries
  
  // Timing
  startedAt   DateTime?
  completedAt DateTime?
  
  // Error tracking
  error       String?
  
  // Summary scores (denormalized for fast access)
  summaryScores Json?   // { accuracy: 78, completeness: 65, attribution: 42 }
  
  // Timestamps
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  
  // Relations
  results     Result[]
  
  @@index([siteId, createdAt])
  @@index([status])
}

enum RunStatus {
  PENDING
  RUNNING
  COMPLETED
  FAILED
  CANCELLED
}
```

#### `results`
Individual query analysis results.

```prisma
model Result {
  id          String   @id @default(cuid())
  runId       String
  run         Run      @relation(fields: [runId], references: [id], onDelete: Cascade)
  queryId     String
  query       Query    @relation(fields: [queryId], references: [id], onDelete: Cascade)
  
  // AI Response
  provider    String   // 'openai', 'google'
  model       String   // 'gpt-4o-mini', 'gemini-1.5-flash'
  response    String   // Full response text
  
  // Token usage
  inputTokens  Int
  outputTokens Int
  
  // Cost
  cost        Float    // USD
  
  // Latency
  latencyMs   Int
  
  // Scores
  accuracyScore     Float
  completenessScore Float
  attributionScore  Float
  
  // Detailed feedback (stored as JSON for flexibility)
  feedback    Json     // ClaimFeedback, HighlightFeedback
  
  // Timestamps
  respondedAt DateTime
  analyzedAt  DateTime @default(now())
  
  @@unique([runId, queryId, provider])
  @@index([runId])
  @@index([queryId])
  @@index([accuracyScore])
  @@index([completenessScore])
  @@index([attributionScore])
}
```

---

### Configuration & Settings

#### `settings`
User/application settings.

```prisma
model Settings {
  id        String   @id @default("default")
  
  // API Keys (consider encryption in production)
  providers Json     // { openai: { apiKey: "..." }, google: { apiKey: "..." } }
  
  // Defaults
  defaults  Json     // { queriesPerRun: 50, providers: ["openai", "google"] }
  
  // Notifications
  notifications Json // { email: "...", alertThreshold: 10 }
  
  // Appearance
  theme     String   @default("system")
  
  // Timestamps
  updatedAt DateTime @updatedAt
}
```

---

### Denormalized Views

For performance on read-heavy dashboard queries, we'll use PostgreSQL materialized views:

#### `site_score_summary`
```sql
CREATE MATERIALIZED VIEW site_score_summary AS
SELECT 
  s.id AS site_id,
  s.domain,
  r.id AS latest_run_id,
  r.completed_at AS last_run_at,
  AVG(res.accuracy_score) AS avg_accuracy,
  AVG(res.completeness_score) AS avg_completeness,
  AVG(res.attribution_score) AS avg_attribution,
  COUNT(res.id) AS query_count
FROM sites s
JOIN runs r ON r.site_id = s.id AND r.status = 'COMPLETED'
JOIN results res ON res.run_id = r.id
WHERE r.id = (
  SELECT id FROM runs 
  WHERE site_id = s.id AND status = 'COMPLETED'
  ORDER BY completed_at DESC LIMIT 1
)
GROUP BY s.id, s.domain, r.id, r.completed_at;

CREATE UNIQUE INDEX ON site_score_summary(site_id);
```

Refresh strategy: After each completed run.

---

## Indexes

### Relational Indexes

```sql
-- Sites
CREATE INDEX idx_sites_domain ON sites(domain);
CREATE INDEX idx_sites_status ON sites(status);

-- Pages
CREATE INDEX idx_pages_site_crawled ON pages(site_id, crawled_at);
CREATE UNIQUE INDEX idx_pages_site_url ON pages(site_id, url);

-- Chunks
CREATE INDEX idx_chunks_page_position ON chunks(page_id, position);

-- Embeddings (vector index created separately)
CREATE INDEX idx_embeddings_chunk ON embeddings(chunk_id);

-- Claims
CREATE INDEX idx_claims_page ON claims(page_id);
CREATE INDEX idx_claims_chunk ON claims(chunk_id);

-- Queries
CREATE INDEX idx_queries_site_enabled ON queries(site_id, enabled);
CREATE INDEX idx_queries_site_type ON queries(site_id, query_type);
CREATE INDEX idx_queries_priority ON queries(priority_score DESC);

-- Runs
CREATE INDEX idx_runs_site_created ON runs(site_id, created_at DESC);
CREATE INDEX idx_runs_status ON runs(status);

-- Results
CREATE INDEX idx_results_run ON results(run_id);
CREATE INDEX idx_results_query ON results(query_id);
CREATE INDEX idx_results_accuracy ON results(accuracy_score) WHERE accuracy_score < 50;
CREATE INDEX idx_results_completeness ON results(completeness_score) WHERE completeness_score < 50;
CREATE INDEX idx_results_attribution ON results(attribution_score) WHERE attribution_score < 50;
```

### Vector Index (pgvector)

```sql
-- HNSW index for fast approximate nearest neighbor search
CREATE INDEX embeddings_vector_hnsw_idx ON embeddings 
USING hnsw (vector vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- For exact search on smaller subsets (optional)
CREATE INDEX embeddings_vector_ivfflat_idx ON embeddings 
USING ivfflat (vector vector_cosine_ops)
WITH (lists = 100);
```

### GIN Indexes for JSONB

```sql
-- For querying inside JSON fields
CREATE INDEX idx_queries_expected_answer ON queries USING GIN (expected_answer);
CREATE INDEX idx_results_feedback ON results USING GIN (feedback);
CREATE INDEX idx_site_config ON sites USING GIN (config);
```

---

## Redis Schema

### Cache Keys

```
# Site data cache
cache:site:{siteId}                    -> Site JSON (TTL: 5min)
cache:site:{domain}:id                 -> Site ID (TTL: 1hr)

# Ground truth cache
cache:groundtruth:{siteId}             -> Compressed chunks + claims (TTL: 1hr)

# Query cache
cache:queries:{siteId}                 -> Query list JSON (TTL: 5min)

# Results cache
cache:results:{runId}                  -> Results summary (TTL: 5min)
cache:results:{runId}:{queryId}        -> Single result (TTL: 5min)

# Dashboard aggregates
cache:dashboard:{siteId}               -> Dashboard data (TTL: 1min)
```

### Job Queue Keys

```
# Queue names
queue:crawl                            -> Crawl jobs
queue:extract                          -> Content extraction jobs
queue:generate                         -> Query generation jobs
queue:analyze                          -> Analysis jobs

# Job data
job:{jobId}                            -> Job details and status

# Rate limiting
ratelimit:provider:{provider}:requests -> Request count (sliding window)
ratelimit:provider:{provider}:tokens   -> Token count (sliding window)
```

### WebSocket / Real-time

```
# Run progress
progress:run:{runId}                   -> { completed, total, current }

# Pub/Sub channels
channel:run:{runId}                    -> Run progress events
channel:site:{siteId}                  -> Site update events
```

---

## File Storage

### Storage Interface

```typescript
interface FileStorage {
  // Store file
  put(key: string, content: Buffer | string, options?: PutOptions): Promise<string>;
  
  // Retrieve file
  get(key: string): Promise<Buffer>;
  
  // Check existence
  exists(key: string): Promise<boolean>;
  
  // Delete file
  delete(key: string): Promise<void>;
  
  // Get signed URL (for S3)
  getSignedUrl(key: string, expiresIn?: number): Promise<string>;
}

interface PutOptions {
  contentType?: string;
  metadata?: Record<string, string>;
}
```

### File Organization

```
storage/
├── sites/
│   └── {siteId}/
│       ├── pages/
│       │   └── {pageId}/
│       │       └── raw.html           # Crawled HTML
│       └── exports/
│           └── {exportId}.{format}    # Generated exports
├── runs/
│   └── {runId}/
│       └── report.pdf                 # Generated reports
└── temp/
    └── {jobId}/                       # Temporary processing files
```

### Storage Implementations

```typescript
// Local filesystem (development)
class LocalFileStorage implements FileStorage {
  constructor(private basePath: string) {}
  // ... implementation
}

// S3 (production)
class S3FileStorage implements FileStorage {
  constructor(private config: S3Config) {}
  // ... implementation
}

// Factory
function createFileStorage(config: StorageConfig): FileStorage {
  if (config.type === 's3') {
    return new S3FileStorage(config.s3);
  }
  return new LocalFileStorage(config.localPath);
}
```

---

## Prisma Configuration

### `schema.prisma`

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [pgvector(map: "vector")]
}

// ... models defined above
```

### Migrations

```bash
# Create migration
npx prisma migrate dev --name init

# Apply migration
npx prisma migrate deploy

# Generate client
npx prisma generate
```

### Custom pgvector Operations

Since Prisma doesn't fully support pgvector, we'll use raw queries for vector operations:

```typescript
// Vector similarity search
async function findSimilarChunks(
  siteId: string,
  queryVector: number[],
  limit: number = 10
): Promise<ChunkWithSimilarity[]> {
  return prisma.$queryRaw`
    SELECT 
      c.*,
      1 - (e.vector <=> ${queryVector}::vector) AS similarity
    FROM chunks c
    JOIN pages p ON p.id = c.page_id
    JOIN embeddings e ON e.chunk_id = c.id
    WHERE p.site_id = ${siteId}
    ORDER BY e.vector <=> ${queryVector}::vector
    LIMIT ${limit}
  `;
}

// Insert embedding
async function insertEmbedding(
  chunkId: string,
  modelName: string,
  vector: number[]
): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO embeddings (id, chunk_id, model_name, vector, created_at)
    VALUES (${cuid()}, ${chunkId}, ${modelName}, ${vector}::vector, NOW())
    ON CONFLICT (chunk_id, model_name) 
    DO UPDATE SET vector = ${vector}::vector, created_at = NOW()
  `;
}
```

---

## Configuration

```typescript
interface DatabaseConfig {
  // PostgreSQL
  postgres: {
    url: string;                    // Connection string
    maxConnections?: number;        // Default: 10
    connectionTimeout?: number;     // Default: 10000ms
  };
  
  // Redis
  redis: {
    url: string;                    // Connection string
    maxRetries?: number;            // Default: 3
    keyPrefix?: string;             // Default: 'aeyez:'
  };
  
  // File storage
  storage: {
    type: 'local' | 's3';
    localPath?: string;             // For local: './storage'
    s3?: {
      bucket: string;
      region: string;
      accessKeyId: string;
      secretAccessKey: string;
    };
  };
  
  // Cache settings
  cache: {
    defaultTtl: number;             // Default: 300 (5 minutes)
    enabled: boolean;               // Default: true
  };
}
```

---

## Data Lifecycle

### Creation Flow

```
Site Created
    │
    ▼
Crawl Job Queued
    │
    ▼
Pages Created (with HTML stored in file storage)
    │
    ▼
Chunks Extracted
    │
    ▼
Embeddings Generated
    │
    ▼
Claims Extracted
    │
    ▼
Queries Generated
    │
    ▼
Site Status → READY
```

### Analysis Flow

```
Run Created (PENDING)
    │
    ▼
Run Started (RUNNING)
    │
    ▼
For each Query:
    │
    ├── Query AI Provider
    │
    ├── Store Result
    │
    └── Update Progress (Redis + WebSocket)
    │
    ▼
Calculate Summary Scores
    │
    ▼
Refresh Materialized Views
    │
    ▼
Run Status → COMPLETED
```

### Deletion Flow (Hard Delete)

```
Site Deletion Requested
    │
    ▼
Delete from file storage (pages/, exports/)
    │
    ▼
Cascade delete in database:
    Site → Pages → Chunks → Embeddings
         → Claims
         → Queries → Results
         → Runs → Results
    │
    ▼
Clear Redis cache keys
    │
    ▼
Refresh materialized views
```

---

## Backup Strategy

Manual backups via pg_dump:

```bash
# Full backup
pg_dump -Fc $DATABASE_URL > backup_$(date +%Y%m%d).dump

# Restore
pg_restore -d $DATABASE_URL backup_20260130.dump

# File storage backup (if using local)
tar -czf storage_$(date +%Y%m%d).tar.gz ./storage/
```

For S3 storage, enable versioning on the bucket.

---

## Performance Considerations

### Query Optimization

1. **Use materialized views** for dashboard aggregates
2. **Partial indexes** for filtered queries (poor scores)
3. **Covering indexes** for common SELECT patterns
4. **Connection pooling** via PgBouncer for high concurrency

### Vector Search Optimization

1. **HNSW parameters**: Tune `m` and `ef_construction` based on dataset size
2. **Pre-filter** by site_id before vector search
3. **Batch embeddings** to reduce API calls

### Caching Strategy

1. **Cache dashboard data** aggressively (1-5 min TTL)
2. **Cache ground truth** during analysis runs
3. **Invalidate** on data changes (not time-based for critical data)

---

## Dependencies

```json
{
  "dependencies": {
    "@prisma/client": "^5.10.0",
    "prisma": "^5.10.0",
    "ioredis": "^5.3.0",
    "bullmq": "^5.1.0",
    "@aws-sdk/client-s3": "^3.500.0",
    "cuid": "^3.0.0"
  }
}
```

---

## Open Questions

- [ ] Should we implement read replicas for scaling?
- [ ] Do we need audit logging for data changes?
- [ ] Should embeddings support multiple dimensions (for different models)?
- [ ] Implement data archival for very old runs?

---

*Spec Version: 1.0*
*Created: 2026-01-30*
*Status: Draft*
