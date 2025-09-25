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
import { MISTRAL_7B_CONFIG } from '../../config/mistral-config';

interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    num_predict?: number;
    num_ctx?: number;
    repeat_penalty?: number;
    seed?: number;
    mirostat?: number;
    mirostat_eta?: number;
    mirostat_tau?: number;
    stop?: string[];
  };
  system?: string;
  stream?: boolean;
  format?: string; // For JSON formatting
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
  enableJsonMode?: boolean;
  contextWindow?: number;
  mistralOptimized?: boolean;
}

export class OllamaLLMService extends LLMService {
  private readonly baseUrl: string;
  
  constructor(config: Partial<OllamaLLMConfig> = {}) {
    // Check if this is Mistral model for optimizations
    const modelName = config.model || process.env.LLM_MODEL || process.env.OLLAMA_LLM_MODEL;
    if (!modelName) {
      throw new Error('Model name is required. Set OLLAMA_LLM_MODEL environment variable or provide in config');
    }
    const isMistralModel = modelName.includes('mistral') || modelName.includes('7b-instruct');
    
    // Ensure base URL is available
    const baseUrl = config.baseUrl || process.env.OLLAMA_BASE_URL;
    if (!baseUrl) {
      throw new Error('OLLAMA_BASE_URL environment variable is required');
    }

    const defaultConfig = {
      ...LLM_CONFIGS.ollama,
      baseUrl: baseUrl,
      model: modelName,
      maxTokens: Number(process.env.LLM_MAX_TOKENS) || (isMistralModel ? MISTRAL_7B_CONFIG.maxTokens : 4096),
      temperature: Number(process.env.LLM_TEMPERATURE) || (isMistralModel ? MISTRAL_7B_CONFIG.temperature : 0.7),
      contextWindow: Number(process.env.LLM_CONTEXT_WINDOW) || (isMistralModel ? MISTRAL_7B_CONFIG.contextWindow : 4096),
      enableJsonMode: isMistralModel,
      mistralOptimized: isMistralModel,
      maxRetries: 3,
      retryDelayMs: 2000,
      timeoutMs: isMistralModel ? MISTRAL_7B_CONFIG.timeoutMs : 30000
    } as OllamaLLMConfig;

    super({ ...defaultConfig, ...config });
    this.baseUrl = (config.baseUrl || defaultConfig.baseUrl).replace(/\/$/, '');
    
    console.log(`🤖 Initialized Ollama LLM Service`);
    console.log(`   Base URL: ${this.baseUrl}`);
    console.log(`   Model: ${this.config.model}`);
    console.log(`   Max tokens: ${this.config.maxTokens}`);
    console.log(`   Context window: ${(this.config as OllamaLLMConfig).contextWindow}`);
    console.log(`   Mistral optimized: ${(this.config as OllamaLLMConfig).mistralOptimized}`);
    console.log(`   JSON mode: ${(this.config as OllamaLLMConfig).enableJsonMode}`);
  }

