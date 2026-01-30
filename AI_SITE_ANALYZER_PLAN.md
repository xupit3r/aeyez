# AI Site Interpretation Analyzer - Technical Approach

## Problem Statement
Website owners have no visibility into how conversational AI search engines (ChatGPT, Perplexity, Google AI Overviews, etc.) interpret, summarize, and represent their content to users. This is an emerging SEO/visibility challenge with no established solutions.

## Target Users
- Website owners (marketers, content teams)
- Developers building and maintaining web properties

## Core Value Proposition
Help site owners understand **how AI agents represent their content** - focusing on:
1. **Accuracy** - Is the AI saying correct things about my site?
2. **Completeness** - Are key features/products/information being mentioned?
3. **Attribution** - Is my site being cited as a source?

*(Expandable to sentiment, competitive positioning, etc. in future)*

---

## Technical Approach Options

### 1. Active Simulation Engine
**Concept**: Programmatically query multiple AI systems with prompts related to the customer's site and analyze responses.

**How it works**:
- Customer provides their domain + key topics/queries they care about
- System generates relevant prompts (e.g., "What is [company]?", "Best [product category]", "How does [feature] work?")
- Queries are sent to AI APIs (OpenAI, Anthropic, Perplexity API, etc.)
- Responses are analyzed for accuracy, completeness, attribution

**Technical components**:
- Prompt generation engine (based on site content/sitemap analysis)
- Multi-provider AI API integration layer
- Response parser + NLP analysis pipeline
- Ground truth extractor (crawl site to establish "correct" answers)
- Scoring/comparison engine

**Pros**: Controllable, repeatable, can run on schedule
**Cons**: API costs, may not reflect real user queries, some AI systems don't have APIs

### 2. Passive Monitoring Network
**Concept**: Crowdsource or partner to collect real AI responses mentioning the customer's site.

**How it works**:
- Browser extension or partnership collects anonymized AI search responses
- Filter for mentions of customer's domain/brand
- Aggregate and analyze how the site appears "in the wild"

**Technical components**:
- Data collection infrastructure (extension, partnerships, or scraping)
- Entity recognition to identify site mentions
- Response aggregation and deduplication
- Trend analysis over time

**Pros**: Reflects real-world AI behavior, captures organic queries
**Cons**: Privacy concerns, harder to scale, may miss low-volume sites

### 3. Structured Data Analyzer
**Concept**: Analyze how well a site's structured data (schema.org, OpenGraph, etc.) communicates to AI systems.

**How it works**:
- Crawl customer's site for structured data, meta tags, robots.txt, llms.txt
- Compare against AI system requirements/preferences
- Simulate how AI extraction would interpret the data
- Provide recommendations for improvement

**Technical components**:
- Web crawler with structured data extraction
- Schema.org validator and analyzer
- AI-specific markup analyzer (llms.txt, ai.txt emerging standards)
- Recommendation engine

**Pros**: Actionable, doesn't require AI API access, helps with optimization
**Cons**: Doesn't show actual AI interpretation, only potential

### 4. A/B Interpretation Testing
**Concept**: Help site owners test how content changes affect AI interpretation.

**How it works**:
- Customer makes content changes (or we suggest changes)
- Run simulation queries before/after
- Measure delta in accuracy, completeness, attribution scores
- Build knowledge base of what content patterns improve AI interpretation

**Technical components**:
- Version tracking for site content
- Diff analyzer
- Before/after simulation runner
- Impact scoring and visualization

**Pros**: Directly actionable, helps optimize over time
**Cons**: Requires active simulation capability first

---

