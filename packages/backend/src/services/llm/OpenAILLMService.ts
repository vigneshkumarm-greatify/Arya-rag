/**
 * OpenAI LLM Service
 * 
 * Implements text generation using OpenAI's language models.
 * Provides high-quality responses with excellent reasoning capabilities for RAG applications.
 * 
 * @author ARYA RAG Team
 */

import OpenAI from 'openai';
import { 
  LLMService, 
  LLMRequest, 
  LLMResponse, 
  LLMServiceConfig,
  LLM_CONFIGS
} from './LLMService';

export interface OpenAILLMConfig extends LLMServiceConfig {
  apiKey: string;
  model: string;
  organization?: string;
  baseURL?: string;
}

export class OpenAILLMService extends LLMService {
  private readonly client: OpenAI;
  private readonly costPerToken: Map<string, { prompt: number; completion: number }>;
  
  constructor(config: Partial<OpenAILLMConfig> = {}) {
    const baseConfig = LLM_CONFIGS.openai;
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
    
    const model = process.env.OPENAI_LLM_MODEL;
    if (!model) {
      throw new Error('OPENAI_LLM_MODEL environment variable is required');
    }
    
    const envConfig = {
      apiKey,
      model
    };
    
    const defaultConfig = {
      ...baseConfig,
      ...envConfig,
      maxTokens: 4000,
      temperature: 0.7,
      maxRetries: 5,
      retryDelayMs: 2000,
      timeoutMs: 60000
    } as OpenAILLMConfig;

    // Filter out undefined values from passed config to avoid overriding defaults
    const cleanConfig: Partial<OpenAILLMConfig> = {};
    Object.keys(config).forEach(key => {
      if (config[key as keyof OpenAILLMConfig] !== undefined) {
        (cleanConfig as any)[key] = config[key as keyof OpenAILLMConfig];
      }
    });
    
    const finalConfig = { ...defaultConfig, ...cleanConfig };
    
    console.log('🔧 OpenAI LLM Config Debug:', {
      baseConfig,
      envConfig,
      defaultConfig,
      passedConfig: config,
      cleanConfig,
      finalConfig
    });

    super(finalConfig);
    
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

    // Set cost per token based on model (as of 2024)
    this.costPerToken = this.initializeCostMap();
    
    console.log(`🤖 Initialized OpenAI LLM Service`);
    console.log(`   Model: ${this.config.model}`);
    console.log(`   Max tokens: ${this.config.maxTokens}`);
    console.log(`   Cost per 1K tokens: $${this.getCostEstimate(1000, 0).toFixed(6)}`);
  }

