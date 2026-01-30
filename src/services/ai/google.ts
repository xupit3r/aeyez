import { GoogleGenerativeAI } from '@google/generative-ai';
import { BaseAIProvider } from './base';
import { AIRequest, AIResponse } from '../../types';
import { retryWithBackoff } from '../../lib/utils';

export class GoogleProvider extends BaseAIProvider {
  name = 'google';
  private client: GoogleGenerativeAI;

  constructor(config: any) {
    super(config);
    this.client = new GoogleGenerativeAI(config.apiKey);
  }

  async query(request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();

    const model = this.client.getGenerativeModel({
      model: this.config.model || 'gemini-2.5-flash',
    });

    // Convert messages to Gemini format
    const history = request.messages.slice(0, -1).map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    const lastMessage = request.messages[request.messages.length - 1];

    const result = await retryWithBackoff(async () => {
      const chat = model.startChat({
        history,
        generationConfig: {
          temperature: request.temperature ?? this.config.temperature ?? 0.7,
          maxOutputTokens: request.maxTokens ?? this.config.maxTokens ?? 8192,
        },
      });

      return chat.sendMessage(lastMessage.content);
    }, 3, 1000);

    const latencyMs = Date.now() - startTime;
    const response = await result.response;
    const text = response.text();

    // Gemini doesn't provide token counts in the same way
    // Approximate based on text length
    const inputTokens = Math.ceil(
      request.messages.reduce((sum, msg) => sum + msg.content.length, 0) / 4
    );
    const outputTokens = Math.ceil(text.length / 4);

    return {
      content: text,
      provider: this.name,
      model: this.config.model || 'gemini-2.5-flash',
      inputTokens,
      outputTokens,
      cost: this.calculateCost(inputTokens, outputTokens),
      latencyMs,
      respondedAt: new Date(),
    };
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const model = this.client.getGenerativeModel({
      model: 'text-embedding-004',
    });

    const result = await retryWithBackoff(async () => {
      return model.embedContent(text);
    }, 3, 1000);

    return result.embedding.values;
  }

  protected calculateCost(inputTokens: number, outputTokens: number): number {
    // Gemini 1.5 Flash pricing (as of 2024)
    // $0.075 per 1M input tokens, $0.30 per 1M output tokens (up to 128k context)
    const inputCost = (inputTokens / 1_000_000) * 0.075;
    const outputCost = (outputTokens / 1_000_000) * 0.30;
    return inputCost + outputCost;
  }
}
