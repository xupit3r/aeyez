# Aeyez - AI Site Interpretation Analyzer

A tool that helps website owners understand how conversational AI search engines (ChatGPT, Perplexity, Google AI Overviews, etc.) interpret, summarize, and represent their content.

## Problem

Website owners have no visibility into how AI agents represent their content to users. This is an emerging SEO/visibility challenge with no established solutions.

## Solution

Aeyez provides analytics on three key metrics:
- **Accuracy** - Is the AI saying correct things about your site?
- **Completeness** - Are key features/products/information being mentioned?
- **Attribution** - Is your site being cited as a source?

## Status

🚧 **Active Development** - Core analysis engine complete and functional!

### Implementation Progress

- ✅ Database schema and migrations
- ✅ Web crawler with Playwright
- ✅ Content extraction and chunking
- ✅ Ground truth service
- ✅ AI provider abstraction (OpenAI, Google)
- ✅ Query generator
- ✅ Response analyzer
- ✅ Analysis runner
- ✅ Full CLI interface
- 🚧 Dashboard (next)
- 📋 Historical tracking (planned)

## Documentation

- **[USAGE.md](USAGE.md)** - Complete user guide with examples
- **[DATABASE_SETUP.md](DATABASE_SETUP.md)** - PostgreSQL + pgvector setup
- **[DEVELOPMENT.md](DEVELOPMENT.md)** - Developer documentation
- **[Technical Approach & Plan](AI_SITE_ANALYZER_PLAN.md)** - Architecture overview
- **[Technical Specifications](specs/)** - Detailed component specs

## Quick Start

### 1. Prerequisites

- PostgreSQL 15+ with pgvector extension
- Redis 6+
- Node.js 18+
- API keys (OpenAI and/or Google)

See [DATABASE_SETUP.md](DATABASE_SETUP.md) for detailed setup instructions.

### 2. Installation

```bash
# Clone repository
git clone <repo-url>
cd aeyez

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your credentials

# Run migrations
npm run db:migrate
```

### 3. Run Analysis

```bash
# Add your site
npm run dev site:add example.com --name "My Site"

# Run complete pipeline
npm run dev pipeline <siteId>

# View results
npm run dev stats <siteId>
```

## Example Workflow

```bash
# 1. Add a site
npm run dev site:add anthropic.com --name "Anthropic" --topics "ai,llm,claude"

# 2. Run the complete pipeline
npm run dev pipeline <siteId> --pages 50 --queries 30

# 3. View results
npm run dev stats <siteId>
npm run dev results <runId>
```

## Features

### Automated Analysis
- Crawls websites with JavaScript rendering
- Extracts content and key claims
- Generates diverse test queries automatically
- Queries multiple AI providers
- Scores responses on accuracy, completeness, and attribution

### Multi-Provider Support
- OpenAI (GPT-4o-mini)
- Google (Gemini 1.5 Flash)
- Extensible architecture for additional providers

### Comprehensive Scoring
- **Accuracy**: Semantic similarity analysis
- **Completeness**: Required claims verification
- **Attribution**: URL, domain, and brand mention detection

### Developer-Friendly
- Full TypeScript implementation
- Prisma ORM for type-safe database access
- Comprehensive CLI
- Detailed logging and error handling

## Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | TypeScript / Node.js |
| Database | PostgreSQL + pgvector |
| ORM | Prisma |
| Cache/Queue | Redis |
| Web Crawler | Playwright |
| Frontend | Vue 3 + Vuetify + Pinia |
| CLI | Commander.js |
| AI Providers | OpenAI, Google Gemini |

## License

TBD
