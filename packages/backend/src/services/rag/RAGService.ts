/**
 * RAG Service - Retrieval-Augmented Generation Orchestration
 * 
 * Main service that combines vector search and LLM generation for question answering.
 * Orchestrates the entire RAG pipeline with accurate page citations.
 * 
 * @author ARYA RAG Team
 */

import { LLMService } from '../llm/LLMService';
import { LLMServiceFactory } from '../llm/LLMServiceFactory';
import { EmbeddingService } from '../embedding/EmbeddingService';
import { EmbeddingServiceFactory } from '../embedding/EmbeddingServiceFactory';
import { VectorSearchService } from '../vector/VectorSearchService';
import { DatabaseClient } from '../../config/database';
import { RAGRequest, RAGResponse, SourceReference } from '@arya-rag/types';

export interface RAGConfig {
  // Search configuration
  maxSearchResults: number;
  similarityThreshold: number;
  
  // Generation configuration
  maxResponseTokens: number;
  temperature: number;
  
  // Context configuration
  maxContextTokens: number;
  includeSourceExcerpts: boolean;
  
  // Citation configuration
  requireSourceCitations: boolean;
  maxSourcesPerResponse: number;
}

export interface RAGStats {
  totalQueries: number;
  avgResponseTime: number;
  avgSearchTime: number;
  avgGenerationTime: number;
  avgSourcesPerResponse: number;
  successRate: number;
}

export class RAGService {
  private llmService: LLMService;
  private embeddingService: EmbeddingService;
  private searchService: VectorSearchService;
  private config: RAGConfig;
  private stats: RAGStats;

  constructor(
    config: Partial<RAGConfig> = {},
    llmService?: LLMService,
    embeddingService?: EmbeddingService,
    searchService?: VectorSearchService
  ) {
    this.config = {
      maxSearchResults: config.maxSearchResults || 10,
      similarityThreshold: config.similarityThreshold || 0.65,
      maxResponseTokens: config.maxResponseTokens || 1000,
      temperature: config.temperature || 0.7,
      maxContextTokens: config.maxContextTokens || 3000,
      includeSourceExcerpts: config.includeSourceExcerpts ?? true,
      requireSourceCitations: config.requireSourceCitations ?? true,
      maxSourcesPerResponse: config.maxSourcesPerResponse || 5
    };

    // Initialize services
    this.llmService = llmService || LLMServiceFactory.createFromEnvironment();
    this.embeddingService = embeddingService || EmbeddingServiceFactory.createFromEnvironment();
    this.searchService = searchService || new VectorSearchService();

    // Log RAG configuration
    const embeddingModel = ('config' in this.embeddingService) ? (this.embeddingService as any).config?.model : 'unknown';
    console.log(`🔍 RAG Service: ${embeddingModel} + ${this.llmService.constructor.name}`);

    // Initialize stats
    this.stats = {
      totalQueries: 0,
      avgResponseTime: 0,
      avgSearchTime: 0,
      avgGenerationTime: 0,
      avgSourcesPerResponse: 0,
      successRate: 1.0
    };

  }