## Recommended MVP Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Dashboard (Web UI)                        │
│  - Site registration + topic configuration                       │
│  - Accuracy/Completeness/Attribution scores over time           │
│  - Response samples with annotations                             │
│  - Recommendations for improvement                               │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Core Analysis Engine                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Ground     │  │   Query      │  │   Response   │          │
│  │   Truth      │  │   Generator  │  │   Analyzer   │          │
│  │   Extractor  │  │              │  │              │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    AI Provider Abstraction                       │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐           │
│  │ OpenAI  │  │ Anthropic│  │Perplexity│  │ Google  │           │
│  │   API   │  │   API   │  │   API   │  │   API   │           │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘           │
└─────────────────────────────────────────────────────────────────┘
```

## Key Technical Challenges

1. **Ground Truth Extraction**: How do we programmatically determine what's "correct" about a site?
   - Crawl and parse site content
   - Customer-provided fact sheets
   - Structured data extraction

2. **Accuracy Measurement**: How do we compare AI responses to ground truth?
   - Semantic similarity (embeddings)
   - Factual claim extraction + verification
   - Human-in-the-loop validation for edge cases

3. **Attribution Detection**: How do we know if a site was cited?
   - Direct URL mention parsing
   - Brand/domain name recognition
   - Source list analysis (where available)

4. **Query Relevance**: What questions should we ask about a given site?
   - Sitemap/content analysis
   - Customer input (key topics, products, FAQs)
   - Competitive query analysis

---

## Technical Specifications

Detailed specs for each core component are available in the `specs/` folder. Each spec includes an **Implementation Review** section documenting what was built, what gaps remain, and specific recommendations.

| Component | Spec File | Impl Status | Key Gaps |
|-----------|-----------|-------------|----------|
| Ground Truth Extractor | [`specs/ground-truth-extractor.md`](specs/ground-truth-extractor.md) | ✅ Complete | LLM claim extraction with structured data claims; embedding persistence via OpenAI text-embedding-3-small |
| Query Generator | [`specs/query-generator.md`](specs/query-generator.md) | ⚠️ Partial | LLM generation works; no clustering/dedup/variations; hardcoded prompt; no source tracking |
| Response Analyzer | [`specs/response-analyzer.md`](specs/response-analyzer.md) | ✅ Complete | All 3 scorers work; completeness uses hybrid semantic (0.75 threshold) + keyword matching; scoring unvalidated against real sites |
| AI Provider Abstraction | [`specs/ai-provider-abstraction.md`](specs/ai-provider-abstraction.md) | ✅ Complete | OpenAI + Google working; no unified orchestrator class; consider Perplexity/Anthropic |
| Dashboard + CLI | [`specs/dashboard-cli.md`](specs/dashboard-cli.md) | ⚠️ CLI only | CLI fully functional; web dashboard 0%; needs API server (Express/Fastify) before frontend |
| Database & Storage | [`specs/database-storage.md`](specs/database-storage.md) | ⚠️ Partial | Schema complete; embeddings now populated (OpenAI 1536d); Redis/BullMQ/S3 unused |

### Key Technical Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Runtime** | TypeScript/Node.js | Good ecosystem for web crawling (Playwright) and APIs |
| **Crawling** | Playwright (headless) | Supports JS-rendered SPA/React sites |
| **Crawl Strategy** | Sitemap-based | Respects site owner intent, manageable scope |
| **Content Extraction** | Layered (raw → chunks → facts) | Flexibility for different analysis needs |
| **Fact Extraction** | Hybrid NLP + LLM | Balance of cost and accuracy |
| **Database** | PostgreSQL + pgvector | Relational + vector search in one DB |
| **ORM** | Prisma | Type-safe, great DX, migrations |
| **Cache/Queue** | Redis | Fast caching and job queue (BullMQ) |
| **File Storage** | Local (dev) / S3 (prod) | Configurable for different environments |
| **Embeddings** | Separate table, HNSW index | Flexibility to re-embed, fast similarity search |
| **AI Providers** | OpenAI + Google (initial) | Good coverage, plugin architecture for expansion |
| **Accuracy Scoring** | Semantic similarity | Efficient and scalable |
| **Completeness Scoring** | Required claims check | Clear pass/fail criteria |
| **Attribution Detection** | URL/domain + brand mentions | Practical and measurable |

---

## Open Questions for Future Sessions

- [x] What tech stack to use? → **TypeScript/Node.js**
- [x] Database selection? → **PostgreSQL + pgvector + Prisma**
- [ ] Self-hosted vs SaaS vs API-first?
- [ ] How to handle AI providers without APIs (browser automation?)
- [ ] Pricing model and cost structure (AI API costs are significant)
- [ ] Data retention and privacy considerations
- [ ] How to validate accuracy scoring methodology?
- [ ] Partnership opportunities (SEO tools, analytics platforms)?

---

## Completed Steps

- [x] Decide on initial scope → **Multi-provider (OpenAI + Google)**
- [x] Spec ground truth extractor
- [x] Spec query generator
- [x] Spec response analyzer
- [x] Spec AI provider abstraction
- [x] Spec dashboard + CLI
- [x] Spec database and storage infrastructure
- [x] Begin implementation (ground truth extractor first)
- [x] Implement AI provider abstraction
- [x] Implement query generator
- [x] Implement response analyzer
- [x] Implement analysis runner
- [x] Build CLI interface

## Next Steps (Prioritized)

### Priority 1: Validate with real sites
- [ ] Run the full pipeline against 2-3 real sites you know well
- [ ] Manually evaluate whether accuracy/completeness/attribution scores make sense
- [ ] Document which scores feel correct and which feel off — this informs every other priority
- [ ] Measure actual API costs per site analysis to understand economics

### Priority 2: Fix claim extraction (highest-impact code change) ✅
- [x] Replace sentence-splitting in `ground-truth.ts` with LLM-based extraction using the prompt template in the ground truth extractor spec (Section 4)
- [x] Generate structured claims with subject/predicate/object triples and confidence scores
- [x] Use extracted structured data (JSON-LD, OpenGraph) as an additional source of high-quality claims
- [ ] Re-run analysis after fixing claims and compare score quality to Priority 1 baseline

### Priority 3: Wire up embedding persistence ✅
- [x] Call `insertEmbedding()` during ground truth extraction to persist chunk embeddings
- [ ] Update response analyzer to check for existing embeddings before generating new ones
- [ ] Enable `findSimilarChunks()` for semantic search in the query generator and analyzer
- [x] Upgrade completeness scorer from keyword matching to semantic similarity (hybrid approach with 0.75 threshold)

### Priority 4: Add tests
- [ ] Unit tests for response-analyzer.ts scoring logic (the core IP of the product)
- [ ] Unit tests for claim extraction once it's upgraded
- [ ] Integration test for the full pipeline against a fixture/mock site
- [ ] Configure test framework (vitest or jest)

### Priority 5: Build API server layer
- [ ] Add Express or Fastify HTTP server exposing existing services as REST endpoints
- [ ] Implement the `APIClient` interface from the dashboard-cli spec as the route contract
- [ ] This is a prerequisite for the web dashboard and also useful for future webhook/API access

### Priority 6: Build minimal dashboard
- [ ] Single page showing latest run scores per site with drill-down to per-query results
- [ ] Skip real-time WebSocket, trends, PDF export, and theme support for now
- [ ] Consider whether a CLI-generated static HTML report would validate the concept faster

### Lower priority (track but don't block on)
- [ ] Wire up BullMQ for background job processing (needed once dashboard exists)
- [ ] Add Perplexity provider (search-grounded responses are directly relevant to attribution)
- [ ] Add Anthropic provider
- [ ] Implement S3 storage backend
- [ ] Add historical tracking and trends
- [ ] Add query clustering/dedup using stored embeddings

---

*Document created: 2026-01-30*
*Last updated: 2026-01-30*
*Status: LLM Claim Extraction, Embedding Persistence, and Semantic Completeness Implemented - Validation Next*
