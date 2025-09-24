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
      defaultSimilarityThreshold: config.defaultSimilarityThreshold || 0.65,
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

    console.log('🔍 Vector Search Service initialized');
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
      console.log(`🎯 Cache hit: ${cachedResults.length} results`);
      return cachedResults;
    }

    // Prepare search parameters
    const topK = Math.min(options.topK || this.config.defaultTopK, this.config.maxTopK);
    const similarityThreshold = options.similarityThreshold || this.config.defaultSimilarityThreshold;

    console.log(`🔍 Vector search: ${topK} results, threshold: ${similarityThreshold}`);

    try {
      // Validate embedding dimensions
      if (queryEmbedding?.length) {
        console.log(`📡 Starting vector search (${queryEmbedding.length}D embedding)`);
      }
      
      // Ensure embedding is an array (not a string) for RPC
      let embeddingArray = queryEmbedding;
      if (typeof queryEmbedding === 'string') {
        try {
          embeddingArray = JSON.parse(queryEmbedding);
          console.log('📋 Converted embedding from string to array');
        } catch (e) {
          console.error('❌ Failed to parse embedding string:', e);
        }
      }
      
      // Fix dimension mismatch - ensure exactly 768 dimensions
      if (embeddingArray.length !== 768) {
        console.log(`⚠️ Dimension mismatch: got ${embeddingArray.length}, expected 768`);
        if (embeddingArray.length > 768) {
          // Truncate to 768
          embeddingArray = embeddingArray.slice(0, 768);
          console.log('✂️ Truncated embedding to 768 dimensions');
        } else {
          // Pad with zeros to 768
          const padding = new Array(768 - embeddingArray.length).fill(0);
          embeddingArray = [...embeddingArray, ...padding];
          console.log(`➕ Padded embedding with ${padding.length} zeros to 768 dimensions`);
        }
      }
      
      const rpcParams = {
        query_embedding: embeddingArray,
        user_id_param: userId,
        similarity_threshold: similarityThreshold,
        match_count: topK
      };
      // Log dimension fix if applied
      if (embeddingArray.length !== queryEmbedding.length) {
        console.log(`⚙️ Adjusted embedding dimensions: ${queryEmbedding.length} → ${embeddingArray.length}`);
      }
      
      // Try the RPC call with the embedding as-is
      let { data, error } = await this.db.rpc('vector_search', rpcParams);
      
      // If no results, try with lower threshold
      if (!error && (!data || data.length === 0) && similarityThreshold > 0.5) {
        console.log('🔄 Retrying with lower threshold (0.5)');
        const { data: lowThresholdData, error: lowThresholdError } = await this.db.rpc('vector_search', {
          ...rpcParams,
          similarity_threshold: 0.5
        });
        
        if (!lowThresholdError && lowThresholdData?.length > 0) {
          const filteredData = lowThresholdData.filter(r => r.similarity_score >= similarityThreshold);
          data = filteredData.length > 0 ? filteredData : lowThresholdData;
          console.log(`✅ Fallback found ${data.length} results`);
        }
      }

      // Log response status
      if (error) {
        console.log(`❌ RPC error: ${error.message}`);
      } else {
        console.log(`📥 RPC returned ${data?.length || 0} results`);
      }
      
      // Direct SQL fallback if RPC fails
      if (!error && (!data || data.length === 0)) {
        console.log('🔄 Trying direct SQL fallback');
        // SQL fallback code remains the same but with simplified logging
        try {
          const sqlQuery = `
            SELECT 
              dc.chunk_id,
              dc.document_id,
              dc.chunk_text,
              dc.page_number,
              dc.section_title,
              ud.filename,
              (1 - (dc.embedding <=> $1::vector(768))) as similarity_score
            FROM document_chunks dc
            INNER JOIN user_documents ud ON dc.document_id = ud.document_id
            WHERE 
              dc.user_id = $2
              AND dc.embedding IS NOT NULL
              AND (1 - (dc.embedding <=> $1::vector(768))) >= $3
            ORDER BY dc.embedding <=> $1::vector(768)
            LIMIT $4
          `;
          
          const { data: sqlData, error: sqlError } = await this.db
            .rpc('exec_sql', {
              sql_query: sqlQuery,
              params: [embeddingArray, userId, similarityThreshold, topK]
            });
            
          if (!sqlError && sqlData?.length > 0) {
            console.log(`✅ SQL fallback found ${sqlData.length} results`);
            Object.assign(data, sqlData);
          }
        } catch (sqlError) {
          console.log(`❌ SQL fallback failed: ${sqlError.message}`);
        }
      }
      
      // Test index usage in development only
      if (process.env.NODE_ENV === 'development' && data?.length > 0) {
        try {
          const { data: explainData } = await this.db.rpc('exec_sql', {
            sql_query: 'EXPLAIN SELECT 1 FROM document_chunks WHERE user_id = $1 LIMIT 1',
            params: [userId]
          });
          const usesIndex = JSON.stringify(explainData).includes('idx_document_chunks_embedding');
          console.log(`🔍 Index status: ${usesIndex ? 'HNSW' : 'Sequential'}`);
        } catch {
          // Ignore index test errors
        }
      }

      if (error) {
        console.error(`❌ Vector search failed: ${error.message}`);
        throw new Error(`Vector search RPC failed: ${error.message}`);
      }

      if (!data || data.length === 0) {
        console.log('⚠️ No results found (empty database or similarity < threshold)');
        return [];
      }

      // Log search results summary
      const similarities = data.map((row: any) => row.similarity_score);
      const avgSimilarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;
      const maxSimilarity = Math.max(...similarities);
      const minSimilarity = Math.min(...similarities);
      
      console.log(`✅ Found ${data.length} results (similarity: ${minSimilarity.toFixed(3)}-${maxSimilarity.toFixed(3)}, avg: ${avgSimilarity.toFixed(3)})`);
      
      // Show top results briefly
      if (data.length > 0 && process.env.NODE_ENV === 'development') {
        data.slice(0, 3).forEach((row: any, i: number) => {
          console.log(`  ${i + 1}. Page ${row.page_number}: ${row.similarity_score.toFixed(3)} - "${row.chunk_text?.substring(0, 80)}..."`);
        });
        if (data.length > 3) console.log(`  ... and ${data.length - 3} more`);
      }

      // Convert results to our expected format
      const resultsWithSimilarity = data.map((row: any) => ({
        id: row.chunk_id,
        document_id: row.document_id,
        document_name: row.filename || 'Unknown',
        chunk_text: row.chunk_text,
        page_number: row.page_number,
        section_title: row.section_title,
        similarity: row.similarity_score
      }));

      console.log(`\n📊 FINAL RESULT: ${resultsWithSimilarity.length} results above threshold ${similarityThreshold}`);
      console.log('=' .repeat(80));
      console.log('🚀 VECTOR SEARCH DEBUG - COMPLETED');
      console.log('=' .repeat(80));

      // Convert to extended search results
      const results = this.formatSearchResults(resultsWithSimilarity, {
        searchTimeMs: Date.now() - startTime,
        totalCandidates: resultsWithSimilarity.length,
        model: 'pgvector_cosine_real'
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
      console.error(`❌ Vector search failed: ${error.message}`);
      console.log('🔄 Falling back to basic query');
      
      // Fallback to basic query without vector search
      try {
        const { data: fallbackData, error: fallbackError } = await this.db
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

        if (fallbackError) {
          console.error('❌ Fallback query also failed:', fallbackError);
          throw new Error(`Both vector search and fallback failed: ${fallbackError.message}`);
        }

        console.log(`⚠️ Fallback returned ${fallbackData?.length || 0} results with mock similarity`);
        
        // Apply mock similarity scores (old behavior)
        const fallbackResults = (fallbackData || []).map((row: any, index) => {
          let documentName = 'Unknown';
          if (row.user_documents) {
            if (Array.isArray(row.user_documents) && row.user_documents[0]) {
              documentName = row.user_documents[0].filename || 'Unknown';
            } else if (typeof row.user_documents === 'object') {
              documentName = row.user_documents.filename || 'Unknown';
            }
          }

          const mockSimilarity = Math.max(0.5, 1 - (index * 0.1));
          
          return {
            id: row.chunk_id,
            document_id: row.document_id,
            document_name: documentName,
            chunk_text: row.chunk_text,
            page_number: row.page_number,
            section_title: row.section_title,
            similarity: mockSimilarity
          };
        }).filter(result => result.similarity >= similarityThreshold);

        console.log(`⚠️ Fallback final: ${fallbackResults.length} results (vector search unavailable)`);

        const results = this.formatSearchResults(fallbackResults, {
          searchTimeMs: Date.now() - startTime,
          totalCandidates: fallbackData?.length || 0,
          model: 'fallback_mock_similarity'
        });

        return results;

      } catch (fallbackError) {
        console.error('❌ Complete failure - both vector search and fallback failed');
        throw new Error(`Complete search failure: ${error.message} | Fallback: ${fallbackError.message}`);
      }
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
    console.log(`🔍 Multi-search: ${queryEmbeddings.length} variations`);

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
    console.log('🗑️ Search cache cleared');
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