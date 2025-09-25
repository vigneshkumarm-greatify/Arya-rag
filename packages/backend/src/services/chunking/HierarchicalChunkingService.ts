/**
 * Hierarchical Chunking Service
 * 
 * Advanced chunking that preserves document structure and hierarchical numbering.
 * Optimized for military/Navy documentation with section boundaries and procedures.
 * 
 * @author ARYA RAG Team
 */

import { PageContent, DocumentChunk } from '@arya-rag/types';
import { ChunkingService, ChunkingOptions, ChunkingResult, SECTION_PATTERNS } from './ChunkingService';
import { countTokens, splitTextAtTokenCount } from '../../utils/tokenCounter';

/**
 * Section hierarchy information
 */
export interface SectionInfo {
  number: string;
  title: string;
  level: number;
  type: 'hierarchical' | 'chapter' | 'appendix' | 'letter' | 'roman' | 'step';
  parentSection?: string;
}

/**
 * Enhanced chunk with section hierarchy
 */
export interface HierarchicalChunk extends DocumentChunk {
  sectionHierarchy: SectionInfo[];
  isCompleteProcedure: boolean;
  containsSteps: boolean;
  crossReferences: string[];
}

/**
 * Hierarchical chunking configuration
 */
export interface HierarchicalChunkingOptions extends ChunkingOptions {
  preserveHierarchy: boolean;
  mergeShortSections: boolean;
  minSectionLength: number;
  extractCrossReferences: boolean;
  identifyProcedures: boolean;
}

export class HierarchicalChunkingService extends ChunkingService {
  private readonly hierarchicalDefaults: HierarchicalChunkingOptions = {
    chunkSizeTokens: 800,
    chunkOverlapTokens: 150,
    preservePageBoundaries: true,
    preserveSentences: true,
    includeMetadata: true,
    preserveHierarchy: true,
    mergeShortSections: true,
    minSectionLength: 100,
    extractCrossReferences: true,
    identifyProcedures: true
  };

  /**
   * Process pages with hierarchical structure preservation
   * 
   * @param pages - Array of page content
   * @param documentId - Document identifier
   * @param options - Enhanced chunking configuration
   * @returns Hierarchical chunking result
   */
  async processHierarchicalPages(
    pages: PageContent[],
    documentId: string,
    options: Partial<HierarchicalChunkingOptions> = {}
  ): Promise<ChunkingResult & { 
    hierarchicalChunks: HierarchicalChunk[];
    sectionMap: Map<string, SectionInfo>;
  }> {
    const startTime = Date.now();
    const config = { ...this.hierarchicalDefaults, ...options };
    
    console.log(`📊 Starting hierarchical chunking for document ${documentId}`);
    console.log(`   Hierarchy preservation: ${config.preserveHierarchy}`);
    console.log(`   Cross-reference extraction: ${config.extractCrossReferences}`);

    // First, analyze document structure
    const sectionMap = this.analyzeDocumentStructure(pages);
    console.log(`   Identified ${sectionMap.size} sections`);

    const hierarchicalChunks: HierarchicalChunk[] = [];
    let totalTokens = 0;
    let chunkIndex = 0;

    // Process each page with section awareness
    for (const page of pages) {
      const pageChunks = await this.chunkPageHierarchically(
        page,
        documentId,
        chunkIndex,
        config,
        sectionMap
      );
      
      hierarchicalChunks.push(...pageChunks);
      chunkIndex += pageChunks.length;
      
      const pageTokens = pageChunks.reduce((sum, chunk) => 
        sum + countTokens(chunk.chunkText), 0
      );
      totalTokens += pageTokens;

      console.log(`   ✓ Page ${page.pageNumber}: ${pageChunks.length} hierarchical chunks, ${pageTokens} tokens`);
    }

    const processingTime = Date.now() - startTime;
    const avgTokensPerChunk = hierarchicalChunks.length > 0 ? totalTokens / hierarchicalChunks.length : 0;

    // Convert to standard chunks for compatibility
    const standardChunks: DocumentChunk[] = hierarchicalChunks.map(chunk => ({
      id: chunk.id,
      documentId: chunk.documentId,
      userId: chunk.userId,
      chunkText: chunk.chunkText,
      chunkTokens: chunk.chunkTokens,
      pageNumber: chunk.pageNumber,
      chunkIndex: chunk.chunkIndex,
      pagePositionStart: chunk.pagePositionStart,
      pagePositionEnd: chunk.pagePositionEnd,
      sectionTitle: chunk.sectionTitle,
      embedding: chunk.embedding,
      embeddingModel: chunk.embeddingModel,
      createdAt: chunk.createdAt
    }));

    console.log(`✅ Hierarchical chunking complete for ${documentId}`);
    console.log(`   📊 Stats: ${hierarchicalChunks.length} chunks, ${totalTokens} tokens, ${avgTokensPerChunk.toFixed(1)} avg tokens/chunk`);
    console.log(`   📚 Sections: ${sectionMap.size} identified, ${hierarchicalChunks.filter(c => c.isCompleteProcedure).length} complete procedures`);

    return {
      chunks: standardChunks,
      totalChunks: hierarchicalChunks.length,
      totalTokens,
      avgTokensPerChunk,
      processingTime,
      hierarchicalChunks,
      sectionMap
    };
  }

