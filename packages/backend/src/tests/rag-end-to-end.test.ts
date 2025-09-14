/**
 * End-to-End RAG System Test
 * 
 * Comprehensive testing of the complete RAG pipeline from document processing
 * to query answering. Tests the integration of all services and validates
 * the accuracy of page citations and response quality.
 * 
 * @author ARYA RAG Team
 */

import { RAGService, RAGConfig } from '../services/rag/RAGService';
import { DocumentProcessor } from '../services/document/DocumentProcessor';
import { ChunkingService } from '../services/chunking/ChunkingService';
import { EmbeddingServiceFactory } from '../services/embedding/EmbeddingServiceFactory';
import { VectorStorageService } from '../services/vector/VectorStorageService';
import { VectorSearchService } from '../services/vector/VectorSearchService';
import { LLMServiceFactory } from '../services/llm/LLMServiceFactory';
import { DatabaseClient } from '../config/database';
import { RAGRequest, RAGResponse, DocumentChunk } from '@arya-rag/types';

/**
 * Test configuration for RAG system
 */
const TEST_CONFIG: Partial<RAGConfig> = {
  maxSearchResults: 5,
  similarityThreshold: 0.7,
  maxResponseTokens: 500,
  temperature: 0.3,
  maxContextTokens: 2000,
  includeSourceExcerpts: true,
  requireSourceCitations: true,
  maxSourcesPerResponse: 3
};

/**
 * Sample test document content with known structure
 */
const SAMPLE_DOCUMENT_CONTENT = `
Page 1:
Introduction to Artificial Intelligence
Artificial intelligence (AI) refers to the simulation of human intelligence in machines. 
It encompasses machine learning, natural language processing, and computer vision.

Page 2:
Machine Learning Fundamentals
Machine learning is a subset of AI that enables machines to learn automatically 
from experience without being explicitly programmed. Common algorithms include 
decision trees, neural networks, and support vector machines.

Page 3:
Natural Language Processing
Natural language processing (NLP) is a branch of AI that helps computers understand, 
interpret and manipulate human language. Key applications include sentiment analysis, 
machine translation, and chatbots.
`;

/**
 * Sample questions with expected page references
 */
const TEST_QUESTIONS = [
  {
    question: "What is artificial intelligence?",
    expectedPage: 1,
    expectedKeywords: ["simulation", "human intelligence", "machines"]
  },
  {
    question: "What are common machine learning algorithms?",
    expectedPage: 2,
    expectedKeywords: ["decision trees", "neural networks", "support vector"]
  },
  {
    question: "What is natural language processing used for?",
    expectedPage: 3,
    expectedKeywords: ["sentiment analysis", "machine translation", "chatbots"]
  }
];

/**
 * RAG System End-to-End Test Suite
 */
class RAGEndToEndTest {
  private ragService: RAGService;
  private vectorStorage: VectorStorageService;
  private vectorSearch: VectorSearchService;
  private testUserId: string = 'test-user-rag-e2e';
  private testDocumentId: string = 'test-doc-ai-basics';

  constructor() {
    // Initialize RAG service with test configuration
    this.ragService = new RAGService(TEST_CONFIG);
    this.vectorStorage = new VectorStorageService();
    this.vectorSearch = new VectorSearchService();
  }

