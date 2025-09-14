/**
 * Chunking Service - Intelligent document chunking with page boundary preservation
 * 
 * Critical for maintaining accurate page citations in RAG responses.
 * Ensures chunks never cross page boundaries and maintains context.
 * 
 * @author ARYA RAG Team
 */

import { PageContent, DocumentChunk } from '@arya-rag/types';
import { 
  countTokens, 
  splitTextAtTokenCount, 
  findSentenceBoundary,
  isWithinTokenLimit,
  getTokenStats 
} from '../../utils/tokenCounter';

export interface ChunkingOptions {
  chunkSizeTokens: number;        // Target size for each chunk (default: 600)
  chunkOverlapTokens: number;     // Overlap between chunks (default: 100)
  preservePageBoundaries: boolean; // Never split across pages (default: true)
  preserveSentences: boolean;      // Try to keep sentences intact (default: true)
  includeMetadata: boolean;        // Include section titles and metadata (default: true)
}

export interface ChunkingResult {
  chunks: DocumentChunk[];
  totalChunks: number;
  totalTokens: number;
  avgTokensPerChunk: number;
  processingTime: number;
}

export class ChunkingService {
  private readonly defaultOptions: ChunkingOptions = {
    chunkSizeTokens: 600,
    chunkOverlapTokens: 100,
    preservePageBoundaries: true,
    preserveSentences: true,
    includeMetadata: true
  };

  /**
   * Process pages into chunks with intelligent splitting
   * Main entry point for the chunking service
   * 
   * @param pages - Array of page content from DocumentProcessor
   * @param documentId - Unique document identifier
   * @param options - Chunking configuration
   * @returns Chunking result with statistics
   */
  async processPages(
    pages: PageContent[],
    documentId: string,
    options: Partial<ChunkingOptions> = {}
  ): Promise<ChunkingResult> {
    const startTime = Date.now();
    const config = { ...this.defaultOptions, ...options };
    
    console.log(`📄 Starting chunking for document ${documentId}`);
    console.log(`   Configuration: ${JSON.stringify(config)}`);

    const chunks: DocumentChunk[] = [];
    let totalTokens = 0;
    let chunkIndex = 0;

    // Process each page independently to preserve boundaries
    for (const page of pages) {
      const pageChunks = await this.chunkPage(
        page,
        documentId,
        chunkIndex,
        config
      );
      
      chunks.push(...pageChunks);
      chunkIndex += pageChunks.length;
      
      // Track token usage
      const pageTokens = pageChunks.reduce((sum, chunk) => {
        return sum + countTokens(chunk.chunkText);
      }, 0);
      totalTokens += pageTokens;

      console.log(`   ✓ Page ${page.pageNumber}: ${pageChunks.length} chunks, ${pageTokens} tokens`);
    }

    const processingTime = Date.now() - startTime;
    const avgTokensPerChunk = chunks.length > 0 ? totalTokens / chunks.length : 0;

    console.log(`✅ Chunking complete for ${documentId}`);
    console.log(`   📊 Stats: ${chunks.length} chunks, ${totalTokens} tokens, ${avgTokensPerChunk.toFixed(1)} avg tokens/chunk`);
    console.log(`   ⏱️  Processing time: ${processingTime}ms`);

    return {
      chunks,
      totalChunks: chunks.length,
      totalTokens,
      avgTokensPerChunk,
      processingTime
    };
  }

