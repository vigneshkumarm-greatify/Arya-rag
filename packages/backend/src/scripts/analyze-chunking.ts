/**
 * Chunking Analysis Script
 * 
 * Analyzes the chunking process for documents to understand:
 * - Token distribution across chunks
 * - Page boundary preservation
 * - Section detection effectiveness
 * - Overlap behavior
 * - Performance characteristics
 * 
 * @author ARYA RAG Team
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { ChunkingService } from '../services/chunking/ChunkingService';
import { HierarchicalChunkingService } from '../services/chunking/HierarchicalChunkingService';
import { DocumentProcessor } from '../services/document/DocumentProcessor';
import { PageContent } from '@arya-rag/types';
import { countTokens } from '../utils/tokenCounter';

interface ChunkAnalysis {
  documentName: string;
  totalPages: number;
  totalChunks: number;
  totalTokens: number;
  avgTokensPerChunk: number;
  avgChunksPerPage: number;
  tokenDistribution: {
    min: number;
    max: number;
    median: number;
    stdDev: number;
  };
  pageBoundariesPreserved: boolean;
  sectionsDetected: number;
  processingTime: number;
}

async function analyzePDF(
  pdfPath: string,
  chunkSize: number = 600,
  overlap: number = 100
): Promise<ChunkAnalysis> {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📄 Analyzing PDF: ${pdfPath}`);
  console.log(`${'='.repeat(80)}`);
  
  const startTime = Date.now();
  
  // Read PDF file using DocumentProcessor
  const pdfBuffer = readFileSync(pdfPath);
  const processor = new DocumentProcessor();
  
  console.log(`\n📄 Processing PDF...`);
  const extractionResult = await processor.extractPagesFromBuffer(pdfBuffer, pdfPath);
  
  const pages = extractionResult.pages;
  const totalText = pages.map(p => p.text).join(' ');
  
  console.log(`\n📊 Document Statistics:`);
  console.log(`   Total Pages: ${pages.length}`);
  console.log(`   Total Text Length: ${totalText.length} characters`);
  console.log(`   Total Tokens: ${countTokens(totalText)}`)
  
  console.log(`\n🔧 Chunking Configuration:`);
  console.log(`   Chunk Size: ${chunkSize} tokens`);
  console.log(`   Overlap: ${overlap} tokens`);
  console.log(`   Preserve Page Boundaries: true`);
  console.log(`   Preserve Sentences: true`);
  console.log(`   Detect Section Headers: true`);
  
  // Perform chunking
  const chunkingService = new ChunkingService();
  const result = await chunkingService.processPages(pages, 'analysis-doc', {
    chunkSizeTokens: chunkSize,
    chunkOverlapTokens: overlap,
    preservePageBoundaries: true,
    preserveSentences: true,
    detectSectionHeaders: true,
    enhancedMetadata: true
  });
  
  console.log(`\n✅ Chunking Complete:`);
  console.log(`   Total Chunks: ${result.totalChunks}`);
  console.log(`   Total Tokens: ${result.totalTokens}`);
  console.log(`   Avg Tokens/Chunk: ${result.avgTokensPerChunk.toFixed(1)}`);
  console.log(`   Processing Time: ${result.processingTime}ms`);
  
  // Analyze chunk statistics
  const tokenCounts = result.chunks.map(c => c.chunkTokens || 0);
  const sortedTokens = [...tokenCounts].sort((a, b) => a - b);
  const median = sortedTokens[Math.floor(sortedTokens.length / 2)];
  const mean = tokenCounts.reduce((a, b) => a + b, 0) / tokenCounts.length;
  const variance = tokenCounts.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / tokenCounts.length;
  const stdDev = Math.sqrt(variance);
  
  console.log(`\n📈 Token Distribution:`);
  console.log(`   Min: ${Math.min(...tokenCounts)} tokens`);
  console.log(`   Max: ${Math.max(...tokenCounts)} tokens`);
  console.log(`   Median: ${median} tokens`);
  console.log(`   Std Dev: ${stdDev.toFixed(1)} tokens`);
  
  // Check page boundaries
  let pageBoundariesPreserved = true;
  const pageGroups = new Map<number, number>();
  result.chunks.forEach(chunk => {
    pageGroups.set(chunk.pageNumber, (pageGroups.get(chunk.pageNumber) || 0) + 1);
  });
  
  console.log(`\n📄 Page Distribution:`);
  console.log(`   Total Pages with Chunks: ${pageGroups.size}`);
  console.log(`   Avg Chunks per Page: ${(result.totalChunks / pageGroups.size).toFixed(1)}`);
  
  // Show top 10 pages with most chunks
  const sortedPages = Array.from(pageGroups.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  
  console.log(`\n   Top Pages by Chunk Count:`);
  sortedPages.forEach(([page, count]) => {
    console.log(`      Page ${page}: ${count} chunks`);
  });
  
  // Detect sections
  let sectionsDetected = 0;
  result.chunks.forEach(chunk => {
    if ((chunk as any).enhancedMetadata?.detectedSections?.length > 0) {
      sectionsDetected += (chunk as any).enhancedMetadata.detectedSections.length;
    }
  });
  
  console.log(`\n🔍 Content Analysis:`);
  console.log(`   Sections Detected: ${sectionsDetected}`);
  
  // Count chunks with procedures and steps
  let procedureChunks = 0;
  let stepChunks = 0;
  let definitionChunks = 0;
  
  result.chunks.forEach(chunk => {
    const metadata = (chunk as any).enhancedMetadata;
    if (metadata) {
      if (metadata.containsProcedure) procedureChunks++;
      if (metadata.containsSteps) stepChunks++;
      if (metadata.containsDefinition) definitionChunks++;
    }
  });
  
  console.log(`   Chunks with Procedures: ${procedureChunks} (${(procedureChunks/result.totalChunks*100).toFixed(1)}%)`);
  console.log(`   Chunks with Steps: ${stepChunks} (${(stepChunks/result.totalChunks*100).toFixed(1)}%)`);
  console.log(`   Chunks with Definitions: ${definitionChunks} (${(definitionChunks/result.totalChunks*100).toFixed(1)}%)`);
  
  // Check overlap effectiveness
  console.log(`\n🔗 Overlap Analysis:`);
  let totalOverlapTokens = 0;
  let chunksWithOverlap = 0;
  
  for (let i = 1; i < result.chunks.length; i++) {
    const prevChunk = result.chunks[i - 1];
    const currentChunk = result.chunks[i];
    
    // Only check overlap for chunks on the same page
    if (prevChunk.pageNumber === currentChunk.pageNumber) {
      const prevWords = prevChunk.chunkText.split(/\s+/).slice(-50);
      const currentWords = currentChunk.chunkText.split(/\s+/).slice(0, 50);
      
      // Find common words at the boundary
      let overlapCount = 0;
      for (let j = 0; j < Math.min(prevWords.length, currentWords.length); j++) {
        if (prevWords[prevWords.length - 1 - j] === currentWords[j]) {
          overlapCount++;
        } else {
          break;
        }
      }
      
      if (overlapCount > 0) {
        chunksWithOverlap++;
        const overlapText = currentWords.slice(0, overlapCount).join(' ');
        totalOverlapTokens += countTokens(overlapText);
      }
    }
  }
  
  if (chunksWithOverlap > 0) {
    console.log(`   Chunks with Overlap: ${chunksWithOverlap}`);
    console.log(`   Avg Overlap: ${(totalOverlapTokens / chunksWithOverlap).toFixed(1)} tokens`);
    console.log(`   Configured Overlap: ${overlap} tokens`);
  }
  
  // Sample chunks
  console.log(`\n📝 Sample Chunks (first 3):`);
  result.chunks.slice(0, 3).forEach((chunk, idx) => {
    console.log(`\n   Chunk ${idx + 1}:`);
    console.log(`      Page: ${chunk.pageNumber}`);
    console.log(`      Tokens: ${chunk.chunkTokens}`);
    console.log(`      Section: ${chunk.sectionTitle || 'N/A'}`);
    console.log(`      Preview: ${chunk.chunkText.substring(0, 150)}...`);
  });
  
  const totalTime = Date.now() - startTime;
  
  console.log(`\n⏱️  Total Analysis Time: ${totalTime}ms`);
  console.log(`${'='.repeat(80)}\n`);
  
  return {
    documentName: pdfPath,
    totalPages: pages.length,
    totalChunks: result.totalChunks,
    totalTokens: result.totalTokens,
    avgTokensPerChunk: result.avgTokensPerChunk,
    avgChunksPerPage: result.totalChunks / pages.length,
    tokenDistribution: {
      min: Math.min(...tokenCounts),
      max: Math.max(...tokenCounts),
      median,
      stdDev
    },
    pageBoundariesPreserved,
    sectionsDetected,
    processingTime: result.processingTime
  };
}

async function compareChunkingStrategies(pdfPath: string): Promise<void> {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔬 Comparing Chunking Strategies`);
  console.log(`${'='.repeat(80)}`);
  
  const strategies = [
    { size: 400, overlap: 50, name: 'Small Chunks' },
    { size: 600, overlap: 100, name: 'Medium Chunks (Default)' },
    { size: 800, overlap: 150, name: 'Large Chunks' },
    { size: 1000, overlap: 200, name: 'Very Large Chunks' }
  ];
  
  const results: ChunkAnalysis[] = [];
  
  for (const strategy of strategies) {
    console.log(`\n📊 Testing: ${strategy.name} (${strategy.size} tokens, ${strategy.overlap} overlap)`);
    const analysis = await analyzePDF(pdfPath, strategy.size, strategy.overlap);
    results.push(analysis);
  }
  
  // Comparison summary
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📊 Strategy Comparison Summary`);
  console.log(`${'='.repeat(80)}\n`);
  
  console.log(`| Strategy                | Chunks | Avg Tokens | Min | Max | Std Dev | Time (ms) |`);
  console.log(`|------------------------|--------|------------|-----|-----|---------|-----------|`);
  
  results.forEach((result, idx) => {
    const strategy = strategies[idx];
    console.log(
      `| ${strategy.name.padEnd(22)} | ` +
      `${result.totalChunks.toString().padEnd(6)} | ` +
      `${result.avgTokensPerChunk.toFixed(1).padEnd(10)} | ` +
      `${result.tokenDistribution.min.toString().padEnd(3)} | ` +
      `${result.tokenDistribution.max.toString().padEnd(3)} | ` +
      `${result.tokenDistribution.stdDev.toFixed(1).padEnd(7)} | ` +
      `${result.processingTime.toString().padEnd(9)} |`
    );
  });
  
  console.log(`\n✅ Analysis Complete!`);
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
📄 Chunking Analysis Tool

Usage:
  npm run analyze-chunking <pdf-path> [chunk-size] [overlap]
  npm run analyze-chunking compare <pdf-path>

Examples:
  npm run analyze-chunking ./testing.pdf
  npm run analyze-chunking ./testing.pdf 800 150
  npm run analyze-chunking compare ./testing.pdf

Arguments:
  pdf-path    Path to PDF file to analyze
  chunk-size  Target chunk size in tokens (default: 600)
  overlap     Overlap between chunks in tokens (default: 100)
  compare     Run comparison of different chunking strategies
    `);
    process.exit(0);
  }
  
  try {
    if (args[0] === 'compare') {
      if (args.length < 2) {
        console.error('❌ Error: PDF path required for compare mode');
        process.exit(1);
      }
      await compareChunkingStrategies(args[1]);
    } else {
      const pdfPath = args[0];
      const chunkSize = args[1] ? parseInt(args[1]) : 600;
      const overlap = args[2] ? parseInt(args[2]) : 100;
      
      await analyzePDF(pdfPath, chunkSize, overlap);
    }
  } catch (error) {
    console.error(`\n❌ Analysis failed:`, error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

