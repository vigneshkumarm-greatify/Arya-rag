/**
 * Vector Storage Service
 * 
 * Handles storage of document chunks with vector embeddings in Supabase.
 * Optimized for batch operations and large-scale document collections.
 * 
 * @author ARYA RAG Team
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { 
  DatabaseClient, 
  Database, 
  DocumentChunk as DBDocumentChunk,
  UserDocument,
  InsertDocumentChunk
} from '../../config/database';
import { DocumentChunk } from '@arya-rag/types';
import { ChunkWithEmbedding } from '@arya-rag/types';
// import { getPostgresPool } from '../../config/postgres'; // Not needed - using Supabase client instead

export interface VectorStorageConfig {
  batchSize: number;
  maxRetries: number;
  retryDelayMs: number;
}

export interface StorageResult {
  success: boolean;
  storedCount: number;
  failedCount: number;
  errors?: StorageError[];
  processingTime: number;
}

export interface StorageError {
  chunkIndex: number;
  error: string;
}

export interface DocumentStorageStats {
  documentId: string;
  totalChunks: number;
  storedChunks: number;
  failedChunks: number;
  avgEmbeddingSize: number;
  processingTimeMs: number;
}

export class VectorStorageService {
  private db: SupabaseClient<Database, 'public'>;
  private config: VectorStorageConfig;
  
  constructor(config: Partial<VectorStorageConfig> = {}) {
    this.db = DatabaseClient.getInstance().getClient();
    this.config = {
      batchSize: config.batchSize || 100, // Supabase handles batches well
      maxRetries: config.maxRetries || 3,
      retryDelayMs: config.retryDelayMs || 1000
    };

    console.log('📦 Initialized Vector Storage Service');
    console.log(`   Batch size: ${this.config.batchSize}`);
    console.log(`   Max retries: ${this.config.maxRetries}`);
  }

  /**
   * Store document chunks with embeddings in batches
   * Main entry point for vector storage
   */
  async storeDocumentChunks(
    chunks: ChunkWithEmbedding[],
    documentId: string,
    userId: string,
    embeddingModel: string
  ): Promise<StorageResult> {
    const startTime = Date.now();
    const errors: StorageError[] = [];
    let storedCount = 0;

    console.log(`💾 Storing ${chunks.length} chunks for document ${documentId}`);

    // Validate document exists and belongs to user
    const documentValid = await this.validateDocument(documentId, userId);
    if (!documentValid) {
      return {
        success: false,
        storedCount: 0,
        failedCount: chunks.length,
        errors: [{ chunkIndex: -1, error: 'Invalid document or user mismatch' }],
        processingTime: Date.now() - startTime
      };
    }

    // Process in batches
    const batches = this.createBatches(chunks, this.config.batchSize);
    
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(`   Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} chunks)`);

      try {
        const batchResult = await this.storeBatch(
          batch, 
          documentId, 
          userId, 
          embeddingModel
        );

        storedCount += batchResult.successCount;
        
        // Track errors with proper chunk indices
        batchResult.errors.forEach(error => {
          errors.push({
            chunkIndex: batchIndex * this.config.batchSize + error.index,
            error: error.message
          });
        });

      } catch (error) {
        // Batch failed entirely
        console.error(`Batch ${batchIndex + 1} failed:`, error);
        batch.forEach((_, index) => {
          errors.push({
            chunkIndex: batchIndex * this.config.batchSize + index,
            error: error instanceof Error ? error.message : 'Unknown batch error'
          });
        });
      }
    }

    // Update document stats
    if (storedCount > 0) {
      await this.updateDocumentStats(documentId, storedCount);
    }

    const processingTime = Date.now() - startTime;
    const success = storedCount === chunks.length;

    console.log(`✅ Storage complete for document ${documentId}`);
    console.log(`   Stored: ${storedCount}/${chunks.length} chunks`);
    console.log(`   Failed: ${errors.length} chunks`);
    console.log(`   Time: ${processingTime}ms`);

    return {
      success,
      storedCount,
      failedCount: errors.length,
      errors: errors.length > 0 ? errors : undefined,
      processingTime
    };
  }

  /**
   * Store a single batch of chunks
   */
  private async storeBatch(
    chunks: ChunkWithEmbedding[],
    documentId: string,
    userId: string,
    embeddingModel: string
  ): Promise<{
    successCount: number;
    errors: Array<{ index: number; message: string }>;
  }> {
    const errors: Array<{ index: number; message: string }> = [];
    
    // Convert chunks to database format
    const dbChunks: InsertDocumentChunk[] = chunks.map((chunk, index) => {
      try {
        return this.convertToDBChunk(chunk, documentId, userId, embeddingModel);
      } catch (error) {
        errors.push({
          index,
          message: error instanceof Error ? error.message : 'Conversion error'
        });
        return null!;
      }
    }).filter(chunk => chunk !== null);

    if (dbChunks.length === 0) {
      return { successCount: 0, errors };
    }

    // Attempt to insert with retries
    // NOTE: Using DIRECT PostgreSQL connection to bypass PostgREST entirely
    // This avoids ALL Supabase REST API schema cache issues
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        // Use Supabase client for bulk insert (fallback from direct PostgreSQL)
        // Note: Direct PostgreSQL connection requires SUPABASE_DB_PASSWORD which may not be configured
        
        // Use Supabase client for bulk insert
        const { data, error } = await (this.db as any)
          .from('document_chunks')
          .insert(dbChunks.map(chunk => ({
            chunk_id: chunk.chunk_id,
            document_id: chunk.document_id,
            user_id: chunk.user_id,
            chunk_index: chunk.chunk_index,
            chunk_text: chunk.chunk_text,
            chunk_tokens: chunk.chunk_tokens,
            page_number: chunk.page_number,
            page_position_start: chunk.page_position_start || 0,
            page_position_end: chunk.page_position_end || 0,
            section_title: chunk.section_title,
            embedding: chunk.embedding,
            embedding_model: chunk.embedding_model
          })));
        
        if (error) {
          throw new Error(`Supabase insert failed: ${error.message}`);
        }
        
        return {
          successCount: dbChunks.length,
          errors
        };

      } catch (error) {
        // Properly handle Supabase errors
        let errorMessage = 'Unknown error';
        if (error instanceof Error) {
          errorMessage = error.message;
        } else if (error && typeof error === 'object') {
          // Handle Supabase error objects
          errorMessage = (error as any).message || (error as any).error_description || JSON.stringify(error);
        } else {
          errorMessage = String(error);
        }
        
        console.error(`   ❌ Batch insert error (attempt ${attempt + 1}):`, {
          error: errorMessage,
          fullError: error,
          type: typeof error
        });
        
        lastError = new Error(errorMessage);
        
        if (attempt < this.config.maxRetries) {
          console.warn(`   ⏳ Retrying batch insert (${attempt + 1}/${this.config.maxRetries})...`);
          await this.delay(this.config.retryDelayMs * Math.pow(2, attempt));
        }
      }
    }

    // All retries failed
    throw lastError || new Error('Batch insert failed after all retries');
  }

  /**
   * Convert application chunk to database format
   */
  private convertToDBChunk(
    chunk: ChunkWithEmbedding,
    documentId: string,
    userId: string,
    embeddingModel: string
  ): InsertDocumentChunk {
    // Validate embedding
    if (!chunk.embedding || chunk.embedding.length === 0) {
      throw new Error('Chunk missing embedding');
    }

    // Validate required fields
    if (!chunk.chunkText || chunk.chunkText.trim().length === 0) {
      throw new Error('Chunk missing text content');
    }

    // Generate a unique chunk ID if not provided, or use existing one
    const chunkId = chunk.id || this.generateChunkId(documentId, chunk.chunkIndex);

    // Get dual-layer fields from chunk (with proper typing)
    const chunkAny = chunk as any;
    const chunkLayer = chunkAny.chunkLayer || 'context';
    const parentChunkId = chunkAny.parentChunkId || null;
    const extractedFacts = chunkAny.extractedFacts || [];

    return {
      chunk_id: chunkId,
      document_id: documentId,
      user_id: userId,
      chunk_index: chunk.chunkIndex,
      chunk_text: chunk.chunkText,
      chunk_tokens: chunk.chunkTokens || 0,
      page_number: chunk.pageNumber,
      page_position_start: chunk.pagePositionStart || 0,
      page_position_end: chunk.pagePositionEnd || chunk.chunkText.length,
      section_title: chunk.sectionTitle,
      embedding: chunk.embedding, // Use array directly for pgvector
      embedding_model: embeddingModel,
      // Dual-layer chunking fields (extended fields not in base type)
      chunk_layer: chunkLayer,
      parent_chunk_id: parentChunkId,
      extracted_facts: extractedFacts
    } as InsertDocumentChunk & {
      chunk_layer: string;
      parent_chunk_id: string | null;
      extracted_facts: any[];
    };
  }

  /**
   * Generate a unique chunk ID
   * Uses UUID v4 for unique identification
   */
  private generateChunkId(documentId: string, chunkIndex: number): string {
    // Generate UUID for unique chunk identification
    // Include document ID and chunk index for human readability in logs
    const uuid = randomUUID();
    return `chunk_${uuid}`;
  }

  /**
   * Validate document exists and belongs to user
   */
  private async validateDocument(documentId: string, userId: string): Promise<boolean> {
    try {
      const { data, error } = await this.db
        .from('user_documents')
        .select('document_id, user_id')
        .eq('document_id', documentId)
        .eq('user_id', userId)
        .single();

      console.log(`🔍 Document validation for ${documentId} (user: ${userId}):`, { 
        found: !!data, 
        error: error?.message,
        data: data ? { document_id: (data as any).document_id, user_id: (data as any).user_id } : null
      });

      return !error && data !== null;
    } catch (error) {
      console.error('Document validation error:', error);
      return false;
    }
  }

  /**
   * Update document statistics after chunk storage
   */
  private async updateDocumentStats(documentId: string, chunkCount: number): Promise<void> {
    try {
      const { error } = await (this.db as any)
        .from('user_documents')
        .update({
          total_chunks: chunkCount,
          status: 'completed', // Use the correct column name
          updated_at: new Date().toISOString()
        })
        .eq('document_id', documentId);

      if (error) {
        console.error('Failed to update document stats:', error);
      }
    } catch (error) {
      console.error('Document stats update error:', error);
    }
  }

  /**
   * Delete all chunks for a document
   */
  async deleteDocumentChunks(documentId: string, userId: string): Promise<boolean> {
    try {
      // Validate ownership
      const valid = await this.validateDocument(documentId, userId);
      if (!valid) {
        console.error('Cannot delete chunks: invalid document or user mismatch');
        return false;
      }

      const { error } = await this.db
        .from('document_chunks')
        .delete()
        .eq('document_id', documentId)
        .eq('user_id', userId);

      if (error) {
        console.error('Failed to delete document chunks:', error);
        return false;
      }

      console.log(`🗑️  Deleted all chunks for document ${documentId}`);
      return true;

    } catch (error) {
      console.error('Delete chunks error:', error);
      return false;
    }
  }

  /**
   * Get storage statistics for a document
   */
  async getDocumentStorageStats(documentId: string): Promise<DocumentStorageStats | null> {
    try {
      const { data, error } = await this.db
        .from('document_chunks' as any)
        .select('chunk_tokens, embedding')
        .eq('document_id', documentId);

      if (error || !data) {
        return null;
      }

      const totalChunks = data.length;
      const storedChunks = data.filter((d: any) => d.embedding !== null).length;
      const failedChunks = totalChunks - storedChunks;
      
      // Calculate average embedding size
      const embeddingSizes = data
        .filter((d: any) => d.embedding !== null)
        .map((d: any) => (d.embedding as any).length);
      
      const avgEmbeddingSize = embeddingSizes.length > 0
        ? embeddingSizes.reduce((a, b) => a + b, 0) / embeddingSizes.length
        : 0;

      return {
        documentId,
        totalChunks,
        storedChunks,
        failedChunks,
        avgEmbeddingSize,
        processingTimeMs: 0 // Would need to track this separately
      };

    } catch (error) {
      console.error('Failed to get document storage stats:', error);
      return null;
    }
  }

  /**
   * Verify vector storage integrity
   */
  async verifyStorageIntegrity(documentId: string): Promise<{
    valid: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];

    try {
      // Get all chunks
      const { data: chunks, error } = await this.db
        .from('document_chunks' as any)
        .select('*')
        .eq('document_id', documentId)
        .order('chunk_index');

      if (error || !chunks) {
        issues.push('Failed to retrieve chunks');
        return { valid: false, issues };
      }

      // Check for missing embeddings
      const missingEmbeddings = chunks.filter((c: any) => !c.embedding || c.embedding.length === 0);
      if (missingEmbeddings.length > 0) {
        issues.push(`${missingEmbeddings.length} chunks missing embeddings`);
      }

      // Check for chunk index gaps
      const indices = chunks.map((c: any) => c.chunk_index).sort((a, b) => a - b);
      for (let i = 1; i < indices.length; i++) {
        if (indices[i] !== indices[i-1] + 1) {
          issues.push(`Chunk index gap between ${indices[i-1]} and ${indices[i]}`);
        }
      }

      // Check for duplicate chunks
      const chunkMap = new Map<number, number>();
      chunks.forEach((c: any) => {
        const count = chunkMap.get(c.chunk_index) || 0;
        chunkMap.set(c.chunk_index, count + 1);
      });
      
      chunkMap.forEach((count, index) => {
        if (count > 1) {
          issues.push(`Duplicate chunks found for index ${index}`);
        }
      });

      // Check embedding dimensions consistency
      const embeddingDimensions = new Set(
        chunks
          .filter((c: any) => c.embedding && c.embedding.length > 0)
          .map((c: any) => c.embedding.length)
      );
      
      if (embeddingDimensions.size > 1) {
        issues.push(`Inconsistent embedding dimensions: ${Array.from(embeddingDimensions).join(', ')}`);
      }

      return {
        valid: issues.length === 0,
        issues
      };

    } catch (error) {
      issues.push(`Verification error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return { valid: false, issues };
    }
  }

  /**
   * Create batches from array
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Delay helper for retries
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get storage capacity information
   */
  async getStorageCapacity(userId: string): Promise<{
    documentsCount: number;
    chunksCount: number;
    estimatedVectorsGB: number;
    percentOfLimit: number;
  }> {
    try {
      const { count: documentsCount } = await this.db
        .from('user_documents')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      const { count: chunksCount } = await this.db
        .from('document_chunks')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      // Estimate storage (1536 dimensions * 4 bytes per float * number of chunks)
      const bytesPerVector = 1536 * 4;
      const estimatedBytes = (chunksCount || 0) * bytesPerVector;
      const estimatedGB = estimatedBytes / (1024 * 1024 * 1024);

      // POC limits: 8 documents, ~30k chunks
      const percentOfLimit = Math.max(
        ((documentsCount || 0) / 8) * 100,
        ((chunksCount || 0) / 30000) * 100
      );

      return {
        documentsCount: documentsCount || 0,
        chunksCount: chunksCount || 0,
        estimatedVectorsGB: Number(estimatedGB.toFixed(3)),
        percentOfLimit: Number(percentOfLimit.toFixed(1))
      };

    } catch (error) {
      console.error('Failed to get storage capacity:', error);
      return {
        documentsCount: 0,
        chunksCount: 0,
        estimatedVectorsGB: 0,
        percentOfLimit: 0
      };
    }
  }
}