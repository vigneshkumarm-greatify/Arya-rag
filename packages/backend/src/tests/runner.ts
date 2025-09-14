/**
 * ARYA-RAG Test Runner
 * 
 * Interactive test runner that provides options for different test types.
 * 
 * Usage:
 *   npm run test:runner
 * 
 * @author ARYA RAG Team
 */

import { createInterface } from 'readline';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

function showTestOptions() {
  console.log('🧪 ARYA-RAG Test Suite');
  console.log('======================');
  console.log('');
  console.log('Available test options:');
  console.log('');
  console.log('1. 🔬 Unit Tests       - Test individual services and components');
  console.log('2. 🔧 Pipeline Tests   - Test each step: PDF→extract→chunk→embed→store');
  console.log('3. 🔗 Integration Tests - Full end-to-end pipeline with testing.pdf');
  console.log('4. 🚀 All Tests        - Run unit, pipeline, and integration tests');
  console.log('5. ❓ Help             - Show test information');
  console.log('6. 🚪 Exit            - Exit test runner');
  console.log('');
}

function showTestInfo() {
  console.log('📋 Test Information');
  console.log('==================');
  console.log('');
  console.log('🔬 Unit Tests:');
  console.log('   - Database Client initialization');
  console.log('   - Storage Service functionality');
  console.log('   - Document Processor PDF handling');
  console.log('   - Chunking Service text processing');
  console.log('   - Embedding Service vector generation');
  console.log('   - Vector Storage operations');
  console.log('   - Environment configuration validation');
  console.log('');
  console.log('🔧 Pipeline Tests:');
  console.log('   - PDF file loading and validation');
  console.log('   - Supabase Storage upload/download');
  console.log('   - PDF text extraction');
  console.log('   - Text chunking with token limits');
  console.log('   - Embedding generation (Ollama/OpenAI)');
  console.log('   - Vector storage in database');
  console.log('');
  console.log('🔗 Integration Tests:');
  console.log('   - Server health check');
  console.log('   - API endpoint discovery');
  console.log('   - Document upload with testing.pdf');
  console.log('   - Document processing pipeline');
  console.log('   - Text extraction and chunking');
  console.log('   - Vector embedding generation');
  console.log('   - Document chunk retrieval');
  console.log('   - File download verification');
  console.log('   - RAG query functionality (if implemented)');
  console.log('   - Document listing');
  console.log('   - Cleanup and deletion');
  console.log('');
  console.log('📝 Requirements:');
  console.log('   - Backend server running on http://localhost:3001');
  console.log('   - Supabase database configured and accessible');
  console.log('   - testing.pdf file in project root');
  console.log('   - Storage bucket created in Supabase');
  console.log('   - Environment variables properly set');
  console.log('');
  console.log('⚠️  Important Notes:');
  console.log('   - Integration tests will create and delete test data');
  console.log('   - Tests may take several minutes to complete');
  console.log('   - Ensure no other critical operations are running');
  console.log('   - Test user ID is generated automatically');
  console.log('');
}

async function runSelectedTest(choice: string) {
  switch (choice) {
    case '1':
      console.log('🔬 Running Unit Tests...\n');
      const { runUnitTests } = await import('./unit.test.js');
      await runUnitTests();
      break;
      
    case '2':
      console.log('🔧 Running Pipeline Tests...\n');
      const { runPipelineTests } = await import('./pipeline.test.js');
      await runPipelineTests();
      break;
      
    case '3':
      console.log('🔗 Running Integration Tests...\n');
      const { runIntegrationTests } = await import('./integration.test.js');
      await runIntegrationTests();
      break;
      
    case '4':
      console.log('🚀 Running All Tests...\n');
      console.log('Starting with Unit Tests...\n');
      const { runUnitTests: runUnits } = await import('./unit.test.js');
      await runUnits();
      
      console.log('\n' + '='.repeat(50));
      console.log('Now running Pipeline Tests...\n');
      const { runPipelineTests: runPipeline } = await import('./pipeline.test.js');
      await runPipeline();
      
      console.log('\n' + '='.repeat(50));
      console.log('Now running Integration Tests...\n');
      const { runIntegrationTests: runIntegration } = await import('./integration.test.js');
      await runIntegration();
      break;
      
    case '5':
      showTestInfo();
      return false; // Don't exit, show menu again
      
    case '6':
      console.log('👋 Goodbye!');
      return true; // Exit
      
    default:
      console.log('❌ Invalid choice. Please select 1-6.');
      return false; // Don't exit, show menu again
  }
  
  return true; // Exit after running tests
}

async function runInteractiveTestRunner() {
  console.log('Welcome to ARYA-RAG Test Suite!\n');
  
  let shouldExit = false;
  
  while (!shouldExit) {
    showTestOptions();
    
    const choice = await new Promise<string>((resolve) => {
      rl.question('Select an option (1-5): ', resolve);
    });
    
    console.log(''); // Add spacing
    
    try {
      shouldExit = await runSelectedTest(choice.trim());
    } catch (error) {
      console.error('💥 Test execution failed:', error.message);
      console.log('\nReturning to menu...\n');
    }
    
    if (!shouldExit) {
      console.log('\n' + '='.repeat(50) + '\n');
    }
  }
  
  rl.close();
}

// Run interactive runner if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runInteractiveTestRunner().catch(error => {
    console.error('💥 Test runner failed:', error);
    process.exit(1);
  });
}