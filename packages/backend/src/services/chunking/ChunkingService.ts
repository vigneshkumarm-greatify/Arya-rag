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

/**
 * Section header patterns for hierarchical documents
 */
export const SECTION_PATTERNS = {
  // Standard hierarchical numbering (1, 1.1, 1.1.1, etc.)
  HIERARCHICAL: /^(\d+(?:\.\d+){0,5})\s+(.+)/m,
  
  // Chapter patterns
  CHAPTER: /^(?:chapter|ch\.?)\s+(\d+)[\s:]+(.+)/im,
  
  // Appendix patterns
  APPENDIX: /^(?:appendix|app\.?)\s+([a-z])\s+(.+)/im,
  
  // Section with letters (A, B, C, etc.)
  LETTER_SECTION: /^([a-z])\.\s+(.+)/im,
  
  // Roman numerals (I, II, III, etc.)
  ROMAN: /^([ivx]+)\.\s+(.+)/im,
  
  // Procedure steps (STEP 1, Step 2, etc.)
  STEP: /^(?:step)\s+(\d+)[\s:]+(.+)/im
};

export interface ChunkingOptions {
  chunkSizeTokens: number;        // Target size for each chunk (default: 600)
  chunkOverlapTokens: number;     // Overlap between chunks (default: 100)
  preservePageBoundaries: boolean; // Never split across pages (default: true)
  preserveSentences: boolean;      // Try to keep sentences intact (default: true)
  includeMetadata: boolean;        // Include section titles and metadata (default: true)
  detectSectionHeaders: boolean;   // Detect and preserve section headers (default: true)
  enhancedMetadata: boolean;       // Include enhanced metadata extraction (default: true)
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
    chunkSizeTokens: process.env.CHUNK_SIZE_TOKENS ? parseInt(process.env.CHUNK_SIZE_TOKENS) : 800,
    chunkOverlapTokens: process.env.CHUNK_OVERLAP_TOKENS ? parseInt(process.env.CHUNK_OVERLAP_TOKENS) : 150,
    preservePageBoundaries: true,
    preserveSentences: true,
    includeMetadata: true,
    detectSectionHeaders: true,
    enhancedMetadata: true
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
  protected async chunkPage(
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

    // Detect section headers if enabled
    let detectedSections: Array<{number: string; title: string; line: number; type: string}> = [];
    let enhancedSectionTitle = page.sectionTitle;
    
    if (config.detectSectionHeaders) {
      detectedSections = this.detectSectionHeaders(page.text);
      if (detectedSections.length > 0 && !enhancedSectionTitle) {
        enhancedSectionTitle = `${detectedSections[0].number} ${detectedSections[0].title}`;
      }
    }

    // If the entire page fits in one chunk, return it as is
    if (isWithinTokenLimit(page.text, config.chunkSizeTokens)) {
      chunks.push(this.createEnhancedChunk(
        page.text,
        documentId,
        page.pageNumber,
        startIndex,
        0,
        page.text.length,
        enhancedSectionTitle,
        config,
        detectedSections
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
      
      chunks.push(this.createEnhancedChunk(
        chunkText.trim(),
        documentId,
        page.pageNumber,
        chunkIndex,
        currentPosition,
        currentPosition + finalContent.length,
        enhancedSectionTitle,
        config,
        detectedSections
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
   * Detect section headers in text content
   * 
   * @param text - Text content to analyze
   * @returns Array of detected section information
   */
  private detectSectionHeaders(text: string): Array<{
    number: string;
    title: string;
    line: number;
    type: string;
  }> {
    const sections: Array<{ number: string; title: string; line: number; type: string }> = [];
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.length === 0) continue;

      // Check against section patterns
      for (const [patternType, pattern] of Object.entries(SECTION_PATTERNS)) {
        const match = pattern.exec(line);
        if (match) {
          sections.push({
            number: match[1],
            title: match[2].trim(),
            line: i,
            type: patternType.toLowerCase()
          });
          break;
        }
      }
    }

    return sections;
  }

  /**
   * Extract enhanced metadata from chunk content
   * 
   * @param content - Chunk text content
   * @returns Enhanced metadata object
   */
  private extractEnhancedMetadata(content: string): {
    containsProcedure: boolean;
    containsSteps: boolean;
    containsDefinition: boolean;
    crossReferences: string[];
    sectionNumbers: string[];
  } {
    const metadata = {
      containsProcedure: false,
      containsSteps: false,
      containsDefinition: false,
      crossReferences: [] as string[],
      sectionNumbers: [] as string[]
    };

    // Detect procedures
    const procedurePatterns = [
      /procedure\s*:/i,
      /steps?\s*:/i,
      /instructions?\s*:/i,
      /to\s+(perform|complete|execute)/i
    ];
    metadata.containsProcedure = procedurePatterns.some(pattern => pattern.test(content));

    // Detect steps
    const stepPatterns = [
      /(?:^|\n)\s*(?:\d+[\.)]\s+|step\s+\d+|[a-z][\.)]\s+)/i,
      /(?:first|second|third|next|then|finally)/i,
      /(?:^|\n)\s*[-*•]\s+/
    ];
    metadata.containsSteps = stepPatterns.some(pattern => pattern.test(content));

    // Detect definitions
    const definitionPatterns = [
      /is\s+defined\s+as/i,
      /means\s+/i,
      /refers\s+to/i,
      /:\s*the\s+/i,
      /definition\s*:/i
    ];
    metadata.containsDefinition = definitionPatterns.some(pattern => pattern.test(content));

    // Extract cross-references
    const crossRefPatterns = [
      /(?:see|refer to|reference|chapter|section|appendix|paragraph)\s+(\d+(?:\.\d+)*)/gi,
      /\((?:ref|see)\s+([^)]+)\)/gi,
      /(?:page|p\.)\s+(\d+)/gi
    ];

    for (const pattern of crossRefPatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) {
          metadata.crossReferences.push(match[1].trim());
        }
      }
    }

