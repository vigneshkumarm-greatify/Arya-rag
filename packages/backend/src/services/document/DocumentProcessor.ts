/**
 * Document Processor - Enhanced PDF processing for RAG system
 * 
 * Handles large PDF processing with page boundary preservation for accurate citations.
 * Designed for documents up to 1000 pages with precise page number tracking.
 * 
 * @author ARYA RAG Team
 */

import { createHash } from 'crypto';
import { PageContent, DocumentChunk } from '@arya-rag/types';
// Use unpdf instead of pdf-parse - following Arya-Chatbot approach
import { extractText, getDocumentProxy } from 'unpdf';

export interface DocumentProcessingResult {
  success: boolean;
  totalPages: number;
  pages?: PageContent[];
  chunks?: DocumentChunk[];
  fileHash?: string;
  processingTime: number;
  error?: string;
}

export interface ProcessingOptions {
  preservePageBoundaries: boolean;
  calculateHash: boolean;
  maxPages?: number; // For testing with smaller docs
}

export class DocumentProcessor {
  private readonly MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB for large documents
  private readonly MAX_PAGES = 2000; // Safety limit

  /**
   * Process a large PDF with page boundary preservation
   * Essential for accurate page citations in RAG responses
   */
  async processLargePDF(
    buffer: Buffer, 
    documentName: string,
    options: ProcessingOptions = { preservePageBoundaries: true, calculateHash: true }
  ): Promise<DocumentProcessingResult> {
    const startTime = Date.now();

    try {
      // Validate file size
      if (buffer.length > this.MAX_FILE_SIZE) {
        return {
          success: false,
          totalPages: 0,
          processingTime: Date.now() - startTime,
          error: `File too large. Maximum size is ${this.MAX_FILE_SIZE / 1024 / 1024}MB`
        };
      }

      // Calculate file hash for duplicate detection
      let fileHash: string | undefined;
      if (options.calculateHash) {
        fileHash = this.calculateFileHash(buffer);
      }

      // Extract text with page boundaries
      const pages = await this.extractTextWithPages(buffer);
      
      // Validate page count
      if (pages.length > this.MAX_PAGES) {
        return {
          success: false,
          totalPages: pages.length,
          processingTime: Date.now() - startTime,
          error: `Document too large. Maximum ${this.MAX_PAGES} pages allowed, found ${pages.length} pages`
        };
      }

      // Apply page limit if specified (for testing)
      const limitedPages = options.maxPages ? pages.slice(0, options.maxPages) : pages;

      console.log(`✅ PDF processed successfully: ${documentName}`);
      console.log(`   📄 Pages: ${limitedPages.length}`);
      console.log(`   📊 Total characters: ${limitedPages.reduce((sum, p) => sum + p.text.length, 0)}`);
      console.log(`   ⏱️  Processing time: ${Date.now() - startTime}ms`);

      return {
        success: true,
        totalPages: limitedPages.length,
        pages: limitedPages,
        fileHash,
        processingTime: Date.now() - startTime
      };

    } catch (error) {
      console.error(`❌ Failed to process PDF: ${documentName}`, error);

      let errorMessage = 'Failed to process PDF';
      if (error instanceof Error) {
        if (error.message.includes('Invalid PDF') || error.message.includes('not a PDF')) {
          errorMessage = 'Invalid or corrupted PDF file';
        } else if (error.message.includes('password') || error.message.includes('encrypted')) {
          errorMessage = 'Password-protected PDFs are not supported';
        } else if (error.message.includes('parsing failed')) {
          errorMessage = 'PDF format not supported or file is corrupted';
        } else {
          errorMessage = error.message;
        }
      }

      return {
        success: false,
        totalPages: 0,
        processingTime: Date.now() - startTime,
        error: errorMessage
      };
    }
  }

