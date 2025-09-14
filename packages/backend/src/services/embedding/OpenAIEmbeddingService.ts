/**
 * OpenAI Embedding Service
 * 
 * Implements embedding generation using OpenAI's embedding models.
 * Provides high-quality embeddings with excellent performance for RAG applications.
 * 
 * @author ARYA RAG Team
 */

import OpenAI from 'openai';
import { 
  EmbeddingService, 
  EmbeddingRequest, 
  EmbeddingResponse, 
  BatchEmbeddingRequest, 
  BatchEmbeddingResponse,
  EmbeddingServiceConfig,
  EMBEDDING_CONFIGS,
  EMBEDDING_MODELS
} from './EmbeddingService';
import { countTokens } from '../../utils/tokenCounter';

export interface OpenAIEmbeddingConfig extends EmbeddingServiceConfig {
  apiKey: string;
  model: string;
  organization?: string;
  baseURL?: string;
}

export class OpenAIEmbeddingService extends EmbeddingService {
  private readonly client: OpenAI;
  private readonly costPerToken: number;
  
  constructor(config: Partial<OpenAIEmbeddingConfig> = {}) {
    const defaultConfig = {
      ...EMBEDDING_CONFIGS.openai,
      apiKey: process.env.OPENAI_API_KEY || '',
      model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-ada-002',
      dimensions: 1536, // Default for ada-002
      maxBatchSize: 100,
      maxRetries: 5,
      retryDelayMs: 2000,
      timeoutMs: 60000
    } as OpenAIEmbeddingConfig;

    super({ ...defaultConfig, ...config });
    
    if (!config.apiKey && !process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key is required. Set OPENAI_API_KEY environment variable.');
    }

    // Initialize OpenAI client
    this.client = new OpenAI({
      apiKey: (config.apiKey || defaultConfig.apiKey)!,
      organization: config.organization,
      baseURL: config.baseURL,
      timeout: this.config.timeoutMs,
      maxRetries: this.config.maxRetries
    });

    // Set cost per token based on model
    this.costPerToken = this.getCostPerToken(this.config.model);
    
    // Update dimensions based on model
    const modelInfo = EMBEDDING_MODELS[this.config.model as keyof typeof EMBEDDING_MODELS];
    if (modelInfo) {
      this.config.dimensions = modelInfo.dimensions;
    }

    console.log(`🔗 Initialized OpenAI Embedding Service`);
    console.log(`   Model: ${this.config.model}`);
    console.log(`   Dimensions: ${this.config.dimensions}`);
    console.log(`   Cost per 1K tokens: $${(this.costPerToken * 1000).toFixed(6)}`);
  }

