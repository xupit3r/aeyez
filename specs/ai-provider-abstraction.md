# AI Provider Abstraction - Technical Specification

## Overview
The AI Provider Abstraction provides a unified interface to query multiple AI systems (OpenAI, Google Gemini, and future providers). It handles authentication, rate limiting, error recovery, and cost tracking while exposing a consistent API for the rest of the system.

## Responsibilities
1. Provide unified interface across AI providers
2. Manage authentication and API keys per provider
3. Handle rate limiting per provider
4. Implement exponential backoff and retry on errors
5. Track token usage and estimated costs
6. Support configurable web search capabilities
7. Enable easy addition of new providers via plugin architecture

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                   AI Provider Abstraction                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                   Unified Interface                       │   │
│  │                                                           │   │
│  │    query(prompt, options) → UnifiedResponse              │   │
│  │    queryBatch(prompts, options) → UnifiedResponse[]      │   │
│  │                                                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                  Request Orchestrator                     │   │
│  │  ┌───────────┐   ┌───────────┐   ┌───────────┐          │   │
│  │  │   Rate    │   │   Retry   │   │   Cost    │          │   │
│  │  │  Limiter  │   │  Handler  │   │  Tracker  │          │   │
│  │  └───────────┘   └───────────┘   └───────────┘          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                  Provider Registry                        │   │
│  │                                                           │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │   │
│  │  │   OpenAI    │  │   Google    │  │   Custom    │      │   │
│  │  │   Plugin    │  │   Plugin    │  │   Plugin    │      │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘      │   │
│  │                                                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Unified Interface

### Core Types

```typescript
// Query options
interface QueryOptions {
  provider: string;              // 'openai' | 'google' | custom
  model?: string;                // Provider-specific model, uses default if omitted
  
  // Search configuration
  webSearch?: {
    enabled: boolean;            // Whether to use web search/grounding
    recency?: 'day' | 'week' | 'month' | 'any';  // How recent sources should be
  };
  
  // Generation parameters
  temperature?: number;          // 0-1, default varies by provider
  maxTokens?: number;            // Max response tokens
  
  // Metadata
  queryId?: string;              // For tracking/correlation
  tags?: string[];               // Custom tags for filtering
}

// Unified response
interface UnifiedResponse {
  // Core response
  text: string;
  
  // Provider info
  provider: string;
  model: string;
  
  // Token usage
  tokens: {
    input: number;
    output: number;
    total: number;
  };
  
  // Cost estimate
  cost: {
    inputCost: number;           // USD
    outputCost: number;          // USD
    totalCost: number;           // USD
  };
  
  // Performance
  latency: {
    totalMs: number;
    timeToFirstTokenMs?: number; // If streaming
  };
  
  // Web search metadata (if enabled)
  search?: {
    enabled: boolean;
    sourcesUsed: number;
    citations?: Citation[];
  };
  
  // Tracking
  queryId?: string;
  requestId: string;             // Provider's request ID
  respondedAt: Date;
}

interface Citation {
  url: string;
  title?: string;
  snippet?: string;
}
```

### Main API

```typescript
interface AIProviderAbstraction {
  // Single query
  query(prompt: string, options: QueryOptions): Promise<UnifiedResponse>;
  
  // Batch queries (same provider)
  queryBatch(
    prompts: string[], 
    options: QueryOptions,
    batchOptions?: BatchOptions
  ): AsyncGenerator<UnifiedResponse>;
  
  // Multi-provider comparison (same prompt to multiple providers)
  queryMultiple(
    prompt: string, 
    providers: QueryOptions[]
  ): Promise<UnifiedResponse[]>;
  
  // Provider management
  registerProvider(name: string, plugin: ProviderPlugin): void;
  listProviders(): ProviderInfo[];
  getProviderStatus(name: string): ProviderStatus;
  
  // Cost tracking
  getCostSummary(filter?: CostFilter): CostSummary;
  resetCostTracking(): void;
}

interface BatchOptions {
  concurrency: number;           // Parallel requests, default: 3
  delayBetweenMs?: number;       // Delay between requests
  stopOnError?: boolean;         // Stop batch on first error
}
```

---

## Provider Plugin Architecture

### Plugin Interface

