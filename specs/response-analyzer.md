## Implementation Status

✅ **Implemented** - Core functionality complete as of 2026-01-30

See source code:
- Database schema: `prisma/schema.prisma`
- Services: `src/services/`
- CLI: `src/cli/index.ts`
- Types: `src/types/index.ts`

---

# Response Analyzer - Technical Specification

## Overview
The Response Analyzer evaluates AI-generated responses against ground truth to produce accuracy, completeness, and attribution scores. It provides detailed feedback on which claims were found or missing and highlights response-to-ground-truth matches.

## Responsibilities
1. Score response accuracy via semantic similarity
2. Score completeness by checking required claims presence
3. Score attribution by detecting URL/domain and brand mentions
4. Provide diagnostic feedback (claims found/missing, text matches)
5. Store full analysis results for historical tracking

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Response Analyzer                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                       Inputs                              │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │   │
│  │  │     AI      │  │   Expected  │  │   Ground    │      │   │
│  │  │  Response   │  │   Answer    │  │    Truth    │      │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘      │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Scoring Pipeline                       │   │
│  │  ┌───────────┐   ┌───────────┐   ┌───────────┐          │   │
│  │  │ Accuracy  │   │Completeness│   │Attribution│          │   │
│  │  │  Scorer   │   │  Scorer   │   │  Scorer   │          │   │
│  │  └───────────┘   └───────────┘   └───────────┘          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                  Feedback Generator                       │   │
│  │  ┌───────────────────┐   ┌───────────────────┐          │   │
│  │  │   Claim Matcher   │   │   Text Highlighter │          │   │
│  │  │  (found/missing)  │   │ (response↔ground)  │          │   │
│  │  └───────────────────┘   └───────────────────┘          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                   Result Assembler                        │   │
│  │        Scores + Tiers + Feedback + Annotations            │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Scoring Metrics

### 1. Accuracy Score
**Purpose**: Measure how semantically similar the AI response is to the expected answer.

**Method**: Embedding cosine similarity

**Algorithm**:
```
1. Embed AI response using embedding provider
2. Compare to expected answer embedding
3. Cosine similarity → raw score (0.0 to 1.0)
4. Scale to 0-100 and apply tier thresholds
```

**Considerations**:
- Chunk long responses and compare chunk-by-chunk
- Take max or average similarity across chunks
- Higher similarity = more accurate

**Interface**:
```typescript
interface AccuracyScorer {
  score(
    response: string,
    expectedAnswer: ExpectedAnswer,
    groundTruth: StoredPage[]
  ): Promise<AccuracyResult>;
}

interface AccuracyResult {
  score: number;           // 0-100
  tier: ScoreTier;
  similarity: number;      // Raw cosine similarity (0-1)
  matchedChunks: ChunkMatch[];
}

interface ChunkMatch {
  responseSegment: string;
  groundTruthChunkId: string;
  similarity: number;
}
```

---

### 2. Completeness Score
**Purpose**: Measure whether required claims from the expected answer appear in the response.

**Method**: Claim presence detection

**Algorithm**:
```
1. Get list of required claims from expected answer
2. For each claim:
   a. Embed claim statement
   b. Search response for semantically similar text
   c. Mark as found if similarity > threshold
3. Score = (claims found / total required claims) * 100
```

**Threshold**: Default 0.75 similarity to count as "found"

**Interface**:
```typescript
interface CompletenessScorer {
  score(
    response: string,
    expectedClaims: ExpectedClaim[]
  ): Promise<CompletenessResult>;
}

interface CompletenessResult {
  score: number;           // 0-100
  tier: ScoreTier;
  claimsFound: ClaimMatch[];
  claimsMissing: ExpectedClaim[];
  totalRequired: number;
  totalFound: number;
}

interface ClaimMatch {
  claim: ExpectedClaim;
  matchedText: string;     // Text from response that matched
  similarity: number;
  position: TextPosition;  // Where in response it was found
}

interface TextPosition {
  start: number;
  end: number;
}
```

---

### 3. Attribution Score
**Purpose**: Measure whether the AI response credits the source website.

**Method**: URL/domain and brand name detection

**Detection Types**:
1. **URL mention**: Full URL or partial path
2. **Domain mention**: Domain name (e.g., "example.com")
3. **Brand mention**: Company/product name

