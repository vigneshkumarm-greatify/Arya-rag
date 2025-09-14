/**
 * Ollama Embedding Service
 * 
 * Implements embedding generation using local Ollama models.
 * Provides free, privacy-focused embedding generation without external API calls.
 * 
 * @author ARYA RAG Team
 */

import { 
  EmbeddingService, 
  EmbeddingRequest, 
  EmbeddingResponse, 
  BatchEmbeddingRequest, 
  BatchEmbeddingResponse,
  EmbeddingServiceConfig,
  EMBEDDING_CONFIGS
} from './EmbeddingService';
import { countTokens } from '../../utils/tokenCounter';

interface OllamaEmbeddingRequest {
  model: string;
  prompt: string;
}

interface OllamaEmbeddingAPIResponse {
  embedding: number[];
}

interface OllamaModelInfo {
  name: string;
  size: number;
  digest: string;
  details: {
    format: string;
    family: string;
    parameter_size: string;
  };
}

interface OllamaModelsResponse {
  models: OllamaModelInfo[];
}

export interface OllamaEmbeddingConfig extends EmbeddingServiceConfig {
  baseUrl: string;
  model: string;
}

export class OllamaEmbeddingService extends EmbeddingService {
  private readonly baseUrl: string;
  
  constructor(config: Partial<OllamaEmbeddingConfig> = {}) {
    const defaultConfig = {
      ...EMBEDDING_CONFIGS.ollama,
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      model: process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text',
      dimensions: 768, // Default for nomic-embed-text
      maxBatchSize: 50,
      maxRetries: 3,
      retryDelayMs: 1000,
      timeoutMs: 30000
    } as OllamaEmbeddingConfig;

    super({ ...defaultConfig, ...config });
    this.baseUrl = (config.baseUrl || defaultConfig.baseUrl).replace(/\/$/, '');
    
    console.log(`🔗 Initialized Ollama Embedding Service`);
    console.log(`   Base URL: ${this.baseUrl}`);
    console.log(`   Model: ${this.config.model}`);
    console.log(`   Dimensions: ${this.config.dimensions}`);
  }

