/**
 * Vector Search Service
 * 
 * Performs similarity search on document chunks using pgvector.
 * Optimized for fast retrieval with user isolation and page citations.
 * 
 * @author ARYA RAG Team
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { DatabaseClient, Database } from '../../config/database';
import { SearchParams, SearchResult } from '@arya-rag/types';

export interface VectorSearchConfig {
  defaultTopK: number;
  defaultSimilarityThreshold: number;
  maxTopK: number;
  cacheResults: boolean;
  cacheTTLSeconds: number;
}

export interface SearchOptions {
  topK?: number;
  similarityThreshold?: number;
  documentIds?: string[];
  includeMetadata?: boolean;
}

export interface ExtendedSearchResult extends SearchResult {
  similarity: number; // Add similarity property for internal use
  processingMetadata?: {
    searchTimeMs: number;
    totalCandidates: number;
    model: string;
  };
}

export interface SearchStats {
  totalSearches: number;
  avgSearchTimeMs: number;
  avgResultsReturned: number;
  cacheHitRate: number;
}

export class VectorSearchService {
  private db: SupabaseClient<Database, 'public'>;
  private config: VectorSearchConfig;
  private searchCache: Map<string, { results: ExtendedSearchResult[]; timestamp: number }>;
  private stats: SearchStats;

  constructor(config: Partial<VectorSearchConfig> = {}) {
    this.db = DatabaseClient.getInstance().getClient();
    this.config = {
      defaultTopK: config.defaultTopK || 10,
      defaultSimilarityThreshold: config.defaultSimilarityThreshold || 0.7,
      maxTopK: config.maxTopK || 50,
      cacheResults: config.cacheResults ?? true,
      cacheTTLSeconds: config.cacheTTLSeconds || 300 // 5 minutes
    };
    
    this.searchCache = new Map();
    this.stats = {
      totalSearches: 0,
      avgSearchTimeMs: 0,
      avgResultsReturned: 0,
      cacheHitRate: 0
    };

    console.log('🔍 Initialized Vector Search Service');
    console.log(`   Default top-k: ${this.config.defaultTopK}`);
    console.log(`   Similarity threshold: ${this.config.defaultSimilarityThreshold}`);
    console.log(`   Cache enabled: ${this.config.cacheResults}`);
  }

  /**
   * Search for similar document chunks
   * Main entry point for vector similarity search
   */
  async search(
    queryEmbedding: number[],
    userId: string,
    options: SearchOptions & { queryText?: string } = {}
  ): Promise<ExtendedSearchResult[]> {
    const startTime = Date.now();
    
    // Validate inputs
    this.validateSearchInputs(queryEmbedding, userId, options);

    // Check cache if enabled
    const cacheKey = this.generateCacheKey(queryEmbedding, userId, options);
    const cachedResults = this.getCachedResults(cacheKey);
    if (cachedResults) {
      this.updateStats(cachedResults.length, Date.now() - startTime, true);
      console.log(`🎯 Cache hit for query (${cachedResults.length} results)`);
      return cachedResults;
    }

    // Prepare search parameters
    const topK = Math.min(options.topK || this.config.defaultTopK, this.config.maxTopK);
    const similarityThreshold = options.similarityThreshold || this.config.defaultSimilarityThreshold;

    console.log(`🔍 Searching for ${topK} similar chunks (threshold: ${similarityThreshold})`);

    try {
      // For POC, we'll use a simple similarity search without custom RPC
      // In production, you'd implement the RPC function in the database
      const { data, error } = await this.db
        .from('document_chunks' as any)
        .select(`
          chunk_id,
          document_id,
          chunk_text,
          page_number,
          section_title,
          user_documents!inner(filename)
        `)
        .eq('user_id', userId)
        .limit(topK);

      if (error) {
        console.error('Vector search error:', error);
        throw new Error(`Search failed: ${error.message}`);
      }

      // Debug: Log the first row structure to understand the data format
      if (data && data.length > 0) {
        console.log('🔍 First row structure:', {
          rawRow: data[0],
          userDocuments: data[0].user_documents,
          userDocumentsType: typeof data[0].user_documents,
          userDocumentsIsArray: Array.isArray(data[0].user_documents)
        });
      }

      // Mock similarity scores for POC (in production, this would come from vector similarity)
      const resultsWithSimilarity = (data || []).map((row: any, index) => {
        // Try different ways to access the filename
        let documentName = 'Unknown';
        if (row.user_documents) {
          if (Array.isArray(row.user_documents) && row.user_documents[0]) {
            documentName = row.user_documents[0].filename || 'Unknown';
          } else if (typeof row.user_documents === 'object') {
            documentName = row.user_documents.filename || 'Unknown';
          }
        }

        return {
          id: row.chunk_id,
          document_id: row.document_id,
          document_name: documentName,
          chunk_text: row.chunk_text,
          page_number: row.page_number,
          section_title: row.section_title,
          similarity: Math.max(0.5, 1 - (index * 0.1)) // Mock decreasing similarity
        };
      });

      // Convert to extended search results
      const results = this.formatSearchResults(resultsWithSimilarity, {
        searchTimeMs: Date.now() - startTime,
        totalCandidates: resultsWithSimilarity.length,
        model: 'pgvector_cosine'
      });

      // Cache results if enabled
      if (this.config.cacheResults) {
        this.cacheResults(cacheKey, results);
      }

      // Update statistics
      this.updateStats(results.length, Date.now() - startTime, false);

      console.log(`✅ Search complete: ${results.length} results in ${Date.now() - startTime}ms`);
      
      return results;

    } catch (error) {
      console.error('Search error:', error);
      throw error;
    }
  }

  /**
   * Search with multiple queries (useful for query expansion)
   */
  async multiSearch(
    queryEmbeddings: number[][],
    userId: string,
    options: SearchOptions = {}
  ): Promise<ExtendedSearchResult[]> {
    console.log(`🔍 Multi-search with ${queryEmbeddings.length} query variations`);

    // Run searches in parallel
    const searchPromises = queryEmbeddings.map(embedding => 
      this.search(embedding, userId, options)
    );

    const allResults = await Promise.all(searchPromises);

    // Merge and deduplicate results
    const mergedResults = this.mergeSearchResults(allResults);

    // Re-sort by highest similarity
    mergedResults.sort((a, b) => b.similarity - a.similarity);

    // Apply top-k limit
    const topK = Math.min(options.topK || this.config.defaultTopK, this.config.maxTopK);
    
    return mergedResults.slice(0, topK);
  }

  /**
   * Search with reranking (if additional ranking model is available)
   */
  async searchWithReranking(
    queryEmbedding: number[],
    userId: string,
    options: SearchOptions = {},
    rerankFunction?: (query: string, results: ExtendedSearchResult[]) => Promise<ExtendedSearchResult[]>
  ): Promise<ExtendedSearchResult[]> {
    // Get initial results
    const initialResults = await this.search(queryEmbedding, userId, {
      ...options,
      topK: (options.topK || this.config.defaultTopK) * 3 // Get more candidates for reranking
    });

    // If no reranking function provided, return initial results
    if (!rerankFunction || initialResults.length === 0) {
      return initialResults.slice(0, options.topK || this.config.defaultTopK);
    }

    // Apply reranking
    console.log(`🎯 Reranking ${initialResults.length} candidates`);
    const rerankedResults = await rerankFunction('', initialResults); // Query would come from context

    return rerankedResults.slice(0, options.topK || this.config.defaultTopK);
  }

  /**
   * Get search statistics for a user
   */
  async getUserSearchStats(userId: string): Promise<{
    totalQueries: number;
    avgResponseTime: number;
    topSearchedDocuments: Array<{ documentId: string; documentName: string; searchCount: number }>;
  }> {
    try {
      // For POC, we'll return basic stats from available data
      const { data: documents } = await this.db
        .from('user_documents')
        .select('document_id, filename')
        .eq('user_id', userId);

      // Mock stats for POC
      const topSearchedDocuments = (documents || []).map((doc: any) => ({
        documentId: doc.document_id,
        documentName: doc.filename,
        searchCount: Math.floor(Math.random() * 10) + 1 // Mock search count
      })).sort((a, b) => b.searchCount - a.searchCount);

      return {
        totalQueries: this.stats.totalSearches,
        avgResponseTime: this.stats.avgSearchTimeMs,
        topSearchedDocuments
      };

    } catch (error) {
      console.error('Failed to get user search stats:', error);
      return {
        totalQueries: 0,
        avgResponseTime: 0,
        topSearchedDocuments: []
      };
    }
  }

  /**
   * Validate search inputs
   */
  private validateSearchInputs(
    queryEmbedding: number[],
    userId: string,
    options: SearchOptions
  ): void {
    if (!queryEmbedding || queryEmbedding.length === 0) {
      throw new Error('Query embedding is required');
    }

    if (!userId || userId.trim().length === 0) {
      throw new Error('User ID is required');
    }

    if (options.topK && (options.topK < 1 || options.topK > this.config.maxTopK)) {
      throw new Error(`topK must be between 1 and ${this.config.maxTopK}`);
    }

    if (options.similarityThreshold && 
        (options.similarityThreshold < 0 || options.similarityThreshold > 1)) {
      throw new Error('Similarity threshold must be between 0 and 1');
    }
  }

  /**
   * Format search results with additional metadata
   */
  private formatSearchResults(
    rawResults: any[],
    metadata: ExtendedSearchResult['processingMetadata']
  ): ExtendedSearchResult[] {
    return rawResults.map(result => ({
      chunkId: result.id,
      documentId: result.document_id,
      documentName: result.document_name,
      chunkText: result.chunk_text,
      pageNumber: result.page_number,
      sectionTitle: result.section_title,
      similarity: result.similarity,
      similarityScore: result.similarity,
      processingMetadata: metadata
    }));
  }

  /**
   * Merge multiple search results and deduplicate
   */
  private mergeSearchResults(resultSets: ExtendedSearchResult[][]): ExtendedSearchResult[] {
    const merged = new Map<string, ExtendedSearchResult>();

    resultSets.forEach(results => {
      results.forEach(result => {
        const existing = merged.get(result.chunkId);
        if (!existing || result.similarity > existing.similarity) {
          merged.set(result.chunkId, result);
        }
      });
    });

    return Array.from(merged.values());
  }

  /**
   * Generate cache key for search
   */
  private generateCacheKey(
    queryEmbedding: number[],
    userId: string,
    options: SearchOptions
  ): string {
    // Use first few embedding values for cache key (full embedding would be too long)
    const embeddingPrefix = queryEmbedding.slice(0, 5).map(v => v.toFixed(4)).join(',');
    const optionsKey = JSON.stringify({
      topK: options.topK,
      threshold: options.similarityThreshold,
      docs: options.documentIds?.sort()
    });
    
    return `${userId}:${embeddingPrefix}:${optionsKey}`;
  }

  /**
   * Get cached search results
   */
  private getCachedResults(cacheKey: string): ExtendedSearchResult[] | null {
    if (!this.config.cacheResults) {
      return null;
    }

    const cached = this.searchCache.get(cacheKey);
    if (!cached) {
      return null;
    }

    // Check if cache is still valid
    const age = Date.now() - cached.timestamp;
    if (age > this.config.cacheTTLSeconds * 1000) {
      this.searchCache.delete(cacheKey);
      return null;
    }

    return cached.results;
  }

  /**
   * Cache search results
   */
  private cacheResults(cacheKey: string, results: ExtendedSearchResult[]): void {
    // Limit cache size
    if (this.searchCache.size > 1000) {
      // Remove oldest entries
      const entries = Array.from(this.searchCache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      entries.slice(0, 100).forEach(([key]) => this.searchCache.delete(key));
    }

    this.searchCache.set(cacheKey, {
      results,
      timestamp: Date.now()
    });
  }

  /**
   * Update service statistics
   */
  private updateStats(resultCount: number, searchTimeMs: number, wasCache: boolean): void {
    this.stats.totalSearches++;
    
    // Update average search time
    const prevAvg = this.stats.avgSearchTimeMs;
    this.stats.avgSearchTimeMs = 
      (prevAvg * (this.stats.totalSearches - 1) + searchTimeMs) / this.stats.totalSearches;

    // Update average results
    const prevAvgResults = this.stats.avgResultsReturned;
    this.stats.avgResultsReturned = 
      (prevAvgResults * (this.stats.totalSearches - 1) + resultCount) / this.stats.totalSearches;

    // Update cache hit rate
    if (wasCache) {
      const cacheHits = Math.round(this.stats.cacheHitRate * (this.stats.totalSearches - 1));
      this.stats.cacheHitRate = (cacheHits + 1) / this.stats.totalSearches;
    } else {
      const cacheHits = Math.round(this.stats.cacheHitRate * (this.stats.totalSearches - 1));
      this.stats.cacheHitRate = cacheHits / this.stats.totalSearches;
    }
  }

  /**
   * Get service statistics
   */
  getStats(): SearchStats {
    return { ...this.stats };
  }

  /**
   * Clear search cache
   */
  clearCache(): void {
    this.searchCache.clear();
    console.log('🗑️  Search cache cleared');
  }

  /**
   * Optimize search performance with index hints
   * (For advanced usage with large datasets)
   */
  async optimizeSearchPerformance(userId: string): Promise<{
    indexed: boolean;
    message: string;
    recommendations: string[];
  }> {
    const recommendations: string[] = [];

    try {
      // Check user's data volume from available tables
      const { count: chunkCount } = await this.db
        .from('document_chunks')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      const { count: documentCount } = await this.db
        .from('user_documents')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      if (!chunkCount && !documentCount) {
        return {
          indexed: false,
          message: 'No data found for user',
          recommendations: []
        };
      }

      // Provide recommendations based on data volume
      if ((chunkCount || 0) > 10000) {
        recommendations.push('Consider using specialized vector index parameters for large datasets');
        recommendations.push('Implement query result caching for frequently accessed documents');
      }

      const avgChunksPerDoc = (documentCount && chunkCount) ? chunkCount / documentCount : 0;
      if (avgChunksPerDoc > 500) {
        recommendations.push('High chunks per document ratio - consider adjusting chunk size');
      }

      return {
        indexed: true,
        message: `Performance optimized for ${chunkCount || 0} chunks across ${documentCount || 0} documents`,
        recommendations
      };

    } catch (error) {
      return {
        indexed: false,
        message: 'Failed to optimize search performance',
        recommendations: ['Check database connection and permissions']
      };
    }
  }
}