  /**
   * Generate JSON-formatted completion for structured responses
   * Optimized for Mistral 7B Instruct with schema validation
   */
  async generateJSONCompletion(
    request: LLMRequest & { 
      schema?: any; 
      enforceJsonFormat?: boolean;
    }
  ): Promise<LLMResponse & { jsonData?: any }> {
    const ollamaConfig = this.config as OllamaLLMConfig;
    const startTime = Date.now();
    
    // Use JSON mode if model supports it and format is requested
    const useJsonFormat = request.enforceJsonFormat && ollamaConfig.enableJsonMode;
    
    try {
      const completion = await this.withRetry(
        () => this.callOllamaGenerate(request, useJsonFormat),
        `Generate JSON completion for ${request.prompt.length} char prompt`
      );

      const processingTime = Date.now() - startTime;
      
      // Estimate token usage
      const promptTokens = completion.prompt_eval_count || this.estimateTokens(request.prompt);
      const completionTokens = completion.eval_count || this.estimateTokens(completion.response);
      
      const usage = {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens
      };
      
      this.updateStats(usage, processingTime, false);

      // Parse JSON if format was requested
      let jsonData = null;
      if (useJsonFormat && completion.response) {
        try {
          jsonData = JSON.parse(completion.response);
        } catch (parseError) {
          console.warn('Failed to parse JSON response, returning raw text:', parseError);
        }
      }

      return {
        text: completion.response,
        finishReason: completion.done ? 'completed' : 'max_tokens',
        usage,
        model: this.config.model,
        processingTime,
        jsonData
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.updateStats(
        { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        processingTime,
        true
      );
      
      throw new Error(`Ollama JSON completion failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Generate text completion using Ollama
   */
  async generateCompletion(request: LLMRequest): Promise<LLMResponse> {
    this.validateRequest(request);
    
    const startTime = Date.now();
    
    try {
      const completion = await this.withRetry(
        () => this.callOllamaGenerate(request, false),
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
      
      throw new Error(`Ollama completion generation failed: ${error instanceof Error ? error.message : String(error)}`);
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
  private async callOllamaGenerate(
    request: LLMRequest, 
    useJsonFormat: boolean = false
  ): Promise<OllamaGenerateResponse> {
    const ollamaConfig = this.config as OllamaLLMConfig;
    
    // Validate base URL first
    if (!this.baseUrl) {
      throw new Error('Ollama base URL is not configured');
    }
    
    // Build options with Mistral optimizations if enabled
    const options: any = {
      temperature: request.temperature || this.config.temperature,
      num_predict: request.maxTokens || this.config.maxTokens,
      stop: request.stopSequences || []
    };

    // Add Mistral-specific optimizations
    if (ollamaConfig.mistralOptimized) {
      options.num_ctx = ollamaConfig.contextWindow || MISTRAL_7B_CONFIG.contextWindow;
      options.top_p = Number(process.env.MISTRAL_TOP_P) || MISTRAL_7B_CONFIG.topP;
      options.top_k = Number(process.env.MISTRAL_TOP_K) || MISTRAL_7B_CONFIG.topK;
      options.repeat_penalty = Number(process.env.MISTRAL_REPEAT_PENALTY) || MISTRAL_7B_CONFIG.ollamaOptions.repeat_penalty;
      options.mirostat = Number(process.env.MISTRAL_MIROSTAT) || MISTRAL_7B_CONFIG.ollamaOptions.mirostat;
      options.mirostat_eta = MISTRAL_7B_CONFIG.ollamaOptions.mirostat_eta;
      options.mirostat_tau = MISTRAL_7B_CONFIG.ollamaOptions.mirostat_tau;
      
      // Use consistent seed for reproducible results in development
      if (process.env.NODE_ENV === 'development') {
        options.seed = MISTRAL_7B_CONFIG.ollamaOptions.seed;
      }
    }

    const requestBody: OllamaGenerateRequest = {
      model: this.config.model,
      prompt: request.prompt,
      system: request.systemPrompt,
      options,
      stream: false, // For now, use non-streaming mode
      ...(useJsonFormat && { format: 'json' }) // Enable JSON formatting if requested
    };

    console.log(`🔗 Making Ollama request to: ${this.baseUrl}/api/generate`);
    console.log(`🔗 Request model: ${this.config.model}`);
    console.log(`🔗 JSON format requested: ${useJsonFormat}`);

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
        let errorText = '';
        try {
          errorText = await response.text();
        } catch (e) {
          errorText = 'Unable to read error response';
        }
        throw new Error(`Ollama API error (${response.status} ${response.statusText}): ${errorText}`);
      }

      const data = await response.json() as OllamaGenerateResponse;
      
      if (!data.response && data.response !== '') {
        throw new Error('Invalid response from Ollama: missing response text');
      }

      console.log(`✅ Ollama response received: ${data.response.length} characters`);
      return data;

    } catch (error) {
      clearTimeout(timeoutId);
      
      console.error(`❌ Ollama request failed:`, error);
      
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error(`Ollama request timed out after ${this.config.timeoutMs}ms`);
        }
        if (error.message.includes('fetch')) {
          throw new Error(`Failed to connect to Ollama server at ${this.baseUrl}. Is Ollama running?`);
        }
        throw error;
      }
      
      throw new Error(`Unknown error calling Ollama: ${String(error)}`);
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
   * Create an optimized Mistral model with enhanced context and guardrails
   * Useful for creating custom models with specific system prompts
   */
  async createOptimizedMistralModel(
    modelName: string = 'arya-mistral:7b',
    systemPrompt?: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const customSystemPrompt = systemPrompt || `You are a Navy documentation assistant.
- Preserve hierarchical numbering EXACTLY as written (e.g., "1.1", "1.1.1").
- Keep procedures as step-by-step lists; one step per bullet.
- Never invent content; if unsure, say you need more context.
- Always return valid JSON when requested.`;

      const baseModel = this.config.model;
      const modelFile = `FROM ${baseModel}
PARAMETER num_ctx ${MISTRAL_7B_CONFIG.contextWindow}
PARAMETER temperature ${MISTRAL_7B_CONFIG.temperature}
PARAMETER top_p ${MISTRAL_7B_CONFIG.topP}
PARAMETER top_k ${MISTRAL_7B_CONFIG.topK}
PARAMETER repeat_penalty ${MISTRAL_7B_CONFIG.ollamaOptions.repeat_penalty}
PARAMETER mirostat ${MISTRAL_7B_CONFIG.ollamaOptions.mirostat}
PARAMETER mirostat_eta ${MISTRAL_7B_CONFIG.ollamaOptions.mirostat_eta}
PARAMETER mirostat_tau ${MISTRAL_7B_CONFIG.ollamaOptions.mirostat_tau}
SYSTEM """${customSystemPrompt}"""`;

      const response = await fetch(`${this.baseUrl}/api/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: modelName,
          modelfile: modelFile
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          message: `Failed to create model: ${errorText}`
        };
      }

      return {
        success: true,
        message: `Optimized model '${modelName}' created successfully`
      };

    } catch (error) {
      return {
        success: false,
        message: `Error creating model: ${error instanceof Error ? error.message : error}`
      };
    }
  }

  /**
   * Check if a specific model exists and is available
   */
  async checkModelAvailability(modelName: string): Promise<{
    available: boolean;
    message: string;
    size?: string;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      const data = await response.json() as { models: OllamaModelInfo[] };
      
      const model = data.models.find(m => 
        m.name === modelName || m.name.includes(modelName)
      );

      if (model) {
        return {
          available: true,
          message: `Model '${modelName}' is available`,
          size: model.details.parameter_size
        };
      }

      return {
        available: false,
        message: `Model '${modelName}' not found. Available models: ${data.models.map(m => m.name).join(', ')}`
      };

    } catch (error) {
      return {
        available: false,
        message: `Error checking model availability: ${error instanceof Error ? error.message : error}`
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