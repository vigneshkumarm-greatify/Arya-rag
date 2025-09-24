/**
 * Embedding Service Interface
 * 
 * Defines the contract for embedding generation services.
 * Supports both local (Ollama) and cloud (OpenAI) providers with consistent interface.
 * 
 * @author ARYA RAG Team
 */

export interface EmbeddingRequest {
  text: string;
  metadata?: {
    chunkId?: string;
    documentId?: string;
    pageNumber?: number;
    chunkIndex?: number;
  };
}

export interface EmbeddingResponse {
  embedding: number[];
  tokenCount?: number;
  model: string;
  dimensions: number;
}

export interface BatchEmbeddingRequest {
  texts: EmbeddingRequest[];
  batchId?: string;
}

export interface BatchEmbeddingResponse {
  embeddings: EmbeddingResponse[];
  totalTokens: number;
  processingTime: number;
  model: string;
  batchId?: string;
  errors?: EmbeddingError[];
}

export interface EmbeddingError {
  index: number;
  error: string;
  text?: string;
}

export interface EmbeddingServiceConfig {
  model: string;
  maxBatchSize: number;
  maxRetries: number;
  retryDelayMs: number;
  timeoutMs: number;
  dimensions?: number;
}

export interface EmbeddingServiceStats {
  totalRequests: number;
  totalTokens: number;
  totalCost?: number;
  avgProcessingTime: number;
  errorRate: number;
  lastRequestTime?: Date;
}

/**
 * Base interface for all embedding services
 */
export abstract class EmbeddingService {
  protected config: EmbeddingServiceConfig;
  protected stats: EmbeddingServiceStats = {
    totalRequests: 0,
    totalTokens: 0,
    avgProcessingTime: 0,
    errorRate: 0
  };

  constructor(config: EmbeddingServiceConfig) {
    this.config = config;
  }

  /**
   * Generate embedding for a single text
   */
  abstract generateEmbedding(request: EmbeddingRequest): Promise<EmbeddingResponse>;

  /**
   * Generate embeddings for multiple texts in batch
   * More efficient than individual requests for large datasets
   */
  abstract generateBatchEmbeddings(request: BatchEmbeddingRequest): Promise<BatchEmbeddingResponse>;

  /**
   * Test connectivity to the embedding service
   */
  abstract testConnection(): Promise<boolean>;

  /**
   * Get model information and capabilities
   */
  abstract getModelInfo(): Promise<{
    name: string;
    dimensions: number;
    maxTokens: number;
    provider: string;
  }>;

  /**
   * Get current service statistics
   */
  getStats(): EmbeddingServiceStats {
    return { ...this.stats };
  }

  /**
   * Reset service statistics
   */
  resetStats(): void {
    this.stats = {
      totalRequests: 0,
      totalTokens: 0,
      avgProcessingTime: 0,
      errorRate: 0
    };
  }

  /**
   * Validate text before embedding generation
   */
  protected validateText(text: string): void {
    if (!text || text.trim().length === 0) {
      throw new Error('Text cannot be empty');
    }

    if (text.length > 8192) { // Conservative limit for most models
      throw new Error(`Text too long: ${text.length} characters. Maximum: 8192`);
    }
  }

  /**
   * Update service statistics
   */
  protected updateStats(
    tokensUsed: number,
    processingTime: number,
    hadError: boolean = false
  ): void {
    this.stats.totalRequests++;
    this.stats.totalTokens += tokensUsed;
    this.stats.lastRequestTime = new Date();

    // Update average processing time
    const prevAvg = this.stats.avgProcessingTime;
    const count = this.stats.totalRequests;
    this.stats.avgProcessingTime = ((prevAvg * (count - 1)) + processingTime) / count;

    // Update error rate
    if (hadError) {
      const errorCount = Math.floor(this.stats.errorRate * (count - 1)) + 1;
      this.stats.errorRate = errorCount / count;
    } else {
      const errorCount = Math.floor(this.stats.errorRate * (count - 1));
      this.stats.errorRate = errorCount / count;
    }
  }

  /**
   * Split large batch into smaller chunks respecting maxBatchSize
   */
  protected splitBatch(requests: EmbeddingRequest[]): EmbeddingRequest[][] {
    const batches: EmbeddingRequest[][] = [];
    
    for (let i = 0; i < requests.length; i += this.config.maxBatchSize) {
      batches.push(requests.slice(i, i + this.config.maxBatchSize));
    }
    
    return batches;
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
   * Create timeout promise
   */
  protected createTimeoutPromise<T>(promise: Promise<T>): Promise<T> {
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error(`Operation timed out after ${this.config.timeoutMs}ms`)),
        this.config.timeoutMs
      );
    });

    return Promise.race([promise, timeout]);
  }
}

/**
 * Embedding service provider types
 */
export type EmbeddingProvider = 'ollama' | 'openai';

/**
 * Configuration for different providers
 */
export const EMBEDDING_CONFIGS: Record<EmbeddingProvider, Partial<EmbeddingServiceConfig>> = {
  ollama: {
    maxBatchSize: 50,  // Ollama handles smaller batches better
    maxRetries: 3,
    retryDelayMs: 1000,
    timeoutMs: 30000
  },
  openai: {
    maxBatchSize: 100,  // OpenAI can handle larger batches
    maxRetries: 5,
    retryDelayMs: 2000,
    timeoutMs: 60000
  }
};

/**
 * Default dimensions for embedding models.
 * Can be overridden by EMBEDDING_DIMENSIONS environment variable.
 * For OpenAI v3 models, dimensions are configurable via API parameters.
 */
export const EMBEDDING_MODELS = {
  // Ollama models (local/free)
  'nomic-embed-text': { 
    dimensions: parseInt(process.env.EMBEDDING_DIMENSIONS || '768'), 
    provider: 'ollama',
    nativeDimensions: 768
  },
  'all-minilm': { 
    dimensions: parseInt(process.env.EMBEDDING_DIMENSIONS || '384'), 
    provider: 'ollama',
    nativeDimensions: 384
  },
  'bge-small': { 
    dimensions: parseInt(process.env.EMBEDDING_DIMENSIONS || '384'), 
    provider: 'ollama',
    nativeDimensions: 384
  },
  'bge-large': { 
    dimensions: parseInt(process.env.EMBEDDING_DIMENSIONS || '1024'), 
    provider: 'ollama',
    nativeDimensions: 1024
  },
  
  // OpenAI models (cloud/paid) - Only v3 models support 768 dimensions
  'text-embedding-3-small': { 
    dimensions: parseInt(process.env.EMBEDDING_DIMENSIONS || '768'), 
    provider: 'openai',
    nativeDimensions: 1536,
    configurable: true // Can be reduced via API parameter
  },
  'text-embedding-3-large': { 
    dimensions: parseInt(process.env.EMBEDDING_DIMENSIONS || '768'), 
    provider: 'openai',
    nativeDimensions: 3072,
    configurable: true // Can be reduced via API parameter
  }
} as const;

export type EmbeddingModel = keyof typeof EMBEDDING_MODELS;