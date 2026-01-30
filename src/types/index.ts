// Core type definitions for Aeyez

// ============================================================================
// Configuration Types
// ============================================================================

export interface SiteConfig {
  topics: string[];
  providers: ('openai' | 'google')[];
  queriesPerRun: number;
  crawlDepth?: number;
  excludePatterns?: string[];
}

export interface RunConfig {
  providers: ('openai' | 'google')[];
  queryCount: number;
  temperature?: number;
  maxRetries?: number;
}

export interface DatabaseConfig {
  postgres: {
    url: string;
    maxConnections?: number;
    connectionTimeout?: number;
  };
  redis: {
    url: string;
    maxRetries?: number;
    keyPrefix?: string;
  };
  storage: {
    type: 'local' | 's3';
    localPath?: string;
    s3?: {
      bucket: string;
      region: string;
      accessKeyId: string;
      secretAccessKey: string;
    };
  };
  cache: {
    defaultTtl: number;
    enabled: boolean;
  };
}

// ============================================================================
// Query & Expected Answer Types
// ============================================================================

export interface ExpectedAnswer {
  keyClaims: string[];
  keywords: string[];
  mustInclude: string[];
  shouldInclude?: string[];
  context?: string;
}

// ============================================================================
// Analysis & Scoring Types
// ============================================================================

export interface ClaimFeedback {
  claimId: string;
  statement: string;
  status: 'accurate' | 'inaccurate' | 'missing' | 'hallucinated';
  similarity?: number;
  explanation?: string;
}

export interface HighlightFeedback {
  text: string;
  category: 'accurate' | 'inaccurate' | 'hallucination';
  severity: 'low' | 'medium' | 'high';
}

export interface AttributionEvidence {
  type: 'url' | 'domain' | 'brand';
  value: string;
  context: string;
}

export interface ScoreBreakdown {
  accuracy: {
    score: number;
    details: {
      accurateClaims: number;
      totalClaims: number;
      avgSimilarity: number;
    };
  };
  completeness: {
    score: number;
    details: {
      mentionedClaims: number;
      requiredClaims: number;
      missingClaims: string[];
    };
  };
  attribution: {
    score: number;
    details: {
      hasDirectUrl: boolean;
      hasDomainMention: boolean;
      hasBrandMention: boolean;
      evidence: AttributionEvidence[];
    };
  };
}

// ============================================================================
// Crawling & Extraction Types
// ============================================================================

export interface CrawlResult {
  url: string;
  title?: string;
  httpStatus: number;
  etag?: string;
  lastModified?: string;
  rawHtml: string;
  crawledAt: Date;
}

export interface ContentChunk {
  text: string;
  heading?: string;
  sectionType: string;
  depth: number;
  tokenCount: number;
  position: number;
}

export interface ExtractedClaim {
  statement: string;
  subject?: string;
  predicate?: string;
  object?: string;
  claimType: string;
  confidence: number;
  source: 'nlp' | 'llm' | 'schema';
}

// ============================================================================
// AI Provider Types
// ============================================================================

export interface AIProviderConfig {
  apiKey: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
}

export interface AIRequest {
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  temperature?: number;
  maxTokens?: number;
}

export interface AIResponse {
  content: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  latencyMs: number;
  respondedAt: Date;
}

// ============================================================================
// Storage Types
// ============================================================================

export interface FileStorage {
  put(key: string, content: Buffer | string, options?: PutOptions): Promise<string>;
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  getSignedUrl?(key: string, expiresIn?: number): Promise<string>;
}

export interface PutOptions {
  contentType?: string;
  metadata?: Record<string, string>;
}

// ============================================================================
// Job Queue Types
// ============================================================================

export interface CrawlJob {
  siteId: string;
  domain: string;
}

export interface ExtractJob {
  siteId: string;
  pageIds: string[];
}

export interface QueryGenerationJob {
  siteId: string;
}

export interface AnalysisJob {
  runId: string;
  siteId: string;
  queryIds: string[];
}

// ============================================================================
// Dashboard Types
// ============================================================================

export interface DashboardData {
  site: {
    id: string;
    domain: string;
    name?: string;
    status: string;
  };
  latestScores: {
    accuracy: number;
    completeness: number;
    attribution: number;
  };
  trend: {
    accuracy: number[];
    completeness: number[];
    attribution: number[];
    dates: string[];
  };
  topIssues: Array<{
    query: string;
    provider: string;
    issue: string;
    severity: 'low' | 'medium' | 'high';
  }>;
  providerComparison: Array<{
    provider: string;
    accuracy: number;
    completeness: number;
    attribution: number;
  }>;
}
