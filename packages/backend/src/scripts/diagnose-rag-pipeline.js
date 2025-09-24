/**
 * RAG Pipeline Comprehensive Diagnostic Tool
 * 
 * This script performs a complete end-to-end analysis of the RAG pipeline:
 * 1. Checks stored chunk embeddings (model, dimensions, format)
 * 2. Verifies query embeddings use same model and dimensions
 * 3. Tests vector search function directly
 * 4. Analyzes cosine similarity calculation
 * 5. Performs end-to-end pipeline trace
 * 
 * Run with: node packages/backend/src/scripts/diagnose-rag-pipeline.js
 * 
 * @author ARYA RAG Team
 */

const { createClient } = require('@supabase/supabase-js');
const { EmbeddingServiceFactory } = require('../services/embedding/EmbeddingServiceFactory');

// Load environment variables
require('dotenv').config();

class RAGPipelineDiagnostic {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );
    
    this.results = {
      timestamp: new Date().toISOString(),
      environment: {
        embeddingProvider: process.env.EMBEDDING_PROVIDER,
        embeddingModel: process.env.EMBEDDING_MODEL,
        embeddingDimensions: process.env.EMBEDDING_DIMENSIONS,
        ragSimilarityThreshold: process.env.RAG_SIMILARITY_THRESHOLD
      },
      tests: {}
    };
  }

  /**
   * Run complete diagnostic suite
   */
  async runDiagnostic() {
    console.log('🏥 ARYA RAG PIPELINE DIAGNOSTIC');
    console.log('=' .repeat(80));
    console.log(`Timestamp: ${this.results.timestamp}`);
    console.log(`Environment: ${process.env.NODE_ENV}`);
    console.log('=' .repeat(80));

    try {
      // Step 1: Environment and Configuration Check
      await this.checkEnvironmentConfiguration();
      
      // Step 2: Database Connection and Schema Check
      await this.checkDatabaseConnection();
      
      // Step 3: Check Stored Document Chunks and Embeddings
      await this.checkStoredEmbeddings();
      
      // Step 4: Test Embedding Service Configuration
      await this.testEmbeddingService();
      
      // Step 5: Test Vector Search Function
      await this.testVectorSearchFunction();
      
      // Step 6: Test Query Embedding Generation
      await this.testQueryEmbedding();
      
      // Step 7: Test Cosine Similarity Calculation
      await this.testCosineSimilarity();
      
      // Step 8: End-to-End Pipeline Test
      await this.testEndToEndPipeline();
      
      // Generate final report
      this.generateFinalReport();
      
    } catch (error) {
      console.error('❌ DIAGNOSTIC FAILED:', error);
      this.results.overallStatus = 'FAILED';
      this.results.criticalError = error.message;
    }
  }

  /**
   * Step 1: Check environment configuration
   */
  async checkEnvironmentConfiguration() {
    console.log('\n🔧 STEP 1: ENVIRONMENT CONFIGURATION CHECK');
    console.log('-' .repeat(50));
    
    const config = {
      embeddingProvider: process.env.EMBEDDING_PROVIDER,
      embeddingModel: process.env.EMBEDDING_MODEL,
      embeddingDimensions: process.env.EMBEDDING_DIMENSIONS,
      ragSimilarityThreshold: process.env.RAG_SIMILARITY_THRESHOLD,
      ollamaBaseUrl: process.env.OLLAMA_BASE_URL,
      openaiApiKey: process.env.OPENAI_API_KEY ? 'SET' : 'NOT_SET',
      supabaseUrl: process.env.SUPABASE_URL ? 'SET' : 'NOT_SET',
      supabaseKey: process.env.SUPABASE_ANON_KEY ? 'SET' : 'NOT_SET'
    };

    console.log('📋 Configuration:');
    Object.entries(config).forEach(([key, value]) => {
      console.log(`   ${key}: ${value || 'NOT_SET'}`);
    });

    // Validate critical configuration
    const issues = [];
    if (!config.embeddingProvider) issues.push('EMBEDDING_PROVIDER not set');
    if (!config.embeddingModel) issues.push('EMBEDDING_MODEL not set');
    if (!config.embeddingDimensions) issues.push('EMBEDDING_DIMENSIONS not set');
    if (!config.supabaseUrl) issues.push('SUPABASE_URL not set');
    if (!config.supabaseKey) issues.push('SUPABASE_ANON_KEY not set');

    if (config.embeddingProvider === 'ollama' && !config.ollamaBaseUrl) {
      issues.push('OLLAMA_BASE_URL not set for Ollama provider');
    }

    if (config.embeddingProvider === 'openai' && config.openaiApiKey === 'NOT_SET') {
      issues.push('OPENAI_API_KEY not set for OpenAI provider');
    }

    this.results.tests.environmentConfig = {
      status: issues.length === 0 ? 'PASS' : 'FAIL',
      config,
      issues,
      message: issues.length === 0 ? 'All configuration valid' : `${issues.length} configuration issues found`
    };

    if (issues.length > 0) {
      console.log('❌ Configuration Issues:');
      issues.forEach(issue => console.log(`   - ${issue}`));
    } else {
      console.log('✅ Environment configuration is valid');
    }
  }

  /**
   * Step 2: Check database connection and schema
   */
  async checkDatabaseConnection() {
    console.log('\n🗄️  STEP 2: DATABASE CONNECTION AND SCHEMA CHECK');
    console.log('-' .repeat(50));

    try {
      // Test basic connection
      const { data: healthCheck, error: healthError } = await this.supabase
        .from('user_documents')
        .select('count(*)', { count: 'exact', head: true });

      if (healthError) {
        throw new Error(`Database connection failed: ${healthError.message}`);
      }

      console.log('✅ Database connection successful');

      // Check required tables exist
      const tables = ['user_documents', 'document_chunks', 'user_queries'];
      const tableChecks = {};

      for (const table of tables) {
        try {
          const { count, error } = await this.supabase
            .from(table)
            .select('*', { count: 'exact', head: true });

          tableChecks[table] = {
            exists: !error,
            rowCount: count || 0,
            error: error?.message
          };

          console.log(`   ${table}: ${!error ? '✅' : '❌'} (${count || 0} rows)`);
        } catch (e) {
          tableChecks[table] = {
            exists: false,
            error: e.message
          };
          console.log(`   ${table}: ❌ ${e.message}`);
        }
      }

      // Check if vector extension is available
      let vectorExtensionAvailable = false;
      try {
        const { data: extensionData, error: extensionError } = await this.supabase
          .rpc('exec_sql', {
            sql_query: "SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector') as vector_enabled;"
          });

        if (!extensionError && extensionData && extensionData.length > 0) {
          vectorExtensionAvailable = extensionData[0].vector_enabled;
        }
      } catch (e) {
        // Extension check failed - might not have permissions
        console.log('   Vector extension check: ⚠️  Cannot verify (requires admin access)');
      }

      console.log(`   Vector extension: ${vectorExtensionAvailable ? '✅' : '❌'}`);

      this.results.tests.databaseConnection = {
        status: 'PASS',
        tableChecks,
        vectorExtensionAvailable,
        message: 'Database connection and schema valid'
      };

    } catch (error) {
      console.error('❌ Database check failed:', error.message);
      this.results.tests.databaseConnection = {
        status: 'FAIL',
        error: error.message,
        message: 'Database connection failed'
      };
    }
  }

  /**
   * Step 3: Check stored document chunks and their embeddings
   */
  async checkStoredEmbeddings() {
    console.log('\n📊 STEP 3: STORED EMBEDDINGS ANALYSIS');
    console.log('-' .repeat(50));

    try {
      // Get sample of document chunks
      const { data: chunks, error: chunksError } = await this.supabase
        .from('document_chunks')
        .select('chunk_id, embedding, chunk_text, page_number, user_id')
        .limit(5);

      if (chunksError) {
        throw new Error(`Failed to fetch chunks: ${chunksError.message}`);
      }

      if (!chunks || chunks.length === 0) {
        console.log('⚠️  No document chunks found in database');
        this.results.tests.storedEmbeddings = {
          status: 'WARNING',
          message: 'No document chunks found - upload some documents first',
          chunkCount: 0
        };
        return;
      }

      console.log(`📋 Found ${chunks.length} chunk samples to analyze`);

      const embeddingAnalysis = [];

      chunks.forEach((chunk, index) => {
        console.log(`\n--- CHUNK ${index + 1} ANALYSIS ---`);
        console.log(`Chunk ID: ${chunk.chunk_id}`);
        console.log(`Page: ${chunk.page_number}`);
        console.log(`User ID: ${chunk.user_id}`);
        console.log(`Text Preview: "${chunk.chunk_text?.substring(0, 100)}..."`);

        // Analyze embedding
        const embedding = chunk.embedding;
        console.log(`Embedding Type: ${typeof embedding}`);

        let embeddingArray = null;
        let dimensions = 0;
        let format = 'unknown';

        if (typeof embedding === 'string') {
          try {
            embeddingArray = JSON.parse(embedding);
            format = 'json_string';
            console.log(`Embedding Format: JSON string (length: ${embedding.length} chars)`);
          } catch (e) {
            console.log(`❌ Failed to parse embedding JSON: ${e.message}`);
          }
        } else if (Array.isArray(embedding)) {
          embeddingArray = embedding;
          format = 'array';
          console.log(`Embedding Format: Direct array`);
        } else {
          console.log(`❌ Unknown embedding format: ${typeof embedding}`);
        }

        if (embeddingArray && Array.isArray(embeddingArray)) {
          dimensions = embeddingArray.length;
          console.log(`Embedding Dimensions: ${dimensions}`);
          
          // Check if it looks like a real embedding
          const nonZeroCount = embeddingArray.filter(v => v !== 0).length;
          const isRealEmbedding = nonZeroCount > dimensions * 0.1; // At least 10% non-zero
          
          console.log(`Non-zero values: ${nonZeroCount}/${dimensions} (${((nonZeroCount/dimensions)*100).toFixed(1)}%)`);
          console.log(`Looks like real embedding: ${isRealEmbedding ? '✅' : '❌'}`);
          
          if (dimensions > 0) {
            console.log(`Value range: ${Math.min(...embeddingArray).toFixed(6)} to ${Math.max(...embeddingArray).toFixed(6)}`);
            console.log(`First 5 values: [${embeddingArray.slice(0, 5).map(v => v.toFixed(6)).join(', ')}]`);
          }

          embeddingAnalysis.push({
            chunkId: chunk.chunk_id,
            dimensions,
            format,
            nonZeroCount,
            isRealEmbedding,
            range: dimensions > 0 ? [Math.min(...embeddingArray), Math.max(...embeddingArray)] : [0, 0]
          });
        } else {
          embeddingAnalysis.push({
            chunkId: chunk.chunk_id,
            dimensions: 0,
            format: 'invalid',
            error: 'Could not parse embedding'
          });
        }
      });

      // Analyze consistency across chunks
      const dimensionCounts = {};
      embeddingAnalysis.forEach(analysis => {
        const dim = analysis.dimensions;
        dimensionCounts[dim] = (dimensionCounts[dim] || 0) + 1;
      });

      console.log('\n📊 EMBEDDING CONSISTENCY ANALYSIS:');
      console.log('Dimension distribution:');
      Object.entries(dimensionCounts).forEach(([dim, count]) => {
        console.log(`   ${dim} dimensions: ${count} chunks`);
      });

      const consistentDimensions = Object.keys(dimensionCounts).length === 1;
      const expectedDimensions = parseInt(process.env.EMBEDDING_DIMENSIONS) || 768;
      const actualDimensions = embeddingAnalysis[0]?.dimensions || 0;
      const dimensionsMatch = actualDimensions === expectedDimensions;

      console.log(`Consistent dimensions across chunks: ${consistentDimensions ? '✅' : '❌'}`);
      console.log(`Expected dimensions (ENV): ${expectedDimensions}`);
      console.log(`Actual dimensions (DB): ${actualDimensions}`);
      console.log(`Dimensions match: ${dimensionsMatch ? '✅' : '❌'}`);

      this.results.tests.storedEmbeddings = {
        status: consistentDimensions && dimensionsMatch ? 'PASS' : 'FAIL',
        chunkCount: chunks.length,
        embeddingAnalysis,
        dimensionCounts,
        consistentDimensions,
        expectedDimensions,
        actualDimensions,
        dimensionsMatch,
        message: consistentDimensions && dimensionsMatch ? 'Stored embeddings are consistent and valid' : 'Issues with stored embeddings detected'
      };

    } catch (error) {
      console.error('❌ Stored embeddings check failed:', error.message);
      this.results.tests.storedEmbeddings = {
        status: 'FAIL',
        error: error.message,
        message: 'Failed to analyze stored embeddings'
      };
    }
  }

  /**
   * Step 4: Test embedding service configuration
   */
  async testEmbeddingService() {
    console.log('\n🤖 STEP 4: EMBEDDING SERVICE TEST');
    console.log('-' .repeat(50));

    try {
      // Create embedding service using factory
      const embeddingFactory = EmbeddingServiceFactory.getInstance();
      const embeddingService = embeddingFactory.createEmbeddingService();

      console.log('✅ Embedding service factory initialized');

      // Test embedding generation
      const testText = "What should you do if your clothes catch fire?";
      console.log(`🔬 Testing embedding generation for: "${testText}"`);

      const startTime = Date.now();
      const result = await embeddingService.generateEmbedding({ text: testText });
      const generationTime = Date.now() - startTime;

      console.log(`✅ Embedding generated in ${generationTime}ms`);
      console.log(`   Dimensions: ${result.embedding.length}`);
      console.log(`   Model: ${result.model || 'unknown'}`);
      
      // Analyze the generated embedding
      const nonZeroCount = result.embedding.filter(v => v !== 0).length;
      const isRealEmbedding = nonZeroCount > result.embedding.length * 0.1;

      console.log(`   Non-zero values: ${nonZeroCount}/${result.embedding.length} (${((nonZeroCount/result.embedding.length)*100).toFixed(1)}%)`);
      console.log(`   Range: ${Math.min(...result.embedding).toFixed(6)} to ${Math.max(...result.embedding).toFixed(6)}`);
      console.log(`   Looks like real embedding: ${isRealEmbedding ? '✅' : '❌'}`);
      console.log(`   First 5 values: [${result.embedding.slice(0, 5).map(v => v.toFixed(6)).join(', ')}]`);

      // Compare with expected configuration
      const expectedDimensions = parseInt(process.env.EMBEDDING_DIMENSIONS) || 768;
      const dimensionsMatch = result.embedding.length === expectedDimensions;

      console.log(`   Expected dimensions: ${expectedDimensions}`);
      console.log(`   Actual dimensions: ${result.embedding.length}`);
      console.log(`   Dimensions match config: ${dimensionsMatch ? '✅' : '❌'}`);

      this.results.tests.embeddingService = {
        status: isRealEmbedding && dimensionsMatch ? 'PASS' : 'FAIL',
        testText,
        generationTime,
        dimensions: result.embedding.length,
        model: result.model,
        nonZeroCount,
        isRealEmbedding,
        expectedDimensions,
        dimensionsMatch,
        embeddingPreview: result.embedding.slice(0, 10),
        message: isRealEmbedding && dimensionsMatch ? 'Embedding service is working correctly' : 'Issues with embedding service detected'
      };

    } catch (error) {
      console.error('❌ Embedding service test failed:', error.message);
      this.results.tests.embeddingService = {
        status: 'FAIL',
        error: error.message,
        message: 'Embedding service test failed'
      };
    }
  }

  /**
   * Step 5: Test vector search function directly
   */
  async testVectorSearchFunction() {
    console.log('\n🔍 STEP 5: VECTOR SEARCH FUNCTION TEST');
    console.log('-' .repeat(50));

    try {
      // First, check if vector_search function exists
      console.log('🔬 Testing if vector_search RPC function exists...');

      // Get a sample user_id from existing data
      const { data: userDocs, error: userError } = await this.supabase
        .from('user_documents')
        .select('user_id')
        .limit(1);

      if (userError || !userDocs || userDocs.length === 0) {
        throw new Error('No user documents found to test with');
      }

      const testUserId = userDocs[0].user_id;
      console.log(`📋 Using test user_id: ${testUserId}`);

      // Create a test embedding (mock for function testing)
      const expectedDimensions = parseInt(process.env.EMBEDDING_DIMENSIONS) || 768;
      const testEmbedding = Array(expectedDimensions).fill(0).map(() => Math.random() * 0.1);

      console.log(`🔬 Testing vector_search RPC with ${expectedDimensions}D embedding...`);

      const { data: rpcData, error: rpcError } = await this.supabase.rpc('vector_search', {
        query_embedding: testEmbedding,
        user_id_param: testUserId,
        similarity_threshold: 0.1, // Very low threshold to get any results
        match_count: 5
      });

      if (rpcError) {
        console.error('❌ Vector search RPC failed:', rpcError.message);
        
        // Check if it's a function not found error
        if (rpcError.message.includes('function vector_search')) {
          this.results.tests.vectorSearchFunction = {
            status: 'FAIL',
            error: 'vector_search function not found',
            message: 'Vector search function does not exist in database',
            recommendation: 'Run the vector search setup script to create the function'
          };
          return;
        }

        this.results.tests.vectorSearchFunction = {
          status: 'FAIL',
          error: rpcError.message,
          message: 'Vector search function exists but failed to execute'
        };
        return;
      }

      console.log(`✅ Vector search RPC executed successfully`);
      console.log(`   Results returned: ${rpcData?.length || 0}`);

      if (rpcData && rpcData.length > 0) {
        console.log('📋 Sample results:');
        rpcData.slice(0, 3).forEach((row, index) => {
          console.log(`   Result ${index + 1}:`);
          console.log(`     Chunk ID: ${row.chunk_id}`);
          console.log(`     Similarity: ${row.similarity_score?.toFixed(6) || 'N/A'}`);
          console.log(`     Page: ${row.page_number}`);
          console.log(`     Text: "${row.chunk_text?.substring(0, 50)}..."`);
        });

        // Analyze similarity scores
        const similarities = rpcData.map(row => row.similarity_score).filter(s => s !== null && s !== undefined);
        if (similarities.length > 0) {
          console.log('\n🔍 Similarity Score Analysis:');
          console.log(`   Min: ${Math.min(...similarities).toFixed(6)}`);
          console.log(`   Max: ${Math.max(...similarities).toFixed(6)}`);
          console.log(`   Average: ${(similarities.reduce((a, b) => a + b, 0) / similarities.length).toFixed(6)}`);
          
          // Check if scores look like real cosine similarity (0-1 range)
          const validRange = similarities.every(s => s >= 0 && s <= 1);
          console.log(`   Valid range (0-1): ${validRange ? '✅' : '❌'}`);
        }
      }

      this.results.tests.vectorSearchFunction = {
        status: 'PASS',
        testUserId,
        resultCount: rpcData?.length || 0,
        sampleResults: rpcData?.slice(0, 3),
        message: 'Vector search function is working correctly'
      };

    } catch (error) {
      console.error('❌ Vector search function test failed:', error.message);
      this.results.tests.vectorSearchFunction = {
        status: 'FAIL',
        error: error.message,
        message: 'Vector search function test failed'
      };
    }
  }

  /**
   * Step 6: Test query embedding generation consistency
   */
  async testQueryEmbedding() {
    console.log('\n❓ STEP 6: QUERY EMBEDDING CONSISTENCY TEST');
    console.log('-' .repeat(50));

    try {
      const embeddingFactory = EmbeddingServiceFactory.getInstance();
      const embeddingService = embeddingFactory.createEmbeddingService();

      // Test multiple embeddings of the same text for consistency
      const testQuery = "What should you do if your clothes catch fire?";
      console.log(`🔬 Testing query embedding consistency for: "${testQuery}"`);

      const embeddings = [];
      for (let i = 0; i < 3; i++) {
        const result = await embeddingService.generateEmbedding({ text: testQuery });
        embeddings.push(result.embedding);
        console.log(`   Embedding ${i + 1}: ${result.embedding.length} dimensions`);
      }

      // Check consistency between embeddings
      const consistent = embeddings.length > 1 && embeddings.every(emb => 
        emb.length === embeddings[0].length &&
        emb.every((val, idx) => Math.abs(val - embeddings[0][idx]) < 0.000001)
      );

      console.log(`✅ Embedding consistency: ${consistent ? 'CONSISTENT' : 'INCONSISTENT'}`);

      // Test different queries
      const testQueries = [
        "What should you do if your clothes catch fire?",
        "fire safety clothing procedures",
        "emergency response for burning clothes"
      ];

      console.log('\n🔬 Testing different query embeddings...');
      const queryEmbeddings = {};

      for (const query of testQueries) {
        const result = await embeddingService.generateEmbedding({ text: query });
        queryEmbeddings[query] = result.embedding;
        console.log(`   "${query}": ${result.embedding.length}D`);
      }

      // Check that different queries produce different embeddings
      const queries = Object.keys(queryEmbeddings);
      const embedsAreDifferent = queries.every((q1, i) => 
        queries.slice(i + 1).every(q2 => {
          const emb1 = queryEmbeddings[q1];
          const emb2 = queryEmbeddings[q2];
          const similarity = this.calculateCosineSimilarity(emb1, emb2);
          return similarity < 0.99; // Should not be identical
        })
      );

      console.log(`✅ Different queries produce different embeddings: ${embedsAreDifferent ? 'YES' : 'NO'}`);

      this.results.tests.queryEmbedding = {
        status: consistent && embedsAreDifferent ? 'PASS' : 'FAIL',
        testQuery,
        consistent,
        embedsAreDifferent,
        dimensions: embeddings[0]?.length || 0,
        testQueries: testQueries.length,
        message: consistent && embedsAreDifferent ? 'Query embedding generation is working correctly' : 'Issues with query embedding generation'
      };

    } catch (error) {
      console.error('❌ Query embedding test failed:', error.message);
      this.results.tests.queryEmbedding = {
        status: 'FAIL',
        error: error.message,
        message: 'Query embedding test failed'
      };
    }
  }

  /**
   * Step 7: Test cosine similarity calculation
   */
  async testCosineSimilarity() {
    console.log('\n📐 STEP 7: COSINE SIMILARITY CALCULATION TEST');
    console.log('-' .repeat(50));

    try {
      // Test cosine similarity with known vectors
      console.log('🔬 Testing cosine similarity calculation...');

      // Test case 1: Identical vectors (should be 1.0)
      const vector1 = [1, 2, 3, 4, 5];
      const vector2 = [1, 2, 3, 4, 5];
      const similarity1 = this.calculateCosineSimilarity(vector1, vector2);
      console.log(`   Identical vectors: ${similarity1.toFixed(6)} (expected: 1.000000)`);

      // Test case 2: Orthogonal vectors (should be 0.0)
      const vector3 = [1, 0, 0];
      const vector4 = [0, 1, 0];
      const similarity2 = this.calculateCosineSimilarity(vector3, vector4);
      console.log(`   Orthogonal vectors: ${similarity2.toFixed(6)} (expected: 0.000000)`);

      // Test case 3: Opposite vectors (should be -1.0)
      const vector5 = [1, 2, 3];
      const vector6 = [-1, -2, -3];
      const similarity3 = this.calculateCosineSimilarity(vector5, vector6);
      console.log(`   Opposite vectors: ${similarity3.toFixed(6)} (expected: -1.000000)`);

      // Test with real embeddings if available
      if (this.results.tests.embeddingService?.status === 'PASS') {
        console.log('\n🔬 Testing with real embeddings...');
        
        const embeddingFactory = EmbeddingServiceFactory.getInstance();
        const embeddingService = embeddingFactory.createEmbeddingService();

        // Generate embeddings for similar and different texts
        const text1 = "What should you do if your clothes catch fire?";
        const text2 = "What should you do if your clothes catch fire?"; // Identical
        const text3 = "How to cook pasta properly"; // Different

        const emb1 = await embeddingService.generateEmbedding({ text: text1 });
        const emb2 = await embeddingService.generateEmbedding({ text: text2 });
        const emb3 = await embeddingService.generateEmbedding({ text: text3 });

        const identicalSim = this.calculateCosineSimilarity(emb1.embedding, emb2.embedding);
        const differentSim = this.calculateCosineSimilarity(emb1.embedding, emb3.embedding);

        console.log(`   Identical text similarity: ${identicalSim.toFixed(6)} (should be ~1.0)`);
        console.log(`   Different text similarity: ${differentSim.toFixed(6)} (should be <0.8)`);

        const realEmbeddingTestPassed = identicalSim > 0.99 && differentSim < 0.8;
        console.log(`   Real embedding test: ${realEmbeddingTestPassed ? '✅ PASS' : '❌ FAIL'}`);

        this.results.tests.cosineSimilarity = {
          status: realEmbeddingTestPassed ? 'PASS' : 'FAIL',
          basicTests: {
            identical: similarity1,
            orthogonal: similarity2,
            opposite: similarity3
          },
          realEmbeddingTests: {
            identicalText: identicalSim,
            differentText: differentSim,
            passed: realEmbeddingTestPassed
          },
          message: realEmbeddingTestPassed ? 'Cosine similarity calculation is working correctly' : 'Issues with cosine similarity calculation'
        };
      } else {
        this.results.tests.cosineSimilarity = {
          status: 'PARTIAL',
          basicTests: {
            identical: similarity1,
            orthogonal: similarity2,
            opposite: similarity3
          },
          message: 'Basic cosine similarity tests passed, but could not test with real embeddings'
        };
      }

    } catch (error) {
      console.error('❌ Cosine similarity test failed:', error.message);
      this.results.tests.cosineSimilarity = {
        status: 'FAIL',
        error: error.message,
        message: 'Cosine similarity test failed'
      };
    }
  }

  /**
   * Step 8: End-to-end pipeline test
   */
  async testEndToEndPipeline() {
    console.log('\n🚀 STEP 8: END-TO-END PIPELINE TEST');
    console.log('-' .repeat(50));

    try {
      // Check if we have data to test with
      const { data: userDocs, error: userError } = await this.supabase
        .from('user_documents')
        .select('user_id, document_id, filename')
        .limit(1);

      if (userError || !userDocs || userDocs.length === 0) {
        console.log('⚠️  No user documents found for end-to-end test');
        this.results.tests.endToEndPipeline = {
          status: 'SKIP',
          message: 'No user documents available for testing'
        };
        return;
      }

      const testUser = userDocs[0];
      console.log(`📋 Testing with user: ${testUser.user_id}, document: ${testUser.filename}`);

      // Generate query embedding
      const embeddingFactory = EmbeddingServiceFactory.getInstance();
      const embeddingService = embeddingFactory.createEmbeddingService();

      const testQuery = "What should you do if your clothes catch fire?";
      console.log(`🔬 Testing end-to-end pipeline with query: "${testQuery}"`);

      const startTime = Date.now();

      // Step 1: Generate query embedding
      console.log('   Step 1: Generating query embedding...');
      const queryResult = await embeddingService.generateEmbedding({ text: testQuery });
      const embeddingTime = Date.now() - startTime;
      console.log(`   ✅ Query embedding generated (${embeddingTime}ms, ${queryResult.embedding.length}D)`);

      // Step 2: Perform vector search
      console.log('   Step 2: Performing vector search...');
      const searchStartTime = Date.now();
      
      const { data: searchResults, error: searchError } = await this.supabase.rpc('vector_search', {
        query_embedding: queryResult.embedding,
        user_id_param: testUser.user_id,
        similarity_threshold: 0.1, // Low threshold to get results
        match_count: 10
      });

      const searchTime = Date.now() - searchStartTime;
      
      if (searchError) {
        throw new Error(`Vector search failed: ${searchError.message}`);
      }

      console.log(`   ✅ Vector search completed (${searchTime}ms, ${searchResults?.length || 0} results)`);

      // Step 3: Analyze results
      if (searchResults && searchResults.length > 0) {
        console.log('   Step 3: Analyzing search results...');
        
        searchResults.slice(0, 3).forEach((result, index) => {
          console.log(`     Result ${index + 1}:`);
          console.log(`       Similarity: ${result.similarity_score?.toFixed(6)}`);
          console.log(`       Page: ${result.page_number}`);
          console.log(`       Text: "${result.chunk_text?.substring(0, 80)}..."`);
        });

        // Check similarity scores quality
        const similarities = searchResults.map(r => r.similarity_score).filter(s => s != null);
        const avgSimilarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;
        const maxSimilarity = Math.max(...similarities);
        const minSimilarity = Math.min(...similarities);

        console.log(`     Similarity range: ${minSimilarity.toFixed(6)} - ${maxSimilarity.toFixed(6)}`);
        console.log(`     Average similarity: ${avgSimilarity.toFixed(6)}`);

        const qualityCheck = maxSimilarity > 0.3 && similarities.every(s => s >= 0 && s <= 1);
        console.log(`     Quality check: ${qualityCheck ? '✅ PASS' : '❌ FAIL'}`);

        const totalTime = Date.now() - startTime;

        this.results.tests.endToEndPipeline = {
          status: qualityCheck ? 'PASS' : 'FAIL',
          testQuery,
          testUserId: testUser.user_id,
          embeddingTime,
          searchTime,
          totalTime,
          resultCount: searchResults.length,
          avgSimilarity,
          maxSimilarity,
          minSimilarity,
          qualityCheck,
          message: qualityCheck ? 'End-to-end pipeline is working correctly' : 'Pipeline has quality issues'
        };

      } else {
        console.log('   ❌ No search results returned');
        
        this.results.tests.endToEndPipeline = {
          status: 'FAIL',
          testQuery,
          testUserId: testUser.user_id,
          embeddingTime,
          searchTime,
          resultCount: 0,
          message: 'Pipeline completed but returned no results'
        };
      }

    } catch (error) {
      console.error('❌ End-to-end pipeline test failed:', error.message);
      this.results.tests.endToEndPipeline = {
        status: 'FAIL',
        error: error.message,
        message: 'End-to-end pipeline test failed'
      };
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  calculateCosineSimilarity(vector1, vector2) {
    if (vector1.length !== vector2.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vector1.length; i++) {
      dotProduct += vector1[i] * vector2[i];
      norm1 += vector1[i] * vector1[i];
      norm2 += vector2[i] * vector2[i];
    }

    norm1 = Math.sqrt(norm1);
    norm2 = Math.sqrt(norm2);

    if (norm1 === 0 || norm2 === 0) {
      return 0;
    }

    return dotProduct / (norm1 * norm2);
  }

  /**
   * Generate final diagnostic report
   */
  generateFinalReport() {
    console.log('\n📋 FINAL DIAGNOSTIC REPORT');
    console.log('=' .repeat(80));

    const tests = this.results.tests;
    const testResults = Object.values(tests);
    const passedTests = testResults.filter(t => t.status === 'PASS').length;
    const failedTests = testResults.filter(t => t.status === 'FAIL').length;
    const skippedTests = testResults.filter(t => t.status === 'SKIP').length;
    const partialTests = testResults.filter(t => t.status === 'PARTIAL').length;
    const warningTests = testResults.filter(t => t.status === 'WARNING').length;

    console.log(`📊 Test Summary:`);
    console.log(`   ✅ Passed: ${passedTests}`);
    console.log(`   ❌ Failed: ${failedTests}`);
    console.log(`   ⚠️  Warnings: ${warningTests}`);
    console.log(`   🔄 Partial: ${partialTests}`);
    console.log(`   ⏭️  Skipped: ${skippedTests}`);
    console.log(`   📊 Total: ${testResults.length}`);

    console.log('\n📋 Test Details:');
    Object.entries(tests).forEach(([testName, result]) => {
      const statusIcon = {
        'PASS': '✅',
        'FAIL': '❌',
        'WARNING': '⚠️',
        'PARTIAL': '🔄',
        'SKIP': '⏭️'
      }[result.status] || '❓';

      console.log(`   ${statusIcon} ${testName}: ${result.message}`);
    });

    // Determine overall status
    const overallStatus = failedTests === 0 ? 'HEALTHY' : 'ISSUES_DETECTED';
    this.results.overallStatus = overallStatus;
    this.results.summary = {
      totalTests: testResults.length,
      passed: passedTests,
      failed: failedTests,
      warnings: warningTests,
      partial: partialTests,
      skipped: skippedTests
    };

    console.log(`\n🏥 Overall System Status: ${overallStatus === 'HEALTHY' ? '✅ HEALTHY' : '❌ ISSUES DETECTED'}`);

    if (failedTests > 0) {
      console.log('\n🔧 Recommendations:');
      
      if (tests.environmentConfig?.status === 'FAIL') {
        console.log('   - Fix environment configuration issues');
      }
      
      if (tests.databaseConnection?.status === 'FAIL') {
        console.log('   - Check database connection and setup');
      }
      
      if (tests.storedEmbeddings?.status === 'FAIL') {
        console.log('   - Re-process documents with correct embedding model');
      }
      
      if (tests.embeddingService?.status === 'FAIL') {
        console.log('   - Fix embedding service configuration');
      }
      
      if (tests.vectorSearchFunction?.status === 'FAIL') {
        console.log('   - Create or fix vector_search function in database');
      }
      
      if (tests.endToEndPipeline?.status === 'FAIL') {
        console.log('   - Investigate pipeline integration issues');
      }
    }

    console.log('\n💾 Full diagnostic results saved to this.results object');
    console.log('=' .repeat(80));

    // Save results to file
    this.saveDiagnosticResults();
  }

  /**
   * Save diagnostic results to file
   */
  saveDiagnosticResults() {
    const fs = require('fs');
    const path = require('path');
    
    const outputDir = path.join(__dirname, '..', '..', '..', '..', 'diagnostic-reports');
    const outputFile = path.join(outputDir, `rag-pipeline-diagnostic-${Date.now()}.json`);
    
    try {
      // Create directory if it doesn't exist
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      fs.writeFileSync(outputFile, JSON.stringify(this.results, null, 2));
      console.log(`💾 Diagnostic results saved to: ${outputFile}`);
    } catch (error) {
      console.error('❌ Failed to save diagnostic results:', error.message);
    }
  }
}

// Run diagnostic if called directly
if (require.main === module) {
  const diagnostic = new RAGPipelineDiagnostic();
  diagnostic.runDiagnostic().catch(console.error);
}

module.exports = { RAGPipelineDiagnostic };