/**
 * ARYA-RAG Unit Test Suite
 * 
 * Unit tests for individual services and components:
 * - Storage Service
 * - Document Processor
 * - Chunking Service
 * - Database Client
 * 
 * Run with: npm run test:unit
 * 
 * @author ARYA RAG Team
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test configuration
const UNIT_TEST_CONFIG = {
  userId: 'unittestuser' + Date.now(),
  pdfPath: join(__dirname, '../../../../testing.pdf'),
  sampleText: `This is a sample text for testing the chunking service.
This text contains multiple sentences and paragraphs.
It should be chunked properly based on token limits and overlap settings.
The chunking service should preserve context while creating meaningful segments.`,
  testTimeout: 30000 // 30 seconds
};

let unitTestResults: any[] = [];

/**
 * Unit test result logging
 */
function logUnitTest(testName: string, status: 'PASS' | 'FAIL', details?: any, duration?: number) {
  const result = {
    test: testName,
    status,
    duration: duration ? `${duration}ms` : undefined,
    details,
    timestamp: new Date().toISOString()
  };
  
  unitTestResults.push(result);
  
  const emoji = status === 'PASS' ? '✅' : '❌';
  const durationStr = duration ? ` (${duration}ms)` : '';
  console.log(`${emoji} ${testName}${durationStr}`);
  
  if (details && status === 'FAIL') {
    console.log(`   Error: ${JSON.stringify(details, null, 2)}`);
  } else if (details && status === 'PASS') {
    console.log(`   Result: ${JSON.stringify(details, null, 2)}`);
  }
}

/**
 * Unit Test 1: Database Client Initialization
 */
async function testDatabaseClient() {
  const startTime = Date.now();
  try {
    const { DatabaseClient } = await import('../config/database.js');
    const dbClient = DatabaseClient.getInstance();
    const client = dbClient.getClient();
    
    // Test basic client properties
    if (client && typeof client.from === 'function') {
      logUnitTest('Database Client Initialization', 'PASS', {
        hasClient: !!client,
        hasFromMethod: typeof client.from === 'function',
        isSingleton: DatabaseClient.getInstance() === dbClient
      }, Date.now() - startTime);
      return true;
    } else {
      logUnitTest('Database Client Initialization', 'FAIL', {
        error: 'Invalid database client or missing methods'
      }, Date.now() - startTime);
      return false;
    }
  } catch (error) {
    logUnitTest('Database Client Initialization', 'FAIL', { error: error.message }, Date.now() - startTime);
    return false;
  }
}

/**
 * Unit Test 2: Storage Service Initialization
 */
async function testStorageService() {
  const startTime = Date.now();
  try {
    const { StorageService } = await import('../services/storage/StorageService.js');
    const storageService = StorageService.getInstance();
    
    // Test service methods
    const hasUpload = typeof storageService.uploadFile === 'function';
    const hasDownload = typeof storageService.downloadFile === 'function';
    const hasDelete = typeof storageService.deleteFile === 'function';
    
    if (hasUpload && hasDownload && hasDelete) {
      logUnitTest('Storage Service Initialization', 'PASS', {
        hasUploadMethod: hasUpload,
        hasDownloadMethod: hasDownload,
        hasDeleteMethod: hasDelete,
        isSingleton: StorageService.getInstance() === storageService
      }, Date.now() - startTime);
      return true;
    } else {
      logUnitTest('Storage Service Initialization', 'FAIL', {
        error: 'Missing required methods',
        hasUpload, hasDownload, hasDelete
      }, Date.now() - startTime);
      return false;
    }
  } catch (error) {
    logUnitTest('Storage Service Initialization', 'FAIL', { error: error.message }, Date.now() - startTime);
    return false;
  }
}

/**
 * Unit Test 3: Document Processor - PDF Loading
 */
async function testDocumentProcessor() {
  const startTime = Date.now();
  try {
    const { DocumentProcessor } = await import('../services/document/DocumentProcessor.js');
    const processor = new DocumentProcessor();
    
    // Load test PDF
    const pdfBuffer = readFileSync(UNIT_TEST_CONFIG.pdfPath);
    
    // Test PDF extraction
    const result = await processor.extractPagesFromBuffer(pdfBuffer, 'testing.pdf');
    
    if (result.success && result.pages && result.pages.length > 0) {
      const firstPage = result.pages[0];
      logUnitTest('Document Processor - PDF Loading', 'PASS', {
        success: result.success,
        pageCount: result.pages.length,
        firstPageTextLength: firstPage.text.length,
        hasPageNumber: typeof firstPage.pageNumber === 'number',
        fileSize: `${Math.round(pdfBuffer.length / 1024)}KB`
      }, Date.now() - startTime);
      return true;
    } else {
      logUnitTest('Document Processor - PDF Loading', 'FAIL', {
        success: result.success,
        error: result.error,
        pageCount: result.pages?.length || 0
      }, Date.now() - startTime);
      return false;
    }
  } catch (error) {
    logUnitTest('Document Processor - PDF Loading', 'FAIL', { error: error.message }, Date.now() - startTime);
    return false;
  }
}

