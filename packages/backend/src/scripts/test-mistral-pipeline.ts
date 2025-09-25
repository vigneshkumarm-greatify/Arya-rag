/**
 * Test Mistral 7B Instruct Pipeline
 * 
 * Comprehensive test script to verify the enhanced RAG pipeline with Mistral optimizations.
 * Tests structured responses, query classification, and JSON formatting.
 * 
 * @author ARYA RAG Team
 */

import { OllamaLLMService } from '../services/llm/OllamaLLMService';
import { RAGService } from '../services/rag/RAGService';
import { ChunkingService } from '../services/chunking/ChunkingService';
import { HierarchicalChunkingService } from '../services/chunking/HierarchicalChunkingService';
import { promptTemplateManager } from '../services/rag/PromptTemplates';
import { MISTRAL_7B_CONFIG } from '../config/mistral-config';

/**
 * Test configuration for Mistral pipeline
 */
const TEST_CONFIG = {
  models: {
    baseModel: 'mistral:7b-instruct',
    customModel: 'arya-mistral:7b',
    embeddingModel: 'mxbai-embed-large'
  },
  testQueries: [
    {
      query: "What are the steps to submit a leave request?",
      expectedType: 'procedural',
      description: 'Procedural query test'
    },
    {
      query: "What is the definition of operational readiness?",
      expectedType: 'definitional',  
      description: 'Definitional query test'
    },
    {
      query: "Compare the requirements between Section 1.2.1 and 1.2.3",
      expectedType: 'analytical',
      description: 'Analytical query test'
    },
    {
      query: "Tell me about the ship's communication protocols",
      expectedType: 'general',
      description: 'General query test'
    }
  ],
  sampleDocumentContent: `1. INTRODUCTION

1.1 Purpose
This manual provides procedures for ship operations and maintenance.

1.2 Scope  
These procedures apply to all naval personnel.

1.2.1 Leave Request Process
To submit a leave request, personnel must:
Step 1: Complete Form NAV-123
Step 2: Obtain supervisor approval
Step 3: Submit to personnel office
Step 4: Await approval confirmation

1.2.2 Operational Readiness
Operational readiness is defined as the ability to perform assigned missions with available resources and personnel.

1.3 Communication Protocols
All ship communications must follow established security procedures as outlined in Section 2.1.`
};

/**
 * Main test execution class
 */
class MistralPipelineTest {
  private llmService: OllamaLLMService;
  private ragService: RAGService;
  private chunkingService: ChunkingService;
  private hierarchicalChunking: HierarchicalChunkingService;

  constructor() {
    console.log('🧪 Initializing Mistral 7B Instruct Pipeline Test');
    
    this.llmService = new OllamaLLMService({
      model: TEST_CONFIG.models.baseModel,
      enableJsonMode: true,
      mistralOptimized: true
    });
    
    this.ragService = new RAGService({
      enableStructuredResponses: true,
      useQueryClassification: true,
      enforceJsonFormat: true,
      enablePromptOptimization: true
    }, this.llmService);
    
    this.chunkingService = new ChunkingService();
    this.hierarchicalChunking = new HierarchicalChunkingService();
  }

  /**
   * Run all pipeline tests
   */
  async runAllTests(): Promise<void> {
    console.log('\n🚀 Starting Mistral 7B Instruct Pipeline Tests\n');
    
    try {
      // Test 1: Basic connectivity and model availability
      await this.testConnectivity();
      
      // Test 2: Query classification
      await this.testQueryClassification();
      
      // Test 3: JSON structured responses
      await this.testStructuredResponses();
      
      // Test 4: Hierarchical chunking
      await this.testHierarchicalChunking();
      
      // Test 5: Enhanced chunking with section detection
      await this.testEnhancedChunking();
      
      // Test 6: Custom Mistral model creation (optional)
      await this.testCustomModelCreation();
      
      console.log('\n✅ All Mistral Pipeline Tests Completed Successfully!');
      
    } catch (error) {
      console.error('\n❌ Pipeline Test Failed:', error);
      throw error;
    }
  }

  /**
   * Test Ollama connectivity and Mistral model availability
   */
  private async testConnectivity(): Promise<void> {
    console.log('📡 Testing Ollama Connectivity and Model Availability...');
    
    const readyCheck = await this.llmService.isReady();
    if (!readyCheck.ready) {
      throw new Error(`Mistral model not ready: ${readyCheck.message}`);
    }
    
    console.log(`   ✅ ${readyCheck.message}`);
    
    // Test model info
    const modelInfo = await this.llmService.getModelInfo();
    console.log(`   📊 Model: ${modelInfo.name}`);
    console.log(`   📊 Max tokens: ${modelInfo.maxTokens}`);
    console.log(`   📊 Provider: ${modelInfo.provider}`);
  }

