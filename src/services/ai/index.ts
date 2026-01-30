import { AIProvider } from './base';
import { OpenAIProvider } from './openai';
import { GoogleProvider } from './google';
import config from '../../lib/config';

export * from './base';
export * from './openai';
export * from './google';

// Provider factory
export function createProvider(providerName: 'openai' | 'google'): AIProvider {
  switch (providerName) {
    case 'openai':
      return new OpenAIProvider(config.providers.openai);
    case 'google':
      return new GoogleProvider(config.providers.google);
    default:
      throw new Error(`Unknown provider: ${providerName}`);
  }
}

// Get all available providers
export function getAvailableProviders(): AIProvider[] {
  const providers: AIProvider[] = [];

  try {
    const openai = createProvider('openai');
    if (openai.isAvailable()) {
      providers.push(openai);
    }
  } catch (error) {
    console.warn('OpenAI provider not available:', (error as Error).message);
  }

  try {
    const google = createProvider('google');
    if (google.isAvailable()) {
      providers.push(google);
    }
  } catch (error) {
    console.warn('Google provider not available:', (error as Error).message);
  }

  return providers;
}

// Rate limiter class
export class RateLimiter {
  private requests: number[] = [];
  private tokens: number[] = [];

  constructor(
    private maxRequestsPerMinute: number,
    private maxTokensPerMinute: number
  ) {}

  async waitIfNeeded(estimatedTokens: number = 1000): Promise<void> {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Clean old entries
    this.requests = this.requests.filter(time => time > oneMinuteAgo);
    this.tokens = this.tokens.filter(time => time > oneMinuteAgo);

    // Check if we need to wait
    while (
      this.requests.length >= this.maxRequestsPerMinute ||
      this.tokens.length + estimatedTokens >= this.maxTokensPerMinute
    ) {
      // Wait for oldest request to expire
      const oldestRequest = Math.min(...this.requests);
      const waitTime = oldestRequest + 60000 - Date.now() + 100; // Add 100ms buffer
      
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

      // Clean again
      const currentTime = Date.now();
      const oneMinuteAgoNow = currentTime - 60000;
      this.requests = this.requests.filter(time => time > oneMinuteAgoNow);
      this.tokens = this.tokens.filter(time => time > oneMinuteAgoNow);
    }

    // Record this request
    this.requests.push(now);
    for (let i = 0; i < estimatedTokens; i++) {
      this.tokens.push(now);
    }
  }
}

// Global rate limiters
const rateLimiters = new Map<string, RateLimiter>();

export function getRateLimiter(provider: string): RateLimiter {
  if (!rateLimiters.has(provider)) {
    // Default rate limits (can be configured)
    rateLimiters.set(provider, new RateLimiter(60, 60000));
  }
  return rateLimiters.get(provider)!;
}