  /**
   * Chunk a single page respecting token limits and boundaries
   * 
   * @param page - Page content to chunk
   * @param documentId - Document identifier
   * @param startIndex - Starting chunk index
   * @param config - Chunking configuration
   * @returns Array of chunks for this page
   */
  private async chunkPage(
    page: PageContent,
    documentId: string,
    startIndex: number,
    config: ChunkingOptions
  ): Promise<DocumentChunk[]> {
    const chunks: DocumentChunk[] = [];
    
    // Skip empty pages
    if (!page.text || page.text.trim().length === 0) {
      return chunks;
    }

    // If the entire page fits in one chunk, return it as is
    if (isWithinTokenLimit(page.text, config.chunkSizeTokens)) {
      chunks.push(this.createChunk(
        page.text,
        documentId,
        page.pageNumber,
        startIndex,
        0,
        page.text.length,
        page.sectionTitle
      ));
      return chunks;
    }

    // Split page into chunks
    let remainingText = page.text;
    let currentPosition = 0;
    let chunkIndex = startIndex;
    let previousChunkText = '';

    while (remainingText.trim().length > 0) {
      // Calculate overlap from previous chunk (only within same page)
      let chunkText = '';
      if (previousChunkText && config.chunkOverlapTokens > 0) {
        const overlapText = this.extractOverlapText(
          previousChunkText,
          config.chunkOverlapTokens
        );
        chunkText = overlapText + ' ';
      }

      // Determine how much text we can add to reach target chunk size
      const remainingTokenBudget = config.chunkSizeTokens - countTokens(chunkText);
      const [mainContent, leftoverText] = splitTextAtTokenCount(
        remainingText,
        remainingTokenBudget
      );

      // If preserving sentences, adjust the split point
      let finalContent = mainContent;
      let finalLeftover = leftoverText;
      
      if (config.preserveSentences && leftoverText.length > 0) {
        const splitPoint = findSentenceBoundary(
          chunkText + mainContent + leftoverText,
          (chunkText + mainContent).length
        );
        
        const adjustedSplitPoint = splitPoint - chunkText.length;
        if (adjustedSplitPoint > 0 && adjustedSplitPoint < remainingText.length) {
          finalContent = remainingText.substring(0, adjustedSplitPoint);
          finalLeftover = remainingText.substring(adjustedSplitPoint);
        }
      }

      // Create the chunk
      chunkText += finalContent;
      
      chunks.push(this.createChunk(
        chunkText.trim(),
        documentId,
        page.pageNumber,
        chunkIndex,
        currentPosition,
        currentPosition + finalContent.length,
        page.sectionTitle
      ));

      // Update for next iteration
      previousChunkText = finalContent;
      remainingText = finalLeftover;
      currentPosition += finalContent.length;
      chunkIndex++;

      // Safety check to prevent infinite loops
      if (chunks.length > 1000) {
        console.error(`Warning: Too many chunks for page ${page.pageNumber}, breaking`);
        break;
      }
    }

    return chunks;
  }

  /**
   * Extract overlap text from the end of the previous chunk
   * 
   * @param previousText - Text from the previous chunk
   * @param overlapTokens - Number of tokens to overlap
   * @returns Overlap text
   */
  private extractOverlapText(previousText: string, overlapTokens: number): string {
    // Count tokens from the end of the previous text
    const words = previousText.split(/\s+/);
    let overlapText = '';
    let tokenCount = 0;

    // Build overlap from end of previous chunk
    for (let i = words.length - 1; i >= 0; i--) {
      const testText = words.slice(i).join(' ');
      const tokens = countTokens(testText);
      
      if (tokens > overlapTokens) {
        break;
      }
      
      overlapText = testText;
      tokenCount = tokens;
    }

    return overlapText;
  }

  /**
   * Create a DocumentChunk with all metadata
   * 
   * @param content - The chunk text content
   * @param documentId - Document identifier
   * @param pageNumber - Page number for citation
   * @param chunkIndex - Chunk index in document
   * @param startPos - Starting character position in page
   * @param endPos - Ending character position in page
   * @param sectionTitle - Optional section title
   * @returns Formatted DocumentChunk
   */
  private createChunk(
    content: string,
    documentId: string,
    pageNumber: number,
    chunkIndex: number,
    startPos: number,
    endPos: number,
    sectionTitle?: string
  ): DocumentChunk {
    // Generate chunk ID (will be replaced by database ID later)
    const chunkId = `${documentId}-chunk-${chunkIndex}`;
    
    // Calculate token count for this chunk
    const tokenCount = countTokens(content);

    return {
      id: chunkId,
      documentId,
      userId: '', // Will be set when saving to database
      chunkText: content,
      chunkTokens: tokenCount,
      pageNumber,
      chunkIndex,
      pagePositionStart: startPos,
      pagePositionEnd: endPos,
      sectionTitle,
      embedding: [], // Will be populated by embedding service
      embeddingModel: '', // Will be set when embeddings are generated
      createdAt: new Date().toISOString()
    };
  }

