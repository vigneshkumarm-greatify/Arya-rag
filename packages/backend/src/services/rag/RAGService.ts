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
import { OllamaLLMService } from '../llm/OllamaLLMService';
import { promptTemplateManager, QueryClassification, PromptConfig } from './PromptTemplates';

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
  
  // Enhanced Mistral-specific options
  enableStructuredResponses: boolean;
  useQueryClassification: boolean;
  enforceJsonFormat: boolean;
  enablePromptOptimization: boolean;
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
    // Check if using Ollama/Mistral for enhanced features
    const usingOllama = llmService instanceof OllamaLLMService || 
      (!llmService && process.env.LLM_PROVIDER === 'ollama');
    
    this.config = {
      maxSearchResults: config.maxSearchResults || 10,
      similarityThreshold: config.similarityThreshold || 0.65,
      maxResponseTokens: config.maxResponseTokens || (usingOllama ? 3000 : 1000),
      temperature: config.temperature || (usingOllama ? 0.1 : 0.7),
      maxContextTokens: config.maxContextTokens || (usingOllama ? 5000 : 3000),
      includeSourceExcerpts: config.includeSourceExcerpts ?? true,
      requireSourceCitations: config.requireSourceCitations ?? true,
      maxSourcesPerResponse: config.maxSourcesPerResponse || 5,
      enableStructuredResponses: config.enableStructuredResponses ?? usingOllama,
      useQueryClassification: config.useQueryClassification ?? usingOllama,
      enforceJsonFormat: config.enforceJsonFormat ?? usingOllama,
      enablePromptOptimization: config.enablePromptOptimization ?? usingOllama
    };

    // Initialize services
    this.llmService = llmService || LLMServiceFactory.createFromEnvironment();
    this.embeddingService = embeddingService || EmbeddingServiceFactory.createFromEnvironment();
    this.searchService = searchService || new VectorSearchService();

    // Log RAG configuration
    const embeddingModel = ('config' in this.embeddingService) ? (this.embeddingService as any).config?.model : 'unknown';
    console.log(`🔍 RAG Service: ${embeddingModel} + ${this.llmService.constructor.name}`);
    console.log(`   Enhanced features: ${this.config.enableStructuredResponses ? 'Enabled' : 'Disabled'}`);
    console.log(`   Query classification: ${this.config.useQueryClassification ? 'Enabled' : 'Disabled'}`);
    console.log(`   JSON format: ${this.config.enforceJsonFormat ? 'Enabled' : 'Disabled'}`);

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
   * Process RAG query with enhanced structured responses
   * Automatically detects query type and uses optimized prompts
   */
  async processEnhancedQuery(request: RAGRequest): Promise<RAGResponse & {
    queryClassification?: QueryClassification;
    structuredData?: any;
    promptType?: string;
  }> {
    const startTime = Date.now();
    
    try {
      console.log(`🔍 Enhanced RAG query: "${request.query.substring(0, 100)}${request.query.length > 100 ? '...' : ''}"`);
      
      // Step 1: Classify query if enabled
      let queryClassification: QueryClassification | undefined;
      if (this.config.useQueryClassification) {
        queryClassification = promptTemplateManager.classifyQuery(request.query);
        console.log(`   Query type: ${queryClassification.type} (confidence: ${(queryClassification.confidence * 100).toFixed(1)}%)`);
      }

      // Step 2: Generate query embedding
      const embeddingStart = Date.now();
      const queryEmbedding = await this.generateQueryEmbedding(request.query);
      const embeddingTime = Date.now() - embeddingStart;
      
      // Step 3: Search for relevant chunks
      const searchStart = Date.now();
      const searchResults = await this.searchRelevantChunks(
        queryEmbedding,
        request.userId,
        request.documentIds,
        request.maxResults || this.config.maxSearchResults,
        request.query
      );
      const searchTime = Date.now() - searchStart;
      
      // Step 4: Prepare enhanced context
      const context = this.prepareEnhancedContext(searchResults, queryClassification);
      
      // Step 5: Generate structured response
      const generationStart = Date.now();
      const llmResponse = await this.generateStructuredResponse(
        request.query,
        context,
        queryClassification,
        request.responseStyle
      );
      const generationTime = Date.now() - generationStart;
      
      // Step 6: Format enhanced response
      const response = this.formatEnhancedRAGResponse(
        request,
        llmResponse,
        searchResults,
        queryClassification,
        {
          searchTime,
          generationTime,
          embeddingTime,
          totalTime: Date.now() - startTime
        }
      );

      // Update statistics
      this.updateStats(response, searchTime, generationTime, true);

      // Save query to database
      await this.saveQueryToDatabase(request, response);

      console.log(`✅ Enhanced RAG query completed in ${Date.now() - startTime}ms`);
      console.log(`   Query type: ${queryClassification?.type || 'general'}`);
      console.log(`   Sources found: ${response.sources.length}`);
      console.log(`   Confidence: ${(response.confidence * 100).toFixed(1)}%`);

      return {
        ...response,
        queryClassification,
        structuredData: llmResponse.jsonData,
        promptType: queryClassification?.type || 'general'
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.updateStats(null, 0, 0, false);
      
      console.error(`❌ Enhanced RAG query failed: ${error instanceof Error ? error.message : error}`);
      
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
   * Process RAG query - main entry point (backward compatibility)
   */
  async processQuery(request: RAGRequest): Promise<RAGResponse> {
    // Use enhanced processing if available
    if (this.config.enableStructuredResponses) {
      const enhancedResponse = await this.processEnhancedQuery(request);
      // Return standard response for compatibility
      const { queryClassification, structuredData, promptType, ...standardResponse } = enhancedResponse;
      return standardResponse;
    }
    
    // Fall back to original implementation
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
   * Prepare enhanced context with query-type awareness
   */
  private prepareEnhancedContext(
    searchResults: any[],
    queryClassification?: QueryClassification
  ): string {
    if (searchResults.length === 0) {
      return 'No relevant information found in the documents.';
    }

    let contextHeader = 'Relevant information from the documents:\n\n';
    
    // Adjust context format based on query type
    if (queryClassification?.type === 'procedural') {
      contextHeader = 'Procedural information and steps from the documents:\n\n';
    } else if (queryClassification?.type === 'definitional') {
      contextHeader = 'Definitions and explanations from the documents:\n\n';
    } else if (queryClassification?.type === 'analytical') {
      contextHeader = 'Analytical information for comparison and analysis:\n\n';
    }

    let context = contextHeader;
    let tokenCount = 0;
    const maxTokens = this.config.maxContextTokens;

    for (let i = 0; i < searchResults.length; i++) {
      const result = searchResults[i];
      
      // Enhanced formatting with hierarchy information
      let excerpt = '';
      if (queryClassification?.type === 'procedural') {
        excerpt = `[PROCEDURE SOURCE]\nDocument: ${result.documentName}\nPage: ${result.pageNumber}`;
        if (result.sectionTitle) excerpt += `\nSection: ${result.sectionTitle}`;
        excerpt += `\nSimilarity: ${(result.similarityScore * 100).toFixed(1)}%\nContent:\n${result.chunkText}\n\n`;
      } else if (queryClassification?.type === 'definitional') {
        excerpt = `[DEFINITION SOURCE]\nDocument: ${result.documentName} (Page ${result.pageNumber})`;
        if (result.sectionTitle) excerpt += `\n"${result.sectionTitle}"`;
        excerpt += `\nContent: ${result.chunkText}\n\n`;
      } else {
        // Standard format
        excerpt = `Document: ${result.documentName}\nPage ${result.pageNumber}${result.sectionTitle ? ` - ${result.sectionTitle}` : ''}\nContent: ${result.chunkText}\n\n`;
      }
      
      const excerptTokens = Math.ceil(excerpt.length / 4);
      
      if (tokenCount + excerptTokens > maxTokens) {
        console.log(`✂️ Enhanced context limit: ${tokenCount} tokens (${i} sources)`);
        break;
      }
      
      context += excerpt;
      tokenCount += excerptTokens;
    }

    return context;
  }

  /**
   * Generate structured response using query-appropriate prompts
   */
  private async generateStructuredResponse(
    query: string,
    context: string,
    queryClassification?: QueryClassification,
    responseStyle?: string
  ): Promise<{ text: string; usage: any; jsonData?: any }> {
    // Use enhanced prompting if classification is available
    if (this.config.enablePromptOptimization && queryClassification) {
      const promptConfig = promptTemplateManager.generatePromptConfig(
        query,
        context,
        queryClassification
      );

      // Optimize prompt length if needed
      const optimizedPrompt = promptTemplateManager.optimizePromptLength(
        promptConfig.userPrompt,
        this.config.maxContextTokens
      );

      // Try structured JSON generation for Ollama/Mistral
      if (this.config.enforceJsonFormat && this.llmService instanceof OllamaLLMService) {
        try {
          const structuredResponse = await (this.llmService as OllamaLLMService).generateJSONCompletion({
            prompt: optimizedPrompt,
            systemPrompt: promptConfig.systemPrompt,
            maxTokens: promptConfig.maxTokens,
            temperature: promptConfig.temperature,
            schema: promptConfig.schema,
            enforceJsonFormat: true
          });

          return {
            text: structuredResponse.text,
            usage: structuredResponse.usage,
            jsonData: structuredResponse.jsonData
          };
        } catch (error) {
          console.warn('Structured response failed, falling back to standard:', error);
          // Fall through to standard generation
        }
      }

      // Standard generation with optimized prompts
      const response = await this.llmService.generateCompletion({
        prompt: optimizedPrompt,
        systemPrompt: promptConfig.systemPrompt,
        maxTokens: promptConfig.maxTokens,
        temperature: promptConfig.temperature
      });

      return {
        text: response.text,
        usage: response.usage
      };
    }

    // Fallback to original method
    return this.generateResponse(query, context, responseStyle);
  }

  /**
   * Format enhanced RAG response with structured data
   */
  private formatEnhancedRAGResponse(
    request: RAGRequest,
    llmResponse: { text: string; usage: any; jsonData?: any },
    searchResults: any[],
    queryClassification?: QueryClassification,
    timing: { searchTime: number; generationTime: number; embeddingTime: number; totalTime: number }
  ): RAGResponse {
    // If we have structured JSON data, use it to enhance the response
    if (llmResponse.jsonData && this.config.enforceJsonFormat) {
      return this.formatStructuredResponse(
        request,
        llmResponse,
        searchResults,
        queryClassification,
        timing
      );
    }

    // Use standard formatting with enhanced metadata
    const standardResponse = this.formatRAGResponse(request, llmResponse, searchResults, timing);
    
    // Add query classification metadata
    if (queryClassification) {
      standardResponse.metadata = {
        ...standardResponse.metadata,
        queryType: queryClassification.type,
        queryConfidence: queryClassification.confidence
      };
    }

    return standardResponse;
  }

  /**
   * Format response from structured JSON data
   */
  private formatStructuredResponse(
    request: RAGRequest,
    llmResponse: { text: string; usage: any; jsonData: any },
    searchResults: any[],
    queryClassification?: QueryClassification,
    timing: { searchTime: number; generationTime: number; embeddingTime: number; totalTime: number }
  ): RAGResponse {
    const jsonData = llmResponse.jsonData;

    // Extract sources from structured data or search results
    let sources: SourceReference[] = [];
    
    if (jsonData.citations && Array.isArray(jsonData.citations)) {
      sources = jsonData.citations.map((citation: any) => ({
        documentId: this.findDocumentIdByName(citation.source, searchResults),
        documentName: citation.source,
        pageNumber: citation.page,
        sectionTitle: citation.section,
        similarityScore: this.findSimilarityScore(citation, searchResults)
      }));
    } else {
      // Fall back to search results
      sources = searchResults.slice(0, this.config.maxSourcesPerResponse).map(result => ({
        documentId: result.documentId,
        documentName: result.documentName,
        pageNumber: result.pageNumber,
        sectionTitle: result.sectionTitle,
        excerpt: this.config.includeSourceExcerpts ? this.extractExcerpt(result.chunkText) : undefined,
        similarityScore: result.similarityScore
      }));
    }

    // Use structured confidence or calculate it
    const confidence = jsonData.confidence || this.calculateConfidence(searchResults, llmResponse.text);

    // Build enhanced response text
    let responseText = jsonData.answer || llmResponse.text;
    
    // Add structured steps for procedural responses
    if (jsonData.steps && Array.isArray(jsonData.steps) && jsonData.steps.length > 0) {
      responseText += '\n\nSteps:\n';
      jsonData.steps.forEach((step: string, index: number) => {
        responseText += `${index + 1}. ${step}\n`;
      });
    }

    return {
      response: responseText,
      sources,
      confidence,
      metadata: {
        processingTime: timing.totalTime,
        searchTime: timing.searchTime,
        generationTime: timing.generationTime,
        embeddingTime: timing.embeddingTime,
        tokensUsed: llmResponse.usage.totalTokens,
        sourcesFound: searchResults.length,
        model: this.llmService.constructor.name,
        queryType: queryClassification?.type,
        queryConfidence: queryClassification?.confidence,
        structuredResponse: true,
        sectionsReferenced: jsonData.sections
      }
    };
  }

  /**
   * Helper method to find document ID by name
   */
  private findDocumentIdByName(documentName: string, searchResults: any[]): string {
    const match = searchResults.find(result => result.documentName === documentName);
    return match?.documentId || 'unknown';
  }

  /**
   * Helper method to find similarity score for a citation
   */
  private findSimilarityScore(citation: any, searchResults: any[]): number {
    const match = searchResults.find(result => 
      result.documentName === citation.source && 
      result.pageNumber === citation.page
    );
    return match?.similarityScore || 0.8; // Default similarity
  }

  /**
   * Prepare context from search results for LLM (backward compatibility)
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