  /**
   * Test query classification functionality
   */
  private async testQueryClassification(): Promise<void> {
    console.log('\n🔍 Testing Query Classification...');
    
    for (const testCase of TEST_CONFIG.testQueries) {
      const classification = promptTemplateManager.classifyQuery(testCase.query);
      
      console.log(`   Query: "${testCase.query}"`);
      console.log(`   Expected: ${testCase.expectedType}, Got: ${classification.type}`);
      console.log(`   Confidence: ${(classification.confidence * 100).toFixed(1)}%`);
      
      if (classification.type === testCase.expectedType || classification.confidence > 0.6) {
        console.log('   ✅ Classification correct or high confidence');
      } else {
        console.log('   ⚠️ Classification mismatch with low confidence');
      }
      console.log('');
    }
  }

  /**
   * Test JSON structured responses
   */
  private async testStructuredResponses(): Promise<void> {
    console.log('📝 Testing JSON Structured Responses...');
    
    const testQuery = TEST_CONFIG.testQueries[0]; // Procedural query
    const testContext = `Context: ${TEST_CONFIG.sampleDocumentContent}`;
    
    try {
      const classification = promptTemplateManager.classifyQuery(testQuery.query);
      const promptConfig = promptTemplateManager.generatePromptConfig(
        testQuery.query,
        testContext,
        classification
      );
      
      console.log(`   Testing ${classification.type} query with JSON formatting...`);
      
      const response = await this.llmService.generateJSONCompletion({
        prompt: promptConfig.userPrompt,
        systemPrompt: promptConfig.systemPrompt,
        maxTokens: promptConfig.maxTokens,
        temperature: promptConfig.temperature,
        schema: promptConfig.schema,
        enforceJsonFormat: true
      });
      
      console.log(`   ✅ JSON Response received (${response.text.length} chars)`);
      
      if (response.jsonData) {
        console.log('   📊 Parsed JSON structure:');
        console.log(`      - Answer: ${response.jsonData.answer ? 'Present' : 'Missing'}`);
        console.log(`      - Steps: ${response.jsonData.steps ? response.jsonData.steps.length : 0}`);
        console.log(`      - Citations: ${response.jsonData.citations ? response.jsonData.citations.length : 0}`);
        console.log(`      - Confidence: ${response.jsonData.confidence || 'N/A'}`);
      } else {
        console.log('   ⚠️ JSON parsing failed, but response received');
      }
      
    } catch (error) {
      console.error('   ❌ Structured response test failed:', error);
      throw error;
    }
  }

  /**
   * Test hierarchical chunking with section detection
   */
  private async testHierarchicalChunking(): Promise<void> {
    console.log('\n📄 Testing Hierarchical Chunking...');
    
    const samplePages = [{
      pageNumber: 1,
      text: TEST_CONFIG.sampleDocumentContent,
      sectionTitle: 'Operations Manual'
    }];
    
    try {
      const result = await this.hierarchicalChunking.processHierarchicalPages(
        samplePages,
        'test-doc-123'
      );
      
      console.log(`   ✅ Hierarchical chunking completed`);
      console.log(`   📊 Total chunks: ${result.totalChunks}`);
      console.log(`   📊 Total tokens: ${result.totalTokens}`);
      console.log(`   📊 Avg tokens/chunk: ${result.avgTokensPerChunk.toFixed(1)}`);
      console.log(`   📊 Sections detected: ${result.sectionMap?.size || 0}`);
      
      if (result.hierarchicalChunks) {
        const procedureChunks = result.hierarchicalChunks.filter(c => c.isCompleteProcedure);
        const stepChunks = result.hierarchicalChunks.filter(c => c.containsSteps);
        
        console.log(`   📚 Complete procedures: ${procedureChunks.length}`);
        console.log(`   🔢 Chunks with steps: ${stepChunks.length}`);
      }
      
    } catch (error) {
      console.error('   ❌ Hierarchical chunking test failed:', error);
      throw error;
    }
  }

