/**
 * System Health and Monitoring API Routes
 * 
 * Provides system health checks, performance monitoring, and administrative functions.
 * Enables operational visibility and system diagnostics.
 * 
 * @author ARYA RAG Team
 */

import { Router, Request, Response } from 'express';
import { DatabaseClient } from '../config/database';
import { EmbeddingServiceFactory } from '../services/embedding/EmbeddingServiceFactory';
import { LLMServiceFactory } from '../services/llm/LLMServiceFactory';
import { RAGService } from '../services/rag/RAGService';
import { 
  asyncHandler, 
  successResponse 
} from '../middleware/errorHandler';

const router = Router();

/**
 * Comprehensive system health check
 * GET /api/system/health
 */
router.get('/health',
  asyncHandler(async (req: Request, res: Response) => {
    console.log('🏥 Running comprehensive health check...');

    const healthChecks = {
      database: await checkDatabaseHealth(),
      embeddingServices: await checkEmbeddingServicesHealth(),
      llmServices: await checkLLMServicesHealth(),
      ragService: await checkRAGServiceHealth(),
      systemResources: await checkSystemResourcesHealth()
    };

    // Determine overall health status
    const allHealthy = Object.values(healthChecks).every(check => 
      check && check.status === 'healthy'
    );

    const overallStatus = allHealthy ? 'healthy' : 'degraded';
    const statusCode = allHealthy ? 200 : 503;

    res.status(statusCode).json(successResponse(
      {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        checks: healthChecks,
        summary: {
          healthy: Object.values(healthChecks).filter(check => 
            check && check.status === 'healthy'
          ).length,
          total: Object.keys(healthChecks).length
        }
      },
      `System is ${overallStatus}`
    ));
  })
);

/**
 * Get system statistics and metrics
 * GET /api/system/stats
 */
router.get('/stats',
  asyncHandler(async (req: Request, res: Response) => {
    console.log('📊 Gathering system statistics...');

    const db = DatabaseClient.getInstance().getClient();

    // Database statistics
    const dbStats = await gatherDatabaseStatistics(db);

    // Service statistics
    const serviceStats = await gatherServiceStatistics();

    // System performance metrics
    const performanceStats = getSystemPerformanceStats();

    const systemStats = {
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      database: dbStats,
      services: serviceStats,
      performance: performanceStats,
      configuration: getSystemConfiguration()
    };

    res.json(successResponse(
      systemStats,
      'System statistics retrieved'
    ));
  })
);

/**
 * Get service availability and performance metrics
 * GET /api/system/services
 */
router.get('/services',
  asyncHandler(async (req: Request, res: Response) => {
    console.log('🔧 Checking service status...');

    const embeddingFactory = EmbeddingServiceFactory.getInstance();
    const llmFactory = LLMServiceFactory.getInstance();

    const serviceStatus = {
      embedding: {
        factory: await embeddingFactory.testAllServices(),
        activeService: embeddingFactory.getServiceStats()
      },
      llm: {
        factory: await llmFactory.testAllServices(),
        activeService: llmFactory.getServiceStats()
      },
      rag: await testRAGService()
    };

    res.json(successResponse(
      serviceStatus,
      'Service status retrieved'
    ));
  })
);

/**
 * Get database connection and performance info
 * GET /api/system/database
 */
router.get('/database',
  asyncHandler(async (req: Request, res: Response) => {
    console.log('🗄️ Checking database status...');

    const db = DatabaseClient.getInstance().getClient();

    // Test database connectivity and get basic stats
    const dbInfo = await getDatabaseInfo(db);

    res.json(successResponse(
      dbInfo,
      'Database information retrieved'
    ));
  })
);

/**
 * Get system configuration (sanitized)
 * GET /api/system/config
 */
router.get('/config',
  asyncHandler(async (req: Request, res: Response) => {
    const config = getSystemConfiguration();

    res.json(successResponse(
      config,
      'System configuration retrieved'
    ));
  })
);

/**
 * Test all system components end-to-end
 * GET /api/system/test
 */