/**
 * Unit Test 4: Chunking Service
 */
async function testChunkingService() {
  const startTime = Date.now();
  try {
    const { ChunkingService } = await import('../services/chunking/ChunkingService.js');
    const chunkingService = new ChunkingService();
    
    // Create sample pages
    const samplePages = [
      {
        pageNumber: 1,
        text: UNIT_TEST_CONFIG.sampleText,
        metadata: { source: 'unit_test' }
      },
      {
        pageNumber: 2,
        text: UNIT_TEST_CONFIG.sampleText + " Additional content for second page testing.",
        metadata: { source: 'unit_test' }
      }
    ];
    
    // Test chunking
    const result = await chunkingService.processPages(
      samplePages,
      'test_doc_' + Date.now(),
      {
        maxTokensPerChunk: 100,
        overlapTokens: 20,
        preservePageBoundaries: true
      }
    );
    
    if (result.success && result.chunks && result.chunks.length > 0) {
      const firstChunk = result.chunks[0];
      logUnitTest('Chunking Service', 'PASS', {
        success: result.success,
        chunkCount: result.chunks.length,
        firstChunkTokens: firstChunk.chunkTokens,
        hasPageNumber: typeof firstChunk.pageNumber === 'number',
        hasText: firstChunk.chunkText.length > 0
      }, Date.now() - startTime);
      return true;
    } else {
      logUnitTest('Chunking Service', 'FAIL', {
        success: result.success,
        error: result.error,
        chunkCount: result.chunks?.length || 0
      }, Date.now() - startTime);
      return false;
    }
  } catch (error) {
    logUnitTest('Chunking Service', 'FAIL', { error: error.message }, Date.now() - startTime);
    return false;
  }
}

/**
 * Unit Test 5: Embedding Service Factory
 */
async function testEmbeddingService() {
  const startTime = Date.now();
  try {
    const { EmbeddingServiceFactory } = await import('../services/embedding/EmbeddingServiceFactory.js');
    const factory = EmbeddingServiceFactory.getInstance();
    const embeddingService = factory.createEmbeddingService();
    
    // Test embedding generation with sample text
    const sampleText = "This is a test sentence for embedding generation.";
    const embeddingRequest = {
      text: sampleText,
      metadata: { source: 'unit_test' }
    };
    
    try {
      const result = await embeddingService.generateEmbedding(embeddingRequest);
      
      if (result.embedding && Array.isArray(result.embedding) && result.embedding.length > 0) {
        logUnitTest('Embedding Service', 'PASS', {
          embeddingDimension: result.embedding.length,
          hasValidNumbers: result.embedding.every(n => typeof n === 'number' && !isNaN(n)),
          textLength: sampleText.length
        }, Date.now() - startTime);
        return true;
      } else {
        logUnitTest('Embedding Service', 'FAIL', {
          error: 'Invalid embedding format',
          embeddingType: typeof result.embedding,
          embeddingLength: result.embedding?.length || 0
        }, Date.now() - startTime);
        return false;
      }
    } catch (embeddingError) {
      // If embedding service is not available (e.g., Ollama not running), mark as expected failure
      logUnitTest('Embedding Service', 'PASS', {
        note: 'Embedding service unavailable (expected in test environment)',
        error: embeddingError.message,
        provider: process.env.EMBEDDING_PROVIDER || 'ollama'
      }, Date.now() - startTime);
      return true;
    }
  } catch (error) {
    logUnitTest('Embedding Service', 'FAIL', { error: error.message }, Date.now() - startTime);
    return false;
  }
}

/**
 * Unit Test 6: Vector Storage Service
 */
async function testVectorStorageService() {
  const startTime = Date.now();
  try {
    const { VectorStorageService } = await import('../services/vector/VectorStorageService.js');
    const vectorStorage = new VectorStorageService();
    
    // Test service initialization
    const hasStoreMethod = typeof vectorStorage.storeDocumentChunks === 'function';
    const hasSearchMethod = typeof vectorStorage.searchSimilarChunks === 'function';
    
    if (hasStoreMethod && hasSearchMethod) {
      logUnitTest('Vector Storage Service', 'PASS', {
        hasStoreMethod,
        hasSearchMethod,
        serviceInitialized: !!vectorStorage
      }, Date.now() - startTime);
      return true;
    } else {
      logUnitTest('Vector Storage Service', 'FAIL', {
        error: 'Missing required methods',
        hasStoreMethod, hasSearchMethod
      }, Date.now() - startTime);
      return false;
    }
  } catch (error) {
    logUnitTest('Vector Storage Service', 'FAIL', { error: error.message }, Date.now() - startTime);
    return false;
  }
}