  /**
   * Generate text completion using OpenAI
   */
  async generateCompletion(request: LLMRequest): Promise<LLMResponse> {
    console.log('🔍 generateCompletion called with:', {
      promptLength: request.prompt?.length,
      hasSystemPrompt: !!request.systemPrompt,
      maxTokens: request.maxTokens,
      temperature: request.temperature,
      configMaxTokens: this.config.maxTokens,
      configTemperature: this.config.temperature
    });

    try {
      this.validateRequest(request);
      console.log('✅ Request validation passed');
    } catch (error) {
      console.error('🚨 Request validation failed:', error);
      throw error;
    }
    
    const startTime = Date.now();
    
    try {
      const completion = await this.withRetry(
        () => this.callOpenAICompletion(request),
        `Generate completion for ${request.prompt.length} char prompt`
      );

      const processingTime = Date.now() - startTime;
      
      // Extract usage information
      const usage = {
        promptTokens: completion.usage?.prompt_tokens || 0,
        completionTokens: completion.usage?.completion_tokens || 0,
        totalTokens: completion.usage?.total_tokens || 0
      };

      // Calculate cost
      const cost = this.calculateCost(usage.promptTokens, usage.completionTokens);
      
      this.updateStats(usage, processingTime, false, cost);

      return {
        text: completion.choices[0]?.message?.content || '',
        finishReason: this.mapFinishReason(completion.choices[0]?.finish_reason),
        usage,
        model: this.config.model,
        processingTime
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.updateStats(
        { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        processingTime,
        true
      );
      
      // Better error logging for debugging
      console.error('🚨 OpenAI LLM Service Error Details:', {
        errorType: typeof error,
        errorConstructor: error?.constructor?.name,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        errorStack: error instanceof Error ? error.stack : 'No stack trace',
        fullError: error
      });
      
      throw new Error(`OpenAI completion generation failed: ${error instanceof Error ? error.message : JSON.stringify(error)}`);
    }
  }

  /**
   * Test connection to OpenAI API
   */
  async testConnection(): Promise<boolean> {
    try {
      // Make a minimal completion request to test connectivity
      await this.client.chat.completions.create({
        model: this.config.model,
        messages: [{ role: 'user', content: 'Test' }],
        max_tokens: 5
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
    maxTokens: number;
    supportsStreaming: boolean;
    provider: string;
  }> {
    // For OpenAI, we know the capabilities based on model name
    const modelCapabilities = {
      'gpt-4': { maxTokens: 8192 },
      'gpt-4-turbo': { maxTokens: 128000 },
      'gpt-4-turbo-preview': { maxTokens: 128000 },
      'gpt-3.5-turbo': { maxTokens: 16385 },
      'gpt-3.5-turbo-16k': { maxTokens: 16385 }
    } as const;

    const modelName = this.config.model as keyof typeof modelCapabilities;
    const capabilities = modelCapabilities[modelName] || { maxTokens: 4096 };

    return {
      name: this.config.model,
      maxTokens: capabilities.maxTokens,
      supportsStreaming: true,
      provider: 'openai'
    };
  }

  /**
   * Make actual API call to OpenAI for text generation
   */
  private async callOpenAICompletion(request: LLMRequest): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    try {
      console.log('🔍 OpenAI API call starting...', {
        model: this.config.model,
        promptLength: request.prompt.length,
        hasSystemPrompt: !!request.systemPrompt,
        maxTokens: request.maxTokens || this.config.maxTokens,
        temperature: request.temperature || this.config.temperature
      });

      // Prepare messages
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
      
      if (request.systemPrompt) {
        messages.push({ role: 'system', content: request.systemPrompt });
      }
      
      messages.push({ role: 'user', content: request.prompt });

      const response = await this.client.chat.completions.create({
        model: this.config.model,
        messages,
        max_tokens: request.maxTokens || this.config.maxTokens,
        temperature: request.temperature || this.config.temperature,
        stop: request.stopSequences,
        user: request.metadata?.userId // For usage tracking
      });

      if (!response.choices || response.choices.length === 0) {
        throw new Error('Empty response from OpenAI API');
      }

      return response;

    } catch (error) {
      console.error('🚨 Error in callOpenAICompletion:', {
        errorType: typeof error,
        errorConstructor: error?.constructor?.name,
        isOpenAIError: error instanceof OpenAI.APIError,
        fullError: error
      });

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
   * Map OpenAI finish reasons to our standard format
   */
  private mapFinishReason(finishReason?: string): LLMResponse['finishReason'] {
    switch (finishReason) {
      case 'stop':
        return 'completed';
      case 'length':
        return 'max_tokens';
      case 'content_filter':
        return 'stop_sequence';
      default:
        return 'completed';
    }
  }

  /**
   * Initialize cost mapping for different models
   */
  private initializeCostMap(): Map<string, { prompt: number; completion: number }> {
    const costs = new Map();
    
    // Prices per 1K tokens (as of 2024)
    costs.set('gpt-4', { prompt: 0.03, completion: 0.06 });
    costs.set('gpt-4-turbo', { prompt: 0.01, completion: 0.03 });
    costs.set('gpt-4-turbo-preview', { prompt: 0.01, completion: 0.03 });
    costs.set('gpt-3.5-turbo', { prompt: 0.0005, completion: 0.0015 });
    costs.set('gpt-3.5-turbo-16k', { prompt: 0.003, completion: 0.004 });
    
    return costs;
  }

  /**
   * Calculate cost for a completion
   */
  private calculateCost(promptTokens: number, completionTokens: number): number {
    const modelCost = this.costPerToken.get(this.config.model);
    
    if (!modelCost) {
      // Default to GPT-3.5-turbo pricing if unknown
      const defaultCost = this.costPerToken.get('gpt-3.5-turbo')!;
      return (promptTokens / 1000) * defaultCost.prompt + (completionTokens / 1000) * defaultCost.completion;
    }
    
    return (promptTokens / 1000) * modelCost.prompt + (completionTokens / 1000) * modelCost.completion;
  }

  /**
   * Get cost estimate for given token counts
   */
  private getCostEstimate(promptTokens: number, completionTokens: number): number {
    return this.calculateCost(promptTokens, completionTokens);
  }

  /**
   * Check if OpenAI service is ready
   */
  async isReady(): Promise<{ ready: boolean; message: string }> {
    try {
      // Test with minimal request
      await this.client.chat.completions.create({
        model: this.config.model,
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 5
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
   * Generate a simple test completion to verify functionality
   */
  async testGeneration(): Promise<{ success: boolean; response?: string; error?: string }> {
    try {
      const testRequest: LLMRequest = {
        prompt: 'What is artificial intelligence? Answer in one sentence.',
        maxTokens: 50,
        temperature: 0.1
      };

      const response = await this.generateCompletion(testRequest);
      
      return {
        success: true,
        response: response.text
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get cost analysis for usage
   */
  getCostAnalysis(): {
    totalCost: number;
    avgCostPerRequest: number;
    avgCostPerToken: number;
    projectedMonthlyCost: number;
  } {
    const stats = this.getStats();
    const totalCost = stats.totalCost || 0;
    const avgCostPerRequest = stats.totalRequests > 0 ? totalCost / stats.totalRequests : 0;
    const avgCostPerToken = stats.totalTokens > 0 ? totalCost / stats.totalTokens : 0;
    
    // Project monthly cost based on current usage rate
    const hoursOfUsage = (Date.now() - (stats.lastRequestTime?.getTime() || Date.now())) / (1000 * 60 * 60);
    const requestsPerHour = hoursOfUsage > 0 ? stats.totalRequests / hoursOfUsage : 0;
    const projectedMonthlyCost = requestsPerHour * 24 * 30 * avgCostPerRequest;

    return {
      totalCost: Number(totalCost.toFixed(4)),
      avgCostPerRequest: Number(avgCostPerRequest.toFixed(4)),
      avgCostPerToken: Number(avgCostPerToken.toFixed(6)),
      projectedMonthlyCost: Number(projectedMonthlyCost.toFixed(2))
    };
  }

  /**
   * Get performance metrics specific to OpenAI
   */
  getPerformanceMetrics(): {
    avgTokensPerSecond: number;
    totalGenerations: number;
    avgResponseTime: number;
    costEfficiency: number; // tokens per dollar
  } {
    const stats = this.getStats();
    const costAnalysis = this.getCostAnalysis();
    
    // Calculate tokens per second
    const totalTimeSeconds = (stats.avgResponseTime * stats.totalRequests) / 1000;
    const avgTokensPerSecond = totalTimeSeconds > 0 ? stats.totalTokens / totalTimeSeconds : 0;
    
    // Calculate cost efficiency
    const costEfficiency = costAnalysis.totalCost > 0 ? stats.totalTokens / costAnalysis.totalCost : 0;

    return {
      avgTokensPerSecond: Number(avgTokensPerSecond.toFixed(1)),
      totalGenerations: stats.totalRequests,
      avgResponseTime: stats.avgResponseTime,
      costEfficiency: Number(costEfficiency.toFixed(0))
    };
  }
}