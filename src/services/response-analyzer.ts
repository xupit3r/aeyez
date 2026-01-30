import { AIResponse, ExpectedAnswer, ScoreBreakdown, AttributionEvidence } from '../types';
import { cosineSimilarity } from '../lib/utils';
import { createProvider } from './ai';

export class ResponseAnalyzer {
  async analyzeResponse(
    queryText: string,
    expectedAnswer: ExpectedAnswer,
    aiResponse: string,
    siteDomain: string
  ): Promise<ScoreBreakdown> {
    // Generate embeddings for semantic similarity (try OpenAI, fall back to Google)
    let provider = createProvider('openai');
    if (!provider.isAvailable()) {
      provider = createProvider('google');
    }

    let responseEmbedding: number[];
    let claimEmbeddings: number[][];
    try {
      const results = await Promise.all([
        provider.generateEmbedding(aiResponse),
        ...expectedAnswer.keyClaims.map(claim => provider.generateEmbedding(claim)),
      ]);
      responseEmbedding = results[0];
      claimEmbeddings = results.slice(1);
    } catch (error: any) {
      if (provider.name === 'openai') {
        console.log(`OpenAI embeddings failed (${error.message}), falling back to Google...`);
        const fallback = createProvider('google');
        if (fallback.isAvailable()) {
          const results = await Promise.all([
            fallback.generateEmbedding(aiResponse),
            ...expectedAnswer.keyClaims.map(claim => fallback.generateEmbedding(claim)),
          ]);
          responseEmbedding = results[0];
          claimEmbeddings = results.slice(1);
        } else {
          throw error;
        }
      } else {
        throw error;
      }
    }

    // Calculate accuracy score
    const accuracyResult = this.calculateAccuracy(
      aiResponse,
      expectedAnswer,
      responseEmbedding,
      claimEmbeddings
    );

    // Calculate completeness score (hybrid: semantic + keyword)
    const completenessResult = this.calculateCompleteness(
      aiResponse,
      expectedAnswer,
      responseEmbedding,
      claimEmbeddings
    );

    // Calculate attribution score
    const attributionResult = this.calculateAttribution(
      aiResponse,
      siteDomain
    );

    return {
      accuracy: accuracyResult,
      completeness: completenessResult,
      attribution: attributionResult,
    };
  }

  private calculateAccuracy(
    response: string,
    expectedAnswer: ExpectedAnswer,
    responseEmbedding: number[],
    claimEmbeddings: number[][]
  ): ScoreBreakdown['accuracy'] {
    if (expectedAnswer.keyClaims.length === 0) {
      return {
        score: 100,
        details: {
          accurateClaims: 0,
          totalClaims: 0,
          avgSimilarity: 1.0,
        },
      };
    }

    // Calculate semantic similarity for each claim
    const similarities = claimEmbeddings.map(claimEmb =>
      cosineSimilarity(responseEmbedding, claimEmb)
    );

    const avgSimilarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;
    
    // Count claims with similarity > 0.7 as accurate
    const accurateClaims = similarities.filter(sim => sim > 0.7).length;

    // Score: percentage of accurate claims, weighted by avg similarity
    const score = ((accurateClaims / expectedAnswer.keyClaims.length) * 0.7 + avgSimilarity * 0.3) * 100;

    return {
      score: Math.round(score),
      details: {
        accurateClaims,
        totalClaims: expectedAnswer.keyClaims.length,
        avgSimilarity: Math.round(avgSimilarity * 100) / 100,
      },
    };
  }

  private calculateCompleteness(
    response: string,
    expectedAnswer: ExpectedAnswer,
    responseEmbedding: number[],
    claimEmbeddings: number[][]
  ): ScoreBreakdown['completeness'] {
    const responseLower = response.toLowerCase();

    // Hybrid check: a claim is "found" if either semantic OR keyword passes
    const foundClaims: string[] = [];
    const missingClaims: string[] = [];

    for (let i = 0; i < expectedAnswer.keyClaims.length; i++) {
      const claim = expectedAnswer.keyClaims[i];

      // Semantic check: cosine similarity > 0.75 threshold
      const semanticFound = i < claimEmbeddings.length
        ? cosineSimilarity(responseEmbedding, claimEmbeddings[i]) > 0.75
        : false;

      // Keyword check: existing isClaimMentioned as secondary signal
      const keywordFound = this.isClaimMentioned(claim, responseLower);

      if (semanticFound || keywordFound) {
        foundClaims.push(claim);
      } else {
        missingClaims.push(claim);
      }
    }

    // Check for required keywords
    const mentionedKeywords = expectedAnswer.keywords.filter(keyword =>
      responseLower.includes(keyword.toLowerCase())
    );

    // Calculate score: 70% claim coverage + 30% keyword coverage
    const claimScore = expectedAnswer.keyClaims.length > 0
      ? foundClaims.length / expectedAnswer.keyClaims.length
      : 1;

    const keywordScore = expectedAnswer.keywords.length > 0
      ? mentionedKeywords.length / expectedAnswer.keywords.length
      : 1;

    const score = (claimScore * 0.7 + keywordScore * 0.3) * 100;

    return {
      score: Math.round(score),
      details: {
        mentionedClaims: foundClaims.length,
        requiredClaims: expectedAnswer.keyClaims.length,
        missingClaims: missingClaims.slice(0, 5), // Limit to 5 for readability
      },
    };
  }

  private calculateAttribution(
    response: string,
    siteDomain: string
  ): ScoreBreakdown['attribution'] {
    const evidence: AttributionEvidence[] = [];
    let score = 0;

    const responseLower = response.toLowerCase();
    const domainLower = siteDomain.toLowerCase();

    // Check for direct URL mention
    const hasDirectUrl = 
      responseLower.includes(`https://${domainLower}`) ||
      responseLower.includes(`http://${domainLower}`) ||
      responseLower.includes(`www.${domainLower}`);

    if (hasDirectUrl) {
      score += 60;
      evidence.push({
        type: 'url',
        value: siteDomain,
        context: 'Direct URL found in response',
      });
    }

    // Check for domain mention (without protocol)
    const hasDomainMention = responseLower.includes(domainLower);
    
    if (hasDomainMention && !hasDirectUrl) {
      score += 30;
      evidence.push({
        type: 'domain',
        value: siteDomain,
        context: 'Domain name mentioned',
      });
    }

    // Check for brand name (simplified - just check first part of domain)
    const brandName = domainLower.split('.')[0];
    const hasBrandMention = 
      brandName.length > 3 && // Avoid short/common words
      responseLower.includes(brandName);

    if (hasBrandMention) {
      score += 10;
      evidence.push({
        type: 'brand',
        value: brandName,
        context: 'Brand name mentioned',
      });
    }

    return {
      score: Math.min(score, 100), // Cap at 100
      details: {
        hasDirectUrl,
        hasDomainMention,
        hasBrandMention,
        evidence,
      },
    };
  }

  private isClaimMentioned(claim: string, responseText: string): boolean {
    // Simple keyword matching - can be improved with NLP
    const claimWords = claim.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const matchedWords = claimWords.filter(word => responseText.includes(word));
    
    // Consider claim mentioned if >60% of significant words are present
    return matchedWords.length / claimWords.length > 0.6;
  }
}

export default ResponseAnalyzer;