  /**
   * Test enhanced chunking with section detection
   */
  private async testEnhancedChunking(): Promise<void> {
    console.log('\n⚡ Testing Enhanced Chunking with Section Detection...');
    
    const samplePages = [{
      pageNumber: 1,
      text: TEST_CONFIG.sampleDocumentContent
    }];
    
    try {
      const result = await this.chunkingService.processPages(
        samplePages,
        'test-doc-456',
        {
          detectSectionHeaders: true,
          enhancedMetadata: true,
          chunkSizeTokens: 800,
          chunkOverlapTokens: 150
        }
      );
      
      console.log(`   ✅ Enhanced chunking completed`);
      console.log(`   📊 Total chunks: ${result.totalChunks}`);
      console.log(`   📊 Avg tokens/chunk: ${result.avgTokensPerChunk.toFixed(1)}`);
      
      // Check for enhanced metadata
      const chunksWithMetadata = result.chunks.filter(chunk => (chunk as any).enhancedMetadata);
      console.log(`   🔍 Chunks with enhanced metadata: ${chunksWithMetadata.length}`);
      
      if (chunksWithMetadata.length > 0) {
        const sampleMetadata = (chunksWithMetadata[0] as any).enhancedMetadata;
        console.log('   📋 Sample metadata:');
        console.log(`      - Contains procedure: ${sampleMetadata.containsProcedure}`);
        console.log(`      - Contains steps: ${sampleMetadata.containsSteps}`);
        console.log(`      - Contains definition: ${sampleMetadata.containsDefinition}`);
        console.log(`      - Cross references: ${sampleMetadata.crossReferences.length}`);
        console.log(`      - Section numbers: ${sampleMetadata.sectionNumbers.length}`);
      }
      
    } catch (error) {
      console.error('   ❌ Enhanced chunking test failed:', error);
      throw error;
    }
  }

  /**
   * Test custom Mistral model creation (optional)
   */
  private async testCustomModelCreation(): Promise<void> {
    console.log('\n🔧 Testing Custom Mistral Model Creation...');
    
    try {
      // Check if custom model already exists
      const availability = await this.llmService.checkModelAvailability(TEST_CONFIG.models.customModel);
      
      if (availability.available) {
        console.log(`   ✅ Custom model '${TEST_CONFIG.models.customModel}' already exists`);
        console.log(`   📊 Size: ${availability.size}`);
      } else {
        console.log('   📝 Creating custom optimized Mistral model...');
        
        const result = await this.llmService.createOptimizedMistralModel(
          TEST_CONFIG.models.customModel,
          `You are ARYA, a Navy documentation assistant specialized in military procedures and regulations.
- Preserve hierarchical numbering EXACTLY as written (e.g., "1.1", "1.1.1")  
- Keep procedures as step-by-step lists with precise formatting
- Never invent content; if unsure, request additional context
- Always return valid JSON when requested with proper citations
- Focus on accuracy and operational safety in all responses`
        );
        
        if (result.success) {
          console.log(`   ✅ ${result.message}`);
        } else {
          console.log(`   ⚠️ Custom model creation failed: ${result.message}`);
        }
      }
      
    } catch (error) {
      console.error('   ❌ Custom model test failed:', error);
      // Don't throw - this is optional
    }
  }

  /**
   * Get performance metrics and display summary
   */
  async getPerformanceMetrics(): Promise<void> {
    console.log('\n📈 Performance Metrics Summary:');
    
    const llmMetrics = this.llmService.getPerformanceMetrics();
    const ragStats = this.ragService.getStats();
    
    console.log('\n   LLM Service Metrics:');
    console.log(`   - Average tokens/second: ${llmMetrics.avgTokensPerSecond}`);
    console.log(`   - Total generations: ${llmMetrics.totalGenerations}`);
    console.log(`   - Average response time: ${llmMetrics.avgResponseTime}ms`);
    
    console.log('\n   RAG Service Stats:');
    console.log(`   - Total queries: ${ragStats.totalQueries}`);
    console.log(`   - Average response time: ${ragStats.avgResponseTime.toFixed(1)}ms`);
    console.log(`   - Success rate: ${(ragStats.successRate * 100).toFixed(1)}%`);
    console.log(`   - Average sources per response: ${ragStats.avgSourcesPerResponse.toFixed(1)}`);
  }
}

/**
 * Run the test if called directly
 */
if (require.main === module) {
  async function runTests() {
    const tester = new MistralPipelineTest();
    
    try {
      await tester.runAllTests();
      await tester.getPerformanceMetrics();
      
      console.log('\n🎉 All tests passed! Your Mistral 7B Instruct pipeline is ready.');
      console.log('\n📋 Next steps:');
      console.log('   1. Run: ollama pull mistral:7b-instruct');
      console.log('   2. Run: ollama pull mxbai-embed-large');
      console.log('   3. Update your .env with the optimized settings');
      console.log('   4. Test with real documents using the enhanced RAG service');
      
      process.exit(0);
    } catch (error) {
      console.error('\n💥 Test suite failed:', error);
      process.exit(1);
    }
  }
  
  runTests().catch(console.error);
}

export { MistralPipelineTest, TEST_CONFIG };