**Algorithm**:
```
1. Define attribution targets:
   - Domain variations (example.com, www.example.com)
   - Brand names from ground truth entities
2. Search response text for each target
3. Score based on presence and prominence:
   - URL cited: 100 points
   - Domain mentioned: 75 points  
   - Brand mentioned: 50 points
   - Multiple mentions: bonus points (capped)
4. Normalize to 0-100
```

**Interface**:
```typescript
interface AttributionScorer {
  score(
    response: string,
    domain: string,
    brandNames: string[]
  ): Promise<AttributionResult>;
}

interface AttributionResult {
  score: number;           // 0-100
  tier: ScoreTier;
  mentions: AttributionMention[];
  hasUrlCitation: boolean;
  hasDomainMention: boolean;
  hasBrandMention: boolean;
}

interface AttributionMention {
  type: 'url' | 'domain' | 'brand';
  matchedText: string;
  position: TextPosition;
  context: string;         // Surrounding text for context
}
```

---

## Score Tiers

```typescript
type ScoreTier = 'excellent' | 'good' | 'fair' | 'poor';

const TIER_THRESHOLDS = {
  excellent: 85,  // 85-100
  good: 70,       // 70-84
  fair: 50,       // 50-69
  poor: 0         // 0-49
};

function getTier(score: number): ScoreTier {
  if (score >= 85) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 50) return 'fair';
  return 'poor';
}
```

---

## Feedback Generation

### Claim Matcher
**Purpose**: Identify which expected claims were found or missing in the response.

**Output**:
```typescript
interface ClaimFeedback {
  found: {
    claim: ExpectedClaim;
    evidence: string;        // Response text that supports claim
    confidence: number;
  }[];
  missing: {
    claim: ExpectedClaim;
    importance: 'required' | 'expected' | 'optional';
  }[];
  notInGroundTruth: {
    statement: string;       // Claims in response not in ground truth
    position: TextPosition;
  }[];
}
```

### Text Highlighter
**Purpose**: Show which parts of the response correspond to ground truth content.

**Output**:
```typescript
interface TextHighlight {
  responseRange: TextPosition;
  responseText: string;
  groundTruthSource: {
    chunkId: string;
    pageUrl: string;
    matchedText: string;
  };
  similarity: number;
}

interface HighlightFeedback {
  highlights: TextHighlight[];
  coveragePercent: number;   // % of response that matches ground truth
  unmatchedSegments: {
    text: string;
    position: TextPosition;
  }[];
}
```

---

## Analysis Result Schema

```typescript
interface AnalysisResult {
  id: string;
  
  // Context
  queryId: string;
  query: string;
  domain: string;
  aiProvider: string;
  
  // Response
  response: string;
  responseAt: Date;
  
  // Scores
  scores: {
    accuracy: AccuracyResult;
    completeness: CompletenessResult;
    attribution: AttributionResult;
  };
  
  // Feedback
  feedback: {
    claims: ClaimFeedback;
    highlights: HighlightFeedback;
  };
  
  // Metadata
  analyzedAt: Date;
  analyzerVersion: string;
  groundTruthVersion: string;
}
```

---

## Analyzer Pipeline

```typescript
interface ResponseAnalyzer {
  // Main analysis
  analyze(
    response: AIResponse,
    query: GeneratedQuery,
    groundTruth: StoredPage[]
  ): Promise<AnalysisResult>;
  
  // Batch analysis
  analyzeBatch(
    responses: AIResponse[],
    queries: GeneratedQuery[],
    groundTruth: StoredPage[]
  ): AsyncGenerator<AnalysisResult>;
  
  // Re-analyze with updated ground truth
  reanalyze(
    previousResult: AnalysisResult,
    newGroundTruth: StoredPage[]
  ): Promise<AnalysisResult>;
}

interface AIResponse {
  queryId: string;
  provider: string;
  model: string;
  response: string;
  respondedAt: Date;
  metadata?: Record<string, unknown>;
}
```

---

## Storage Schema

