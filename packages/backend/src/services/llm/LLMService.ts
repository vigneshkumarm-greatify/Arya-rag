/**
 * LLM Service Interface
 * 
 * Defines the contract for language model services in the RAG system.
 * Supports both local (Ollama) and cloud (OpenAI) providers with consistent interface.
 * 
 * @author ARYA RAG Team
 */

export interface LLMRequest {
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  stopSequences?: string[];
  systemPrompt?: string;
  metadata?: {
    userId?: string;
    queryId?: string;
    documentIds?: string[];
  };
}

export interface LLMResponse {
  text: string;
  finishReason: 'completed' | 'max_tokens' | 'stop_sequence' | 'error';
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  processingTime: number;
}

export interface LLMStreamResponse {
  text: string;
  isComplete: boolean;
  finishReason?: LLMResponse['finishReason'];
  usage?: LLMResponse['usage'];
}

export interface LLMServiceConfig {
  model: string;
  maxTokens: number;
  temperature: number;
  maxRetries: number;
  retryDelayMs: number;
  timeoutMs: number;
}

export interface LLMServiceStats {
  totalRequests: number;
  totalTokens: number;
  totalCost?: number;
  avgResponseTime: number;
  errorRate: number;
  lastRequestTime?: Date;
}

/**
 * Base abstract class for all LLM services
 */
export abstract class LLMService {
  protected config: LLMServiceConfig;
  protected stats: LLMServiceStats = {
    totalRequests: 0,
    totalTokens: 0,
    avgResponseTime: 0,
    errorRate: 0
  };

  constructor(config: LLMServiceConfig) {
    this.config = config;
  }

  /**
   * Generate text completion from prompt
   */
  abstract generateCompletion(request: LLMRequest): Promise<LLMResponse>;

  /**
   * Generate streaming completion (optional, for real-time responses)
   */
  async generateStreamingCompletion?(
    request: LLMRequest
  ): Promise<AsyncGenerator<LLMStreamResponse, void, unknown>>;

  /**
   * Test connectivity to the LLM service
   */
  abstract testConnection(): Promise<boolean>;

  /**
   * Get model information and capabilities
   */
  abstract getModelInfo(): Promise<{
    name: string;
    maxTokens: number;
    supportsStreaming: boolean;
    provider: string;
  }>;

  /**
   * Get current service statistics
   */
  getStats(): LLMServiceStats {
    return { ...this.stats };
  }

  /**
   * Reset service statistics
   */
  resetStats(): void {
    this.stats = {
      totalRequests: 0,
      totalTokens: 0,
      avgResponseTime: 0,
      errorRate: 0
    };
  }

  /**
   * Validate request parameters
   */
  protected validateRequest(request: LLMRequest): void {
    if (!request.prompt || request.prompt.trim().length === 0) {
      throw new Error('Prompt cannot be empty');
    }

    if (request.maxTokens && (request.maxTokens < 1 || request.maxTokens > this.config.maxTokens)) {
      throw new Error(`maxTokens must be between 1 and ${this.config.maxTokens}`);
    }

    if (request.temperature !== undefined && 
        (request.temperature < 0 || request.temperature > 2)) {
      throw new Error('Temperature must be between 0 and 2');
    }
  }

  /**
   * Update service statistics
   */
  protected updateStats(
    usage: LLMResponse['usage'],
    processingTime: number,
    hadError: boolean = false,
    cost?: number
  ): void {
    this.stats.totalRequests++;
    this.stats.totalTokens += usage.totalTokens;
    this.stats.lastRequestTime = new Date();

    // Update average processing time
    const prevAvg = this.stats.avgResponseTime;
    const count = this.stats.totalRequests;
    this.stats.avgResponseTime = ((prevAvg * (count - 1)) + processingTime) / count;

    // Update error rate
    if (hadError) {
      const errorCount = Math.floor(this.stats.errorRate * (count - 1)) + 1;
      this.stats.errorRate = errorCount / count;
    } else {
      const errorCount = Math.floor(this.stats.errorRate * (count - 1));
      this.stats.errorRate = errorCount / count;
    }

    // Update cost if provided
    if (cost !== undefined) {
      this.stats.totalCost = (this.stats.totalCost || 0) + cost;
    }
  }

  /**
   * Retry wrapper with exponential backoff
   */
  protected async withRetry<T>(
    operation: () => Promise<T>,
    context: string = 'operation'
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt === this.config.maxRetries) {
          console.error(`${context} failed after ${this.config.maxRetries + 1} attempts:`, lastError.message);
          throw lastError;
        }

        const delay = this.config.retryDelayMs * Math.pow(2, attempt);
        console.warn(`${context} failed (attempt ${attempt + 1}), retrying in ${delay}ms:`, lastError.message);
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  }

  /**
   * Create timeout promise wrapper
   */
  protected createTimeoutPromise<T>(promise: Promise<T>): Promise<T> {
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error(`LLM request timed out after ${this.config.timeoutMs}ms`)),
        this.config.timeoutMs
      );
    });

    return Promise.race([promise, timeout]);
  }

  /**
   * Count tokens in text (approximation for non-OpenAI models)
   */
  protected estimateTokens(text: string): number {
    // Rough estimation: 1 token ≈ 4 characters for English text
    // More accurate counting would require model-specific tokenizers
    return Math.ceil(text.length / 4);
  }

  /**
   * Truncate prompt to fit within model limits
   */
  protected truncatePrompt(prompt: string, maxTokens: number): string {
    const estimatedTokens = this.estimateTokens(prompt);
    
    if (estimatedTokens <= maxTokens) {
      return prompt;
    }

    // Truncate to approximate character limit
    const maxChars = maxTokens * 4;
    const truncated = prompt.substring(0, maxChars);
    
    // Try to truncate at word boundary
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > maxChars * 0.8) { // If we can preserve 80% of content
      return truncated.substring(0, lastSpace) + '...';
    }
    
    return truncated + '...';
  }
}

/**
 * LLM service provider types
 */
export type LLMProvider = 'ollama' | 'openai';

/**
 * Configuration for different providers
 */
export const LLM_CONFIGS: Record<LLMProvider, Partial<LLMServiceConfig>> = {
  ollama: {
    maxTokens: 4096,    // Conservative default for local models
    temperature: 0.7,
    maxRetries: 3,
    retryDelayMs: 1000,
    timeoutMs: 30000
  },
  openai: {
    maxTokens: 4000,    // Leave buffer for OpenAI context window
    temperature: 0.7,
    maxRetries: 5,
    retryDelayMs: 2000,
    timeoutMs: 60000
  }
};

/**
 * Common LLM models and their capabilities
 */
export const LLM_MODELS = {
  // Ollama models
  'mistral': { 
    maxTokens: 8192, 
    provider: 'ollama',
    supportsStreaming: true 
  },
  'llama2': { 
    maxTokens: 4096, 
    provider: 'ollama',
    supportsStreaming: true 
  },
  'codellama': { 
    maxTokens: 16384, 
    provider: 'ollama',
    supportsStreaming: true 
  },
  
  // OpenAI models
  'gpt-4': { 
    maxTokens: 8192, 
    provider: 'openai',
    supportsStreaming: true 
  },
  'gpt-4-turbo': { 
    maxTokens: 128000, 
    provider: 'openai',
    supportsStreaming: true 
  },
  'gpt-3.5-turbo': { 
    maxTokens: 16385, 
    provider: 'openai',
    supportsStreaming: true 
  }
} as const;

export type LLMModel = keyof typeof LLM_MODELS;