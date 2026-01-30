# Aeyez - Developer Guide

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL 15+ with pgvector extension
- Redis 6+

### Installation

1. **Install dependencies:**
```bash
npm install
```

2. **Set up environment variables:**
```bash
cp .env.example .env
# Edit .env with your database and API credentials
```

3. **Install pgvector extension in PostgreSQL:**
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

4. **Run database migrations:**
```bash
npm run db:migrate
```

5. **Generate Prisma client:**
```bash
npm run db:generate
```

6. **Build the project:**
```bash
npm run build
```

## Usage

### CLI Commands

#### Add a site to monitor
```bash
npm run dev site:add example.com
npm run dev site:add example.com --name "My Site" --topics "ai,tech,product"
```

#### List monitored sites
```bash
npm run dev site:list
```

#### Crawl a site and build ground truth
```bash
npm run dev crawl <siteId>
npm run dev crawl <siteId> --pages 100
```

#### Generate test queries
```bash
npm run dev generate-queries <siteId>
npm run dev generate-queries <siteId> --count 100
```

#### Run AI analysis
```bash
npm run dev analyze <siteId>
npm run dev analyze <siteId> --providers openai --count 25
```

#### View analysis results
```bash
npm run dev results <runId>
npm run dev results <runId> --json
```

#### Show site statistics
```bash
npm run dev stats <siteId>
```

#### Run full pipeline (all-in-one)
```bash
npm run dev pipeline <siteId>
npm run dev pipeline <siteId> --pages 100 --queries 50 --providers openai,google
```

## Development

### Project Structure

```
src/
├── cli/           # Command-line interface
├── lib/           # Core libraries (db, config, utils)
├── services/      # Business logic services
│   ├── ai/               # AI provider implementations
│   │   ├── base.ts       # Base provider interface
│   │   ├── openai.ts     # OpenAI implementation
│   │   ├── google.ts     # Google Gemini implementation
│   │   └── index.ts      # Provider factory
│   ├── crawler.ts        # Web crawler
│   ├── extractor.ts      # Content extraction
│   ├── ground-truth.ts   # Ground truth orchestration
│   ├── query-generator.ts # Query generation
│   ├── response-analyzer.ts # Response scoring
│   └── analysis-runner.ts  # Analysis orchestration
└── types/         # TypeScript type definitions

prisma/
└── schema.prisma  # Database schema

specs/             # Technical specifications
```

### Database Schema

The application uses PostgreSQL with the following main tables:
- `sites` - Monitored websites
- `pages` - Crawled pages
- `chunks` - Content chunks extracted from pages
- `embeddings` - Vector embeddings for semantic search
- `claims` - Factual claims extracted from content
- `queries` - Generated test queries
- `runs` - Analysis runs
- `results` - Query results and scores

### Available Scripts

- `npm run dev` - Run CLI in development mode with tsx
- `npm run build` - Build TypeScript to JavaScript
- `npm run db:generate` - Generate Prisma client
- `npm run db:migrate` - Create and run migrations
- `npm run db:studio` - Open Prisma Studio (database GUI)

## Implementation Status

### ✅ Completed
- Project infrastructure
- Database schema and migrations
- Prisma ORM configuration
- Storage abstraction (local/S3)
- Redis integration
- Configuration management
- Web crawler with Playwright
- Content extraction with Cheerio
- Ground truth service
- AI provider abstraction (OpenAI, Google)
- Query generator
- Response analyzer
- Analysis runner
- Full CLI interface

### 🚧 In Progress
- Dashboard (web UI)
- Embedding generation and vector search

### 📋 Planned
- Advanced claim extraction (NLP/LLM-based)
- Real-time analysis monitoring
- Report generation
- API endpoints
- Multi-site comparison
- Historical trend analysis

## Testing

Currently, testing can be done manually through the CLI:

1. Add a test site:
```bash
npm run dev site:add example.com
```

2. Crawl and extract:
```bash
npm run dev crawl <siteId>
```

3. Check statistics:
```bash
npm run dev stats <siteId>
```

## Database Migrations

When making schema changes:

1. Edit `prisma/schema.prisma`
2. Create a migration:
```bash
npm run db:migrate
```
3. Generate the client:
```bash
npm run db:generate
```

## Troubleshooting

### Database connection issues
- Verify PostgreSQL is running
- Check DATABASE_URL in .env
- Ensure pgvector extension is installed

### Redis connection issues
- Verify Redis is running
- Check REDIS_URL in .env

### Playwright issues
If you encounter Playwright browser errors:
```bash
npx playwright install
```

## Contributing

See the technical specifications in `specs/` for detailed information about each component.

## License

TBD