  /**
   * Run complete end-to-end test suite
   */
  async runTestSuite(): Promise<{
    success: boolean;
    results: {
      serviceInitialization: boolean;
      documentProcessing: boolean;
      vectorOperations: boolean;
      queryProcessing: boolean;
      citationAccuracy: boolean;
    };
    details: any[];
    errors: string[];
  }> {
    console.log('🧪 Starting RAG End-to-End Test Suite');
    console.log('=====================================');

    const results = {
      serviceInitialization: false,
      documentProcessing: false,
      vectorOperations: false,
      queryProcessing: false,
      citationAccuracy: false
    };
    
    const details: any[] = [];
    const errors: string[] = [];

    try {
      // Test 1: Service Initialization
      console.log('\n1️⃣ Testing Service Initialization...');
      const initResult = await this.testServiceInitialization();
      results.serviceInitialization = initResult.success;
      details.push({ test: 'Service Initialization', ...initResult });
      
      if (!initResult.success) {
        errors.push('Service initialization failed');
      }

      // Test 2: Document Processing
      console.log('\n2️⃣ Testing Document Processing...');
      const docResult = await this.testDocumentProcessing();
      results.documentProcessing = docResult.success;
      details.push({ test: 'Document Processing', ...docResult });
      
      if (!docResult.success) {
        errors.push('Document processing failed');
      }

      // Test 3: Vector Operations
      console.log('\n3️⃣ Testing Vector Operations...');
      const vectorResult = await this.testVectorOperations();
      results.vectorOperations = vectorResult.success;
      details.push({ test: 'Vector Operations', ...vectorResult });
      
      if (!vectorResult.success) {
        errors.push('Vector operations failed');
      }

      // Test 4: Query Processing
      console.log('\n4️⃣ Testing Query Processing...');
      const queryResult = await this.testQueryProcessing();
      results.queryProcessing = queryResult.success;
      details.push({ test: 'Query Processing', ...queryResult });
      
      if (!queryResult.success) {
        errors.push('Query processing failed');
      }

      // Test 5: Citation Accuracy
      console.log('\n5️⃣ Testing Citation Accuracy...');
      const citationResult = await this.testCitationAccuracy();
      results.citationAccuracy = citationResult.success;
      details.push({ test: 'Citation Accuracy', ...citationResult });
      
      if (!citationResult.success) {
        errors.push('Citation accuracy validation failed');
      }

    } catch (error) {
      errors.push(`Test suite execution error: ${error instanceof Error ? error.message : error}`);
    }

    // Calculate overall success
    const allTestsPassed = Object.values(results).every(result => result === true);

    console.log('\n📊 Test Results Summary');
    console.log('======================');
    console.log(`Service Initialization: ${results.serviceInitialization ? '✅' : '❌'}`);
    console.log(`Document Processing:    ${results.documentProcessing ? '✅' : '❌'}`);
    console.log(`Vector Operations:      ${results.vectorOperations ? '✅' : '❌'}`);
    console.log(`Query Processing:       ${results.queryProcessing ? '✅' : '❌'}`);
    console.log(`Citation Accuracy:      ${results.citationAccuracy ? '✅' : '❌'}`);
    console.log(`Overall Success:        ${allTestsPassed ? '✅' : '❌'}`);

    if (errors.length > 0) {
      console.log('\n❌ Errors:');
      errors.forEach(error => console.log(`   - ${error}`));
    }

    return {
      success: allTestsPassed,
      results,
      details,
      errors
    };
  }

  /**
   * Test initialization of all services
   */
  private async testServiceInitialization(): Promise<{ success: boolean; message: string; details: any }> {
    try {
      // Test RAG service pipeline
      const pipelineTest = await this.ragService.testPipeline();
      
      if (!pipelineTest.success) {
        return {
          success: false,
          message: 'RAG pipeline test failed',
          details: pipelineTest
        };
      }

      // Test individual services
      const embeddingFactory = EmbeddingServiceFactory.getInstance();
      const llmFactory = LLMServiceFactory.getInstance();

      // Test service availability
      const serviceTests = await Promise.allSettled([
        embeddingFactory.testAllServices(),
        llmFactory.testAllServices()
      ]);

      const details = {
        pipeline: pipelineTest,
        serviceAvailability: serviceTests.map((result, index) => ({
          service: index === 0 ? 'embedding' : 'llm',
          status: result.status,
          value: result.status === 'fulfilled' ? result.value : result.reason
        }))
      };

      return {
        success: true,
        message: 'All services initialized successfully',
        details
      };

    } catch (error) {
      return {
        success: false,
        message: `Service initialization failed: ${error instanceof Error ? error.message : error}`,
        details: { error }
      };
    }
  }

