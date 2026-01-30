# Aeyez Usage Guide

This guide walks you through using Aeyez to analyze how AI systems represent your website.

## Prerequisites

Before starting, ensure you have:

1. **PostgreSQL 15+** with pgvector extension installed
2. **Redis 6+** running
3. **Node.js 18+** installed
4. **API Keys** for at least one AI provider:
   - OpenAI API key (get from https://platform.openai.com/)
   - Google AI API key (get from https://aistudio.google.com/)

## Setup

### 1. Install and Configure

```bash
# Clone and install
git clone <your-repo-url>
cd aeyez
npm install

# Set up environment
cp .env.example .env
```

### 2. Configure Environment

Edit `.env` with your credentials:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/aeyez?schema=public"

# Redis
REDIS_URL="redis://localhost:6379"

# AI Provider API Keys
OPENAI_API_KEY="sk-..."
GOOGLE_API_KEY="..."

# Storage
STORAGE_TYPE="local"
STORAGE_LOCAL_PATH="./storage"
```

### 3. Set Up Database

```bash
# Run migrations
npm run db:migrate

# Verify with Prisma Studio (optional)
npm run db:studio
```

## Basic Workflow

### Option 1: Quick Start (Automated Pipeline)

The fastest way to get results:

```bash
# Add your site
npm run dev site:add example.com --name "Example Site"

# Get the site ID from the output, then run the pipeline
npm run dev pipeline <siteId>
```

This runs all three steps automatically:
1. Crawls your site
2. Generates test queries
3. Analyzes with AI providers

### Option 2: Step-by-Step (Manual Control)

For more control over each step:

#### Step 1: Add Your Site

```bash
npm run dev site:add example.com \
  --name "My Company" \
  --topics "ai,saas,automation"
```

Save the Site ID from the output.

#### Step 2: Crawl and Extract Content

```bash
# Crawl up to 50 pages (default)
npm run dev crawl <siteId>

# Or specify custom page limit
npm run dev crawl <siteId> --pages 100
```

This will:
- Fetch sitemap.xml
- Crawl pages with Playwright
- Extract content into chunks
- Extract basic claims

#### Step 3: Generate Test Queries

```bash
# Generate 50 queries (default)
npm run dev generate-queries <siteId>

# Or specify custom count
npm run dev generate-queries <siteId> --count 30
```

This uses AI to create diverse, relevant queries about your site.

#### Step 4: Run Analysis

```bash
# Analyze with both providers
npm run dev analyze <siteId>

# Or customize
npm run dev analyze <siteId> \
  --providers openai,google \
  --count 50
```

This will:
- Query each AI provider with your test queries
- Score responses for accuracy, completeness, and attribution
- Store detailed results

#### Step 5: View Results

```bash
# Show summary statistics
npm run dev stats <siteId>

# View detailed run results
npm run dev results <runId>

# Export as JSON
npm run dev results <runId> --json > results.json
```

## Understanding the Scores

Aeyez measures three key metrics:

### Accuracy Score (0-100%)
**What it measures:** How correct is the AI's information about your site?

- Uses semantic similarity between AI responses and your actual content
- Checks if key claims are accurately represented
- Higher score = more accurate information

**Good score:** 70%+  
**Excellent score:** 85%+

### Completeness Score (0-100%)
**What it measures:** Does the AI mention all important aspects of your site?

- Checks if required claims appear in responses
- Verifies key keywords are included
- Identifies missing information

**Good score:** 65%+  
**Excellent score:** 80%+

### Attribution Score (0-100%)
**What it measures:** Is your site cited as the source?

- **Direct URL** (+60 points): Full URL in response
- **Domain mention** (+30 points): Domain name mentioned
- **Brand mention** (+10 points): Brand/company name mentioned

**Good score:** 40%+  
**Excellent score:** 70%+

## Example Results

```
Site: example.com

Summary Scores:
  Accuracy: 78%
  Completeness: 65%
  Attribution: 42%

Results (50 queries):
Showing worst performers:

  Query: What is Example Company's main product?
  Provider: openai
  Scores: A=65% C=45% Attr=30%

  Query: How does Example's pricing work?
  Provider: google
  Scores: A=72% C=50% Attr=60%
```

## Advanced Usage

### Multiple Sites

```bash
# Add multiple sites
npm run dev site:add site1.com --name "Site 1"
npm run dev site:add site2.com --name "Site 2"

# List all sites
npm run dev site:list

# Run analysis on each
npm run dev pipeline <site1-id>
npm run dev pipeline <site2-id>
```

### Comparing Providers

```bash
# Test only OpenAI
npm run dev analyze <siteId> --providers openai

# Test only Google
npm run dev analyze <siteId> --providers google

# Compare results
npm run dev results <run-id-openai>
npm run dev results <run-id-google>
```

### Custom Query Sets

Generate queries focusing on specific aspects:

```bash
# More queries for deeper analysis
npm run dev generate-queries <siteId> --count 100

# Analyze subset
npm run dev analyze <siteId> --count 25
```

### Re-crawling

Keep your ground truth fresh:

```bash
# Re-crawl to update content
npm run dev crawl <siteId> --pages 50

# Re-generate queries (new content may need new questions)
npm run dev generate-queries <siteId>

# Run new analysis
npm run dev analyze <siteId>
```

## Troubleshooting

### "OpenAI provider not available"
- Check your OPENAI_API_KEY in .env
- Verify the key is valid at https://platform.openai.com/

### "Database connection failed"
- Ensure PostgreSQL is running: `pg_isready`
- Check DATABASE_URL in .env
- Verify pgvector extension: `CREATE EXTENSION IF NOT EXISTS vector;`

### "Redis connection failed"
- Ensure Redis is running: `redis-cli ping`
- Check REDIS_URL in .env

### Playwright browser errors
```bash
npx playwright install
```

### Analysis is slow
- Reduce query count: `--count 25`
- Use single provider: `--providers openai`
- Rate limiting is intentional to respect API limits

## Cost Estimation

Approximate costs per site (using default settings):

**Crawling:** Free (uses your resources)

**Query Generation (50 queries):**
- OpenAI GPT-4o-mini: ~$0.05

**Analysis (50 queries × 2 providers):**
- OpenAI GPT-4o-mini: ~$0.15
- Google Gemini 1.5 Flash: ~$0.08

**Total per site:** ~$0.30

Embeddings add ~$0.01 per 1000 chunks (when implemented).

## Best Practices

1. **Start small:** Use default settings (50 queries) initially
2. **Crawl regularly:** Re-crawl monthly or after major content updates
3. **Focus on key pages:** Adjust crawl limits based on your site size
4. **Track trends:** Run analysis periodically to spot changes
5. **Use multiple providers:** Different AIs may represent you differently
6. **Review worst performers:** Focus on queries with low scores

## Getting Help

- Review [DEVELOPMENT.md](DEVELOPMENT.md) for technical details
- Check [specs/](specs/) for component documentation
- Open an issue for bugs or questions

## Next Steps

After your first analysis:

1. Review results and identify problem areas
2. Update your site content/structure to improve scores
3. Re-run analysis to measure improvement
4. Set up regular monitoring (coming soon: automated scheduling)

---

Happy analyzing! 🎯
