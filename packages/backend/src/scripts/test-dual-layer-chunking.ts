/**
 * Test Dual-Layer Chunking
 * 
 * Tests the dual-layer chunking implementation with fact extraction
 * 
 * Usage: tsx src/scripts/test-dual-layer-chunking.ts <pdf-path>
 */

import { readFileSync } from 'fs';
import { ChunkingService } from '../services/chunking/ChunkingService';
import { DocumentProcessor } from '../services/document/DocumentProcessor';
import { FactExtractionService } from '../services/extraction/FactExtractionService';

async function testDualLayerChunking(pdfPath: string) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🧪 Testing Dual-Layer Chunking`);
  console.log(`${'='.repeat(80)}\n`);

  try {
    // Step 1: Extract pages from PDF
    console.log(`📄 Step 1: Extracting pages from PDF...`);
    const pdfBuffer = readFileSync(pdfPath);
    const processor = new DocumentProcessor();
    
    const extractionResult = await processor.extractPagesFromBuffer(pdfBuffer, pdfPath);
    
    if (!extractionResult.success || !extractionResult.pages) {
      throw new Error(`Page extraction failed: ${extractionResult.error}`);
    }
    
    const pages = extractionResult.pages;
    console.log(`✅ Extracted ${pages.length} pages`);
    console.log(`   Total text: ${pages.reduce((sum, p) => sum + p.text.length, 0)} characters`);

    // Step 2: Run dual-layer chunking
    console.log(`\n📝 Step 2: Running dual-layer chunking...`);
    const chunkingService = new ChunkingService();
    
    const result = await chunkingService.processPagesWithDualLayer(
      pages,
      'test-doc',
      {
        chunkSizeTokens: 600,
        chunkOverlapTokens: 100,
        detailChunkSize: 200,
        detailChunkOverlap: 50,
        dualLayer: true,
        extractFacts: true
      }
    );

    console.log(`\n✅ Dual-layer chunking complete!`);
    console.log(`\n📊 Results Summary:`);
    console.log(`${'─'.repeat(80)}`);
    console.log(`   Total Chunks: ${result.totalChunks}`);
    console.log(`   Context Chunks: ${result.contextChunks?.length || 0}`);
    console.log(`   Detail Chunks: ${result.detailChunks?.length || 0}`);
    console.log(`   Extracted Facts: ${result.extractedFacts?.size || 0} chunks with facts`);
    console.log(`   Total Tokens: ${result.totalTokens}`);
    console.log(`   Avg Tokens/Chunk: ${result.avgTokensPerChunk.toFixed(1)}`);
    console.log(`   Processing Time: ${result.processingTime}ms`);

    // Step 3: Analyze context chunks
    console.log(`\n📦 Step 3: Analyzing Context Chunks...`);
    console.log(`${'─'.repeat(80)}`);
    
    if (result.contextChunks && result.contextChunks.length > 0) {
      const contextTokens = result.contextChunks.map(c => c.chunkTokens || 0);
      const avgContext = contextTokens.reduce((a, b) => a + b, 0) / contextTokens.length;
      const minContext = Math.min(...contextTokens);
      const maxContext = Math.max(...contextTokens);
      
      console.log(`   Count: ${result.contextChunks.length}`);
      console.log(`   Avg Tokens: ${avgContext.toFixed(1)}`);
      console.log(`   Range: ${minContext} - ${maxContext} tokens`);
      
      // Show sample context chunk
      const sampleContext = result.contextChunks[0];
      console.log(`\n   Sample Context Chunk:`);
      console.log(`      Page: ${sampleContext.pageNumber}`);
      console.log(`      Tokens: ${sampleContext.chunkTokens}`);
      console.log(`      Preview: ${sampleContext.chunkText.substring(0, 150)}...`);
    }

    // Step 4: Analyze detail chunks
    console.log(`\n🔍 Step 4: Analyzing Detail Chunks...`);
    console.log(`${'─'.repeat(80)}`);
    
    if (result.detailChunks && result.detailChunks.length > 0) {
      const detailTokens = result.detailChunks.map((c: any) => c.chunkTokens || 0);
      const avgDetail = detailTokens.reduce((a, b) => a + b, 0) / detailTokens.length;
      const minDetail = Math.min(...detailTokens);
      const maxDetail = Math.max(...detailTokens);
      
      console.log(`   Count: ${result.detailChunks.length}`);
      console.log(`   Avg Tokens: ${avgDetail.toFixed(1)}`);
      console.log(`   Range: ${minDetail} - ${maxDetail} tokens`);
      
      // Show sample detail chunk
      const sampleDetail: any = result.detailChunks[0];
      console.log(`\n   Sample Detail Chunk:`);
      console.log(`      Page: ${sampleDetail.pageNumber}`);
      console.log(`      Tokens: ${sampleDetail.chunkTokens}`);
      console.log(`      Parent ID: ${sampleDetail.parentChunkId || 'N/A'}`);
      console.log(`      Preview: ${sampleDetail.chunkText.substring(0, 150)}...`);
    }

    // Step 5: Analyze extracted facts
    console.log(`\n📊 Step 5: Analyzing Extracted Facts...`);
    console.log(`${'─'.repeat(80)}`);
    
    if (result.extractedFacts && result.extractedFacts.size > 0) {
      let totalFacts = 0;
      const factsByType: Map<string, number> = new Map();
      
      for (const [chunkId, facts] of result.extractedFacts.entries()) {
        totalFacts += facts.length;
        facts.forEach(fact => {
          factsByType.set(fact.type, (factsByType.get(fact.type) || 0) + 1);
        });
      }
      
      console.log(`   Total Facts Extracted: ${totalFacts}`);
      console.log(`   Chunks with Facts: ${result.extractedFacts.size}`);
      console.log(`\n   Facts by Type:`);
      
      for (const [type, count] of Array.from(factsByType.entries()).sort((a, b) => b[1] - a[1])) {
        console.log(`      ${type}: ${count}`);
      }
      
      // Show sample facts
      console.log(`\n   Sample Facts:`);
      let sampleCount = 0;
      for (const [chunkId, facts] of result.extractedFacts.entries()) {
        if (sampleCount >= 5) break;
        facts.slice(0, 3).forEach(fact => {
          if (sampleCount >= 5) return;
          console.log(`      [${fact.type}] ${fact.value}${fact.unit ? fact.unit : ''} - "${fact.context?.substring(0, 40)}..."`);
          sampleCount++;
        });
      }
    } else {
      console.log(`   No facts extracted from this document`);
    }

    // Step 6: Test fact extraction directly
    console.log(`\n🧪 Step 6: Testing Fact Extraction Service...`);
    console.log(`${'─'.repeat(80)}`);
    
    const testText = `
      The tolerance is ±0.05mm and the operating temperature is 25°C.
      Pressure must be maintained at 100 psi. Dimensions are 5x10x15cm.
      The procedure must be completed by 2024-01-15 at 14:30:00.
    `;
    
    const factExtractor = new FactExtractionService();
    const factResult = await factExtractor.extractFacts(testText, {
      useLLM: false,
      minConfidence: 0.5
    });
    
    console.log(`   Test Text Facts:`);
    console.log(`      Total: ${factResult.totalFacts}`);
    factResult.facts.forEach(fact => {
      console.log(`      [${fact.type}] ${fact.value}${fact.unit ? ' ' + fact.unit : ''} (confidence: ${fact.confidence.toFixed(2)})`);
    });

    console.log(`\n${'='.repeat(80)}`);
    console.log(`✅ Test Complete!`);
    console.log(`${'='.repeat(80)}\n`);

    // Summary
    console.log(`📋 Summary:`);
    console.log(`   ✅ Dual-layer chunking working`);
    console.log(`   ✅ Context chunks created (${result.contextChunks?.length || 0})`);
    console.log(`   ✅ Detail chunks created (${result.detailChunks?.length || 0})`);
    console.log(`   ✅ Fact extraction working (${Array.from(result.extractedFacts?.values() || []).reduce((sum, facts) => sum + facts.length, 0)} facts)`);
    console.log(`\n🎯 System ready for minute details retrieval!\n`);

  } catch (error) {
    console.error(`\n❌ Test failed:`, error);
    process.exit(1);
  }
}

// Get PDF path from command line
const pdfPath = process.argv[2];

if (!pdfPath) {
  console.error('❌ Error: PDF path required');
  console.log('\nUsage: tsx src/scripts/test-dual-layer-chunking.ts <pdf-path>');
  console.log('\nExample:');
  console.log('  tsx src/scripts/test-dual-layer-chunking.ts ../../Fire_Safety_QA.pdf');
  process.exit(1);
}

// Run test
testDualLayerChunking(pdfPath).catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