  /**
   * Generate embedding for a single text using OpenAI - simplified like Arya-Chatbot
   */
  async generateEmbedding(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    this.validateText(request.text);
    
    const startTime = Date.now();
    
    try {
      console.log(`🔗 Making OpenAI embedding call for ${request.text.length} characters...`);
      
      // Direct API call like Arya-Chatbot - no complex retry wrapper
      const response = await this.client.embeddings.create({
        model: this.config.model,
        input: [request.text],
      });
      
      console.log('✅ OpenAI API response received:', {
        hasResponse: !!response,
        hasData: !!response?.data,
        dataLength: response?.data?.length || 0,
        firstEmbeddingLength: response?.data?.[0]?.embedding?.length || 0
      });

      const tokenCount = countTokens(request.text);
      const processingTime = Date.now() - startTime;
      
      // Update stats including cost
      this.updateStats(tokenCount, processingTime, false);
      if (this.stats.totalCost !== undefined) {
        this.stats.totalCost += tokenCount * this.costPerToken;
      } else {
        this.stats.totalCost = tokenCount * this.costPerToken;
      }

      return {
        embedding: response.data[0].embedding,
        tokenCount,
        model: this.config.model,
        dimensions: this.config.dimensions || response.data[0].embedding.length
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.updateStats(0, processingTime, true);
      
      console.error('❌ OpenAI embedding generation error:', error);
      throw new Error('Failed to generate embeddings');
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   * OpenAI supports native batch processing which is more efficient
   */
  async generateBatchEmbeddings(request: BatchEmbeddingRequest): Promise<BatchEmbeddingResponse> {
    const startTime = Date.now();
    const embeddings: EmbeddingResponse[] = [];
    const errors: any[] = [];
    let totalTokens = 0;

    console.log(`🔄 Processing batch of ${request.texts.length} embeddings with OpenAI`);

    // Split into smaller batches to respect API limits
    const batches = this.splitBatch(request.texts);
    
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(`   Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} texts)`);

      try {
        const batchTexts = batch.map(req => req.text);
        const response = await this.withRetry(
          () => this.callOpenAIEmbedding(batchTexts),
          `Process batch ${batchIndex + 1}/${batches.length}`
        );

        // Process successful responses
        response.data.forEach((embeddingData, index) => {
          const originalRequest = batch[index];
          const tokenCount = countTokens(originalRequest.text);
          
          embeddings.push({
            embedding: embeddingData.embedding,
            tokenCount,
            model: this.config.model,
            dimensions: this.config.dimensions || embeddingData.embedding.length
          });

          totalTokens += tokenCount;
        });

        // Update cost tracking
        if (this.stats.totalCost !== undefined) {
          this.stats.totalCost += response.usage.total_tokens * this.costPerToken;
        } else {
          this.stats.totalCost = response.usage.total_tokens * this.costPerToken;
        }

      } catch (error) {
        // If batch fails, record errors for all items in batch
        batch.forEach((req, index) => {
          errors.push({
            index: batchIndex * this.config.maxBatchSize + index,
            error: error instanceof Error ? error.message : String(error),
            text: req.text.substring(0, 100) + '...'
          });
        });
      }
    }

    const processingTime = Date.now() - startTime;
    
    console.log(`✅ Batch processing complete: ${embeddings.length}/${request.texts.length} successful`);
    console.log(`💰 Estimated cost: $${(totalTokens * this.costPerToken).toFixed(6)}`);
    
    if (errors.length > 0) {
      console.warn(`⚠️  ${errors.length} embedding errors occurred`);
    }

    // Update service stats
    this.updateStats(totalTokens, processingTime, errors.length > 0);

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
   * Test connection to OpenAI API
   */
  async testConnection(): Promise<boolean> {
    try {
      // Make a minimal embedding request to test connectivity
      await this.client.embeddings.create({
        input: 'test',
        model: this.config.model
      });
      
      console.log(`✅ OpenAI connection test passed with model '${this.config.model}'`);
      return true;

    } catch (error) {
      console.error('OpenAI connection test failed:', error instanceof Error ? error.message : error);
      return false;
    }
  }

  /**
   * Get model information from OpenAI
   */
  async getModelInfo(): Promise<{
    name: string;
    dimensions: number;
    maxTokens: number;
    provider: string;
  }> {
    const modelInfo = EMBEDDING_MODELS[this.config.model as keyof typeof EMBEDDING_MODELS];
    
    if (!modelInfo) {
      // Make a test call to determine dimensions
      try {
        const response = await this.client.embeddings.create({
          input: 'test',
          model: this.config.model
        });
        
        return {
          name: this.config.model,
          dimensions: response.data[0].embedding.length,
          maxTokens: 8191, // Standard OpenAI embedding limit
          provider: 'openai'
        };
      } catch (error) {
        throw new Error(`Failed to get OpenAI model info: ${error instanceof Error ? error.message : error}`);
      }
    }

    return {
      name: this.config.model,
      dimensions: modelInfo.dimensions,
      maxTokens: 8191,
      provider: 'openai'
    };
  }

  /**
   * Make actual API call to OpenAI for embedding generation
   */
  private async callOpenAIEmbedding(texts: string[]): Promise<OpenAI.Embeddings.CreateEmbeddingResponse> {
    try {
      console.log(`📄 Calling OpenAI embeddings.create with:`, {
        model: this.config.model,
        inputCount: texts.length,
        firstInputLength: texts[0]?.length || 0,
        apiKeyPresent: !!this.client.apiKey
      });
      
      const response = await this.client.embeddings.create({
        input: texts,
        model: this.config.model,
        encoding_format: 'float' // Ensure we get float arrays
      });
      
      console.log(`✅ OpenAI embeddings.create response:`, {
        hasResponse: !!response,
        hasData: !!response?.data,
        dataCount: response?.data?.length || 0,
        usage: response?.usage
      });

      if (!response.data || response.data.length === 0) {
        throw new Error('Empty response from OpenAI embeddings API');
      }

      return response;

    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        // Handle specific OpenAI API errors
        switch (error.status) {
          case 401:
            throw new Error('Invalid OpenAI API key');
          case 429:
            throw new Error('OpenAI rate limit exceeded. Try again later.');
          case 400:
            throw new Error(`Invalid request: ${error.message}`);
          case 500:
            throw new Error('OpenAI server error. Try again later.');
          default:
            throw new Error(`OpenAI API error (${error.status}): ${error.message}`);
        }
      }

      throw error;
    }
  }

  /**
   * Get cost per token for different OpenAI embedding models
   */
  private getCostPerToken(model: string): number {
    // Prices as of 2024 (per 1M tokens)
    const prices: Record<string, number> = {
      'text-embedding-ada-002': 0.0001 / 1000000,        // $0.0001/1M tokens
      'text-embedding-3-small': 0.00002 / 1000000,       // $0.00002/1M tokens  
      'text-embedding-3-large': 0.00013 / 1000000        // $0.00013/1M tokens
    };

    return prices[model] || prices['text-embedding-ada-002']; // Default to ada-002 pricing
  }

  /**
   * Check if OpenAI service is ready
   */
  async isReady(): Promise<{ ready: boolean; message: string }> {
    try {
      // Test with minimal request
      await this.client.embeddings.create({
        input: 'test',
        model: this.config.model
      });

      return {
        ready: true,
        message: `OpenAI ready with model '${this.config.model}'`
      };

    } catch (error) {
      let message = 'OpenAI not available';
      
      if (error instanceof OpenAI.APIError) {
        switch (error.status) {
          case 401:
            message = 'Invalid OpenAI API key';
            break;
          case 429:
            message = 'OpenAI rate limit exceeded';
            break;
          case 404:
            message = `Model '${this.config.model}' not found`;
            break;
          default:
            message = `OpenAI API error: ${error.message}`;
        }
      }

      return {
        ready: false,
        message
      };
    }
  }

  /**
   * Get current cost estimate based on usage
   */
  getCostEstimate(): {
    totalCost: number;
    avgCostPerRequest: number;
    projectedMonthlyCost: number;
  } {
    const totalCost = this.stats.totalCost || 0;
    const avgCostPerRequest = this.stats.totalRequests > 0 ? totalCost / this.stats.totalRequests : 0;
    
    // Project monthly cost based on current usage rate
    const requestsPerMinute = this.stats.totalRequests / ((Date.now() - (this.stats.lastRequestTime?.getTime() || Date.now())) / 60000);
    const projectedMonthlyCost = requestsPerMinute * 60 * 24 * 30 * avgCostPerRequest;

    return {
      totalCost,
      avgCostPerRequest,
      projectedMonthlyCost
    };
  }
}