```typescript
interface ProviderPlugin {
  // Metadata
  readonly name: string;
  readonly displayName: string;
  readonly supportedModels: ModelInfo[];
  readonly defaultModel: string;
  readonly supportsWebSearch: boolean;
  
  // Configuration
  configure(config: ProviderConfig): void;
  validate(): Promise<boolean>;  // Test API key validity
  
  // Core functionality
  query(prompt: string, options: ProviderQueryOptions): Promise<ProviderResponse>;
  
  // Rate limiting info
  getRateLimits(): RateLimitInfo;
  
  // Cost calculation
  calculateCost(tokens: TokenUsage, model: string): CostEstimate;
}

interface ModelInfo {
  id: string;
  displayName: string;
  contextWindow: number;
  maxOutputTokens: number;
  inputPricePerMillion: number;   // USD per 1M tokens
  outputPricePerMillion: number;
  supportsWebSearch: boolean;
}

interface ProviderConfig {
  apiKey: string;
  baseUrl?: string;              // For proxies or custom endpoints
  organizationId?: string;       // OpenAI org ID
  projectId?: string;            // Google project ID
  timeout?: number;              // Request timeout ms
}

interface ProviderQueryOptions {
  model: string;
  temperature?: number;
  maxTokens?: number;
  webSearch?: boolean;
  searchRecency?: string;
}

interface ProviderResponse {
  text: string;
  model: string;
  tokens: TokenUsage;
  requestId: string;
  citations?: Citation[];
  rawResponse?: unknown;         // Original API response for debugging
}

interface TokenUsage {
  input: number;
  output: number;
}
```

---

## Built-in Providers

### OpenAI Plugin

```typescript
class OpenAIPlugin implements ProviderPlugin {
  readonly name = 'openai';
  readonly displayName = 'OpenAI';
  readonly supportsWebSearch = false;  // ChatGPT web, but not API
  readonly defaultModel = 'gpt-4o-mini';
  
  readonly supportedModels: ModelInfo[] = [
    {
      id: 'gpt-4o',
      displayName: 'GPT-4o',
      contextWindow: 128000,
      maxOutputTokens: 16384,
      inputPricePerMillion: 2.50,
      outputPricePerMillion: 10.00,
      supportsWebSearch: false,
    },
    {
      id: 'gpt-4o-mini',
      displayName: 'GPT-4o Mini',
      contextWindow: 128000,
      maxOutputTokens: 16384,
      inputPricePerMillion: 0.15,
      outputPricePerMillion: 0.60,
      supportsWebSearch: false,
    },
    {
      id: 'gpt-4-turbo',
      displayName: 'GPT-4 Turbo',
      contextWindow: 128000,
      maxOutputTokens: 4096,
      inputPricePerMillion: 10.00,
      outputPricePerMillion: 30.00,
      supportsWebSearch: false,
    },
  ];
  
  getRateLimits(): RateLimitInfo {
    return {
      requestsPerMinute: 500,      // Tier 1 default
      tokensPerMinute: 30000,
      requestsPerDay: null,        // No daily limit
    };
  }
}
```

### Google Gemini Plugin

```typescript
class GoogleGeminiPlugin implements ProviderPlugin {
  readonly name = 'google';
  readonly displayName = 'Google Gemini';
  readonly supportsWebSearch = true;  // Grounding with Google Search
  readonly defaultModel = 'gemini-1.5-flash';
  
  readonly supportedModels: ModelInfo[] = [
    {
      id: 'gemini-1.5-pro',
      displayName: 'Gemini 1.5 Pro',
      contextWindow: 2097152,
      maxOutputTokens: 8192,
      inputPricePerMillion: 1.25,
      outputPricePerMillion: 5.00,
      supportsWebSearch: true,
    },
    {
      id: 'gemini-1.5-flash',
      displayName: 'Gemini 1.5 Flash',
      contextWindow: 1048576,
      maxOutputTokens: 8192,
      inputPricePerMillion: 0.075,
      outputPricePerMillion: 0.30,
      supportsWebSearch: true,
    },
    {
      id: 'gemini-2.0-flash',
      displayName: 'Gemini 2.0 Flash',
      contextWindow: 1048576,
      maxOutputTokens: 8192,
      inputPricePerMillion: 0.10,
      outputPricePerMillion: 0.40,
      supportsWebSearch: true,
    },
  ];
  
  getRateLimits(): RateLimitInfo {
    return {
      requestsPerMinute: 60,
      tokensPerMinute: 1000000,
      requestsPerDay: 1500,
    };
  }
}
```

---

## Rate Limiter

### Implementation

