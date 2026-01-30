## Implementation Status

⚠️ **CLI: Implemented** | **Web Dashboard: Not Started** | **API Server: Not Started**

See source code:
- CLI: `src/cli/index.ts`
- Services: `src/services/`
- Types: `src/types/index.ts`

### Implementation Review (2026-01-30)

**CLI — fully functional:**
All core commands are implemented: `site:add`, `site:list`, `crawl`, `generate-queries`, `analyze`, `results`, `stats`, and a `pipeline` command that chains crawl → generate → analyze. Commands have proper options, error handling, and formatted output.

**CLI differences from spec:**
- Command names use colon-separated style (`site:add`) rather than the subcommand style specified (`sites add`). This is a minor naming convention difference.
- No `--json`, `--quiet`, or `--verbose` global output format flags.
- No `--export` flag on results.
- No interactive prompts via Inquirer.js — all input is via command flags.

**Web Dashboard — 0% implemented:**
There is no frontend code, no Vue/Vuetify dependencies, no API routes, and no web server. The full dashboard spec (6 pages, WebSocket real-time updates, Chart.js charts, theme support) represents a major implementation effort.

**Prerequisite: API server must be built first:**
The dashboard spec assumes REST endpoints + WebSocket, but there is no HTTP server at all. Before building the Vue frontend, you need an Express/Fastify API layer that exposes the existing services over HTTP. The CLI currently calls services directly via in-process function calls. The `APIClient` interface in the Shared Components section of this spec can serve as the contract for those routes.

**Recommended MVP approach for the dashboard:**
Rather than building the full 6-page spec, consider starting with:
1. An Express/Fastify API server exposing sites, runs, and results endpoints
2. A single-page dashboard showing the latest run's scores with drill-down to per-query results
3. Skip real-time WebSocket updates, trends visualization, and PDF export for now
4. Alternatively, the CLI could generate a static HTML report as a lighter-weight option to validate the product concept before investing in a full web app

---

# Dashboard UI + CLI - Technical Specification

## Overview
The user interface consists of two parts:
1. **Web Dashboard** - Vue + Vuetify + Pinia web application for visual analysis and management
2. **CLI Tool** - Commander.js-based command line interface for power users and automation

Both interfaces share the same backend API and provide equivalent functionality.

---

## Part 1: Web Dashboard

### Technology Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| Framework | Vue 3 | Reactive, approachable, great ecosystem |
| UI Library | Vuetify 3 | Material Design components, responsive, accessible |
| State Management | Pinia | Official Vue store, TypeScript-friendly |
| Build Tool | Vite | Fast dev server, optimized builds |
| Real-time | WebSocket (Socket.io) | Live updates during analysis runs |
| Charts | Chart.js + vue-chartjs | Flexible, well-documented |
| Tables | Vuetify data tables + virtual scroll | Handles large datasets |

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Web Dashboard                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                      App Shell                            │   │
│  │  ┌─────────────┐  ┌──────────────────────────────────┐   │   │
│  │  │   Sidebar   │  │         Main Content             │   │   │
│  │  │   Nav       │  │                                  │   │   │
│  │  │             │  │  ┌────────────────────────────┐  │   │   │
│  │  │  • Home     │  │  │      Router View          │  │   │   │
│  │  │  • Sites    │  │  │                            │  │   │   │
│  │  │  • Queries  │  │  │   (page components)       │  │   │   │
│  │  │  • Results  │  │  │                            │  │   │   │
│  │  │  • Trends   │  │  └────────────────────────────┘  │   │   │
│  │  │  • Settings │  │                                  │   │   │
│  │  └─────────────┘  └──────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    State (Pinia)                          │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐        │   │
│  │  │  Sites  │ │ Queries │ │ Results │ │Settings │        │   │
│  │  │  Store  │ │  Store  │ │  Store  │ │  Store  │        │   │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘        │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                   API Client Layer                        │   │
│  │         REST API + WebSocket for real-time               │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

### Pages & Views

#### 1. Dashboard Home (`/`)
**Purpose**: At-a-glance overview of site health across all monitored sites.