  /**
   * Analyze document structure to build section hierarchy map
   * 
   * @param pages - Array of page content
   * @returns Map of section numbers to section information
   */
  private analyzeDocumentStructure(pages: PageContent[]): Map<string, SectionInfo> {
    const sectionMap = new Map<string, SectionInfo>();
    
    for (const page of pages) {
      const lines = page.text.split('\n');
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.length === 0) continue;

        // Check against all section patterns
        for (const [patternType, pattern] of Object.entries(SECTION_PATTERNS)) {
          const match = pattern.exec(trimmedLine);
          if (match) {
            const sectionNumber = match[1];
            const sectionTitle = match[2].trim();
            
            const sectionInfo: SectionInfo = {
              number: sectionNumber,
              title: sectionTitle,
              level: this.calculateSectionLevel(sectionNumber, patternType),
              type: patternType.toLowerCase() as any,
              parentSection: this.findParentSection(sectionNumber, patternType)
            };
            
            sectionMap.set(sectionNumber, sectionInfo);
            break; // Only match first pattern
          }
        }
      }
    }

    return sectionMap;
  }

  /**
   * Calculate section nesting level based on numbering
   * 
   * @param sectionNumber - Section number (e.g., "1.1.1")
   * @param patternType - Type of section pattern
   * @returns Nesting level (0 = top level)
   */
  private calculateSectionLevel(sectionNumber: string, patternType: string): number {
    switch (patternType) {
      case 'HIERARCHICAL':
        return sectionNumber.split('.').length - 1;
      case 'CHAPTER':
      case 'APPENDIX':
        return 0;
      case 'LETTER_SECTION':
      case 'ROMAN':
        return 1;
      case 'STEP':
        return 2;
      default:
        return 0;
    }
  }

  /**
   * Find parent section for hierarchical navigation
   * 
   * @param sectionNumber - Current section number
   * @param patternType - Section pattern type
   * @returns Parent section number if applicable
   */
  private findParentSection(sectionNumber: string, patternType: string): string | undefined {
    if (patternType === 'HIERARCHICAL') {
      const parts = sectionNumber.split('.');
      if (parts.length > 1) {
        return parts.slice(0, -1).join('.');
      }
    }
    return undefined;
  }

  /**
   * Chunk a single page with hierarchical awareness
   * 
   * @param page - Page content to chunk
   * @param documentId - Document identifier
   * @param startIndex - Starting chunk index
   * @param config - Hierarchical chunking configuration
   * @param sectionMap - Map of section information
   * @returns Array of hierarchical chunks
   */
  private async chunkPageHierarchically(
    page: PageContent,
    documentId: string,
    startIndex: number,
    config: HierarchicalChunkingOptions,
    sectionMap: Map<string, SectionInfo>
  ): Promise<HierarchicalChunk[]> {
    const chunks: HierarchicalChunk[] = [];
    
    if (!page.text || page.text.trim().length === 0) {
      return chunks;
    }

    // Identify sections within the page
    const pageSections = this.identifyPageSections(page.text, sectionMap);
    
    // If page has clear sections and hierarchy preservation is enabled
    if (config.preserveHierarchy && pageSections.length > 0) {
      return this.chunkBySections(page, documentId, startIndex, config, pageSections);
    }

    // Fall back to standard chunking with enhanced metadata
    return this.chunkWithEnhancedMetadata(page, documentId, startIndex, config, sectionMap);
  }

  /**
   * Identify section boundaries within a page
   * 
   * @param pageText - Text content of the page
   * @param sectionMap - Map of known sections
   * @returns Array of section boundaries with line numbers
   */
  private identifyPageSections(
    pageText: string,
    sectionMap: Map<string, SectionInfo>
  ): Array<{ section: SectionInfo; startLine: number; endLine?: number }> {
    const lines = pageText.split('\n');
    const pageSections: Array<{ section: SectionInfo; startLine: number; endLine?: number }> = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Check if line matches a known section
      for (const [sectionNumber, sectionInfo] of sectionMap.entries()) {
        if (line.includes(sectionNumber) && line.includes(sectionInfo.title.substring(0, 20))) {
          pageSections.push({
            section: sectionInfo,
            startLine: i
          });
          break;
        }
      }
    }

    // Set end lines for each section
    for (let i = 0; i < pageSections.length - 1; i++) {
      pageSections[i].endLine = pageSections[i + 1].startLine - 1;
    }
    
    if (pageSections.length > 0) {
      pageSections[pageSections.length - 1].endLine = lines.length - 1;
    }

    return pageSections;
  }

  /**
   * Chunk page content by identified sections
   * 
   * @param page - Page content
   * @param documentId - Document identifier  
   * @param startIndex - Starting chunk index
   * @param config - Chunking configuration
   * @param pageSections - Identified sections with boundaries
   * @returns Array of section-based chunks
   */
  private chunkBySections(
    page: PageContent,
    documentId: string,
    startIndex: number,
    config: HierarchicalChunkingOptions,
    pageSections: Array<{ section: SectionInfo; startLine: number; endLine?: number }>
  ): HierarchicalChunk[] {
    const chunks: HierarchicalChunk[] = [];
    const lines = page.text.split('\n');
    let chunkIndex = startIndex;

    for (const pageSection of pageSections) {
      const startLine = pageSection.startLine;
      const endLine = pageSection.endLine || lines.length - 1;
      
      const sectionText = lines.slice(startLine, endLine + 1).join('\n').trim();
      
      if (!sectionText) continue;

      // Check if section is too large and needs sub-chunking
      const tokenCount = countTokens(sectionText);
      
      if (tokenCount <= config.chunkSizeTokens) {
        // Section fits in one chunk
        chunks.push(this.createHierarchicalChunk(
          sectionText,
          documentId,
          page.pageNumber,
          chunkIndex,
          0,
          sectionText.length,
          pageSection.section,
          config
        ));
        chunkIndex++;
      } else {
        // Section needs to be split while preserving hierarchy
        const subChunks = this.splitSectionIntoChunks(
          sectionText,
          documentId,
          page.pageNumber,
          chunkIndex,
          pageSection.section,
          config
        );
        chunks.push(...subChunks);
        chunkIndex += subChunks.length;
      }
    }

    return chunks;
  }

  /**
   * Split large section into smaller chunks while preserving context
   * 
   * @param sectionText - Text content of the section
   * @param documentId - Document identifier
   * @param pageNumber - Page number
   * @param startIndex - Starting chunk index
   * @param section - Section information
   * @param config - Chunking configuration
   * @returns Array of sub-chunks
   */
  private splitSectionIntoChunks(
    sectionText: string,
    documentId: string,
    pageNumber: number,
    startIndex: number,
    section: SectionInfo,
    config: HierarchicalChunkingOptions
  ): HierarchicalChunk[] {
    const chunks: HierarchicalChunk[] = [];
    let remainingText = sectionText;
    let chunkIndex = startIndex;
    let currentPosition = 0;

    // Keep section header in first chunk
    const lines = sectionText.split('\n');
    const headerLine = lines[0];
    let previousChunkText = headerLine;

    while (remainingText.trim().length > 0) {
      let chunkText = '';
      
      // Add overlap from previous chunk (within section)
      if (previousChunkText && chunkIndex > startIndex && config.chunkOverlapTokens > 0) {
        const overlapText = this.extractSectionOverlap(previousChunkText, config.chunkOverlapTokens);
        chunkText = overlapText + '\n';
      }

      // Add new content to reach target size
      const remainingBudget = config.chunkSizeTokens - countTokens(chunkText);
      const [mainContent, leftoverText] = splitTextAtTokenCount(remainingText, remainingBudget);

      chunkText += mainContent;

      chunks.push(this.createHierarchicalChunk(
        chunkText.trim(),
        documentId,
        pageNumber,
        chunkIndex,
        currentPosition,
        currentPosition + mainContent.length,
        section,
        config
      ));

      previousChunkText = mainContent;
      remainingText = leftoverText;
      currentPosition += mainContent.length;
      chunkIndex++;
    }

    return chunks;
  }

  /**
   * Extract overlap text that maintains section context
   * 
   * @param previousText - Previous chunk text
   * @param overlapTokens - Number of overlap tokens
   * @returns Context-aware overlap text
   */
  private extractSectionOverlap(previousText: string, overlapTokens: number): string {
    // Find the last complete sentence or procedure step
    const sentences = previousText.split(/[.!?]+/);
    let overlapText = '';
    let tokenCount = 0;

    // Build from last sentences backward
    for (let i = sentences.length - 1; i >= 0; i--) {
      const sentence = sentences[i].trim();
      if (!sentence) continue;

      const testText = sentence + (i < sentences.length - 1 ? '.' : '');
      const testTokens = countTokens(testText);

      if (tokenCount + testTokens > overlapTokens) break;

      overlapText = testText + ' ' + overlapText;
      tokenCount += testTokens;
    }

    return overlapText.trim();
  }

  /**
   * Chunk with enhanced metadata when sections aren't clearly defined
   * 
   * @param page - Page content
   * @param documentId - Document identifier
   * @param startIndex - Starting chunk index
   * @param config - Chunking configuration
   * @param sectionMap - Map of section information
   * @returns Array of enhanced chunks
   */
  private chunkWithEnhancedMetadata(
    page: PageContent,
    documentId: string,
    startIndex: number,
    config: HierarchicalChunkingOptions,
    sectionMap: Map<string, SectionInfo>
  ): HierarchicalChunk[] {
    // Use parent class chunking and enhance with metadata
    const standardChunks = this.chunkPage(page, documentId, startIndex, config);
    
    return standardChunks.map(chunk => {
      // Analyze chunk for hierarchical context
      const hierarchy = this.analyzeChunkHierarchy(chunk.chunkText, sectionMap);
      const crossRefs = config.extractCrossReferences 
        ? this.extractCrossReferences(chunk.chunkText)
        : [];

      return {
        ...chunk,
        sectionHierarchy: hierarchy,
        isCompleteProcedure: this.isCompleteProcedure(chunk.chunkText),
        containsSteps: this.containsSteps(chunk.chunkText),
        crossReferences: crossRefs
      } as HierarchicalChunk;
    });
  }

  /**
   * Create a hierarchical chunk with enhanced metadata
   * 
   * @param content - Chunk text content
   * @param documentId - Document identifier
   * @param pageNumber - Page number
   * @param chunkIndex - Chunk index
   * @param startPos - Start position in page
   * @param endPos - End position in page
   * @param section - Section information
   * @param config - Chunking configuration
   * @returns Enhanced hierarchical chunk
   */
  private createHierarchicalChunk(
    content: string,
    documentId: string,
    pageNumber: number,
    chunkIndex: number,
    startPos: number,
    endPos: number,
    section: SectionInfo,
    config: HierarchicalChunkingOptions
  ): HierarchicalChunk {
    const baseChunk = this.createChunk(
      content,
      documentId,
      pageNumber,
      chunkIndex,
      startPos,
      endPos,
      section.title
    );

    // Build section hierarchy path
    const hierarchy = [section];
    let parentNumber = section.parentSection;
    
    // Add parent sections to hierarchy (could be enhanced with actual parent lookup)
    
    const crossRefs = config.extractCrossReferences 
      ? this.extractCrossReferences(content)
      : [];

    return {
      ...baseChunk,
      sectionHierarchy: hierarchy,
      isCompleteProcedure: this.isCompleteProcedure(content),
      containsSteps: this.containsSteps(content),
      crossReferences: crossRefs
    };
  }

  /**
   * Analyze chunk text to determine hierarchical context
   * 
   * @param chunkText - Text content to analyze
   * @param sectionMap - Known sections map
   * @returns Array of relevant section information
   */
  private analyzeChunkHierarchy(
    chunkText: string,
    sectionMap: Map<string, SectionInfo>
  ): SectionInfo[] {
    const relevantSections: SectionInfo[] = [];
    
    // Find section references in the chunk
    for (const [sectionNumber, sectionInfo] of sectionMap.entries()) {
      if (chunkText.includes(sectionNumber) || 
          chunkText.toLowerCase().includes(sectionInfo.title.toLowerCase().substring(0, 20))) {
        relevantSections.push(sectionInfo);
      }
    }

    // Sort by hierarchy level
    return relevantSections.sort((a, b) => a.level - b.level);
  }

  /**
   * Check if chunk contains a complete procedure
   * 
   * @param text - Text to analyze
   * @returns True if appears to contain complete procedure
   */
  private isCompleteProcedure(text: string): boolean {
    const procedureIndicators = [
      /procedure\s*:/i,
      /steps?\s*:/i,
      /instructions?\s*:/i,
      /to\s+(perform|complete|execute)/i
    ];

    const hasIndicator = procedureIndicators.some(pattern => pattern.test(text));
    const hasSteps = this.containsSteps(text);
    const hasConclusion = /(?:complete|finished|done|end)/i.test(text);

    return hasIndicator && hasSteps && (hasConclusion || text.split('\n').length > 5);
  }

  /**
   * Check if chunk contains step-by-step instructions
   * 
   * @param text - Text to analyze
   * @returns True if contains numbered or listed steps
   */
  private containsSteps(text: string): boolean {
    const stepPatterns = [
      /(?:^|\n)\s*(?:\d+[\.)]\s+|step\s+\d+|[a-z][\.)]\s+)/i,
      /(?:first|second|third|next|then|finally)/i,
      /(?:^|\n)\s*[-*•]\s+/
    ];

    return stepPatterns.some(pattern => pattern.test(text));
  }

  /**
   * Extract cross-references from chunk text
   * 
   * @param text - Text to analyze
   * @returns Array of found cross-references
   */
  private extractCrossReferences(text: string): string[] {
    const crossRefPatterns = [
      /(?:see|refer to|reference|chapter|section|appendix|paragraph)\s+(\d+(?:\.\d+)*)/gi,
      /\((?:ref|see)\s+([^)]+)\)/gi,
      /(?:page|p\.)\s+(\d+)/gi
    ];

    const references: string[] = [];
    
    for (const pattern of crossRefPatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) {
          references.push(match[1].trim());
        }
      }
    }

    return [...new Set(references)]; // Remove duplicates
  }
}