```typescript
interface RateLimitInfo {
  requestsPerMinute: number | null;
  tokensPerMinute: number | null;
  requestsPerDay: number | null;
}

interface RateLimiterConfig {
  provider: string;
  limits: RateLimitInfo;
  bufferPercent: number;         // Stay below limits, default: 10%
}

class ProviderRateLimiter {
  private requestCounts: Map<string, number[]>;  // Timestamps
  private tokenCounts: Map<string, number[]>;
  
  async acquire(
    provider: string, 
    estimatedTokens: number
  ): Promise<void> {
    // Wait if at limit
    while (this.isAtLimit(provider, estimatedTokens)) {
      await this.waitForCapacity(provider);
    }
    this.recordRequest(provider, estimatedTokens);
  }
  
  release(provider: string): void {
    // Called on request completion
  }
  
  getStatus(provider: string): RateLimitStatus {
    return {
      requestsRemaining: this.getRequestsRemaining(provider),
      tokensRemaining: this.getTokensRemaining(provider),
      resetsAt: this.getResetTime(provider),
    };
  }
}
```

---

## Retry Handler

### Exponential Backoff Strategy

```typescript
interface RetryConfig {
  maxRetries: number;            // Default: 3
  initialDelayMs: number;        // Default: 1000
  maxDelayMs: number;            // Default: 60000
  backoffMultiplier: number;     // Default: 2
  retryableErrors: string[];     // Error codes to retry
}

const DEFAULT_RETRYABLE_ERRORS = [
  'rate_limit_exceeded',
  'timeout',
  'server_error',
  'service_unavailable',
  'connection_error',
];

class RetryHandler {
  async execute<T>(
    fn: () => Promise<T>,
    config: RetryConfig
  ): Promise<T> {
    let lastError: Error;
    let delay = config.initialDelayMs;
    
    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        if (!this.isRetryable(error, config)) {
          throw error;
        }
        
        if (attempt < config.maxRetries) {
          await this.sleep(delay);
          delay = Math.min(delay * config.backoffMultiplier, config.maxDelayMs);
        }
      }
    }
    
    throw lastError;
  }
  
  private isRetryable(error: Error, config: RetryConfig): boolean {
    const errorCode = this.extractErrorCode(error);
    return config.retryableErrors.includes(errorCode);
  }
}
```

---

## Cost Tracker

### Implementation

```typescript
interface CostEstimate {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  currency: 'USD';
}

interface CostRecord {
  requestId: string;
  provider: string;
  model: string;
  tokens: TokenUsage;
  cost: CostEstimate;
  timestamp: Date;
  queryId?: string;
  tags?: string[];
}

interface CostFilter {
  provider?: string;
  model?: string;
  startDate?: Date;
  endDate?: Date;
  tags?: string[];
}

interface CostSummary {
  totalCost: number;
  totalRequests: number;
  totalTokens: {
    input: number;
    output: number;
  };
  byProvider: Record<string, {
    cost: number;
    requests: number;
    tokens: TokenUsage;
  }>;
  byModel: Record<string, {
    cost: number;
    requests: number;
    tokens: TokenUsage;
  }>;
  byDay: {
    date: string;
    cost: number;
    requests: number;
  }[];
}

class CostTracker {
  private records: CostRecord[] = [];
  
  record(entry: CostRecord): void {
    this.records.push(entry);
  }
  
  getSummary(filter?: CostFilter): CostSummary {
    const filtered = this.applyFilter(this.records, filter);
    return this.aggregate(filtered);
  }
  
  export(format: 'json' | 'csv'): string {
    // Export cost records for reporting
  }
  
  reset(): void {
    this.records = [];
  }
}
```

---

## Provider Status

```typescript
interface ProviderStatus {
  name: string;
  available: boolean;
  lastChecked: Date;
  
  // Health
  health: 'healthy' | 'degraded' | 'down';
  latencyP50Ms: number;
  latencyP99Ms: number;
  errorRate: number;             // Last hour
  
  // Rate limits
  rateLimits: RateLimitStatus;
  
  // Usage
  requestsToday: number;
  costToday: number;
}

interface RateLimitStatus {
  requestsRemaining: number | null;
  tokensRemaining: number | null;
  resetsAt: Date | null;
  percentUsed: number;
}
```

---

## Configuration