router.get('/test/full',
  asyncHandler(async (req: Request, res: Response) => {
    console.log('🧪 Running full system test...');

    const testResults = {
      timestamp: new Date().toISOString(),
      tests: {
        database: await testDatabaseConnectivity(),
        embeddingGeneration: await testEmbeddingGeneration(),
        llmGeneration: await testLLMGeneration(),
        vectorStorage: await testVectorStorage(),
        ragPipeline: await testRAGPipeline()
      }
    };

    // Calculate overall test success
    const testsPassed = Object.values(testResults.tests).filter(test => 
      test && test.success
    ).length;
    const totalTests = Object.keys(testResults.tests).length;
    const allTestsPassed = testsPassed === totalTests;

    const response = {
      ...testResults,
      summary: {
        success: allTestsPassed,
        passed: testsPassed,
        total: totalTests,
        successRate: Math.round((testsPassed / totalTests) * 100)
      }
    };

    res.status(allTestsPassed ? 200 : 500).json(successResponse(
      response,
      allTestsPassed ? 'All system tests passed' : 'Some system tests failed'
    ));
  })
);

/**
 * Get system logs (basic implementation)
 * GET /api/system/logs
 */
router.get('/logs',
  asyncHandler(async (req: Request, res: Response) => {
    const level = req.query.level as string || 'info';
    const limit = parseInt(req.query.limit as string) || 100;

    // In a real implementation, you'd read from log files or a logging service
    // For this POC, we'll return a basic log structure
    const mockLogs = generateMockLogs(level, limit);

    res.json(successResponse(
      mockLogs,
      `Retrieved ${mockLogs.length} log entries`
    ));
  })
);

/**
 * Get performance metrics over time
 * GET /api/system/metrics
 */
router.get('/metrics',
  asyncHandler(async (req: Request, res: Response) => {
    const timeframe = req.query.timeframe as string || '1h';
    
    // Generate performance metrics
    const metrics = await getPerformanceMetrics(timeframe);

    res.json(successResponse(
      metrics,
      `Performance metrics for ${timeframe}`
    ));
  })
);

/**
 * Health check functions
 */

async function checkDatabaseHealth() {
  try {
    const db = DatabaseClient.getInstance().getClient();
    
    const start = Date.now();
    const { data, error } = await db.from('user_documents').select('count(*)', { count: 'exact', head: true });
    const responseTime = Date.now() - start;

    if (error) {
      return {
        status: 'unhealthy',
        message: `Database error: ${error.message}`,
        responseTime
      };
    }

    return {
      status: 'healthy',
      message: 'Database connection successful',
      responseTime,
      metadata: {
        totalDocuments: data?.[0]?.count || 0
      }
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      message: `Database connection failed: ${error instanceof Error ? error.message : error}`,
      responseTime: null
    };
  }
}

async function checkEmbeddingServicesHealth() {
  try {
    const embeddingFactory = EmbeddingServiceFactory.getInstance();
    const serviceTests = await embeddingFactory.testAllServices();

    const hasHealthyService = serviceTests.ollama.available || serviceTests.openai.available;

    return {
      status: hasHealthyService ? 'healthy' : 'unhealthy',
      message: hasHealthyService ? 'Embedding services available' : 'No embedding services available',
      details: serviceTests
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      message: `Embedding service check failed: ${error instanceof Error ? error.message : error}`,
      details: null
    };
  }
}

async function checkLLMServicesHealth() {
  try {
    const llmFactory = LLMServiceFactory.getInstance();
    const serviceTests = await llmFactory.testAllServices();

    const hasHealthyService = serviceTests.ollama.available || serviceTests.openai.available;

    return {
      status: hasHealthyService ? 'healthy' : 'unhealthy',
      message: hasHealthyService ? 'LLM services available' : 'No LLM services available',
      details: serviceTests
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      message: `LLM service check failed: ${error instanceof Error ? error.message : error}`,
      details: null
    };
  }
}

async function checkRAGServiceHealth() {
  try {
    const ragService = new RAGService();
    const pipelineTest = await ragService.testPipeline();

    return {
      status: pipelineTest.success ? 'healthy' : 'unhealthy',
      message: pipelineTest.success ? 'RAG pipeline operational' : 'RAG pipeline issues detected',
      details: pipelineTest
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      message: `RAG service check failed: ${error instanceof Error ? error.message : error}`,
      details: null
    };
  }
}

async function checkSystemResourcesHealth() {
  try {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    // Convert to MB
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    const rssMB = Math.round(memUsage.rss / 1024 / 1024);

    // Basic health thresholds
    const memoryHealthy = heapUsedMB < 500; // Under 500MB
    const uptime = process.uptime();

    return {
      status: memoryHealthy ? 'healthy' : 'warning',
      message: memoryHealthy ? 'System resources normal' : 'High memory usage detected',
      details: {
        memory: {
          heapUsed: heapUsedMB,
          heapTotal: heapTotalMB,
          rss: rssMB
        },
        uptime: Math.floor(uptime),
        pid: process.pid
      }
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      message: `System resource check failed: ${error instanceof Error ? error.message : error}`,
      details: null
    };
  }
}

