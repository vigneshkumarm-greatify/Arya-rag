/**
 * Server Entry Point
 * 
 * Main server startup file for the ARYA RAG API.
 * Handles initialization, configuration loading, and graceful shutdown.
 * 
 * @author ARYA RAG Team
 */

import dotenv from 'dotenv';
import { AppConfig } from './app';
import { DatabaseClient } from './config/database';

/**
 * Load environment variables
 */
dotenv.config();

/**
 * Server startup and initialization
 */
async function startServer(): Promise<void> {
  console.log('🏁 Starting ARYA RAG API Server...');
  console.log('==================================');

  try {
    // Validate required environment variables
    await validateEnvironment();

    // Skip database and AI service tests in development if using placeholder values
    if (process.env.SUPABASE_URL?.includes('placeholder') || process.env.NODE_ENV === 'development') {
      console.log('⚠️  Development mode: Skipping database and AI service validation');
      console.log('   Server will start but features requiring these services may not work');
    } else {
      // Test database connection
      await testDatabaseConnection();

      // Test AI services
      await testAIServices();
    }

    // Start the Express server
    const app = AppConfig.getInstance();
    const port = parseInt(process.env.PORT || '3001');
    
    await app.start(port);

  } catch (error) {
    console.error('💥 Server startup failed:', error);
    process.exit(1);
  }
}

/**
 * Validate required environment variables
 */
async function validateEnvironment(): Promise<void> {
  console.log('🔍 Validating environment configuration...');

  const required = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY'
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(`⚠️  Missing environment variables: ${missing.join(', ')}`);
      console.warn('   Using development defaults, some features may not work');
    } else {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  }

  // Validate AI service configuration
  const embeddingProvider = process.env.EMBEDDING_PROVIDER || 'ollama';
  const llmProvider = process.env.LLM_PROVIDER || 'ollama';

  if (embeddingProvider === 'openai' && !process.env.OPENAI_API_KEY) {
    throw new Error('OpenAI embedding provider requires OPENAI_API_KEY environment variable');
  }

  if (llmProvider === 'openai' && !process.env.OPENAI_API_KEY) {
    throw new Error('OpenAI LLM provider requires OPENAI_API_KEY environment variable');
  }

  console.log('✅ Environment validation passed');
  console.log(`   Embedding Provider: ${embeddingProvider}`);
  console.log(`   LLM Provider: ${llmProvider}`);
  console.log(`   Database: Supabase (${process.env.SUPABASE_URL?.split('.')[0]}...)`);
}

/**
 * Test database connection
 */
async function testDatabaseConnection(): Promise<void> {
  console.log('🗄️  Testing database connection...');

  try {
    const dbClient = DatabaseClient.getInstance();
    const client = dbClient.getClient();

    // Test connection with a simple query
    const { data, error } = await client.from('user_documents').select('count(*)', { count: 'exact', head: true });

    if (error) {
      throw new Error(`Database connection failed: ${error.message}`);
    }

    console.log('✅ Database connection successful');
    console.log(`   Total documents in database: ${data?.[0]?.count || 0}`);

  } catch (error) {
    throw new Error(`Database test failed: ${error instanceof Error ? error.message : error}`);
  }
}

/**
 * Test AI services availability
 */
async function testAIServices(): Promise<void> {
  console.log('🤖 Testing AI services...');

  try {
    try {
      // Test embedding service
      const { EmbeddingServiceFactory } = await import('./services/embedding/EmbeddingServiceFactory.js');
      const embeddingFactory = EmbeddingServiceFactory.getInstance();
      const embeddingTests = await embeddingFactory.testAllServices();

      console.log(`   Embedding Services:`);
      console.log(`     Ollama: ${embeddingTests.ollama.available ? '✅' : '❌'} - ${embeddingTests.ollama.message}`);
      console.log(`     OpenAI: ${embeddingTests.openai.available ? '✅' : '❌'} - ${embeddingTests.openai.message}`);

      // Test LLM service
      const { LLMServiceFactory } = await import('./services/llm/LLMServiceFactory.js');
      const llmFactory = LLMServiceFactory.getInstance();
      const llmTests = await llmFactory.testAllServices();

      console.log(`   LLM Services:`);
      console.log(`     Ollama: ${llmTests.ollama.available ? '✅' : '❌'} - ${llmTests.ollama.message}`);
      console.log(`     OpenAI: ${llmTests.openai.available ? '✅' : '❌'} - ${llmTests.openai.message}`);

      // Check if at least one service of each type is available
      const embeddingAvailable = embeddingTests.ollama.available || embeddingTests.openai.available;
      const llmAvailable = llmTests.ollama.available || llmTests.openai.available;

      if (!embeddingAvailable) {
        console.warn('⚠️  No embedding services available. Some features may not work.');
      }

      if (!llmAvailable) {
        console.warn('⚠️  No LLM services available. Query processing will not work.');
      }
    } catch (serviceError) {
      console.warn('⚠️  Could not load AI services:', serviceError instanceof Error ? serviceError.message : serviceError);
    }

    console.log('✅ AI services test completed');

  } catch (error) {
    console.warn('⚠️  AI services test failed:', error instanceof Error ? error.message : error);
    console.warn('   Server will start but some features may not be available.');
  }
}

/**
 * Handle uncaught errors
 */
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

/**
 * Start the server
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer().catch((error) => {
    console.error('💥 Fatal startup error:', error);
    process.exit(1);
  });
}

export { startServer };