```typescript
interface AIProviderConfig {
  // Provider configurations
  providers: {
    openai?: {
      apiKey: string;
      organizationId?: string;
      defaultModel?: string;
    };
    google?: {
      apiKey: string;
      projectId?: string;
      defaultModel?: string;
    };
    // Custom providers added via registerProvider()
  };
  
  // Global settings
  defaults: {
    temperature: number;         // Default: 0.7
    maxTokens: number;           // Default: 1024
    timeout: number;             // Default: 30000ms
  };
  
  // Retry settings
  retry: RetryConfig;
  
  // Rate limiting
  rateLimiting: {
    enabled: boolean;
    bufferPercent: number;       // Default: 10%
  };
  
  // Cost tracking
  costTracking: {
    enabled: boolean;
    alertThreshold?: number;     // USD, optional warning threshold
  };
}
```

---

## Usage Examples

### Basic Query

```typescript
const ai = new AIProviderAbstraction(config);

// Simple query
const response = await ai.query(
  "What is Acme Corp?",
  { provider: 'openai', model: 'gpt-4o-mini' }
);

console.log(response.text);
console.log(`Cost: $${response.cost.totalCost.toFixed(4)}`);
```

### Query with Web Search

```typescript
// Google with grounding
const response = await ai.query(
  "What are the latest features of Acme Corp?",
  { 
    provider: 'google', 
    model: 'gemini-1.5-flash',
    webSearch: { enabled: true, recency: 'week' }
  }
);

console.log(response.text);
console.log(`Sources: ${response.search?.sourcesUsed}`);
```

### Multi-Provider Comparison

```typescript
// Same query to multiple providers
const responses = await ai.queryMultiple(
  "Describe Acme Corp's main products",
  [
    { provider: 'openai', model: 'gpt-4o-mini' },
    { provider: 'google', model: 'gemini-1.5-flash', webSearch: { enabled: true } },
  ]
);

for (const r of responses) {
  console.log(`${r.provider}: ${r.text.substring(0, 100)}...`);
}
```

### Batch Processing

```typescript
// Batch queries with rate limiting
const queries = generatedQueries.map(q => q.canonical);

for await (const response of ai.queryBatch(
  queries,
  { provider: 'openai', model: 'gpt-4o-mini' },
  { concurrency: 5, delayBetweenMs: 100 }
)) {
  await analyzer.analyze(response);
}

// Check costs after batch
const costs = ai.getCostSummary();
console.log(`Batch cost: $${costs.totalCost.toFixed(2)}`);
```

---

## Adding a New Provider

```typescript
// 1. Implement the plugin interface
class AnthropicPlugin implements ProviderPlugin {
  readonly name = 'anthropic';
  readonly displayName = 'Anthropic Claude';
  // ... implement all required methods
}

// 2. Register with the abstraction
ai.registerProvider('anthropic', new AnthropicPlugin());

// 3. Configure credentials
ai.configureProvider('anthropic', {
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// 4. Use it
const response = await ai.query(
  "What is Acme Corp?",
  { provider: 'anthropic', model: 'claude-3-sonnet' }
);
```

---

## Error Handling

```typescript
// Error types
interface ProviderError extends Error {
  provider: string;
  code: string;
  retryable: boolean;
  retryAfterMs?: number;
}

// Error codes
type ErrorCode = 
  | 'rate_limit_exceeded'
  | 'invalid_api_key'
  | 'invalid_model'
  | 'context_length_exceeded'
  | 'content_filtered'
  | 'timeout'
  | 'server_error'
  | 'service_unavailable'
  | 'connection_error'
  | 'unknown';
```

| Error Type | Retryable | Handling |
|------------|-----------|----------|
| rate_limit_exceeded | Yes | Exponential backoff |
| invalid_api_key | No | Fail immediately, surface to user |
| context_length_exceeded | No | Truncate prompt or fail |
| content_filtered | No | Log and skip query |
| timeout | Yes | Retry with increased timeout |
| server_error | Yes | Retry up to max attempts |
| service_unavailable | Yes | Retry with longer delay |

---

## Metrics & Logging

Track:
- Requests per provider/model
- Token usage per provider/model
- Cost per provider/model/day
- Latency percentiles (p50, p95, p99)
- Error rates by type
- Rate limit hit frequency
- Retry counts

---

## Dependencies

```json
{
  "dependencies": {
    "openai": "^4.0.0",
    "@google/generative-ai": "^0.21.0",
    "p-limit": "^4.0.0",
    "p-retry": "^6.0.0"
  }
}
```

---

## Open Questions

- [ ] Should we support streaming responses?
- [ ] How to handle provider-specific features (function calling, vision)?
- [ ] Should we cache responses for identical queries?
- [ ] Support for self-hosted models (Ollama, vLLM)?

---

*Spec Version: 1.0*
*Created: 2026-01-30*
*Status: Draft*