  /**
   * Process RAG query - main entry point
   */
  async processQuery(request: RAGRequest): Promise<RAGResponse> {
    const startTime = Date.now();
    
    try {
      console.log(`🔍 RAG query: "${request.query.substring(0, 100)}${request.query.length > 100 ? '...' : ''}"`);
      
      // Step 1: Generate query embedding
      const embeddingStart = Date.now();
      const queryEmbedding = await this.generateQueryEmbedding(request.query);
      const embeddingTime = Date.now() - embeddingStart;
      
      // Step 2: Search for relevant chunks
      const searchStart = Date.now();
      const searchResults = await this.searchRelevantChunks(
        queryEmbedding,
        request.userId,
        request.documentIds,
        request.maxResults || this.config.maxSearchResults,
        request.query
      );
      const searchTime = Date.now() - searchStart;
      
      // Step 3: Prepare context from search results
      const context = this.prepareContext(searchResults);
      
      // Step 4: Generate response with LLM
      const generationStart = Date.now();
      const llmResponse = await this.generateResponse(
        request.query,
        context,
        request.responseStyle
      );
      const generationTime = Date.now() - generationStart;
      
      // Step 5: Format response with citations
      const response = this.formatRAGResponse(
        request,
        llmResponse,
        searchResults,
        {
          searchTime,
          generationTime,
          embeddingTime,
          totalTime: Date.now() - startTime
        }
      );

      // Update statistics
      this.updateStats(response, searchTime, generationTime, true);

      // Save query to database for analytics
      await this.saveQueryToDatabase(request, response);

      console.log(`✅ RAG query completed in ${Date.now() - startTime}ms`);
      console.log(`   Sources found: ${response.sources.length}`);
      console.log(`   Confidence: ${(response.confidence * 100).toFixed(1)}%`);

      return response;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.updateStats(null, 0, 0, false);
      
      console.error(`❌ RAG query failed: ${error instanceof Error ? error.message : error}`);
      
      // Return error response
      return {
        response: 'I apologize, but I encountered an error while processing your question. Please try again.',
        sources: [],
        confidence: 0,
        metadata: {
          processingTime,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }

  /**
   * Generate embedding for the user query
   */
  private async generateQueryEmbedding(query: string): Promise<number[]> {
    const response = await this.embeddingService.generateEmbedding({
      text: query,
      metadata: { queryType: 'user_question' }
    });
    
    return response.embedding;
  }

  /**
   * Search for relevant document chunks
   */
  private async searchRelevantChunks(
    queryEmbedding: number[],
    userId: string,
    documentIds?: string[],
    maxResults: number = 10,
    queryText?: string
  ) {
    console.log(`🔍 Searching ${maxResults} chunks (threshold: ${this.config.similarityThreshold})`);
    
    return await this.searchService.search(queryEmbedding, userId, {
      topK: maxResults,
      similarityThreshold: this.config.similarityThreshold,
      documentIds,
      includeMetadata: true,
      queryText
    });
  }

  /**
   * Prepare context from search results for LLM
   */
  private prepareContext(searchResults: any[]): string {
    if (searchResults.length === 0) {
      return 'No relevant information found in the documents.';
    }

    let context = 'Relevant information from the documents:\n\n';
    let tokenCount = 0;
    const maxTokens = this.config.maxContextTokens;

    for (let i = 0; i < searchResults.length; i++) {
      const result = searchResults[i];
      const excerpt = `Document: ${result.documentName}\nPage ${result.pageNumber}${result.sectionTitle ? ` - ${result.sectionTitle}` : ''}\nContent: ${result.chunkText}\n\n`;
      
      // Estimate tokens (rough approximation)
      const excerptTokens = Math.ceil(excerpt.length / 4);
      
      if (tokenCount + excerptTokens > maxTokens) {
        console.log(`✂️ Context limit: ${tokenCount} tokens (${i} sources)`);
        break;
      }
      
      context += excerpt;
      tokenCount += excerptTokens;
    }

    return context;
  }

  /**
   * Generate response using LLM
   */
  private async generateResponse(
    query: string,
    context: string,
    responseStyle?: string
  ): Promise<{ text: string; usage: any }> {
    const systemPrompt = this.buildSystemPrompt(responseStyle);
    const prompt = this.buildUserPrompt(query, context);

    const response = await this.llmService.generateCompletion({
      prompt,
      systemPrompt,
      maxTokens: this.config.maxResponseTokens,
      temperature: this.config.temperature
    });

    return {
      text: response.text,
      usage: response.usage
    };
  }

  /**
   * Build system prompt for LLM
   */
  private buildSystemPrompt(responseStyle?: string): string {
    let systemPrompt = `You are an AI assistant that answers questions based on provided document excerpts. 

Your responsibilities:
1. Answer questions accurately using only the provided information
2. Always cite your sources with page numbers when making claims
3. If information is not in the documents, clearly state that
4. Be precise and professional in your responses
5. When referencing information, use the format: "(Document Name, Page X)"

`;

    if (responseStyle) {
      systemPrompt += `Response style: ${responseStyle}\n\n`;
    }

    if (this.config.requireSourceCitations) {
      systemPrompt += `IMPORTANT: You must include page citations for all factual claims. Use the exact document names and page numbers provided.\n\n`;
    }

    return systemPrompt;
  }

  /**
   * Build user prompt combining query and context
   */
  private buildUserPrompt(query: string, context: string): string {
    return `${context}

Question: ${query}

Please answer the question based on the information provided above. Remember to cite your sources with page numbers.`;
  }

  /**
   * Format the final RAG response
   */
  private formatRAGResponse(
    request: RAGRequest,
    llmResponse: { text: string; usage: any },
    searchResults: any[],
    timing: { searchTime: number; generationTime: number; embeddingTime: number; totalTime: number }
  ): RAGResponse {
    // Extract source references
    const sources: SourceReference[] = searchResults.slice(0, this.config.maxSourcesPerResponse).map(result => ({
      documentId: result.documentId,
      documentName: result.documentName,
      pageNumber: result.pageNumber,
      sectionTitle: result.sectionTitle,
      excerpt: this.config.includeSourceExcerpts ? this.extractExcerpt(result.chunkText) : undefined,
      similarityScore: result.similarityScore
    }));

    // Calculate confidence based on source quality and similarity
    const confidence = this.calculateConfidence(searchResults, llmResponse.text);

    return {
      response: llmResponse.text,
      sources,
      confidence,
      metadata: {
        processingTime: timing.totalTime,
        searchTime: timing.searchTime,
        generationTime: timing.generationTime,
        embeddingTime: timing.embeddingTime,
        tokensUsed: llmResponse.usage.totalTokens,
        sourcesFound: searchResults.length,
        model: this.llmService.getStats().totalRequests > 0 ? 'configured' : 'unknown'
      }
    };
  }

  /**
   * Extract a concise excerpt from chunk text
   */
  private extractExcerpt(chunkText: string, maxLength: number = 200): string {
    if (chunkText.length <= maxLength) {
      return chunkText;
    }

    // Try to cut at sentence boundary
    const truncated = chunkText.substring(0, maxLength);
    const lastPeriod = truncated.lastIndexOf('.');
    
    if (lastPeriod > maxLength * 0.7) {
      return truncated.substring(0, lastPeriod + 1);
    }

    return truncated + '...';
  }

  /**
   * Calculate confidence score based on search quality and response coherence
   */
  private calculateConfidence(searchResults: any[], response: string): number {
    if (searchResults.length === 0) {
      return 0.1; // Very low confidence with no sources
    }

    // Average similarity score of top results
    const avgSimilarity = searchResults.slice(0, 3).reduce((sum, r) => sum + r.similarityScore, 0) / Math.min(3, searchResults.length);
    
    // Number of sources factor
    const sourcesFactor = Math.min(searchResults.length / 5, 1); // 0 to 1
    
    // Response length factor (very short responses might be less reliable)
    const lengthFactor = Math.min(response.length / 100, 1); // 0 to 1
    
    // Combine factors
    const confidence = (avgSimilarity * 0.5) + (sourcesFactor * 0.3) + (lengthFactor * 0.2);
    
    return Math.max(0.1, Math.min(1.0, confidence));
  }

  /**
   * Save query and response to database for analytics
   */
  private async saveQueryToDatabase(request: RAGRequest, response: RAGResponse): Promise<void> {
    try {
      const db = DatabaseClient.getInstance().getClient();
      
      await (db as any).from('user_queries').insert({
        user_id: request.userId,
        query_text: request.query,
        response_text: response.response,
        sources: response.sources,
        confidence_score: response.confidence,
        processing_time_ms: response.metadata.processingTime
      });
    } catch (error) {
      console.error('Failed to save query to database:', error);
      // Don't throw - this is non-critical
    }
  }

  /**
   * Update service statistics
   */
  private updateStats(
    response: RAGResponse | null,
    searchTime: number,
    generationTime: number,
    success: boolean
  ): void {
    this.stats.totalQueries++;
    
    if (success && response) {
      // Update timing averages
      const prevAvgResponse = this.stats.avgResponseTime;
      const prevAvgSearch = this.stats.avgSearchTime;
      const prevAvgGeneration = this.stats.avgGenerationTime;
      const prevAvgSources = this.stats.avgSourcesPerResponse;
      
      const count = this.stats.totalQueries;
      
      this.stats.avgResponseTime = ((prevAvgResponse * (count - 1)) + response.metadata.processingTime) / count;
      this.stats.avgSearchTime = ((prevAvgSearch * (count - 1)) + searchTime) / count;
      this.stats.avgGenerationTime = ((prevAvgGeneration * (count - 1)) + generationTime) / count;
      this.stats.avgSourcesPerResponse = ((prevAvgSources * (count - 1)) + response.sources.length) / count;
    }

    // Update success rate
    const successCount = Math.floor(this.stats.successRate * (this.stats.totalQueries - 1)) + (success ? 1 : 0);
    this.stats.successRate = successCount / this.stats.totalQueries;
  }

  /**
   * Get service statistics
   */
  getStats(): RAGStats {
    return { ...this.stats };
  }

  /**
   * Test RAG pipeline end-to-end
   */
  async testPipeline(): Promise<{
    success: boolean;
    stages: {
      embedding: boolean;
      search: boolean;
      generation: boolean;
    };
    error?: string;
  }> {
    const stages = {
      embedding: false,
      search: false,
      generation: false
    };

    try {
      // Test embedding
      await this.embeddingService.generateEmbedding({ text: 'test query' });
      stages.embedding = true;

      // Test search (may not have data, but should not crash)
      await this.searchService.search([0.1, 0.2, 0.3], 'test-user', { topK: 1 });
      stages.search = true;

      // Test generation
      await this.llmService.generateCompletion({
        prompt: 'What is 2+2?',
        maxTokens: 10
      });
      stages.generation = true;

      return { success: true, stages };

    } catch (error) {
      return {
        success: false,
        stages,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}