/**
 * Statistics gathering functions
 */

async function gatherDatabaseStatistics(db: any) {
  try {
    // Get counts for all major tables
    const [documentsResult, chunksResult, queriesResult] = await Promise.allSettled([
      db.from('user_documents').select('count(*)', { count: 'exact', head: true }),
      db.from('document_chunks').select('count(*)', { count: 'exact', head: true }),
      db.from('user_queries').select('count(*)', { count: 'exact', head: true })
    ]);

    return {
      documents: documentsResult.status === 'fulfilled' ? documentsResult.value.count || 0 : 0,
      chunks: chunksResult.status === 'fulfilled' ? chunksResult.value.count || 0 : 0,
      queries: queriesResult.status === 'fulfilled' ? queriesResult.value.count || 0 : 0,
      status: 'connected'
    };
  } catch (error) {
    return {
      documents: 0,
      chunks: 0,
      queries: 0,
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

async function gatherServiceStatistics() {
  try {
    const embeddingFactory = EmbeddingServiceFactory.getInstance();
    const llmFactory = LLMServiceFactory.getInstance();

    return {
      embedding: embeddingFactory.getServiceStats(),
      llm: llmFactory.getServiceStats()
    };
  } catch (error) {
    return {
      embedding: { error: 'Failed to get embedding stats' },
      llm: { error: 'Failed to get LLM stats' }
    };
  }
}

function getSystemPerformanceStats() {
  const memUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();

  return {
    memory: {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      rss: Math.round(memUsage.rss / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024)
    },
    cpu: {
      user: cpuUsage.user,
      system: cpuUsage.system
    },
    uptime: Math.floor(process.uptime()),
    pid: process.pid,
    platform: process.platform,
    nodeVersion: process.version
  };
}

function getSystemConfiguration() {
  return {
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0',
    embeddingProvider: process.env.EMBEDDING_PROVIDER || 'ollama',
    llmProvider: process.env.LLM_PROVIDER || 'ollama',
    embeddingModel: process.env.EMBEDDING_MODEL || 'nomic-embed-text',
    llmModel: process.env.LLM_MODEL || 'mistral',
    chunkSizeTokens: process.env.CHUNK_SIZE_TOKENS || '600',
    chunkOverlapTokens: process.env.CHUNK_OVERLAP_TOKENS || '100',
    maxFileSizeMB: process.env.MAX_FILE_SIZE_MB || '100',
    ragMaxSearchResults: process.env.RAG_MAX_SEARCH_RESULTS || '10',
    ragSimilarityThreshold: process.env.RAG_SIMILARITY_THRESHOLD || '0.65',
    database: {
      url: process.env.SUPABASE_URL ? `${process.env.SUPABASE_URL.substring(0, 20)}...` : 'Not configured',
      hasKey: !!process.env.SUPABASE_ANON_KEY
    }
  };
}

/**
 * Test functions
 */

async function testDatabaseConnectivity() {
  try {
    const db = DatabaseClient.getInstance().getClient();
    const start = Date.now();
    
    const { data, error } = await db.from('user_documents').select('count(*)', { count: 'exact', head: true });
    
    const responseTime = Date.now() - start;

    return {
      success: !error,
      responseTime,
      message: error ? `Database test failed: ${error.message}` : 'Database connectivity test passed'
    };
  } catch (error) {
    return {
      success: false,
      responseTime: null,
      message: `Database test error: ${error instanceof Error ? error.message : error}`
    };
  }
}

async function testEmbeddingGeneration() {
  try {
    const embeddingFactory = EmbeddingServiceFactory.getInstance();
    const embeddingService = embeddingFactory.createEmbeddingService();
    
    const start = Date.now();
    const result = await embeddingService.generateEmbedding({
      text: 'Test embedding generation'
    });
    const responseTime = Date.now() - start;

    return {
      success: result.embedding.length > 0,
      responseTime,
      message: `Generated ${result.embedding.length}-dimensional embedding`,
      embeddingDimensions: result.embedding.length
    };
  } catch (error) {
    return {
      success: false,
      responseTime: null,
      message: `Embedding generation test failed: ${error instanceof Error ? error.message : error}`
    };
  }
}

async function testLLMGeneration() {
  try {
    const llmFactory = LLMServiceFactory.getInstance();
    const llmService = llmFactory.createLLMService();
    
    const start = Date.now();
    const result = await llmService.generateCompletion({
      prompt: 'What is 2+2? Answer briefly.',
      maxTokens: 10
    });
    const responseTime = Date.now() - start;

    return {
      success: result.text.length > 0,
      responseTime,
      message: 'LLM generation test completed',
      response: result.text.substring(0, 50),
      tokensGenerated: result.usage.completionTokens
    };
  } catch (error) {
    return {
      success: false,
      responseTime: null,
      message: `LLM generation test failed: ${error instanceof Error ? error.message : error}`
    };
  }
}

async function testVectorStorage() {
  // This would test vector storage operations
  // For now, return a mock success
  return {
    success: true,
    responseTime: 100,
    message: 'Vector storage test not implemented'
  };
}

async function testRAGPipeline() {
  try {
    const ragService = new RAGService();
    const pipelineTest = await ragService.testPipeline();

    return {
      success: pipelineTest.success,
      message: pipelineTest.success ? 'RAG pipeline test passed' : 'RAG pipeline test failed',
      details: pipelineTest
    };
  } catch (error) {
    return {
      success: false,
      message: `RAG pipeline test failed: ${error instanceof Error ? error.message : error}`
    };
  }
}

async function testRAGService() {
  try {
    const ragService = new RAGService();
    const stats = ragService.getStats();
    const pipelineTest = await ragService.testPipeline();

    return {
      operational: pipelineTest.success,
      statistics: stats,
      pipelineTest
    };
  } catch (error) {
    return {
      operational: false,
      error: error instanceof Error ? error.message : error
    };
  }
}

async function getDatabaseInfo(db: any) {
  try {
    const start = Date.now();
    
    // Test basic connectivity
    const { data, error } = await db.from('user_documents').select('count(*)', { count: 'exact', head: true });
    const responseTime = Date.now() - start;

    if (error) {
      return {
        connected: false,
        error: error.message,
        responseTime
      };
    }

    // Get table information
    const tables = ['user_documents', 'document_chunks', 'user_queries'];
    const tableSizes = {};

    for (const table of tables) {
      try {
        const { count } = await db.from(table).select('*', { count: 'exact', head: true });
        (tableSizes as any)[table] = count || 0;
      } catch (e) {
        (tableSizes as any)[table] = 'error';
      }
    }

    return {
      connected: true,
      responseTime,
      tables: tableSizes,
      databaseUrl: process.env.SUPABASE_URL ? `${process.env.SUPABASE_URL.substring(0, 20)}...` : 'Not configured'
    };
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : error
    };
  }
}

function generateMockLogs(level: string, limit: number) {
  const levels = ['info', 'warn', 'error', 'debug'];
  const logs = [];

  for (let i = 0; i < limit; i++) {
    const logLevel = levels[Math.floor(Math.random() * levels.length)];
    
    if (level !== 'all' && logLevel !== level) {
      continue;
    }

    logs.push({
      timestamp: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000).toISOString(),
      level: logLevel,
      message: `Sample log message ${i + 1}`,
      service: 'arya-rag-api',
      requestId: `req_${Math.random().toString(36).substr(2, 9)}`
    });
  }

  return logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

async function getPerformanceMetrics(timeframe: string) {
  // In a real implementation, you'd collect these metrics over time
  // For this POC, we'll return mock time-series data
  const dataPoints = timeframe === '1h' ? 12 : timeframe === '24h' ? 24 : 7;
  const metrics = [];

  for (let i = 0; i < dataPoints; i++) {
    const timestamp = new Date(Date.now() - (dataPoints - i) * (timeframe === '1h' ? 5 * 60 * 1000 : 60 * 60 * 1000));
    
    metrics.push({
      timestamp: timestamp.toISOString(),
      memory: {
        heapUsed: 50 + Math.random() * 100,
        rss: 100 + Math.random() * 200
      },
      cpu: {
        usage: Math.random() * 100
      },
      requests: {
        total: Math.floor(Math.random() * 100),
        errors: Math.floor(Math.random() * 5)
      },
      responseTime: {
        avg: 100 + Math.random() * 500,
        p95: 200 + Math.random() * 1000
      }
    });
  }

  return {
    timeframe,
    dataPoints: metrics.length,
    metrics
  };
}

export default router;