**Components**:
```
┌─────────────────────────────────────────────────────────────────┐
│  Dashboard Home                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Score Cards (per site or aggregate)                     │    │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐           │    │
│  │  │ Accuracy  │  │Completeness│  │Attribution│           │    │
│  │  │   78      │  │    65     │  │    42     │           │    │
│  │  │   Good    │  │   Fair    │  │   Poor    │           │    │
│  │  └───────────┘  └───────────┘  └───────────┘           │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Trend Chart (scores over time)                          │    │
│  │  📈 Line chart with accuracy/completeness/attribution   │    │
│  │     - Selectable date range                              │    │
│  │     - Hover for details                                  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌──────────────────────┐  ┌────────────────────────────────┐   │
│  │  Recent Runs         │  │  Issues Requiring Attention    │   │
│  │  • Run #42 - 2h ago │  │  • 5 queries with poor accuracy │   │
│  │  • Run #41 - 1d ago │  │  • 12 missing attributions     │   │
│  │  • Run #40 - 2d ago │  │  • 3 claims not found          │   │
│  └──────────────────────┘  └────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Score Card Component**:
```typescript
interface ScoreCardProps {
  label: string;
  score: number;           // 0-100
  tier: 'excellent' | 'good' | 'fair' | 'poor';
  trend?: 'up' | 'down' | 'stable';
  trendDelta?: number;     // Change from previous run
}
```

---

#### 2. Site Management (`/sites`)
**Purpose**: Add, configure, and manage monitored sites.

**Views**:
- Site list (cards or table view)
- Add site wizard
- Site detail/edit

**Site List Component**:
```
┌─────────────────────────────────────────────────────────────────┐
│  Sites                                        [+ Add Site]      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  example.com                                             │    │
│  │  Last crawled: 2 hours ago | 142 pages | 856 claims     │    │
│  │  Scores: Acc 78 | Comp 65 | Attr 42                     │    │
│  │  [View Results] [Run Analysis] [Edit] [⋮]               │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  acmecorp.io                                             │    │
│  │  Last crawled: 1 day ago | 58 pages | 234 claims        │    │
│  │  Scores: Acc 92 | Comp 88 | Attr 71                     │    │
│  │  [View Results] [Run Analysis] [Edit] [⋮]               │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Add Site Wizard Steps**:
1. Enter domain URL
2. Crawl sitemap (show progress)
3. Review discovered pages
4. Add optional topics/keywords
5. Configure analysis options (providers, query count)
6. Confirm and save

---

#### 3. Query Explorer (`/sites/:id/queries`)
**Purpose**: View and manage generated queries for a site.

**Features**:
- List all generated queries with metadata
- Filter by type, topic, priority
- Search by keyword
- View expected answers
- Edit/disable specific queries
- Regenerate queries