```typescript
interface StoredAnalysis {
  // Primary key
  id: string;
  
  // Foreign keys
  queryId: string;
  querySetId: string;
  runId: string;            // Groups analyses from same test run
  
  // Full result
  result: AnalysisResult;
  
  // Denormalized for querying
  domain: string;
  aiProvider: string;
  accuracyScore: number;
  completenessScore: number;
  attributionScore: number;
  
  // Timestamps
  createdAt: Date;
}

// Aggregation view
interface DomainScoreSummary {
  domain: string;
  runId: string;
  runAt: Date;
  
  queryCount: number;
  
  accuracy: {
    mean: number;
    median: number;
    min: number;
    max: number;
    distribution: Record<ScoreTier, number>;
  };
  
  completeness: {
    mean: number;
    median: number;
    min: number;
    max: number;
    distribution: Record<ScoreTier, number>;
  };
  
  attribution: {
    mean: number;
    median: number;
    min: number;
    max: number;
    distribution: Record<ScoreTier, number>;
  };
  
  // Trend vs previous run
  trend?: {
    accuracyDelta: number;
    completenessDelta: number;
    attributionDelta: number;
  };
}
```

---

## Configuration

```typescript
interface AnalyzerConfig {
  // Accuracy settings
  accuracy: {
    chunkingStrategy: 'none' | 'sentences' | 'paragraphs';
    aggregation: 'max' | 'mean';     // How to combine chunk scores
  };
  
  // Completeness settings
  completeness: {
    similarityThreshold: number;      // Default: 0.75
    requireAllRequired: boolean;      // Fail if any required claim missing
  };
  
  // Attribution settings
  attribution: {
    urlWeight: number;                // Default: 100
    domainWeight: number;             // Default: 75
    brandWeight: number;              // Default: 50
    multiMentionBonus: number;        // Default: 10 per additional mention
    maxScore: number;                 // Default: 100 (cap)
  };
  
  // Tier thresholds (customizable)
  tiers: {
    excellent: number;                // Default: 85
    good: number;                     // Default: 70
    fair: number;                     // Default: 50
  };
  
  // Provider settings
  providers: {
    embedding: 'openai' | 'local';
    embeddingModel?: string;
  };
}
```

---

## Analysis Workflow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Query     │────▶│ AI Provider │────▶│  Response   │
│  Generator  │     │ Abstraction │     │  Analyzer   │
└─────────────┘     └─────────────┘     └─────────────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │   Storage   │
                                        │  & History  │
                                        └─────────────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │  Dashboard  │
                                        │   Display   │
                                        └─────────────┘
```

---

## Batch Processing

For efficiency, analyses can be run in batches:

```typescript
interface AnalysisBatchConfig {
  concurrency: number;        // Parallel analyses, default: 5
  retryOnFailure: boolean;    // Retry failed analyses
  maxRetries: number;         // Default: 2
  continueOnError: boolean;   // Don't stop batch on single failure
}

interface BatchResult {
  runId: string;
  domain: string;
  startedAt: Date;
  completedAt: Date;
  
  total: number;
  succeeded: number;
  failed: number;
  
  results: AnalysisResult[];
  errors: {
    queryId: string;
    error: string;
  }[];
  
  summary: DomainScoreSummary;
}
```

---

## Error Handling

| Error Type | Handling |
|------------|----------|
| Empty response from AI | Score as 0 across all metrics, flag for review |
| Embedding API failure | Retry with backoff, fall back to keyword matching |
| Response too long | Truncate or chunk, note in metadata |
| Ground truth not found | Error - cannot analyze without ground truth |
| Malformed response | Best-effort parsing, flag issues in feedback |

---

## Metrics & Logging

Track:
- Analyses per domain/run
- Score distributions over time
- Average analysis latency
- Embedding API token usage
- Error rates by type
- Claim detection precision (if manually validated)

---

## Dependencies

```json
{
  "dependencies": {
    "openai": "^4.0.0",
    "compromise": "^14.0.0",
    "string-similarity": "^4.0.0"
  }
}
```

---

## Open Questions

- [ ] Should we support custom scoring weights per metric?
- [ ] How to handle AI responses in different languages than ground truth?
- [ ] Should we detect hallucinations (confident wrong statements)?
- [ ] Support for comparing multiple AI providers side-by-side?

---

*Spec Version: 1.0*
*Created: 2026-01-30*
*Status: Draft*
