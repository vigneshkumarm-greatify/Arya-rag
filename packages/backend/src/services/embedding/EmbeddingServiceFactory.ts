/**
 * Embedding Service Factory
 * 
 * Factory class for creating embedding service instances based on configuration.
 * Enables easy switching between Ollama (local) and OpenAI (cloud) providers.
 * 
 * @author ARYA RAG Team
 */

import { EmbeddingService, EmbeddingProvider } from './EmbeddingService';
import { OllamaEmbeddingService, OllamaEmbeddingConfig } from './OllamaEmbeddingService';
import { OpenAIEmbeddingService, OpenAIEmbeddingConfig } from './OpenAIEmbeddingService';

export interface EmbeddingFactoryConfig {
  provider: EmbeddingProvider;
  model?: string;
  
  // Ollama specific
  ollamaBaseUrl?: string;
  
  // OpenAI specific
  openaiApiKey?: string;
  openaiOrganization?: string;
  
  // Common options
  maxBatchSize?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
}

export class EmbeddingServiceFactory {
  private static instance: EmbeddingServiceFactory;
  private serviceCache: Map<string, EmbeddingService> = new Map();

  private constructor() {}

  /**
   * Get singleton instance of the factory
   */
  static getInstance(): EmbeddingServiceFactory {
    if (!EmbeddingServiceFactory.instance) {
      EmbeddingServiceFactory.instance = new EmbeddingServiceFactory();
    }
    return EmbeddingServiceFactory.instance;
  }

  /**
   * Create or get cached embedding service instance
   */
  createEmbeddingService(config?: Partial<EmbeddingFactoryConfig>): EmbeddingService {
    const finalConfig = this.resolveConfig(config);
    const cacheKey = this.generateCacheKey(finalConfig);

    // Return cached instance if available
    if (this.serviceCache.has(cacheKey)) {
      console.log(`📌 Using cached ${finalConfig.provider} embedding service`);
      return this.serviceCache.get(cacheKey)!;
    }

    // Create new service instance
    let service: EmbeddingService;

    switch (finalConfig.provider) {
      case 'ollama':
        service = this.createOllamaService(finalConfig);
        break;
        
      case 'openai':
        service = this.createOpenAIService(finalConfig);
        break;
        
      default:
        throw new Error(`Unsupported embedding provider: ${finalConfig.provider}`);
    }

    // Cache the service
    this.serviceCache.set(cacheKey, service);
    
    console.log(`✨ Created new ${finalConfig.provider} embedding service`);
    return service;
  }

  /**
   * Create Ollama embedding service
   */
  private createOllamaService(config: EmbeddingFactoryConfig): OllamaEmbeddingService {
    const ollamaConfig: Partial<OllamaEmbeddingConfig> = {
      baseUrl: config.ollamaBaseUrl,
      model: config.model,
      // Only pass these values if they're defined, let the service use its defaults otherwise
      ...(config.maxBatchSize !== undefined && { maxBatchSize: config.maxBatchSize }),
      ...(config.maxRetries !== undefined && { maxRetries: config.maxRetries }),
      ...(config.retryDelayMs !== undefined && { retryDelayMs: config.retryDelayMs }),
      ...(config.timeoutMs !== undefined && { timeoutMs: config.timeoutMs })
    };

    return new OllamaEmbeddingService(ollamaConfig);
  }

  /**
   * Create OpenAI embedding service
   */
  private createOpenAIService(config: EmbeddingFactoryConfig): OpenAIEmbeddingService {
    const openaiConfig: Partial<OpenAIEmbeddingConfig> = {
      apiKey: config.openaiApiKey,
      model: config.model,
      organization: config.openaiOrganization,
      // Only pass these values if they're defined, let the service use its defaults otherwise
      ...(config.maxBatchSize !== undefined && { maxBatchSize: config.maxBatchSize }),
      ...(config.maxRetries !== undefined && { maxRetries: config.maxRetries }),
      ...(config.retryDelayMs !== undefined && { retryDelayMs: config.retryDelayMs }),
      ...(config.timeoutMs !== undefined && { timeoutMs: config.timeoutMs })
    };

    return new OpenAIEmbeddingService(openaiConfig);
  }

