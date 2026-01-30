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

## Quick Start

See [DEVELOPMENT.md](DEVELOPMENT.md) for detailed setup and usage instructions.

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your database and API credentials

# Run migrations
npm run db:migrate

# Run full analysis pipeline
npm run dev site:add example.com
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

## Documentation

- [Technical Approach & Plan](AI_SITE_ANALYZER_PLAN.md)
- [Technical Specifications](specs/)
  - [Ground Truth Extractor](specs/ground-truth-extractor.md)
  - [Query Generator](specs/query-generator.md)
  - [Response Analyzer](specs/response-analyzer.md)
  - [AI Provider Abstraction](specs/ai-provider-abstraction.md)
  - [Dashboard + CLI](specs/dashboard-cli.md)
  - [Database & Storage](specs/database-storage.md)

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
