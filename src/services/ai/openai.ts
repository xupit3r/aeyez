import OpenAI from 'openai';
import { BaseAIProvider } from './base';
import { AIRequest, AIResponse } from '../../types';
import { retryWithBackoff } from '../../lib/utils';

export class OpenAIProvider extends BaseAIProvider {
  name = 'openai';
  private client: OpenAI;

  constructor(config: any) {
    super(config);
    this.client = new OpenAI({
      apiKey: config.apiKey,
      timeout: config.timeout || 30000,
    });
  }

  async query(request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();

    const completion = await retryWithBackoff(async () => {
      return this.client.chat.completions.create({
        model: this.config.model || 'gpt-4o-mini',
        messages: request.messages,
        temperature: request.temperature ?? this.config.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? this.config.maxTokens ?? 4096,
      });
    }, 3, 1000);

    const latencyMs = Date.now() - startTime;
    const inputTokens = completion.usage?.prompt_tokens || 0;
    const outputTokens = completion.usage?.completion_tokens || 0;

    return {
      content: completion.choices[0]?.message?.content || '',
      provider: this.name,
      model: completion.model,
      inputTokens,
      outputTokens,
      cost: this.calculateCost(inputTokens, outputTokens),
      latencyMs,
      respondedAt: new Date(),
    };
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const response = await retryWithBackoff(async () => {
      return this.client.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
      });
    }, 3, 1000);

    return response.data[0].embedding;
  }

  protected calculateCost(inputTokens: number, outputTokens: number): number {
    // GPT-4o-mini pricing (as of 2024)
    // $0.150 per 1M input tokens, $0.600 per 1M output tokens
    const inputCost = (inputTokens / 1_000_000) * 0.15;
    const outputCost = (outputTokens / 1_000_000) * 0.60;
    return inputCost + outputCost;
  }
}