  /**
   * Resolve configuration from environment variables and defaults
   */
  private resolveConfig(config?: Partial<EmbeddingFactoryConfig>): EmbeddingFactoryConfig {
    const provider = (config?.provider || 
                     process.env.EMBEDDING_PROVIDER || 
                     'ollama') as EmbeddingProvider;

    // Base configuration
    const resolved: EmbeddingFactoryConfig = {
      provider,
      model: config?.model || this.getDefaultModel(provider),
      maxBatchSize: config?.maxBatchSize,
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
   * Get default model for a provider - now uses unified EMBEDDING_MODEL
   */
  private getDefaultModel(provider: EmbeddingProvider): string {
    // Use unified EMBEDDING_MODEL env var first
    const modelFromEnv = process.env.EMBEDDING_MODEL;
    if (modelFromEnv) {
      return modelFromEnv;
    }

    // Fallback to provider-specific defaults
    switch (provider) {
      case 'ollama':
        return process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text';
      case 'openai':
        return process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  /**
   * Generate cache key for service instance
   */
  private generateCacheKey(config: EmbeddingFactoryConfig): string {
    const keyParts = [
      config.provider,
      config.model,
      config.ollamaBaseUrl,
      config.openaiApiKey?.substring(0, 10), // Only use first 10 chars of API key
      config.maxBatchSize,
      config.maxRetries
    ];

    return keyParts.filter(part => part !== undefined).join('|');
  }

  /**
   * Clear service cache (useful for testing or config changes)
   */
  clearCache(): void {
    this.serviceCache.clear();
    console.log('🗑️  Embedding service cache cleared');
  }

  /**
   * Get service from environment variables (convenience method)
   */
  static createFromEnvironment(): EmbeddingService {
    const factory = EmbeddingServiceFactory.getInstance();
    return factory.createEmbeddingService();
  }

  /**
   * Test all available services to see which ones are ready
   */
  async testAllServices(): Promise<{
    ollama: { available: boolean; message: string };
    openai: { available: boolean; message: string };
    recommended: EmbeddingProvider;
  }> {
    const results = {
      ollama: { available: false, message: 'Not tested' },
      openai: { available: false, message: 'Not tested' },
      recommended: 'ollama' as EmbeddingProvider
    };

    // Test Ollama
    try {
      const ollamaService = this.createEmbeddingService({ provider: 'ollama' });
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
        const openaiService = this.createEmbeddingService({ provider: 'openai' });
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
      provider: EmbeddingProvider;
      model: string;
      stats: any;
    }>;
  } {
    const services = Array.from(this.serviceCache.entries()).map(([key, service]) => {
      const [provider, model] = key.split('|');
      return {
        provider: provider as EmbeddingProvider,
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
    primary: EmbeddingProvider = 'ollama',
    secondary: EmbeddingProvider = 'openai'
  ): Promise<{
    service: EmbeddingService;
    provider: EmbeddingProvider;
    message: string;
  }> {
    try {
      const primaryService = this.createEmbeddingService({ provider: primary });
      const connected = await primaryService.testConnection();
      
      if (connected) {
        return {
          service: primaryService,
          provider: primary,
          message: `Using ${primary} embedding service`
        };
      }
    } catch (error) {
      console.warn(`Primary embedding service (${primary}) failed:`, error);
    }

    // Try secondary provider
    try {
      const secondaryService = this.createEmbeddingService({ provider: secondary });
      const connected = await secondaryService.testConnection();
      
      if (connected) {
        return {
          service: secondaryService,
          provider: secondary,
          message: `Falling back to ${secondary} embedding service`
        };
      }
    } catch (error) {
      console.error(`Secondary embedding service (${secondary}) also failed:`, error);
    }

    throw new Error(`Both ${primary} and ${secondary} embedding services are unavailable`);
  }
}