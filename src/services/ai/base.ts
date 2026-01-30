import { AIRequest, AIResponse, AIProviderConfig } from '../../types';

export interface AIProvider {
  name: string;
  query(request: AIRequest): Promise<AIResponse>;
  generateEmbedding(text: string): Promise<number[]>;
  isAvailable(): boolean;
}

export abstract class BaseAIProvider implements AIProvider {
  abstract name: string;
  protected config: AIProviderConfig;

  constructor(config: AIProviderConfig) {
    this.config = config;
  }

  abstract query(request: AIRequest): Promise<AIResponse>;
  abstract generateEmbedding(text: string): Promise<number[]>;

  isAvailable(): boolean {
    return !!this.config.apiKey && this.config.apiKey.length > 0;
  }

  protected calculateCost(inputTokens: number, outputTokens: number): number {
    // Override in subclasses with actual pricing
    return 0;
  }
}
