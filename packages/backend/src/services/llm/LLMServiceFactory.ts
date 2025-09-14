/**
 * LLM Service Factory
 * 
 * Factory class for creating LLM service instances based on configuration.
 * Enables easy switching between Ollama (local) and OpenAI (cloud) providers.
 * 
 * @author ARYA RAG Team
 */

import { LLMService, LLMProvider } from './LLMService';
import { OllamaLLMService, OllamaLLMConfig } from './OllamaLLMService';
import { OpenAILLMService, OpenAILLMConfig } from './OpenAILLMService';

export interface LLMFactoryConfig {
  provider: LLMProvider;
  model?: string;
  
  // Ollama specific
  ollamaBaseUrl?: string;
  
  // OpenAI specific
  openaiApiKey?: string;
  openaiOrganization?: string;
  
  // Common options
  maxTokens?: number;
  temperature?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
}

export class LLMServiceFactory {
  private static instance: LLMServiceFactory;
  private serviceCache: Map<string, LLMService> = new Map();

  private constructor() {}

  /**
   * Get singleton instance of the factory
   */
  static getInstance(): LLMServiceFactory {
    if (!LLMServiceFactory.instance) {
      LLMServiceFactory.instance = new LLMServiceFactory();
    }
    return LLMServiceFactory.instance;
  }

  /**
   * Create or get cached LLM service instance
   */
  createLLMService(config?: Partial<LLMFactoryConfig>): LLMService {
    const finalConfig = this.resolveConfig(config);
    const cacheKey = this.generateCacheKey(finalConfig);

    // Return cached instance if available
    if (this.serviceCache.has(cacheKey)) {
      console.log(`📌 Using cached ${finalConfig.provider} LLM service`);
      return this.serviceCache.get(cacheKey)!;
    }

    // Create new service instance
    let service: LLMService;

    switch (finalConfig.provider) {
      case 'ollama':
        service = this.createOllamaService(finalConfig);
        break;
        
      case 'openai':
        service = this.createOpenAIService(finalConfig);
        break;
        
      default:
        throw new Error(`Unsupported LLM provider: ${finalConfig.provider}`);
    }

    // Cache the service
    this.serviceCache.set(cacheKey, service);
    
    console.log(`✨ Created new ${finalConfig.provider} LLM service`);
    return service;
  }

  /**
   * Create Ollama LLM service
   */
  private createOllamaService(config: LLMFactoryConfig): OllamaLLMService {
    const ollamaConfig: Partial<OllamaLLMConfig> = {
      baseUrl: config.ollamaBaseUrl,
      model: config.model,
      maxTokens: config.maxTokens,
      temperature: config.temperature,
      maxRetries: config.maxRetries,
      retryDelayMs: config.retryDelayMs,
      timeoutMs: config.timeoutMs
    };

    return new OllamaLLMService(ollamaConfig);
  }

  /**
   * Create OpenAI LLM service
   */
  private createOpenAIService(config: LLMFactoryConfig): OpenAILLMService {
    const openaiConfig: Partial<OpenAILLMConfig> = {
      apiKey: config.openaiApiKey,
      model: config.model,
      organization: config.openaiOrganization,
      maxTokens: config.maxTokens,
      temperature: config.temperature,
      maxRetries: config.maxRetries,
      retryDelayMs: config.retryDelayMs,
      timeoutMs: config.timeoutMs
    };

    return new OpenAILLMService(openaiConfig);
  }

  /**
   * Resolve configuration from environment variables and defaults
   */
  private resolveConfig(config?: Partial<LLMFactoryConfig>): LLMFactoryConfig {
    const provider = (config?.provider || 
                     process.env.LLM_PROVIDER || 
                     'ollama') as LLMProvider;

    // Base configuration
    const resolved: LLMFactoryConfig = {
      provider,
      model: config?.model || this.getDefaultModel(provider),
      maxTokens: config?.maxTokens,
      temperature: config?.temperature,
      maxRetries: config?.maxRetries,
      retryDelayMs: config?.retryDelayMs,
      timeoutMs: config?.timeoutMs
    };

    // Provider-specific configuration
    if (provider === 'ollama') {
      resolved.ollamaBaseUrl = config?.ollamaBaseUrl || 
                              process.env.OLLAMA_BASE_URL || 
                              'http://localhost:11434';
    } else if (provider === 'openai') {
      resolved.openaiApiKey = config?.openaiApiKey || 
                             process.env.OPENAI_API_KEY;
      resolved.openaiOrganization = config?.openaiOrganization || 
                                   process.env.OPENAI_ORGANIZATION;
                                   
      if (!resolved.openaiApiKey) {
        throw new Error('OpenAI API key is required when using OpenAI provider. Set OPENAI_API_KEY environment variable.');
      }
    }

    return resolved;
  }