  /**
   * Test document processing and chunking
   */
  private async testDocumentProcessing(): Promise<{ success: boolean; message: string; details: any }> {
    try {
      // Create mock document chunks from sample content
      const mockPages = this.createMockPages();
      const chunkingService = new ChunkingService();

      // Process document pages into chunks
      const chunkResult = await chunkingService.processPages(
        mockPages,
        this.testDocumentId,
        {
          maxTokensPerChunk: 200,
          overlapTokens: 50,
          preservePageBoundaries: true
        }
      );

      if (!chunkResult.success) {
        return {
          success: false,
          message: 'Document chunking failed',
          details: { error: chunkResult.error }
        };
      }

      // Validate chunk structure
      const chunks = chunkResult.chunks;
      const hasPageNumbers = chunks.every(chunk => 
        chunk.pageNumber !== undefined && chunk.pageNumber > 0
      );
      
      const hasContent = chunks.every(chunk => 
        chunk.chunkText && chunk.chunkText.length > 0
      );

      const hasTokenCounts = chunks.every(chunk => 
        chunk.chunkTokens && chunk.chunkTokens > 0
      );

      if (!hasPageNumbers || !hasContent || !hasTokenCounts) {
        return {
          success: false,
          message: 'Chunk validation failed',
          details: { hasPageNumbers, hasContent, hasTokenCounts, chunks }
        };
      }

      return {
        success: true,
        message: `Document processed successfully: ${chunks.length} chunks created`,
        details: {
          totalChunks: chunks.length,
          avgTokensPerChunk: Math.round(chunks.reduce((sum, c) => sum + c.chunkTokens, 0) / chunks.length),
          pagesCovered: [...new Set(chunks.map(c => c.pageNumber))].length,
          sampleChunk: chunks[0]
        }
      };

    } catch (error) {
      return {
        success: false,
        message: `Document processing failed: ${error instanceof Error ? error.message : error}`,
        details: { error }
      };
    }
  }

  /**
   * Test vector storage and search operations
   */
  private async testVectorOperations(): Promise<{ success: boolean; message: string; details: any }> {
    try {
      // Create test chunks with embeddings
      const testChunks = await this.createTestChunksWithEmbeddings();

      // Test vector storage
      console.log('   📥 Testing vector storage...');
      const storageResult = await this.vectorStorage.storeDocumentChunks(
        testChunks,
        this.testDocumentId,
        this.testUserId,
        'test-embedding-model'
      );

      if (!storageResult.success) {
        return {
          success: false,
          message: 'Vector storage failed',
          details: { storageError: storageResult.error }
        };
      }

      // Test vector search
      console.log('   🔍 Testing vector search...');
      const searchEmbedding = testChunks[0].embedding; // Use first chunk's embedding
      const searchResults = await this.vectorSearch.search(
        searchEmbedding,
        this.testUserId,
        {
          topK: 3,
          similarityThreshold: 0.5,
          includeMetadata: true
        }
      );

      if (searchResults.length === 0) {
        return {
          success: false,
          message: 'Vector search returned no results',
          details: { searchResults }
        };
      }

      // Validate search results structure
      const hasValidStructure = searchResults.every(result => 
        result.chunkText && 
        result.pageNumber !== undefined &&
        result.similarityScore !== undefined
      );

      if (!hasValidStructure) {
        return {
          success: false,
          message: 'Search results have invalid structure',
          details: { searchResults }
        };
      }

      return {
        success: true,
        message: `Vector operations successful: stored ${testChunks.length} chunks, found ${searchResults.length} results`,
        details: {
          chunksStored: testChunks.length,
          searchResults: searchResults.length,
          avgSimilarity: searchResults.reduce((sum, r) => sum + r.similarityScore, 0) / searchResults.length,
          sampleResult: searchResults[0]
        }
      };

    } catch (error) {
      return {
        success: false,
        message: `Vector operations failed: ${error instanceof Error ? error.message : error}`,
        details: { error }
      };
    }
  }

