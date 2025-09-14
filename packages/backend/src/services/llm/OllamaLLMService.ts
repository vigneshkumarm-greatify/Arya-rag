/**
 * Ollama LLM Service
 * 
 * Implements text generation using local Ollama models.
 * Provides free, privacy-focused language model capabilities without external API calls.
 * 
 * @author ARYA RAG Team
 */

import { 
  LLMService, 
  LLMRequest, 
  LLMResponse, 
  LLMServiceConfig,
  LLM_CONFIGS
} from './LLMService';

interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    num_predict?: number;
    stop?: string[];
  };
  system?: string;
  stream?: boolean;
}

interface OllamaGenerateResponse {
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
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

export interface OllamaLLMConfig extends LLMServiceConfig {
  baseUrl: string;
  model: string;
}

export class OllamaLLMService extends LLMService {
  private readonly baseUrl: string;
  
  constructor(config: Partial<OllamaLLMConfig> = {}) {
    const defaultConfig = {
      ...LLM_CONFIGS.ollama,
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      model: process.env.OLLAMA_LLM_MODEL || 'mistral',
      maxTokens: 4096,
      temperature: 0.7,
      maxRetries: 3,
      retryDelayMs: 1000,
      timeoutMs: 30000
    } as OllamaLLMConfig;

    super({ ...defaultConfig, ...config });
    this.baseUrl = (config.baseUrl || defaultConfig.baseUrl).replace(/\/$/, '');
    
    console.log(`🤖 Initialized Ollama LLM Service`);
    console.log(`   Base URL: ${this.baseUrl}`);
    console.log(`   Model: ${this.config.model}`);
    console.log(`   Max tokens: ${this.config.maxTokens}`);
  }

  /**
   * Generate text completion using Ollama
   */
  async generateCompletion(request: LLMRequest): Promise<LLMResponse> {
    this.validateRequest(request);
    
    const startTime = Date.now();
    
    try {
      const completion = await this.withRetry(
        () => this.callOllamaGenerate(request),
        `Generate completion for ${request.prompt.length} char prompt`
      );

      const processingTime = Date.now() - startTime;
      
      // Estimate token usage (Ollama doesn't always provide exact counts)
      const promptTokens = completion.prompt_eval_count || this.estimateTokens(request.prompt);
      const completionTokens = completion.eval_count || this.estimateTokens(completion.response);
      
      const usage = {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens
      };
      
      this.updateStats(usage, processingTime, false);

      return {
        text: completion.response,
        finishReason: completion.done ? 'completed' : 'max_tokens',
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
      
      throw new Error(`Ollama completion generation failed: ${error instanceof Error ? error.message : error}`);
    }
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

      const data = await response.json() as { models: OllamaModelInfo[] };
      
      // Check if our model is available
      const modelAvailable = data.models.some(model => 
        model.name.includes(this.config.model)
      );

      if (!modelAvailable) {
        console.warn(`⚠️  Model '${this.config.model}' not found on Ollama server`);
        console.log('Available models:', data.models.map(m => m.name).join(', '));
        return false;
      }

      console.log(`✅ Ollama LLM connection test passed. Model '${this.config.model}' is available`);
      return true;

    } catch (error) {
      console.error('Ollama LLM connection test failed:', error instanceof Error ? error.message : error);
      return false;
    }
  }

  /**
   * Get model information from Ollama
   */
  async getModelInfo(): Promise<{
    name: string;
    maxTokens: number;
    supportsStreaming: boolean;
    provider: string;
  }> {
    try {
      // Get model list to verify it exists
      const response = await fetch(`${this.baseUrl}/api/tags`);
      const data = await response.json() as { models: OllamaModelInfo[] };
      
      const modelInfo = data.models.find(model => 
        model.name.includes(this.config.model)
      );

      if (!modelInfo) {
        throw new Error(`Model '${this.config.model}' not found on Ollama server`);
      }

      return {
        name: this.config.model,
        maxTokens: this.config.maxTokens,
        supportsStreaming: true, // Ollama supports streaming
        provider: 'ollama'
      };

    } catch (error) {
      throw new Error(`Failed to get Ollama model info: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Make actual API call to Ollama for text generation
   */
  private async callOllamaGenerate(request: LLMRequest): Promise<OllamaGenerateResponse> {
    const requestBody: OllamaGenerateRequest = {
      model: this.config.model,
      prompt: request.prompt,
      system: request.systemPrompt,
      options: {
        temperature: request.temperature || this.config.temperature,
        num_predict: request.maxTokens || this.config.maxTokens,
        stop: request.stopSequences
      },
      stream: false // For now, use non-streaming mode
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
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

      const data = await response.json() as OllamaGenerateResponse;
      
      if (!data.response) {
        throw new Error('Invalid response from Ollama: missing response text');
      }

      return data;

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
      const data = await serverResponse.json() as { models: OllamaModelInfo[] };
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
   * Get performance metrics specific to Ollama
   */
  getPerformanceMetrics(): {
    avgTokensPerSecond: number;
    totalGenerations: number;
    avgResponseTime: number;
  } {
    const stats = this.getStats();
    
    // Calculate tokens per second
    const totalTimeSeconds = (stats.avgResponseTime * stats.totalRequests) / 1000;
    const avgTokensPerSecond = totalTimeSeconds > 0 ? stats.totalTokens / totalTimeSeconds : 0;

    return {
      avgTokensPerSecond: Number(avgTokensPerSecond.toFixed(1)),
      totalGenerations: stats.totalRequests,
      avgResponseTime: stats.avgResponseTime
    };
  }
}