  /**
   * Get default model for a provider
   */
  private getDefaultModel(provider: LLMProvider): string {
    switch (provider) {
      case 'ollama':
        return process.env.OLLAMA_LLM_MODEL || 'mistral';
      case 'openai':
        return process.env.OPENAI_LLM_MODEL || 'gpt-3.5-turbo';
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  /**
   * Generate cache key for service instance
   */
  private generateCacheKey(config: LLMFactoryConfig): string {
    const keyParts = [
      config.provider,
      config.model,
      config.ollamaBaseUrl,
      config.openaiApiKey?.substring(0, 10), // Only use first 10 chars of API key
      config.maxTokens,
      config.temperature
    ];

    return keyParts.filter(part => part !== undefined).join('|');
  }

  /**
   * Clear service cache (useful for testing or config changes)
   */
  clearCache(): void {
    this.serviceCache.clear();
    console.log('🗑️  LLM service cache cleared');
  }

  /**
   * Get service from environment variables (convenience method)
   */
  static createFromEnvironment(): LLMService {
    const factory = LLMServiceFactory.getInstance();
    return factory.createLLMService();
  }

  /**
   * Test all available services to see which ones are ready
   */
  async testAllServices(): Promise<{
    ollama: { available: boolean; message: string };
    openai: { available: boolean; message: string };
    recommended: LLMProvider;
  }> {
    const results = {
      ollama: { available: false, message: 'Not tested' },
      openai: { available: false, message: 'Not tested' },
      recommended: 'ollama' as LLMProvider
    };

    // Test Ollama
    try {
      const ollamaService = this.createLLMService({ provider: 'ollama' });
      if ('isReady' in ollamaService) {
        const ollamaReady = await (ollamaService as any).isReady();
        results.ollama = ollamaReady;
      } else {
        results.ollama = {
          available: await ollamaService.testConnection(),
          message: await ollamaService.testConnection() ? 'Connected' : 'Connection failed'
        };
      }
    } catch (error) {
      results.ollama = {
        available: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }

    // Test OpenAI (only if API key is available)
    if (process.env.OPENAI_API_KEY) {
      try {
        const openaiService = this.createLLMService({ provider: 'openai' });
        if ('isReady' in openaiService) {
          const openaiReady = await (openaiService as any).isReady();
          results.openai = openaiReady;
        } else {
          results.openai = {
            available: await openaiService.testConnection(),
            message: await openaiService.testConnection() ? 'Connected' : 'Connection failed'
          };
        }
      } catch (error) {
        results.openai = {
          available: false,
          message: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    } else {
      results.openai = {
        available: false,
        message: 'No API key configured'
      };
    }

    // Determine recommendation
    if (results.ollama.available && results.openai.available) {
      results.recommended = 'ollama'; // Prefer free local option
    } else if (results.ollama.available) {
      results.recommended = 'ollama';
    } else if (results.openai.available) {
      results.recommended = 'openai';
    } else {
      results.recommended = 'ollama'; // Default fallback
    }

    return results;
  }

  /**
   * Get service statistics for monitoring
   */
  getServiceStats(): {
    cachedServices: number;
    services: Array<{
      provider: LLMProvider;
      model: string;
      stats: any;
    }>;
  } {
    const services = Array.from(this.serviceCache.entries()).map(([key, service]) => {
      const [provider, model] = key.split('|');
      return {
        provider: provider as LLMProvider,
        model: model || 'unknown',
        stats: service.getStats()
      };
    });

    return {
      cachedServices: this.serviceCache.size,
      services
    };
  }

  /**
   * Create service with automatic fallback
   * Tries primary provider first, falls back to secondary if primary fails
   */
  async createWithFallback(
    primary: LLMProvider = 'ollama',
    secondary: LLMProvider = 'openai'
  ): Promise<{
    service: LLMService;
    provider: LLMProvider;
    message: string;
  }> {
    try {
      const primaryService = this.createLLMService({ provider: primary });
      const connected = await primaryService.testConnection();
      
      if (connected) {
        return {
          service: primaryService,
          provider: primary,
          message: `Using ${primary} LLM service`
        };
      }
    } catch (error) {
      console.warn(`Primary LLM service (${primary}) failed:`, error);
    }

    // Try secondary provider
    try {
      const secondaryService = this.createLLMService({ provider: secondary });
      const connected = await secondaryService.testConnection();
      
      if (connected) {
        return {
          service: secondaryService,
          provider: secondary,
          message: `Falling back to ${secondary} LLM service`
        };
      }
    } catch (error) {
      console.error(`Secondary LLM service (${secondary}) also failed:`, error);
    }

    throw new Error(`Both ${primary} and ${secondary} LLM services are unavailable`);
  }

  /**
   * Generate a test prompt for validating services
   */
  async validateService(provider: LLMProvider): Promise<{
    success: boolean;
    response?: string;
    error?: string;
    processingTime?: number;
  }> {
    try {
      const service = this.createLLMService({ provider });
      
      const startTime = Date.now();
      const response = await service.generateCompletion({
        prompt: 'What is the capital of France? Answer in one word.',
        maxTokens: 10,
        temperature: 0.1
      });
      const processingTime = Date.now() - startTime;

      return {
        success: true,
        response: response.text.trim(),
        processingTime
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}