**Query List Component**:
```
┌─────────────────────────────────────────────────────────────────┐
│  Queries for example.com                    [Regenerate Queries]│
├─────────────────────────────────────────────────────────────────┤
│  Filters: [Type ▼] [Topic ▼] [Priority ▼]  Search: [________]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─ Query ──────────────────────────────────────────────────┐   │
│  │  "What is Example Corp?"                                  │   │
│  │  Type: Informational | Topic: Company | Priority: 95     │   │
│  │  Expected: Founded in 2019, provides SaaS solutions...   │   │
│  │  [View Details] [Edit] [Disable]                         │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─ Query ──────────────────────────────────────────────────┐   │
│  │  "Example Corp pricing plans"                             │   │
│  │  Type: Navigational | Topic: Pricing | Priority: 88      │   │
│  │  Expected: Three tiers - Starter $29, Pro $99, Enterprise│   │
│  │  [View Details] [Edit] [Disable]                         │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  [Virtual scroll - 247 total queries]                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

#### 4. Analysis Results (`/sites/:id/results`)
**Purpose**: View and drill into analysis results.

**Drill-down Paths**:
1. **By Query** - See how each query performed
2. **By Metric** - View all accuracy/completeness/attribution issues
3. **By Time** - Compare runs over time

**Results Overview**:
```
┌─────────────────────────────────────────────────────────────────┐
│  Results for example.com                                        │
│  Run #42 - Jan 30, 2026 2:30 PM                [Compare Runs ▼]│
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Summary                                                 │    │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐           │    │
│  │  │ Accuracy  │  │Completeness│  │Attribution│           │    │
│  │  │   78/100  │  │   65/100  │  │   42/100  │           │    │
│  │  │   ↑ +3    │  │   ↓ -2    │  │   ↑ +8    │           │    │
│  │  └───────────┘  └───────────┘  └───────────┘           │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─ View Mode ──────────────────────────────────────────────┐   │
│  │  [By Query]  [By Metric]  [By Time]                      │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─ Filters ────────────────────────────────────────────────┐   │
│  │  Score: [All ▼]  Type: [All ▼]  Search: [____________]  │   │
│  │  Sort by: [Accuracy ▼] [Asc/Desc]                        │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Query Result Detail (drill-down)**:
```
┌─────────────────────────────────────────────────────────────────┐
│  Query: "What is Example Corp?"                    [← Back]     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─ Scores ─────────────────────────────────────────────────┐   │
│  │  Accuracy: 82 (Good)  Completeness: 60 (Fair)  Attr: 0   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─ AI Response ────────────────────────────────────────────┐   │
│  │  Provider: OpenAI gpt-4o-mini                            │   │
│  │                                                           │   │
│  │  "Example Corp is a [software company] founded in        │   │
│  │  [2019] that provides [cloud-based solutions] for        │   │
│  │  small businesses. They offer tools for [project         │   │
│  │  management] and [team collaboration]..."                │   │
│  │                                                           │   │
│  │  [Highlighted text = matched ground truth]               │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─ Claims Checklist ───────────────────────────────────────┐   │
│  │  ✅ Founded in 2019                                       │   │
│  │  ✅ Provides SaaS solutions                               │   │
│  │  ✅ Project management tools                              │   │
│  │  ❌ 500+ customers (not mentioned)                        │   │
│  │  ❌ SOC 2 certified (not mentioned)                       │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─ Source Ground Truth ────────────────────────────────────┐   │
│  │  From: example.com/about                                  │   │
│  │  [View source page] [View extracted content]              │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

#### 5. Historical Trends (`/sites/:id/trends`)
**Purpose**: Visualize score changes over time.

**Components**:
- Date range selector
- Multi-line chart (accuracy, completeness, attribution)
- Run comparison table
- Significant changes callouts

**Trends View**:
```
┌─────────────────────────────────────────────────────────────────┐
│  Trends for example.com                                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Date Range: [Last 30 days ▼]  [Custom range...]               │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                                                          │    │
│  │  100 ┤                                                   │    │
│  │      │    ╭──────╮                    ╭─────            │    │
│  │   75 ┤───╯      ╰────╮    ╭─────────╯                   │    │
│  │      │               ╰────╯                              │    │
│  │   50 ┤                         ╭─────────────────────   │    │
│  │      │  ────────────╮    ╭────╯                         │    │
│  │   25 ┤              ╰────╯                               │    │
│  │      │                                                   │    │
│  │    0 ┼────────────────────────────────────────────────  │    │
│  │      Jan 1    Jan 8    Jan 15   Jan 22   Jan 29         │    │
│  │                                                          │    │
│  │  ── Accuracy  ── Completeness  ── Attribution           │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─ Significant Changes ────────────────────────────────────┐   │
│  │  📈 Jan 22: Attribution +15 (added schema.org markup)    │   │
│  │  📉 Jan 15: Completeness -8 (pricing page updated)       │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

#### 6. Settings (`/settings`)
**Purpose**: Configure application settings.

**Sections**:

```
┌─────────────────────────────────────────────────────────────────┐
│  Settings                                                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─ AI Providers ───────────────────────────────────────────┐   │
│  │                                                           │   │
│  │  OpenAI API Key                                          │   │
│  │  [••••••••••••••••••••] [👁] [Test Connection]           │   │
│  │  Status: ✅ Connected                                     │   │
│  │                                                           │   │
│  │  Google AI API Key                                       │   │
│  │  [••••••••••••••••••••] [👁] [Test Connection]           │   │
│  │  Status: ✅ Connected                                     │   │
│  │                                                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─ Default Analysis Options ───────────────────────────────┐   │
│  │                                                           │   │
│  │  Default Providers: [✓] OpenAI  [✓] Google               │   │
│  │  Queries per Run:   [50 ▼]                               │   │
│  │  Web Search:        [◉ Enabled  ○ Disabled]              │   │
│  │                                                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─ Notifications ──────────────────────────────────────────┐   │
│  │                                                           │   │
│  │  Email alerts:      [user@example.com]                   │   │
│  │  Alert on:          [✓] Score drops > 10%                │   │
│  │                     [✓] Run completion                    │   │
│  │                     [ ] Weekly digest                     │   │
│  │                                                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─ Export & Integrations ──────────────────────────────────┐   │
│  │                                                           │   │
│  │  API Key: [Generate New Key]                             │   │
│  │  Webhook URL: [https://...]                              │   │
│  │                                                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─ Appearance ─────────────────────────────────────────────┐   │
│  │                                                           │   │
│  │  Theme: [◉ System  ○ Light  ○ Dark]                      │   │
│  │                                                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│                                              [Save Changes]     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

### Real-time Updates (WebSocket)

**Events**:
```typescript
// Server → Client events
interface WSEvents {
  // Analysis run progress
  'run:started': { runId: string; siteId: string; totalQueries: number };
  'run:progress': { runId: string; completed: number; total: number; currentQuery: string };
  'run:query-complete': { runId: string; queryId: string; scores: Scores };
  'run:completed': { runId: string; summary: RunSummary };
  'run:failed': { runId: string; error: string };
  
  // Crawl progress
  'crawl:started': { siteId: string; totalPages: number };
  'crawl:progress': { siteId: string; crawled: number; total: number };
  'crawl:completed': { siteId: string; pagesFound: number; claimsExtracted: number };
}
```

**UI Indicators**:
- Progress bar during runs
- Live-updating score cards
- Toast notifications for completion/errors

---

### Export Options

| Format | Use Case | Contents |
|--------|----------|----------|
| PDF Report | Executive summary | Scores, trends, key findings |
| CSV/Excel | Data analysis | All results with full details |
| Shareable Link | Stakeholder sharing | Read-only dashboard view |
| API | Integrations | Programmatic access to all data |

---

### Theming

```typescript
// Vuetify theme configuration
const lightTheme = {
  dark: false,
  colors: {
    primary: '#1976D2',
    secondary: '#424242',
    accent: '#82B1FF',
    error: '#FF5252',
    warning: '#FFC107',
    success: '#4CAF50',
    
    // Score tiers
    'score-excellent': '#4CAF50',
    'score-good': '#8BC34A',
    'score-fair': '#FFC107',
    'score-poor': '#FF5252',
  }
};

const darkTheme = {
  dark: true,
  colors: {
    // ... dark variants
  }
};
```

---

## Part 2: CLI Tool

### Technology Stack

| Component | Technology |
|-----------|------------|
| Framework | Commander.js |
| Prompts | Inquirer.js |
| Output | chalk (colors), cli-table3 (tables), ora (spinners) |
| Config | conf (persistent config storage) |

### Command Structure

```
aeyez <command> [subcommand] [options]

Commands:
  sites        Manage monitored sites
  analyze      Run analysis
  results      View analysis results  
  queries      Manage queries
  config       Configuration management

Global Options:
  --json       Output as JSON (for scripting)
  --quiet      Suppress non-essential output
  --verbose    Show detailed output
  --help       Show help
  --version    Show version
```

---

### Commands

#### `aeyez sites` - Site Management

```bash
# List all sites
aeyez sites list
aeyez sites list --json

# Add a new site (interactive)
aeyez sites add
# Add with flags
aeyez sites add --domain example.com --topics "product,pricing,features"

# Show site details
aeyez sites show example.com

# Remove a site
aeyez sites remove example.com