  /**
   * Generate embedding for a single text using Ollama
   */
  async generateEmbedding(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    this.validateText(request.text);
    
    const startTime = Date.now();
    
    try {
      const embedding = await this.withRetry(
        () => this.callOllamaEmbedding(request.text),
        `Generate embedding for text (${request.text.length} chars)`
      );

      const tokenCount = countTokens(request.text);
      const processingTime = Date.now() - startTime;
      
      this.updateStats(tokenCount, processingTime, false);

      return {
        embedding,
        tokenCount,
        model: this.config.model,
        dimensions: this.config.dimensions || embedding.length
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.updateStats(0, processingTime, true);
      
      throw new Error(`Ollama embedding generation failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   * Ollama doesn't have native batch API, so we process in parallel with rate limiting
   */
  async generateBatchEmbeddings(request: BatchEmbeddingRequest): Promise<BatchEmbeddingResponse> {
    const startTime = Date.now();
    const embeddings: EmbeddingResponse[] = [];
    const errors: any[] = [];
    let totalTokens = 0;

    console.log(`🔄 Processing batch of ${request.texts.length} embeddings with Ollama`);

    // Split into smaller batches to avoid overwhelming Ollama
    const batches = this.splitBatch(request.texts);
    
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(`   Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} texts)`);

      // Process batch in parallel with some concurrency control
      const batchPromises = batch.map(async (embeddingRequest, index) => {
        try {
          const response = await this.generateEmbedding(embeddingRequest);
          return { success: true, response, index: batchIndex * this.config.maxBatchSize + index };
        } catch (error) {
          return { 
            success: false, 
            error: error instanceof Error ? error.message : String(error),
            index: batchIndex * this.config.maxBatchSize + index,
            text: embeddingRequest.text.substring(0, 100) + '...'
          };
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          if (result.value.success) {
            embeddings.push(result.value.response!);
            totalTokens += result.value.response?.tokenCount || 0;
          } else {
            errors.push({
              index: result.value.index,
              error: result.value.error,
              text: result.value.text
            });
          }
        } else {
          errors.push({
            index: batchIndex * this.config.maxBatchSize + index,
            error: result.reason instanceof Error ? result.reason.message : String(result.reason)
          });
        }
      });

      // Small delay between batches to be nice to Ollama
      if (batchIndex < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    const processingTime = Date.now() - startTime;
    
    console.log(`✅ Batch processing complete: ${embeddings.length}/${request.texts.length} successful`);
    if (errors.length > 0) {
      console.warn(`⚠️  ${errors.length} embedding errors occurred`);
    }

    return {
      embeddings,
      totalTokens,
      processingTime,
      model: this.config.model,
      batchId: request.batchId,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * Test connection to Ollama server
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        console.error('Ollama server responded with error:', response.status, response.statusText);
        return false;
      }

      const data = await response.json() as OllamaModelsResponse;
      
      // Check if our model is available
      const modelAvailable = data.models.some(model => 
        model.name.includes(this.config.model)
      );

      if (!modelAvailable) {
        console.warn(`⚠️  Model '${this.config.model}' not found on Ollama server`);
        console.log('Available models:', data.models.map(m => m.name).join(', '));
        return false;
      }

      console.log(`✅ Ollama connection test passed. Model '${this.config.model}' is available`);
      return true;

    } catch (error) {
      console.error('Ollama connection test failed:', error instanceof Error ? error.message : error);
      return false;
    }
  }

  /**
   * Get model information from Ollama
   */
  async getModelInfo(): Promise<{
    name: string;
    dimensions: number;
    maxTokens: number;
    provider: string;
  }> {
    try {
      // Get model list to verify it exists
      const response = await fetch(`${this.baseUrl}/api/tags`);
      const data = await response.json() as OllamaModelsResponse;
      
      const modelInfo = data.models.find(model => 
        model.name.includes(this.config.model)
      );

      if (!modelInfo) {
        throw new Error(`Model '${this.config.model}' not found on Ollama server`);
      }

      // Test embedding to get actual dimensions
      const testEmbedding = await this.callOllamaEmbedding('test');
      
      return {
        name: this.config.model,
        dimensions: testEmbedding.length,
        maxTokens: 8192, // Conservative estimate for most Ollama models
        provider: 'ollama'
      };

    } catch (error) {
      throw new Error(`Failed to get Ollama model info: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Make actual API call to Ollama for embedding generation
   */
  private async callOllamaEmbedding(text: string): Promise<number[]> {
    const requestBody: OllamaEmbeddingRequest = {
      model: this.config.model,
      prompt: text
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama API error (${response.status}): ${errorText}`);
      }

      const data = await response.json() as OllamaEmbeddingAPIResponse;
      
      if (!data.embedding || !Array.isArray(data.embedding) || data.embedding.length === 0) {
        throw new Error('Invalid embedding response from Ollama');
      }

      return data.embedding;

    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error(`Ollama request timed out after ${this.config.timeoutMs}ms`);
        }
        throw error;
      }
      
      throw new Error(`Unknown error calling Ollama: ${error}`);
    }
  }

  /**
   * Check if Ollama server is running and model is available
   */
  async isReady(): Promise<{ ready: boolean; message: string }> {
    try {
      // Check server availability
      const serverResponse = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });

      if (!serverResponse.ok) {
        return {
          ready: false,
          message: `Ollama server not responding (${serverResponse.status})`
        };
      }

      // Check model availability
      const data = await serverResponse.json() as OllamaModelsResponse;
      const modelAvailable = data.models.some(model => 
        model.name.includes(this.config.model)
      );

      if (!modelAvailable) {
        return {
          ready: false,
          message: `Model '${this.config.model}' not available. Run: ollama pull ${this.config.model}`
        };
      }

      return {
        ready: true,
        message: `Ollama ready with model '${this.config.model}'`
      };

    } catch (error) {
      return {
        ready: false,
        message: `Ollama not available: ${error instanceof Error ? error.message : error}`
      };
    }
  }
}