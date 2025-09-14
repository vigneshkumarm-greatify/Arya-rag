/**
 * ARYA-RAG Pipeline Test Suite
 * 
 * Individual tests for each step of the RAG pipeline:
 * 1. PDF Storage & Retrieval
 * 2. PDF Text Extraction 
 * 3. Text Chunking
 * 4. Embedding Generation
 * 5. Vector Storage
 * 
 * Run with: npm run test:pipeline
 * 
 * @author ARYA RAG Team
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test configuration
const PIPELINE_TEST_CONFIG = {
  userId: 'pipelineuser' + Date.now(),
  pdfPath: join(__dirname, '../../../../testing.pdf'),
  testDocumentTitle: 'Pipeline Test Document',
  sampleText: `This is a sample document for testing the RAG pipeline.

Chapter 1: Introduction
This document contains multiple paragraphs and sections to test the chunking functionality.
The text extraction should properly handle different formatting and layouts.

Chapter 2: Technical Details  
The embedding generation process converts text into vector representations.
These vectors enable semantic search and retrieval for question answering.

Chapter 3: Implementation
The system uses PDF parsing, text chunking, and vector embeddings.
Each step must work correctly for the overall RAG system to function.`
};

let pipelineTestResults: any[] = [];

/**
 * Pipeline test result logging
 */