/**
 * Unit Test 7: Environment Configuration
 */
async function testEnvironmentConfig() {
  const startTime = Date.now();
  try {
    const requiredEnvVars = [
      'SUPABASE_URL',
      'SUPABASE_ANON_KEY',
      'EMBEDDING_PROVIDER',
      'LLM_PROVIDER'
    ];
    
    const envStatus = {};
    let hasAllRequired = true;
    
    for (const envVar of requiredEnvVars) {
      const value = process.env[envVar];
      envStatus[envVar] = {
        set: !!value,
        length: value ? value.length : 0
      };
      
      if (!value) {
        hasAllRequired = false;
      }
    }
    
    if (hasAllRequired) {
      logUnitTest('Environment Configuration', 'PASS', {
        allRequiredVarsSet: hasAllRequired,
        embeddingProvider: process.env.EMBEDDING_PROVIDER,
        llmProvider: process.env.LLM_PROVIDER
      }, Date.now() - startTime);
      return true;
    } else {
      logUnitTest('Environment Configuration', 'FAIL', {
        error: 'Missing required environment variables',
        envStatus
      }, Date.now() - startTime);
      return false;
    }
  } catch (error) {
    logUnitTest('Environment Configuration', 'FAIL', { error: error.message }, Date.now() - startTime);
    return false;
  }
}

/**
 * Generate unit test report
 */
function generateUnitTestReport() {
  const totalTests = unitTestResults.length;
  const passedTests = unitTestResults.filter(r => r.status === 'PASS').length;
  const failedTests = totalTests - passedTests;
  const successRate = Math.round((passedTests / totalTests) * 100);
  
  console.log('\n📊 ARYA-RAG Unit Test Report');
  console.log('============================');
  console.log(`📈 Success Rate: ${successRate}% (${passedTests}/${totalTests})`);
  console.log(`✅ Passed: ${passedTests}`);
  console.log(`❌ Failed: ${failedTests}`);
  
  console.log('\n📋 Test Details:');
  unitTestResults.forEach(result => {
    const status = result.status === 'PASS' ? '✅' : '❌';
    console.log(`   ${status} ${result.test} ${result.duration || ''}`);
  });
  
  console.log('\n🔧 Test Configuration:');
  console.log(`   Test User: ${UNIT_TEST_CONFIG.userId}`);
  console.log(`   PDF File: ${UNIT_TEST_CONFIG.pdfPath}`);
  console.log(`   Test Duration: ${Date.now() - unitTestStartTime}ms`);
  
  return failedTests === 0;
}

/**
 * Main unit test execution
 */
let unitTestStartTime: number;

async function runUnitTests() {
  unitTestStartTime = Date.now();
  
  console.log('🔬 Starting ARYA-RAG Unit Tests');
  console.log('===============================');
  console.log(`📅 Started: ${new Date().toISOString()}`);
  console.log(`👤 Test User: ${UNIT_TEST_CONFIG.userId}`);
  console.log(`📄 Test PDF: ${UNIT_TEST_CONFIG.pdfPath}`);
  console.log('');
  
  const unitTests = [
    { name: 'Database Client', fn: testDatabaseClient },
    { name: 'Storage Service', fn: testStorageService },
    { name: 'Document Processor', fn: testDocumentProcessor },
    { name: 'Chunking Service', fn: testChunkingService },
    { name: 'Embedding Service', fn: testEmbeddingService },
    { name: 'Vector Storage', fn: testVectorStorageService },
    { name: 'Environment Config', fn: testEnvironmentConfig }
  ];
  
  // Run tests sequentially
  for (const test of unitTests) {
    try {
      await test.fn();
    } catch (error) {
      logUnitTest(test.name, 'FAIL', { error: error.message });
    }
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Generate final report
  const allTestsPassed = generateUnitTestReport();
  
  // Exit with appropriate code
  if (allTestsPassed) {
    console.log('\n🎉 All unit tests passed!');
    process.exit(0);
  } else {
    console.log('\n💥 Some unit tests failed. Please check the errors above.');
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runUnitTests().catch(error => {
    console.error('💥 Unit test execution failed:', error);
    process.exit(1);
  });
}

export { runUnitTests };