  /**
   * Test end-to-end query processing
   */
  private async testQueryProcessing(): Promise<{ success: boolean; message: string; details: any }> {
    try {
      const queryResults = [];

      // Test each sample question
      for (let i = 0; i < TEST_QUESTIONS.length; i++) {
        const testQuestion = TEST_QUESTIONS[i];
        console.log(`   🤔 Testing query ${i + 1}: "${testQuestion.question}"`);

        const ragRequest: RAGRequest = {
          query: testQuestion.question,
          userId: this.testUserId,
          maxResults: 3,
          responseStyle: 'concise'
        };

        const response = await this.ragService.processQuery(ragRequest);

        // Validate response structure
        if (!response.response || response.sources.length === 0) {
          return {
            success: false,
            message: `Query processing failed for question ${i + 1}`,
            details: { question: testQuestion.question, response }
          };
        }

        queryResults.push({
          question: testQuestion.question,
          response: response.response,
          sourcesFound: response.sources.length,
          confidence: response.confidence,
          processingTime: response.metadata.processingTime
        });
      }

      // Calculate average metrics
      const avgConfidence = queryResults.reduce((sum, r) => sum + r.confidence, 0) / queryResults.length;
      const avgProcessingTime = queryResults.reduce((sum, r) => sum + r.processingTime, 0) / queryResults.length;
      const avgSources = queryResults.reduce((sum, r) => sum + r.sourcesFound, 0) / queryResults.length;

      return {
        success: true,
        message: `Query processing successful: ${queryResults.length} queries processed`,
        details: {
          totalQueries: queryResults.length,
          avgConfidence: Math.round(avgConfidence * 100) / 100,
          avgProcessingTime: Math.round(avgProcessingTime),
          avgSourcesPerQuery: Math.round(avgSources * 10) / 10,
          queryResults
        }
      };

    } catch (error) {
      return {
        success: false,
        message: `Query processing failed: ${error instanceof Error ? error.message : error}`,
        details: { error }
      };
    }
  }

  /**
   * Test citation accuracy and page number correctness
   */
  private async testCitationAccuracy(): Promise<{ success: boolean; message: string; details: any }> {
    try {
      const citationResults = [];

      // Test each question for citation accuracy
      for (let i = 0; i < TEST_QUESTIONS.length; i++) {
        const testQuestion = TEST_QUESTIONS[i];
        console.log(`   📑 Testing citations for: "${testQuestion.question}"`);

        const ragRequest: RAGRequest = {
          query: testQuestion.question,
          userId: this.testUserId,
          maxResults: 3
        };

        const response = await this.ragService.processQuery(ragRequest);

        // Check if expected page is referenced
        const expectedPageFound = response.sources.some(source => 
          source.pageNumber === testQuestion.expectedPage
        );

        // Check if response contains expected keywords
        const keywordsFound = testQuestion.expectedKeywords.filter(keyword =>
          response.response.toLowerCase().includes(keyword.toLowerCase())
        );

        // Check citation format in response text
        const hasCitationFormat = /\(.*[Pp]age \d+.*\)/.test(response.response) || 
                                 response.sources.length > 0;

        citationResults.push({
          question: testQuestion.question,
          expectedPage: testQuestion.expectedPage,
          expectedPageFound,
          keywordsExpected: testQuestion.expectedKeywords.length,
          keywordsFound: keywordsFound.length,
          hasCitationFormat,
          sources: response.sources.map(s => ({
            page: s.pageNumber,
            similarity: s.similarityScore
          }))
        });
      }

      // Calculate accuracy metrics
      const pagesCorrect = citationResults.filter(r => r.expectedPageFound).length;
      const avgKeywordMatch = citationResults.reduce((sum, r) => 
        sum + (r.keywordsFound / r.keywordsExpected), 0
      ) / citationResults.length;
      const citationsFormatted = citationResults.filter(r => r.hasCitationFormat).length;

      const pageAccuracy = pagesCorrect / citationResults.length;
      const citationFormatAccuracy = citationsFormatted / citationResults.length;

      // Consider test successful if page accuracy > 80% and keyword match > 60%
      const success = pageAccuracy >= 0.8 && avgKeywordMatch >= 0.6 && citationFormatAccuracy >= 0.8;

      return {
        success,
        message: success ? 
          'Citation accuracy test passed' : 
          'Citation accuracy below threshold',
        details: {
          pageAccuracy: Math.round(pageAccuracy * 100),
          avgKeywordMatch: Math.round(avgKeywordMatch * 100),
          citationFormatAccuracy: Math.round(citationFormatAccuracy * 100),
          citationResults
        }
      };

    } catch (error) {
      return {
        success: false,
        message: `Citation accuracy test failed: ${error instanceof Error ? error.message : error}`,
        details: { error }
      };
    }
  }

