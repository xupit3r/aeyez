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

Detailed specs for each core component are available in the `specs/` folder:

| Component | Spec File | Status | Description |
|-----------|-----------|--------|-------------|
| Ground Truth Extractor | [`specs/ground-truth-extractor.md`](specs/ground-truth-extractor.md) | ✅ Draft | Crawls sites, extracts content in layers (raw → chunks → facts), stores in document + vector DB |
| Query Generator | [`specs/query-generator.md`](specs/query-generator.md) | ✅ Draft | Generates test queries from ground truth + user topics, with expected answers for scoring |
| Response Analyzer | [`specs/response-analyzer.md`](specs/response-analyzer.md) | ✅ Draft | Scores AI responses for accuracy, completeness, and attribution |
| AI Provider Abstraction | [`specs/ai-provider-abstraction.md`](specs/ai-provider-abstraction.md) | ✅ Draft | Unified interface to OpenAI, Google Gemini (and future providers) with rate limiting and cost tracking |
| Dashboard + CLI | [`specs/dashboard-cli.md`](specs/dashboard-cli.md) | ✅ Draft | Vue/Vuetify web dashboard + Commander.js CLI for power users |
| Database & Storage | [`specs/database-storage.md`](specs/database-storage.md) | ✅ Draft | PostgreSQL + pgvector, Prisma ORM, Redis cache/queue, S3 file storage |

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

## Next Steps

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
- [ ] Build minimal dashboard to visualize results
- [ ] Add embedding generation and vector search
- [ ] Test with a few real sites to validate approach
- [ ] Add historical tracking and trends

---

*Document created: 2026-01-30*
*Last updated: 2026-01-30*
*Status: Core Implementation Complete - Dashboard Next*