# Crawl/refresh a site
aeyez sites crawl example.com
aeyez sites crawl example.com --force  # Ignore cache
```

**Interactive `sites add` flow**:
```
$ aeyez sites add

? Enter the domain to monitor: example.com
⠋ Fetching sitemap...
✔ Found 142 pages in sitemap

? Add custom topics/keywords? (comma-separated)
  product, pricing, features, about

? Select AI providers to use:
  ◉ OpenAI (gpt-4o-mini)
  ◉ Google (gemini-1.5-flash)

? How many queries per run? 50

✔ Site added successfully!

Run 'aeyez analyze example.com' to start your first analysis.
```

---

#### `aeyez analyze` - Run Analysis

```bash
# Run analysis for a site
aeyez analyze example.com

# Run with options
aeyez analyze example.com --queries 100 --providers openai,google

# Run for all sites
aeyez analyze --all

# Dry run (show what would be analyzed)
aeyez analyze example.com --dry-run
```

**Analysis output**:
```
$ aeyez analyze example.com

⠋ Generating queries... (using cached ground truth)
✔ Generated 50 queries

⠋ Running analysis...
  ████████████████░░░░░░░░░░░░░░ 32/50

✔ Analysis complete!

┌─────────────┬───────┬──────────┐
│ Metric      │ Score │ Tier     │
├─────────────┼───────┼──────────┤
│ Accuracy    │ 78    │ Good     │
│ Completeness│ 65    │ Fair     │
│ Attribution │ 42    │ Poor     │
└─────────────┴───────┴──────────┘

Run 'aeyez results example.com' to see details.
```

---

#### `aeyez results` - View Results

```bash
# Show latest results summary
aeyez results example.com

# Show detailed results
aeyez results example.com --detailed

# Filter by score
aeyez results example.com --filter "accuracy<50"

# Show specific run
aeyez results example.com --run 42

# Compare runs
aeyez results example.com --compare 41,42

# Export results
aeyez results example.com --export csv > results.csv
aeyez results example.com --export json > results.json
```

**Detailed results output**:
```
$ aeyez results example.com --detailed --filter "accuracy<50"