    // Extract section numbers
    for (const [patternType, pattern] of Object.entries(SECTION_PATTERNS)) {
      // Create a new global regex instance for matchAll to avoid state issues
      const globalPattern = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
      const matches = content.matchAll(globalPattern);
      for (const match of matches) {
        if (match[1]) {
          metadata.sectionNumbers.push(match[1]);
        }
      }
    }

    // Remove duplicates
    metadata.crossReferences = [...new Set(metadata.crossReferences)];
    metadata.sectionNumbers = [...new Set(metadata.sectionNumbers)];

    return metadata;
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
  protected createChunk(
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
   * Create an enhanced DocumentChunk with section detection and metadata
   * 
   * @param content - The chunk text content
   * @param documentId - Document identifier
   * @param pageNumber - Page number for citation
   * @param chunkIndex - Chunk index in document
   * @param startPos - Starting character position in page
   * @param endPos - Ending character position in page
   * @param sectionTitle - Optional section title
   * @param config - Chunking configuration
   * @param detectedSections - Array of detected sections
   * @returns Enhanced DocumentChunk with metadata
   */
  private createEnhancedChunk(
    content: string,
    documentId: string,
    pageNumber: number,
    chunkIndex: number,
    startPos: number,
    endPos: number,
    sectionTitle: string | undefined,
    config: ChunkingOptions,
    detectedSections: Array<{number: string; title: string; line: number; type: string}>
  ): DocumentChunk {
    // Create base chunk
    const baseChunk = this.createChunk(
      content,
      documentId,
      pageNumber,
      chunkIndex,
      startPos,
      endPos,
      sectionTitle
    );

    // Add enhanced metadata if enabled
    if (config.enhancedMetadata) {
      const enhancedMetadata = this.extractEnhancedMetadata(content);
      
      // Store enhanced metadata in the chunk (could extend DocumentChunk interface in future)
      (baseChunk as any).enhancedMetadata = {
        ...enhancedMetadata,
        detectedSections: detectedSections.filter(section => {
          // Only include sections that appear in this chunk
          return content.includes(section.number) || content.includes(section.title.substring(0, 20));
        })
      };
    }

    return baseChunk;
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