  /**
   * Validate chunking results for quality assurance
   * 
   * @param chunks - Array of chunks to validate
   * @param originalPages - Original pages for comparison
   * @returns Validation report
   */
  validateChunking(
    chunks: DocumentChunk[],
    originalPages: PageContent[]
  ): {
    valid: boolean;
    issues: string[];
    stats: {
      avgTokensPerChunk: number;
      minTokensPerChunk: number;
      maxTokensPerChunk: number;
      chunksPerPage: Map<number, number>;
    };
  } {
    const issues: string[] = [];
    
    // Check for empty chunks
    const emptyChunks = chunks.filter(c => !c.chunkText || c.chunkText.trim().length === 0);
    if (emptyChunks.length > 0) {
      issues.push(`Found ${emptyChunks.length} empty chunks`);
    }

    // Check chunk ordering
    for (let i = 1; i < chunks.length; i++) {
      if (chunks[i].chunkIndex !== chunks[i-1].chunkIndex + 1) {
        issues.push(`Chunk index gap between ${chunks[i-1].chunkIndex} and ${chunks[i].chunkIndex}`);
      }
    }

    // Check page boundaries
    for (let i = 1; i < chunks.length; i++) {
      if (chunks[i].pageNumber < chunks[i-1].pageNumber) {
        issues.push(`Page number goes backward at chunk ${i}`);
      }
    }

    // Calculate statistics
    const tokenCounts = chunks.map(c => c.chunkTokens || countTokens(c.chunkText));
    const avgTokens = tokenCounts.reduce((a, b) => a + b, 0) / tokenCounts.length;
    const minTokens = Math.min(...tokenCounts);
    const maxTokens = Math.max(...tokenCounts);

    // Count chunks per page
    const chunksPerPage = new Map<number, number>();
    chunks.forEach(chunk => {
      const count = chunksPerPage.get(chunk.pageNumber) || 0;
      chunksPerPage.set(chunk.pageNumber, count + 1);
    });

    return {
      valid: issues.length === 0,
      issues,
      stats: {
        avgTokensPerChunk: avgTokens,
        minTokensPerChunk: minTokens,
        maxTokensPerChunk: maxTokens,
        chunksPerPage
      }
    };
  }

  /**
   * Re-chunk with different parameters (useful for testing)
   * 
   * @param chunks - Existing chunks to recombine and re-chunk
   * @param newOptions - New chunking options
   * @returns New chunking result
   */
  async rechunk(
    chunks: DocumentChunk[],
    newOptions: Partial<ChunkingOptions>
  ): Promise<ChunkingResult> {
    // Group chunks by page
    const pageMap = new Map<number, DocumentChunk[]>();
    chunks.forEach(chunk => {
      const pageChunks = pageMap.get(chunk.pageNumber) || [];
      pageChunks.push(chunk);
      pageMap.set(chunk.pageNumber, pageChunks);
    });

    // Reconstruct pages
    const pages: PageContent[] = [];
    for (const [pageNumber, pageChunks] of pageMap) {
      // Sort chunks by index to ensure correct order
      pageChunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
      
      // Combine chunk content
      const pageText = pageChunks.map(c => c.chunkText).join(' ');
      const sectionTitle = pageChunks.find(c => c.sectionTitle)?.sectionTitle;
      
      pages.push({
        pageNumber,
        text: pageText,
        sectionTitle
      });
    }

    // Sort pages by page number
    pages.sort((a, b) => a.pageNumber - b.pageNumber);

    // Re-chunk with new options
    const documentId = chunks[0]?.documentId || 'unknown';
    return this.processPages(pages, documentId, newOptions);
  }
}