Results for example.com (Run #42)
Showing 5 queries with accuracy < 50

┌────┬─────────────────────────────┬─────────┬──────┬───────┐
│ #  │ Query                       │ Accuracy│ Comp │ Attr  │
├────┼─────────────────────────────┼─────────┼──────┼───────┤
│ 1  │ "Example Corp competitors"  │ 32      │ 45   │ 0     │
│ 2  │ "Example Corp reviews"      │ 41      │ 38   │ 25    │
│ 3  │ "Is Example Corp reliable?" │ 28      │ 52   │ 0     │
│ 4  │ "Example Corp vs Acme"      │ 45      │ 33   │ 50    │
│ 5  │ "Example Corp problems"     │ 38      │ 29   │ 0     │
└────┴─────────────────────────────┴─────────┴──────┴───────┘

Use 'aeyez results example.com --query 1' for full details.
```

---

#### `aeyez queries` - Query Management

```bash
# List queries for a site
aeyez queries list example.com

# Filter queries
aeyez queries list example.com --type informational

# Show query details
aeyez queries show example.com --id q_abc123

# Regenerate queries
aeyez queries regenerate example.com

# Disable a query
aeyez queries disable example.com --id q_abc123
```

---

#### `aeyez config` - Configuration

```bash
# Show current config
aeyez config show

# Set API keys
aeyez config set openai.apiKey sk-...
aeyez config set google.apiKey AIza...

# Set defaults
aeyez config set defaults.queriesPerRun 100
aeyez config set defaults.providers openai,google

# Test connections
aeyez config test

# Reset config
aeyez config reset
```

**Config test output**:
```
$ aeyez config test

Testing provider connections...

✔ OpenAI: Connected (gpt-4o-mini available)
✔ Google: Connected (gemini-1.5-flash available)

All providers configured correctly.
```

---

### Output Formats

**Default (human-readable)**:
```
$ aeyez sites list

Sites:
  • example.com (142 pages, last run: 2h ago)
  • acmecorp.io (58 pages, last run: 1d ago)
```

**JSON (for scripting)**:
```
$ aeyez sites list --json

{
  "sites": [
    {
      "domain": "example.com",
      "pages": 142,
      "lastRun": "2026-01-30T14:30:00Z"
    },
    {
      "domain": "acmecorp.io", 
      "pages": 58,
      "lastRun": "2026-01-29T10:00:00Z"
    }
  ]
}
```

**Table format**:
```
$ aeyez sites list --table

┌──────────────┬───────┬─────────────┬────────────┐
│ Domain       │ Pages │ Claims      │ Last Run   │
├──────────────┼───────┼─────────────┼────────────┤
│ example.com  │ 142   │ 856         │ 2h ago     │
│ acmecorp.io  │ 58    │ 234         │ 1d ago     │
└──────────────┴───────┴─────────────┴────────────┘
```

---

### Configuration File

Location: `~/.aeyez/config.json`

```json
{
  "providers": {
    "openai": {
      "apiKey": "sk-...",
      "defaultModel": "gpt-4o-mini"
    },
    "google": {
      "apiKey": "AIza...",
      "defaultModel": "gemini-1.5-flash"
    }
  },
  "defaults": {
    "queriesPerRun": 50,
    "providers": ["openai", "google"],
    "webSearch": true
  },
  "output": {
    "color": true,
    "format": "default"
  }
}
```

---

## Shared Components

### API Client

Both web and CLI share the same API client:

```typescript
interface APIClient {
  // Sites
  sites: {
    list(): Promise<Site[]>;
    get(domain: string): Promise<Site>;
    create(config: SiteConfig): Promise<Site>;
    update(domain: string, config: Partial<SiteConfig>): Promise<Site>;
    delete(domain: string): Promise<void>;
    crawl(domain: string, force?: boolean): Promise<CrawlJob>;
  };
  
  // Queries
  queries: {
    list(domain: string, filter?: QueryFilter): Promise<Query[]>;
    get(domain: string, queryId: string): Promise<Query>;
    regenerate(domain: string): Promise<QuerySet>;
    disable(domain: string, queryId: string): Promise<void>;
  };
  
  // Analysis
  analysis: {
    run(domain: string, options?: RunOptions): Promise<AnalysisRun>;
    getStatus(runId: string): Promise<RunStatus>;
    cancel(runId: string): Promise<void>;
  };
  
  // Results
  results: {
    list(domain: string, filter?: ResultFilter): Promise<ResultSummary[]>;
    get(domain: string, runId: string): Promise<AnalysisResult>;
    getQuery(domain: string, runId: string, queryId: string): Promise<QueryResult>;
    export(domain: string, runId: string, format: ExportFormat): Promise<Blob>;
  };
  
  // Config
  config: {
    get(): Promise<UserConfig>;
    update(config: Partial<UserConfig>): Promise<UserConfig>;
    testProviders(): Promise<ProviderStatus[]>;
  };
}
```

---

## Dependencies

### Web Dashboard
```json
{
  "dependencies": {
    "vue": "^3.4.0",
    "vuetify": "^3.5.0",
    "pinia": "^2.1.0",
    "vue-router": "^4.2.0",
    "chart.js": "^4.4.0",
    "vue-chartjs": "^5.3.0",
    "socket.io-client": "^4.7.0",
    "axios": "^1.6.0"
  }
}
```

### CLI
```json
{
  "dependencies": {
    "commander": "^12.0.0",
    "inquirer": "^9.2.0",
    "chalk": "^5.3.0",
    "cli-table3": "^0.6.0",
    "ora": "^8.0.0",
    "conf": "^12.0.0"
  }
}
```

---

## Open Questions

- [ ] Should the CLI support a "watch" mode for continuous monitoring?
- [ ] Do we need role-based access for future multi-user support?
- [ ] Should we support custom dashboard widgets?
- [ ] Offline mode for CLI (queue commands when offline)?

---

*Spec Version: 1.0*
*Created: 2026-01-30*
*Status: Draft*