  /**
   * Create mock document pages from sample content
   */
  private createMockPages(): Array<{ pageNumber: number; content: string }> {
    const pages = SAMPLE_DOCUMENT_CONTENT.trim().split(/Page \d+:/);
    
    return pages
      .filter(page => page.trim().length > 0)
      .map((content, index) => ({
        pageNumber: index + 1,
        content: content.trim()
      }));
  }

  /**
   * Create test chunks with mock embeddings
   */
  private async createTestChunksWithEmbeddings(): Promise<Array<DocumentChunk & { embedding: number[] }>> {
    const mockPages = this.createMockPages();
    const chunkingService = new ChunkingService();

    // Create chunks
    const chunkResult = await chunkingService.processPages(
      mockPages,
      this.testDocumentId,
      {
        maxTokensPerChunk: 150,
        overlapTokens: 30,
        preservePageBoundaries: true
      }
    );

    if (!chunkResult.success) {
      throw new Error('Failed to create test chunks');
    }

    // Add mock embeddings (for testing - in reality these would come from embedding service)
    return chunkResult.chunks.map(chunk => ({
      ...chunk,
      embedding: this.generateMockEmbedding(chunk.chunkText)
    }));
  }

  /**
   * Generate mock embedding vector based on text content
   */
  private generateMockEmbedding(text: string): number[] {
    // Create a pseudo-embedding based on text characteristics
    // This is for testing only - real embeddings come from ML models
    const words = text.toLowerCase().split(/\s+/);
    const embedding = new Array(384).fill(0); // Common embedding size

    // Simple hash-based mock embedding
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      for (let j = 0; j < word.length; j++) {
        const index = (word.charCodeAt(j) + i + j) % embedding.length;
        embedding[index] += 0.1;
      }
    }

    // Normalize to unit vector
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map(val => magnitude > 0 ? val / magnitude : 0);
  }

  /**
   * Clean up test data
   */
  async cleanup(): Promise<void> {
    try {
      console.log('🧹 Cleaning up test data...');
      
      const db = DatabaseClient.getInstance().getClient();
      
      // Delete test chunks
      await (db as any).from('document_chunks')
        .delete()
        .eq('document_id', this.testDocumentId);
      
      // Delete test document
      await (db as any).from('user_documents')
        .delete()
        .eq('document_id', this.testDocumentId);
      
      // Delete test queries
      await (db as any).from('user_queries')
        .delete()
        .eq('user_id', this.testUserId);

      console.log('✅ Test data cleanup completed');
      
    } catch (error) {
      console.warn('⚠️ Test cleanup failed (this may be okay):', error);
    }
  }
}

/**
 * Main test execution function
 */
export async function runRAGEndToEndTest(): Promise<void> {
  const testRunner = new RAGEndToEndTest();
  
  try {
    console.log('🚀 Initializing RAG End-to-End Test...');
    
    // Run the complete test suite
    const results = await testRunner.runTestSuite();
    
    // Display results
    if (results.success) {
      console.log('\n🎉 ALL TESTS PASSED!');
      console.log('The RAG system is working correctly end-to-end.');
    } else {
      console.log('\n❌ SOME TESTS FAILED');
      console.log('Please review the errors and fix the issues.');
      
      if (results.errors.length > 0) {
        console.log('\nError Summary:');
        results.errors.forEach((error, index) => {
          console.log(`${index + 1}. ${error}`);
        });
      }
    }

    // Performance summary
    const processingDetails = results.details.find(d => d.test === 'Query Processing');
    if (processingDetails && processingDetails.details) {
      console.log('\n⚡ Performance Summary:');
      console.log(`   Average Response Time: ${processingDetails.details.avgProcessingTime}ms`);
      console.log(`   Average Confidence: ${Math.round(processingDetails.details.avgConfidence * 100)}%`);
      console.log(`   Average Sources per Query: ${processingDetails.details.avgSourcesPerQuery}`);
    }

    return;

  } catch (error) {
    console.error('💥 Test execution failed:', error);
  } finally {
    // Always attempt cleanup
    await testRunner.cleanup();
  }
}

/**
 * If running this file directly, execute the test
 */
if (require.main === module) {
  runRAGEndToEndTest()
    .then(() => {
      console.log('\n🏁 Test execution completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 Fatal test error:', error);
      process.exit(1);
    });
}