function logPipelineTest(testName: string, status: 'PASS' | 'FAIL', details?: any, duration?: number) {
  const result = {
    test: testName,
    status,
    duration: duration ? `${duration}ms` : undefined,
    details,
    timestamp: new Date().toISOString()
  };
  
  pipelineTestResults.push(result);
  
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
 * Pipeline Test 1: PDF File Loading
 */
async function testPdfLoading() {
  const startTime = Date.now();
  try {
    console.log('📄 Testing PDF file loading...');
    
    // Check if PDF file exists and is readable
    const pdfBuffer = readFileSync(PIPELINE_TEST_CONFIG.pdfPath);
    
    if (pdfBuffer && pdfBuffer.length > 0) {
      logPipelineTest('PDF File Loading', 'PASS', {
        filePath: PIPELINE_TEST_CONFIG.pdfPath,
        fileSize: `${Math.round(pdfBuffer.length / 1024)}KB`,
        bufferLength: pdfBuffer.length,
        firstBytes: Array.from(pdfBuffer.slice(0, 8)).map(b => b.toString(16)).join(' ')
      }, Date.now() - startTime);
      return { success: true, buffer: pdfBuffer };
    } else {
      logPipelineTest('PDF File Loading', 'FAIL', {
        error: 'Empty or invalid PDF buffer'
      }, Date.now() - startTime);
      return { success: false };
    }
  } catch (error) {
    logPipelineTest('PDF File Loading', 'FAIL', { 
      error: error.message,
      filePath: PIPELINE_TEST_CONFIG.pdfPath
    }, Date.now() - startTime);
    return { success: false };
  }
}

/**
 * Pipeline Test 2: Storage Service Upload/Download
 */
async function testStorageOperations() {
  const startTime = Date.now();
  try {
    console.log('💾 Testing Supabase Storage operations...');
    
    const { StorageService } = await import('../services/storage/StorageService.js');
    const storageService = StorageService.getInstance();
    
    // Load test PDF
    const pdfBuffer = readFileSync(PIPELINE_TEST_CONFIG.pdfPath);
    const testFileName = `pipeline_test_${Date.now()}.pdf`;
    
    // Test upload
    const uploadResult = await storageService.uploadFile(
      pdfBuffer,
      testFileName,
      PIPELINE_TEST_CONFIG.userId,
      'application/pdf'
    );
    
    if (!uploadResult.success) {
      logPipelineTest('Storage Upload', 'FAIL', {
        error: uploadResult.error
      }, Date.now() - startTime);
      return { success: false };
    }
    
    console.log(`   📤 Upload successful: ${uploadResult.filePath}`);
    
    // Test download
    const downloadResult = await storageService.downloadFile(uploadResult.filePath!);
    
    if (!downloadResult.success || !downloadResult.buffer) {
      logPipelineTest('Storage Download', 'FAIL', {
        error: downloadResult.error
      }, Date.now() - startTime);
      return { success: false };
    }
    
    console.log(`   📥 Download successful: ${downloadResult.buffer.length} bytes`);
    
    // Test cleanup
    const deleteResult = await storageService.deleteFile(uploadResult.filePath!);
    console.log(`   🗑️ Cleanup: ${deleteResult.success ? 'Success' : 'Failed'}`);
    
    logPipelineTest('Storage Operations', 'PASS', {
      uploadedSize: `${Math.round(pdfBuffer.length / 1024)}KB`,
      downloadedSize: `${Math.round(downloadResult.buffer.length / 1024)}KB`,
      sizesMatch: pdfBuffer.length === downloadResult.buffer.length,
      filePath: uploadResult.filePath,
      cleanupSuccess: deleteResult.success
    }, Date.now() - startTime);
    
    return { success: true, buffer: downloadResult.buffer };
    
  } catch (error) {
    logPipelineTest('Storage Operations', 'FAIL', { error: error.message }, Date.now() - startTime);
    return { success: false };
  }
}

/**
 * Pipeline Test 3: PDF Text Extraction
 */
async function testTextExtraction() {
  const startTime = Date.now();
  try {
    console.log('📝 Testing PDF text extraction...');
    
    const { DocumentProcessor } = await import('../services/document/DocumentProcessor.js');
    const processor = new DocumentProcessor();
    
    // Load test PDF
    const pdfBuffer = readFileSync(PIPELINE_TEST_CONFIG.pdfPath);
    
    // Test text extraction using the method that routes expect
    const extractionResult = await processor.extractPagesFromBuffer(pdfBuffer, 'testing.pdf');
    
    if (extractionResult.success && extractionResult.pages && extractionResult.pages.length > 0) {
      const totalText = extractionResult.pages.map(p => p.text).join(' ');
      const firstPage = extractionResult.pages[0];
      
      logPipelineTest('PDF Text Extraction', 'PASS', {
        success: extractionResult.success,
        pageCount: extractionResult.pages.length,
        totalTextLength: totalText.length,
        firstPageLength: firstPage.text.length,
        hasPageNumbers: extractionResult.pages.every(p => typeof p.pageNumber === 'number'),
        sampleText: firstPage.text.substring(0, 100) + '...'
      }, Date.now() - startTime);
      
      return { success: true, pages: extractionResult.pages, totalText };
    } else {
      logPipelineTest('PDF Text Extraction', 'FAIL', {
        success: extractionResult.success,
        error: extractionResult.error,
        pageCount: extractionResult.pages?.length || 0
      }, Date.now() - startTime);
      return { success: false };
    }
  } catch (error) {
    logPipelineTest('PDF Text Extraction', 'FAIL', { error: error.message }, Date.now() - startTime);
    return { success: false };
  }
}

/**
 * Pipeline Test 4: Text Chunking (using real extracted PDF text)
 */
async function testTextChunking() {
  const startTime = Date.now();
  try {
    console.log('✂️  Testing text chunking with real PDF text...');
    
    // First extract real text from the PDF
    const { DocumentProcessor } = await import('../services/document/DocumentProcessor.js');
    const processor = new DocumentProcessor();
    
    const pdfBuffer = readFileSync(PIPELINE_TEST_CONFIG.pdfPath);
    const extractionResult = await processor.extractPagesFromBuffer(pdfBuffer, 'testing.pdf');
    
    if (!extractionResult.success || !extractionResult.pages || extractionResult.pages.length === 0) {
      throw new Error('Failed to extract PDF text for chunking test');
    }
    
    console.log(`   📄 Using real PDF text: ${extractionResult.pages.length} pages extracted`);
    
    const { ChunkingService } = await import('../services/chunking/ChunkingService.js');
    const chunkingService = new ChunkingService();
    
    // Test chunking with real PDF pages
    const chunkingResult = await chunkingService.processPages(
      extractionResult.pages,
      'pipeline_test_doc_' + Date.now(),
      {
        maxTokensPerChunk: 200,
        overlapTokens: 50,
        preservePageBoundaries: true
      }
    );
    
    if (chunkingResult.chunks && chunkingResult.chunks.length > 0) {
      const firstChunk = chunkingResult.chunks[0];
      
      logPipelineTest('Text Chunking', 'PASS', {
        success: chunkingResult.success,
        chunkCount: chunkingResult.chunks.length,
        firstChunkTokens: firstChunk.chunkTokens,
        firstChunkLength: firstChunk.chunkText.length,
        hasPageNumbers: chunkingResult.chunks.every(c => typeof c.pageNumber === 'number'),
        hasChunkIds: chunkingResult.chunks.every(c => !!c.chunkId),
        sampleChunkText: firstChunk.chunkText.substring(0, 100) + '...'
      }, Date.now() - startTime);
      
      return { success: true, chunks: chunkingResult.chunks };
    } else {
      logPipelineTest('Text Chunking', 'FAIL', {
        success: chunkingResult.success,
        error: chunkingResult.error,
        chunkCount: chunkingResult.chunks?.length || 0
      }, Date.now() - startTime);
      return { success: false };
    }
  } catch (error) {
    logPipelineTest('Text Chunking', 'FAIL', { error: error.message }, Date.now() - startTime);
    return { success: false };
  }
}

/**
 * Pipeline Test 5: Embedding Generation (using real chunked text)
 */
async function testEmbeddingGeneration() {
  const startTime = Date.now();
  try {
    console.log('🧠 Testing embedding generation with real PDF text...');
    
    // First get real chunks from PDF
    const chunkingTestResult = await testTextChunking();
    if (!chunkingTestResult.success || !chunkingTestResult.chunks || chunkingTestResult.chunks.length === 0) {
      throw new Error('No chunks available for embedding test');
    }
    
    const firstChunk = chunkingTestResult.chunks[0];
    console.log(`   📝 Using real chunk text: "${firstChunk.chunkText.substring(0, 100)}..."`);
    
    const { EmbeddingServiceFactory } = await import('../services/embedding/EmbeddingServiceFactory.js');
    const embeddingFactory = EmbeddingServiceFactory.getInstance();
    const embeddingService = embeddingFactory.createEmbeddingService();
    
    // Test embedding generation with real chunk text
    const embeddingRequest = {
      text: firstChunk.chunkText,
      metadata: { 
        source: 'pipeline_test', 
        step: 'embedding_test',
        chunkId: firstChunk.chunkId,
        pageNumber: firstChunk.pageNumber
      }
    };
    
    try {
      console.log(`   🔗 Attempting to generate embedding with ${process.env.EMBEDDING_PROVIDER || 'default'} provider...`);
      
      const embeddingResult = await embeddingService.generateEmbedding(embeddingRequest);
      
      if (embeddingResult.embedding && Array.isArray(embeddingResult.embedding) && embeddingResult.embedding.length > 0) {
        const hasValidNumbers = embeddingResult.embedding.every(n => typeof n === 'number' && !isNaN(n));
        const avgValue = embeddingResult.embedding.reduce((sum, val) => sum + val, 0) / embeddingResult.embedding.length;
        
        logPipelineTest('Embedding Generation', 'PASS', {
          embeddingDimension: embeddingResult.embedding.length,
          hasValidNumbers,
          avgValue: parseFloat(avgValue.toFixed(6)),
          textLength: firstChunk.chunkText.length,
          firstFewValues: embeddingResult.embedding.slice(0, 5).map(v => parseFloat(v.toFixed(6))),
          embeddingModel: embeddingResult.model || process.env.EMBEDDING_MODEL || 'default',
          provider: process.env.EMBEDDING_PROVIDER || 'default'
        }, Date.now() - startTime);
        
        return { success: true, embedding: embeddingResult.embedding };
      } else {
        logPipelineTest('Embedding Generation', 'FAIL', {
          error: 'Invalid embedding format - no valid embedding returned',
          embeddingType: typeof embeddingResult?.embedding,
          embeddingLength: embeddingResult?.embedding?.length || 0,
          fullResult: embeddingResult,
          provider: process.env.EMBEDDING_PROVIDER || 'default'
        }, Date.now() - startTime);
        return { success: false };
      }
    } catch (embeddingError) {
      console.error('   ❌ Embedding generation error details:', {
        message: embeddingError.message,
        stack: embeddingError.stack,
        name: embeddingError.name,
        cause: embeddingError.cause
      });
      
      // Provide detailed error information
      const errorDetails = {
        originalError: embeddingError.message,
        provider: process.env.EMBEDDING_PROVIDER || 'default',
        apiKey: process.env.OPENAI_API_KEY ? `${process.env.OPENAI_API_KEY.substring(0, 8)}...` : 'NOT_SET',
        textLength: firstChunk.chunkText.length,
        errorType: embeddingError.name || 'Unknown',
        fullError: embeddingError.toString()
      };
      
      // Check if it's a connection error (service not available)
      if (embeddingError.message.includes('fetch') || embeddingError.message.includes('ECONNREFUSED') || 
          embeddingError.message.includes('connect') || embeddingError.message.includes('timeout')) {
        logPipelineTest('Embedding Generation', 'FAIL', {
          error: 'Service connection failed',
          details: errorDetails,
          suggestion: process.env.EMBEDDING_PROVIDER === 'ollama' ? 'Start Ollama with: ollama serve' : 'Check API credentials and internet connection'
        }, Date.now() - startTime);
        return { success: false };
      } else {
        logPipelineTest('Embedding Generation', 'FAIL', {
          error: embeddingError.message || 'Unknown embedding error',
          details: errorDetails
        }, Date.now() - startTime);
        return { success: false };
      }
    }
  } catch (error) {
    logPipelineTest('Embedding Generation', 'FAIL', { error: error.message }, Date.now() - startTime);
    return { success: false };
  }
}

/**
 * Pipeline Test 6: Vector Storage (using real chunks and embeddings only)
 */
async function testVectorStorage() {
  const startTime = Date.now();
  try {
    console.log('🗄️ Testing vector storage with real data only...');
    
    // Get real embeddings from previous test - NO MOCK DATA ALLOWED
    const embeddingTestResult = await testEmbeddingGeneration();
    if (!embeddingTestResult.success || !embeddingTestResult.embedding) {
      logPipelineTest('Vector Storage', 'FAIL', {
        error: 'Cannot test vector storage without real embeddings',
        embeddingTestSuccess: embeddingTestResult.success,
        reason: 'Real embeddings are required for meaningful vector storage testing'
      }, Date.now() - startTime);
      return { success: false };
    }
    
    // Get real chunks
    const chunkingTestResult = await testTextChunking();
    if (!chunkingTestResult.success || !chunkingTestResult.chunks || chunkingTestResult.chunks.length === 0) {
      throw new Error('No chunks available for vector storage test');
    }
    
    const firstChunk = chunkingTestResult.chunks[0];
    const sampleChunksWithEmbeddings = [
      {
        ...firstChunk,
        embedding: embeddingTestResult.embedding
      }
    ];
    
    console.log(`   ✅ Using real chunk with real embedding: "${firstChunk.chunkText.substring(0, 50)}..."`);
    
    const { VectorStorageService } = await import('../services/vector/VectorStorageService.js');
    const { DatabaseClient } = await import('../config/database.js');
    
    const vectorStorage = new VectorStorageService();
    const dbClient = DatabaseClient.getInstance();
    const db = dbClient.getClient();
    
    // Create a real document record for the test
    const testDocumentId = `pipeline_doc_${Date.now()}`;
    console.log(`   📄 Creating test document record: ${testDocumentId}`);
    
    const documentRecord = {
      document_id: testDocumentId,
      user_id: PIPELINE_TEST_CONFIG.userId,
      filename: 'pipeline_test.pdf',
      original_name: 'pipeline_test.pdf',
      title: 'Pipeline Test Document',
      mime_type: 'application/pdf',
      file_size: 1000,
      file_hash: 'test_hash',
      uploaded_at: new Date().toISOString(),
      status: 'completed' as const,
      total_pages: 2,
      total_chunks: 1,
      storage_path: 'test/path',
      storage_url: 'test/url',
      file_url: 'test/url',
      embedding_model: 'test_model'
    };
    
    const { error: createError } = await (db as any)
      .from('user_documents')
      .insert(documentRecord);
    
    if (createError) {
      throw new Error(`Failed to create test document: ${createError.message}`);
    }
    
    console.log(`   ✅ Test document created: ${testDocumentId}`);
    
    console.log('   📦 Attempting to store vector embeddings...');
    
    // Test vector storage with real data and real document ID
    // Get the actual model name from the embedding service
    const actualModelName = 'text-embedding-ada-002'; // We know we're using OpenAI
    
    console.log(`   🤖 Using embedding model: ${actualModelName}`);
    
    const storageResult = await vectorStorage.storeDocumentChunks(
      sampleChunksWithEmbeddings,
      testDocumentId,
      PIPELINE_TEST_CONFIG.userId,
      actualModelName
    );
    
    console.log('   📊 Vector storage result:', {
      success: storageResult.success,
      storedCount: storageResult.storedCount,
      failedCount: storageResult.failedCount,
      errors: storageResult.errors
    });
    
    if (storageResult.success) {
      logPipelineTest('Vector Storage', 'PASS', {
        success: storageResult.success,
        storedCount: storageResult.storedCount,
        failedCount: storageResult.failedCount,
        embeddingDimension: embeddingTestResult.embedding.length,
        userId: PIPELINE_TEST_CONFIG.userId,
        documentId: testDocumentId
      }, Date.now() - startTime);
      
      return { success: true };
    } else {
      logPipelineTest('Vector Storage', 'FAIL', {
        success: storageResult.success,
        storedCount: storageResult.storedCount,
        failedCount: storageResult.failedCount,
        errors: storageResult.errors,
        chunksAttempted: sampleChunksWithEmbeddings.length,
        embeddingDimension: embeddingTestResult.embedding.length,
        userId: PIPELINE_TEST_CONFIG.userId,
        suggestion: 'Check database connection and table schema'
      }, Date.now() - startTime);
      
      // Cleanup test document on failure
      await (db as any)
        .from('user_documents')
        .delete()
        .eq('document_id', testDocumentId);
      
      return { success: false };
    }
    
    console.log(`   ✅ Vector storage successful: ${storageResult.storedCount} chunks stored`);
    
    // Cleanup test document and chunks
    await (db as any)
      .from('document_chunks')
      .delete()
      .eq('document_id', testDocumentId);
      
    await (db as any)
      .from('user_documents')
      .delete()
      .eq('document_id', testDocumentId);
    
    console.log(`   🧹 Cleanup completed for test document: ${testDocumentId}`);

    return { success: true };
  } catch (error) {
    logPipelineTest('Vector Storage', 'FAIL', { error: error.message }, Date.now() - startTime);
    return { success: false };
  }
}

/**
 * Generate pipeline test report
 */
function generatePipelineReport() {
  const totalTests = pipelineTestResults.length;
  const passedTests = pipelineTestResults.filter(r => r.status === 'PASS').length;
  const failedTests = totalTests - passedTests;
  const successRate = Math.round((passedTests / totalTests) * 100);
  
  console.log('\n📊 ARYA-RAG Pipeline Test Report');
  console.log('================================');
  console.log(`📈 Success Rate: ${successRate}% (${passedTests}/${totalTests})`);
  console.log(`✅ Passed: ${passedTests}`);
  console.log(`❌ Failed: ${failedTests}`);
  console.log(`👤 Test User: ${PIPELINE_TEST_CONFIG.userId}`);
  
  console.log('\n📋 Pipeline Steps:');
  pipelineTestResults.forEach(result => {
    const status = result.status === 'PASS' ? '✅' : '❌';
    console.log(`   ${status} ${result.test} ${result.duration || ''}`);
  });
  
  console.log('\n🔧 Environment Info:');
  console.log(`   PDF File: ${PIPELINE_TEST_CONFIG.pdfPath}`);
  console.log(`   Embedding Provider: ${process.env.EMBEDDING_PROVIDER || 'ollama'}`);
  console.log(`   LLM Provider: ${process.env.LLM_PROVIDER || 'ollama'}`);
  console.log(`   Test Duration: ${Date.now() - pipelineTestStartTime}ms`);
  
  return failedTests === 0;
}

/**
 * Main pipeline test execution
 */
let pipelineTestStartTime: number;

async function runPipelineTests() {
  pipelineTestStartTime = Date.now();
  
  console.log('🔬 ARYA-RAG Pipeline Testing');
  console.log('============================');
  console.log(`📅 Started: ${new Date().toISOString()}`);
  console.log(`👤 Test User: ${PIPELINE_TEST_CONFIG.userId}`);
  console.log(`📄 Test PDF: ${PIPELINE_TEST_CONFIG.pdfPath}`);
  console.log('');
  
  const pipelineTests = [
    { name: 'PDF Loading', fn: testPdfLoading },
    { name: 'Storage Operations', fn: testStorageOperations },
    { name: 'Text Extraction', fn: testTextExtraction },
    { name: 'Text Chunking', fn: testTextChunking },
    { name: 'Embedding Generation', fn: testEmbeddingGeneration },
    { name: 'Vector Storage', fn: testVectorStorage }
  ];
  
  // Run tests sequentially
  for (const test of pipelineTests) {
    console.log(`\n🔄 Running ${test.name}...`);
    try {
      const result = await test.fn();
      if (!result?.success && test.name === 'PDF Loading') {
        console.log('💥 Critical failure - stopping pipeline tests');
        break;
      }
    } catch (error) {
      logPipelineTest(test.name, 'FAIL', { error: error.message });
    }
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Generate final report
  const allTestsPassed = generatePipelineReport();
  
  // Exit with appropriate code
  if (allTestsPassed) {
    console.log('\n🎉 All pipeline tests passed!');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some pipeline tests failed - check individual steps above.');
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runPipelineTests().catch(error => {
    console.error('💥 Pipeline test execution failed:', error);
    process.exit(1);
  });
}

export { runPipelineTests };