  /**
   * Extract text from PDF while preserving page boundaries
   * This is crucial for accurate page citations
   */
  async extractTextWithPages(buffer: Buffer): Promise<PageContent[]> {
    try {
      console.log('📄 Extracting PDF text using unpdf library...');
      
      // Convert Buffer to Uint8Array for unpdf
      const uint8Array = new Uint8Array(buffer);
      
      // Get PDF document proxy using unpdf
      const pdf = await getDocumentProxy(uint8Array);
      
      // Extract text from each page individually to preserve page boundaries
      const pages: PageContent[] = [];
      
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        try {
          // Get the page
          const page = await pdf.getPage(pageNum);
          
          // Extract text from this specific page
          const textContent = await page.getTextContent();
          
          // Combine all text items from the page
          let pageText = '';
          textContent.items.forEach((item: any) => {
            if (item.str) {
              pageText += item.str + ' ';
            }
          });
          
          // Clean up the text
          pageText = pageText.trim();
          
          if (pageText) {
            pages.push({
              pageNumber: pageNum,
              text: pageText,
              sectionTitle: undefined
            });
          }
          
          console.log(`   ✓ Extracted page ${pageNum}: ${pageText.length} characters`);
          
        } catch (pageError) {
          console.warn(`   ⚠️  Failed to extract page ${pageNum}:`, pageError.message);
          // Add empty page to maintain page numbering
          pages.push({
            pageNumber: pageNum,
            text: '',
            sectionTitle: undefined
          });
        }
      }
      
      console.log(`✅ Successfully extracted ${pages.length} pages using unpdf`);
      return pages;
      
    } catch (error) {
      console.error('Failed to extract pages with unpdf:', error);
      throw new Error(`PDF text extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Wrapper method for backward compatibility with routes
   * Routes expect this method name, but we use extractTextWithPages internally
   */
  async extractPagesFromBuffer(buffer: Buffer, filename: string): Promise<{
    success: boolean;
    pages: PageContent[];
    error?: string;
  }> {
    try {
      console.log(`📄 Extracting text from PDF: ${filename}`);
      const pages = await this.extractTextWithPages(buffer);
      
      console.log(`✅ Successfully extracted ${pages.length} pages from ${filename}`);
      return {
        success: true,
        pages
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown extraction error';
      console.error(`❌ Failed to extract pages from ${filename}:`, errorMessage);
      
      return {
        success: false,
        pages: [],
        error: errorMessage
      };
    }
  }

  /**
   * Alternative method to extract pages individually using unpdf
   */
  private async extractPagesIndividually(buffer: Buffer): Promise<PageContent[]> {
    try {
      console.log('📄 Using fallback extraction method with unpdf...');
      
      // Convert Buffer to Uint8Array for unpdf
      const uint8Array = new Uint8Array(buffer);
      
      // Get PDF document proxy
      const pdf = await getDocumentProxy(uint8Array);
      
      // Extract all text as a single string, then split by estimated pages
      const { text, totalPages } = await extractText(pdf, { mergePages: true });
      
      if (!text || !totalPages || totalPages <= 1) {
        // Single page or no page info
        return [{
          pageNumber: 1,
          text: text || '',
          sectionTitle: undefined
        }];
      }

      // For multi-page PDFs, attempt to split by estimated page breaks
      return this.splitTextIntoPages(text, totalPages);

    } catch (error) {
      throw new Error(`Failed to extract PDF pages: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Split extracted text into page-based chunks
   * Uses heuristics to identify page boundaries
   */
  private splitTextIntoPages(fullText: string, pageCount: number): PageContent[] {
    const pages: PageContent[] = [];
    
    // If we only have one page worth of content, return as single page
    if (pageCount === 1 || !fullText) {
      pages.push({
        pageNumber: 1,
        text: fullText || '',
        sectionTitle: this.detectSectionTitle(fullText || '')
      });
      return pages;
    }

    // Attempt to split text evenly across pages
    // This is a heuristic approach - not perfect but workable for POC
    const avgCharsPerPage = Math.ceil(fullText.length / pageCount);
    const lines = fullText.split('\n');
    
    let currentPage = 1;
    let currentPageText = '';
    let currentCharCount = 0;
    
    for (const line of lines) {
      currentPageText += line + '\n';
      currentCharCount += line.length;
      
      // Check if we should move to next page
      if (currentCharCount >= avgCharsPerPage && currentPage < pageCount) {
        pages.push({
          pageNumber: currentPage,
          text: currentPageText.trim(),
          sectionTitle: this.detectSectionTitle(currentPageText)
        });
        
        currentPage++;
        currentPageText = '';
        currentCharCount = 0;
      }
    }
    
    // Add remaining text as last page
    if (currentPageText.trim()) {
      pages.push({
        pageNumber: currentPage,
        text: currentPageText.trim(),
        sectionTitle: this.detectSectionTitle(currentPageText)
      });
    }

    // Ensure we have the right number of pages
    while (pages.length < pageCount) {
      pages.push({
        pageNumber: pages.length + 1,
        text: '',
        sectionTitle: undefined
      });
    }

    return pages;
  }

  /**
   * Calculate SHA-256 hash of file content for duplicate detection
   */
  calculateFileHash(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Detect section titles from page content
   * Looks for common heading patterns
   */
  private detectSectionTitle(pageText: string): string | undefined {
    if (!pageText) return undefined;

    const lines = pageText.split('\n').map(line => line.trim()).filter(line => line);
    
    for (const line of lines.slice(0, 5)) { // Check first 5 lines
      // Look for common heading patterns
      if (this.looksLikeHeading(line)) {
        return line.length > 100 ? line.substring(0, 100) + '...' : line;
      }
    }

    return undefined;
  }

  /**
   * Heuristic to identify if a line looks like a heading
   */
  private looksLikeHeading(line: string): boolean {
    if (!line || line.length < 3 || line.length > 200) return false;

    // Common heading patterns
    const headingPatterns = [
      /^(Chapter|Section|Part|Article)\s+\d+/i,
      /^\d+\.\s+[A-Z]/,
      /^[A-Z][A-Z\s]{5,50}$/,
      /^[A-Z][a-z\s]{5,50}$/
    ];

    return headingPatterns.some(pattern => pattern.test(line));
  }

  /**
   * Clean extracted text for better processing
   */
  cleanExtractedText(text: string): string {
    return text
      .replace(/\s+/g, ' ')           // Normalize whitespace
      .replace(/\n{3,}/g, '\n\n')     // Max 2 consecutive line breaks
      .replace(/[^\w\s\.,;:!?()-]/g, '') // Remove weird characters
      .trim();
  }

  /**
   * Get processing statistics
   */
  getProcessingStats(pages: PageContent[]): {
    totalPages: number;
    totalCharacters: number;
    averageCharactersPerPage: number;
    pagesWithSections: number;
  } {
    const totalCharacters = pages.reduce((sum, page) => sum + page.text.length, 0);
    const pagesWithSections = pages.filter(page => page.sectionTitle).length;

    return {
      totalPages: pages.length,
      totalCharacters,
      averageCharactersPerPage: Math.round(totalCharacters / pages.length),
      pagesWithSections
    };
  }
}