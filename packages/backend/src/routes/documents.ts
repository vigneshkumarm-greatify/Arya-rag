/**
 * Document Management API Routes
 * 
 * Handles document upload, processing, management, and metadata operations.
 * Provides endpoints for large document collection management with status tracking.
 * 
 * @author ARYA RAG Team
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import { createHash } from 'crypto';
import { 
  asyncHandler, 
  ValidationError, 
  NotFoundError, 
  ConflictError,
  successResponse 
} from '../middleware/errorHandler';
import { validators } from '../middleware/validation';
import { UserDocument, DocumentChunk, ChunkWithEmbedding } from '@arya-rag/types';

const router = Router();

// Services will be initialized lazily like Arya-Chatbot
let documentProcessor: any;
let chunkingService: any;
let embeddingService: any;
let vectorStorageService: any;
let databaseClient: any;
let storageService: any;

// Initialize services lazily to avoid import-time crashes
async function initializeServices() {
  if (!documentProcessor) {
    const { DocumentProcessor } = await import('../services/document/DocumentProcessor');
    const { ChunkingService } = await import('../services/chunking/ChunkingService');
    const { EmbeddingServiceFactory } = await import('../services/embedding/EmbeddingServiceFactory');
    const { VectorStorageService } = await import('../services/vector/VectorStorageService');
    const { DatabaseClient } = await import('../config/database');
    const { StorageService } = await import('../services/storage/StorageService');
    
    documentProcessor = new DocumentProcessor();
    chunkingService = new ChunkingService();
    const embeddingFactory = EmbeddingServiceFactory.getInstance();
    embeddingService = embeddingFactory.createEmbeddingService();
    vectorStorageService = new VectorStorageService();
    databaseClient = DatabaseClient.getInstance();
    storageService = StorageService.getInstance();
  }
}

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE_MB || '100') * 1024 * 1024,
    files: 1
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

/**
 * Upload and process a new document
 * POST /api/documents/upload
 */
router.post('/upload',
  upload.single('document'),
  validators.fileUpload,
  validators.documentUpload,
  validators.uploadRateLimit,
  asyncHandler(async (req: Request, res: Response) => {
    // Initialize services lazily like Arya-Chatbot
    await initializeServices();
    
    const { userId, title, description, tags } = req.body;
    const file = req.file!;

    console.log(`📤 Processing document upload for user: ${userId}`);
    console.log(`   File: ${file.originalname} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);

    // Generate document ID
    const documentId = `doc_${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Calculate file hash for duplicate detection
    const fileHash = createHash('sha256').update(file.buffer).digest('hex');

    const db = databaseClient.getClient();

    // Check for duplicate documents
    const { data: existingDocs, error: duplicateError } = await (db as any)
      .from('user_documents')
      .select('document_id, title')
      .eq('user_id', userId)
      .eq('file_hash', fileHash);

    if (duplicateError) {
      console.warn('⚠️  Database not configured, skipping duplicate check:', duplicateError.message);
      // Continue without duplicate check in development mode
    }

    if (existingDocs && existingDocs.length > 0) {
      throw new ConflictError(
        'Document already exists',
        { 
          existingDocument: existingDocs[0],
          message: 'This file has already been uploaded'
        }
      );
    }

    // Step 1: Upload file to Supabase Storage
    console.log('📤 Uploading file to Supabase Storage...');
    const uploadResult = await storageService.uploadFile(
      file.buffer,
      file.originalname,
      userId,
      file.mimetype
    );

    if (!uploadResult.success) {
      throw new Error(`File storage failed: ${uploadResult.error}`);
    }

    console.log(`✅ File stored at: ${uploadResult.filePath}`);

    // Step 2: Create document record with storage information (using database field names)
    const documentRecord = {
      document_id: documentId,
      user_id: userId,
      filename: file.originalname,
      original_name: file.originalname,
      title: title || file.originalname.replace('.pdf', ''),
      description: description || null,
      mime_type: file.mimetype,
      file_size: file.size,
      file_hash: fileHash,
      uploaded_at: new Date().toISOString(),
      status: 'pending',
      processing_started_at: null,
      processing_completed_at: null,
      total_pages: 0,
      total_chunks: 0,
      embedding_model: process.env.EMBEDDING_MODEL,
      tags: tags || [],
      // Storage information
      storage_path: uploadResult.filePath,
      storage_url: uploadResult.fileUrl,
      file_url: uploadResult.fileUrl
    };

    const { error: insertError } = await (db as any)
      .from('user_documents')
      .insert(documentRecord);

    if (insertError) {
      console.warn('⚠️  Database not configured, simulating document creation:', insertError.message);
      // In development mode without database, return success response
      return res.status(202).json(successResponse(
        {
          documentId,
          status: 'pending',
          message: 'Document uploaded successfully. Database not configured - processing simulation.',
          estimatedProcessingTime: `${Math.ceil(file.size / 1024 / 1024 * 2)} minutes`,
          development: true,
          note: 'Configure SUPABASE_URL and SUPABASE_ANON_KEY to enable full functionality'
        },
        'Document upload initiated (development mode)'
      ));
    }

    // Start background processing using stored file
    console.log(`🚀 UPLOAD COMPLETE - Starting background processing for document: ${documentId}`);
    console.log(`   📁 File path: ${uploadResult.filePath}`);
    console.log(`   👤 User ID: ${userId}`);
    console.log(`   🔧 Embedding model: ${process.env.EMBEDDING_MODEL}`);
    console.log(`   🤖 Embedding provider: ${process.env.EMBEDDING_PROVIDER}`);
    
    // Important: Start background processing immediately (don't await)
    console.log(`🚀 ATTEMPTING to start background processing for: ${documentId}`);
    
    processDocumentInBackground(documentId, userId, uploadResult.filePath!, documentRecord)
      .then(() => {
        console.log(`✅ Background processing completed for: ${documentId}`);
      })
      .catch(backgroundError => {
        console.error(`💥 Background processing failed for ${documentId}:`, backgroundError);
      });
    
    console.log(`🚀 Background processing started (async) for: ${documentId}`);

    // Return immediate response
    res.status(202).json(successResponse(
      {
        documentId,
        status: 'pending',
        message: 'Document uploaded successfully. Processing started in background.',
        estimatedProcessingTime: `${Math.ceil(file.size / 1024 / 1024 * 2)} minutes`
      },
      'Document upload initiated'
    ));
  })
);

/**
 * Get user's documents list
 * GET /api/documents
 */
router.get('/',
  validators.pagination,
  validators.documentSearch,
  asyncHandler(async (req: Request, res: Response) => {
    // Initialize services lazily
    await initializeServices();
    
    const userId = req.query.userId as string;
    const { page, limit } = req.query;
    const { search, status, tags, sortBy, sortOrder } = req.query;

    if (!userId) {
      throw new ValidationError('userId query parameter is required');
    }

    console.log(`📄 Fetching documents for user: ${userId}`);

    const db = databaseClient.getClient();
    
    let query = (db as any).from('user_documents').select('*').eq('user_id', userId);

    // Apply filters
    if (search) {
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%,filename.ilike.%${search}%`);
    }

    if (status) {
      query = query.eq('status', status);
    }

    if (tags && Array.isArray(tags) && tags.length > 0) {
      query = query.contains('tags', tags);
    }

    // Apply sorting
    const sortField = (sortBy as string) || 'created_at';
    const order = (sortOrder as string) === 'asc' ? 'asc' : 'desc';
    query = query.order(sortField, { ascending: order === 'asc' });

    // Apply pagination
    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 20;
    const offset = (pageNum - 1) * limitNum;

    query = query.range(offset, offset + limitNum - 1);

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Failed to fetch documents: ${error.message}`);
    }

    // Get total count for pagination
    const { count: totalCount, error: countError } = await (db as any)
      .from('user_documents')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (countError) {
      console.warn('Failed to get total count:', countError.message);
    }

    const totalPages = Math.ceil((totalCount || data?.length || 0) / limitNum);

    res.json(successResponse(
      data || [],
      `Found ${data?.length || 0} documents`,
      {
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalItems: totalCount || data?.length || 0,
          itemsPerPage: limitNum,
          hasNext: pageNum < totalPages,
          hasPrev: pageNum > 1
        },
        filters: { search, status, tags, sortBy, sortOrder }
      }
    ));
  })
);

/**
 * Get document details and status
 * GET /api/documents/:documentId
 */
router.get('/:documentId',
  validators.documentId,
  asyncHandler(async (req: Request, res: Response) => {
    // Initialize services lazily
    await initializeServices();
    
    const { documentId } = req.params;
    const userId = req.query.userId as string;

    if (!userId) {
      throw new ValidationError('userId query parameter is required');
    }

    console.log(`📄 Fetching document details: ${documentId}`);

    const db = databaseClient.getClient();

    const { data, error } = await (db as any)
      .from('user_documents')
      .select('*')
      .eq('document_id', documentId)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new NotFoundError('Document', documentId);
      }
      throw new Error(`Failed to fetch document: ${error.message}`);
    }

    // Get chunk count and processing stats
    const { count: chunkCount, error: chunkError } = await (db as any)
      .from('document_chunks')
      .select('*', { count: 'exact', head: true })
      .eq('document_id', documentId);

    if (chunkError) {
      console.warn('Failed to get chunk count:', chunkError.message);
    }

    const documentWithStats = {
      ...data,
      totalChunks: chunkCount || 0,
      processingProgress: calculateProcessingProgress(data)
    };

    res.json(successResponse(
      documentWithStats,
      'Document details retrieved'
    ));
  })
);

/**
 * Get document processing status
 * GET /api/documents/:documentId/status
 */
router.get('/:documentId/status',
  validators.documentId,
  asyncHandler(async (req: Request, res: Response) => {
    // Initialize services lazily
    await initializeServices();
    
    const { documentId } = req.params;
    const userId = req.query.userId as string;

    if (!userId) {
      throw new ValidationError('userId query parameter is required');
    }

    const db = databaseClient.getClient();

    const { data, error } = await (db as any)
      .from('user_documents')
      .select('status, processing_started_at, processing_completed_at, error_message, total_pages, total_chunks, processing_stage')
      .eq('document_id', documentId)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new NotFoundError('Document', documentId);
      }
      throw new Error(`Failed to fetch document status: ${error.message}`);
    }

    const status = {
      documentId,
      status: data.status,
      processingStartedAt: data.processing_started_at,
      processingCompletedAt: data.processing_completed_at,
      errorMessage: data.error_message,
      totalPages: data.total_pages || 0,
      totalChunks: data.total_chunks || 0,
      progress: calculateProcessingProgress(data)
    };

    res.json(successResponse(status, 'Document status retrieved'));
  })
);

/**
 * Delete a document
 * DELETE /api/documents/:documentId
 */
router.delete('/:documentId',
  validators.documentId,
  asyncHandler(async (req: Request, res: Response) => {
    // Initialize services lazily
    await initializeServices();
    
    const { documentId } = req.params;
    const userId = req.query.userId as string;

    if (!userId) {
      throw new ValidationError('userId query parameter is required');
    }

    console.log(`🗑️ Deleting document: ${documentId}`);

    const db = databaseClient.getClient();

    // Check if document exists and belongs to user
    const { data: doc, error: fetchError } = await (db as any)
      .from('user_documents')
      .select('document_id, storage_path')
      .eq('document_id', documentId)
      .eq('user_id', userId)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        throw new NotFoundError('Document', documentId);
      }
      throw new Error(`Failed to fetch document: ${fetchError.message}`);
    }

    // Delete document chunks first (foreign key constraint)
    const { error: chunksError } = await (db as any)
      .from('document_chunks')
      .delete()
      .eq('document_id', documentId);

    if (chunksError) {
      console.warn('Failed to delete document chunks:', chunksError.message);
    }

    // Delete document record
    const { error: deleteError } = await (db as any)
      .from('user_documents')
      .delete()
      .eq('document_id', documentId)
      .eq('user_id', userId);

    if (deleteError) {
      throw new Error(`Failed to delete document: ${deleteError.message}`);
    }

    // Delete file from Supabase Storage
    if (doc.storage_path) {
      console.log(`🗑️ Deleting file from storage: ${doc.storage_path}`);
      const storageDeleteResult = await storageService.deleteFile(doc.storage_path);
      
      if (!storageDeleteResult.success) {
        console.warn('⚠️  Failed to delete file from storage:', storageDeleteResult.error);
        // Don't fail the whole operation if storage deletion fails
      } else {
        console.log(`✅ File deleted from storage: ${doc.storage_path}`);
      }
    }

    res.json(successResponse(
      { documentId, deleted: true, storageDeleted: !!doc.storage_path },
      'Document deleted successfully'
    ));
  })
);

/**
 * Download a document file
 * GET /api/documents/:documentId/download
 */
router.get('/:documentId/download',
  validators.documentId,
  asyncHandler(async (req: Request, res: Response) => {
    // Initialize services lazily
    await initializeServices();
    
    const { documentId } = req.params;
    const userId = req.query.userId as string;

    if (!userId) {
      throw new ValidationError('userId query parameter is required');
    }

    console.log(`📥 Downloading document: ${documentId}`);

    const db = databaseClient.getClient();

    // Get document info and verify ownership
    const { data: doc, error: docError } = await (db as any)
      .from('user_documents')
      .select('document_id, filename, original_name, storage_path, mime_type, file_size')
      .eq('document_id', documentId)
      .eq('user_id', userId)
      .single();

    if (docError) {
      if (docError.code === 'PGRST116') {
        throw new NotFoundError('Document', documentId);
      }
      throw new Error(`Failed to fetch document: ${docError.message}`);
    }

    if (!doc.storage_path) {
      throw new Error('Document file not found in storage');
    }

    // Download file from Supabase Storage
    const downloadResult = await storageService.downloadFile(doc.storage_path);

    if (!downloadResult.success || !downloadResult.buffer) {
      throw new Error(`Failed to download file: ${downloadResult.error}`);
    }

    // Set appropriate headers for file download
    res.setHeader('Content-Type', doc.mime_type || 'application/pdf');
    res.setHeader('Content-Length', downloadResult.buffer.length);
    res.setHeader('Content-Disposition', `attachment; filename="${doc.original_name}"`);
    res.setHeader('Cache-Control', 'private, max-age=3600'); // Cache for 1 hour

    console.log(`✅ Downloaded document: ${documentId} (${downloadResult.buffer.length} bytes)`);

    // Send file buffer
    res.send(downloadResult.buffer);
  })
);

/**
 * Get document chunks (for debugging/inspection)
 * GET /api/documents/:documentId/chunks
 */
router.get('/:documentId/chunks',
  validators.documentId,
  validators.pagination,
  asyncHandler(async (req: Request, res: Response) => {
    const { documentId } = req.params;
    const userId = req.query.userId as string;
    const { page, limit } = req.query;

    if (!userId) {
      throw new ValidationError('userId query parameter is required');
    }

    const db = databaseClient.getClient();

    // Verify document ownership
    const { data: doc, error: docError } = await (db as any)
      .from('user_documents')
      .select('document_id')
      .eq('document_id', documentId)
      .eq('user_id', userId)
      .single();

    if (docError) {
      if (docError.code === 'PGRST116') {
        throw new NotFoundError('Document', documentId);
      }
      throw new Error(`Failed to verify document: ${docError.message}`);
    }

    // Get chunks with pagination
    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 20;
    const offset = (pageNum - 1) * limitNum;

    const { data: chunks, error: chunksError, count } = await (db as any)
      .from('document_chunks')
      .select('chunk_id, chunk_text, page_number, section_title, chunk_tokens, chunk_index')
      .eq('document_id', documentId)
      .order('chunk_index')
      .range(offset, offset + limitNum - 1);

    if (chunksError) {
      throw new Error(`Failed to fetch chunks: ${chunksError.message}`);
    }

    const totalPages = Math.ceil((count || 0) / limitNum);

    res.json(successResponse(
      chunks || [],
      `Retrieved ${chunks?.length || 0} chunks`,
      {
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalItems: count || 0,
          itemsPerPage: limitNum
        }
      }
    ));
  })
);

/**
 * Background document processing function
 */
async function processDocumentInBackground(
  documentId: string,
  userId: string,
  storagePath: string,
  documentRecord: Partial<UserDocument>
): Promise<void> {
  console.log(`🔄 BACKGROUND PROCESSING STARTED for document: ${documentId}`);
  console.log(`   📋 Document record:`, JSON.stringify(documentRecord, null, 2));
  console.log(`   🗂️  Storage path: ${storagePath}`);
  console.log(`   👤 User ID: ${userId}`);
  
  // Import services dynamically to avoid initialization issues
  const { DatabaseClient } = await import('../config/database');
  const { StorageService } = await import('../services/storage/StorageService');
  const { EmbeddingServiceFactory } = await import('../services/embedding/EmbeddingServiceFactory');
  
  const db = DatabaseClient.getInstance().getClient();
  const storage = StorageService.getInstance();

  try {
    console.log(`✅ Database and storage instances created successfully`);

    // Update status to processing with initial stage
    console.log(`📝 STEP 1: Updating document status to processing with downloading stage`);
    const statusUpdateResult = await (db as any)
      .from('user_documents')
      .update({
        status: 'processing',
        processing_started_at: new Date(),
        processing_stage: 'downloading'
      })
      .eq('document_id', documentId);
      
    if (statusUpdateResult.error) {
      throw new Error(`Failed to update document status: ${statusUpdateResult.error.message}`);
    }
    console.log(`✅ Status updated to processing/downloading`);

    // Step 1: Download file from storage
    console.log(`📥 STEP 2: Downloading file from storage: ${storagePath}`);
    console.log(`   🔍 Storage service instance:`, !!storage);
    
    const downloadResult = await storage.downloadFile(storagePath);
    console.log(`📥 Download result:`, {
      success: downloadResult.success,
      hasBuffer: !!downloadResult.buffer,
      bufferLength: downloadResult.buffer?.length || 0,
      error: downloadResult.error
    });
    
    if (!downloadResult.success || !downloadResult.buffer) {
      throw new Error(`Failed to download file from storage: ${downloadResult.error}`);
    }

    console.log(`✅ File downloaded successfully: ${downloadResult.buffer.length} bytes`);

    // Update stage to extracting
    console.log(`📝 STEP 3: Updating stage to extracting`);
    const extractingUpdate = await (db as any)
      .from('user_documents')
      .update({
        processing_stage: 'extracting'
      })
      .eq('document_id', documentId);
      
    if (extractingUpdate.error) {
      console.warn(`⚠️  Failed to update stage to extracting: ${extractingUpdate.error.message}`);
    }

    // Step 2: Extract text from PDF
    console.log(`📄 STEP 4: Starting PDF text extraction`);
    console.log(`   📁 Filename: ${documentRecord.filename}`);
    console.log(`   📊 Buffer size: ${downloadResult.buffer.length} bytes`);
    
    const { DocumentProcessor } = await import('../services/document/DocumentProcessor');
    const documentProcessor = new DocumentProcessor();
    console.log(`   🔍 Document processor created:`, !!documentProcessor);
    
    const extractionResult = await documentProcessor.extractPagesFromBuffer(
      downloadResult.buffer,
      documentRecord.filename!
    );
    
    console.log(`📄 Extraction result:`, {
      success: extractionResult.success,
      pagesCount: extractionResult.pages?.length || 0,
      error: extractionResult.error,
      hasPages: !!extractionResult.pages
    });

    if (!extractionResult.success) {
      throw new Error(`Text extraction failed: ${extractionResult.error}`);
    }

    console.log(`✅ Text extraction successful: ${extractionResult.pages.length} pages extracted`);

    // Update stage to chunking
    await (db as any)
      .from('user_documents')
      .update({
        processing_stage: 'chunking'
      })
      .eq('document_id', documentId);

    // Step 3: Chunk the document with DUAL-LAYER chunking
    console.log(`📝 STEP 5: Starting DUAL-LAYER chunking (context + detail chunks)`);
    const { ChunkingService } = await import('../services/chunking/ChunkingService');
    const chunkingService = new ChunkingService();
    
    // Use dual-layer chunking for minute details retrieval
    const chunkingResult = await chunkingService.processPagesWithDualLayer(
      extractionResult.pages,
      documentId,
      {
        chunkSizeTokens: parseInt(process.env.CHUNK_SIZE_TOKENS || '600'),
        chunkOverlapTokens: parseInt(process.env.CHUNK_OVERLAP_TOKENS || '100'),
        preservePageBoundaries: true,
        dualLayer: true,
        detailChunkSize: 200,
        detailChunkOverlap: 50,
        extractFacts: true
      }
    );

    console.log(`✂️  Dual-layer chunking result:`, {
      totalChunks: chunkingResult.totalChunks,
      contextChunks: chunkingResult.contextChunks?.length || 0,
      detailChunks: chunkingResult.detailChunks?.length || 0,
      extractedFacts: chunkingResult.extractedFacts?.size || 0,
      totalTokens: chunkingResult.totalTokens,
      processingTime: chunkingResult.processingTime
    });

    if (!chunkingResult.chunks || chunkingResult.chunks.length === 0) {
      throw new Error(`Chunking failed: No chunks generated`);
    }

    console.log(`✂️  Created ${chunkingResult.chunks.length} chunks for ${documentId}`);

    // Update stage to embedding
    await (db as any)
      .from('user_documents')
      .update({
        processing_stage: 'embedding'
      })
      .eq('document_id', documentId);

    // Step 4: Generate embeddings
    const embeddingFactory = EmbeddingServiceFactory.getInstance();
    const embeddingService = embeddingFactory.createEmbeddingService();

    const chunksWithEmbeddings: ChunkWithEmbedding[] = [];

    // Process chunks in batches to avoid overwhelming the embedding service
    const batchSize = parseInt(process.env.EMBEDDING_BATCH_SIZE || '50');
    
    for (let i = 0; i < chunkingResult.chunks.length; i += batchSize) {
      const batch = chunkingResult.chunks.slice(i, i + batchSize);
      console.log(`🧠 Generating embeddings for batch ${Math.floor(i / batchSize) + 1} (${batch.length} chunks)`);

      const batchEmbeddings = await Promise.all(
        batch.map(async (chunk: any) => {
          const embeddingResponse = await embeddingService.generateEmbedding({
            text: chunk.chunkText,
            metadata: {
              documentId: chunk.documentId,
              chunkId: chunk.id,
              pageNumber: chunk.pageNumber,
              chunkLayer: chunk.chunkLayer || 'context'
            }
          });

          // Get extracted facts for this chunk if available
          const chunkFacts = chunkingResult.extractedFacts?.get(chunk.id) || [];

          return {
            ...chunk,
            embedding: embeddingResponse.embedding,
            chunkLayer: chunk.chunkLayer || 'context',
            parentChunkId: chunk.parentChunkId || null,
            extractedFacts: chunkFacts
          };
        })
      );

      chunksWithEmbeddings.push(...batchEmbeddings);
    }

    console.log(`✨ Generated embeddings for ${chunksWithEmbeddings.length} chunks`);

    // Update stage to storing
    await (db as any)
      .from('user_documents')
      .update({
        processing_stage: 'storing'
      })
      .eq('document_id', documentId);

    // Step 5: Store in vector database
    // Get the actual model name from the first embedding response
    const actualModelName = chunksWithEmbeddings.length > 0 && chunksWithEmbeddings[0].embeddingResponse?.model 
      ? chunksWithEmbeddings[0].embeddingResponse.model 
      : process.env.EMBEDDING_MODEL;
    
    console.log(`🤖 Storing with embedding model: ${actualModelName}`);
    
    const { VectorStorageService } = await import('../services/vector/VectorStorageService');
    const vectorStorage = new VectorStorageService();
    console.log(`💾 STEP 6: Attempting to store chunks in vector database`);
    console.log(`   📊 Chunks to store: ${chunksWithEmbeddings.length}`);
    console.log(`   👤 User ID: ${userId}`);
    console.log(`   📄 Document ID: ${documentId}`);
    console.log(`   🤖 Embedding model: ${actualModelName}`);
    
    const storageResult = await vectorStorage.storeDocumentChunks(
      chunksWithEmbeddings,
      documentId,
      userId,
      actualModelName
    );

    console.log(`💾 Vector storage result:`, {
      success: storageResult.success,
      storedCount: storageResult.storedCount,
      failedCount: storageResult.failedCount,
      errors: storageResult.errors,
      processingTime: storageResult.processingTime
    });

    if (!storageResult.success) {
      const errorMessage = storageResult.errors && storageResult.errors.length > 0 
        ? storageResult.errors[0].error 
        : 'Unknown storage error';
      throw new Error(`Vector storage failed: ${errorMessage}`);
    }

    console.log(`💾 Stored ${storageResult.storedCount} chunks in vector database`);

    // Update document status to completed
    await (db as any)
      .from('user_documents')
      .update({
        status: 'completed',
        processing_completed_at: new Date(),
        total_pages: extractionResult.pages.length,
        total_chunks: chunkingResult.chunks.length
      })
      .eq('document_id', documentId);

    console.log(`✅ Document processing completed: ${documentId}`);

  } catch (error) {
    console.error(`💥 CRITICAL ERROR - Document processing failed for ${documentId}:`, {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : 'No stack trace',
      documentId,
      userId,
      storagePath
    });

    // Get the current processing stage to show where it failed
    try {
      const { data: currentDoc } = await (db as any)
        .from('user_documents')
        .select('processing_stage')
        .eq('document_id', documentId)
        .single();

      const currentStage = currentDoc?.processing_stage || 'unknown';
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const stageMessage = `Failed during ${currentStage}: ${errorMessage}`;

      console.log(`📝 Updating document status to failed at stage: ${currentStage}`);
      
      // Update document status to failed with stage info
      const failedUpdate = await (db as any)
        .from('user_documents')
        .update({
          status: 'failed',
          error_message: stageMessage,
          processing_stage: `failed_${currentStage}`
        })
        .eq('document_id', documentId);
        
      if (failedUpdate.error) {
        console.error(`💥 Failed to update document status to failed: ${failedUpdate.error.message}`);
      } else {
        console.log(`✅ Document status updated to failed`);
      }
    } catch (updateError) {
      console.error(`💥 Error updating failed status: ${updateError instanceof Error ? updateError.message : 'Unknown error'}`);
    }
  }
}

/**
 * Calculate processing progress percentage
 */
function calculateProcessingProgress(document: any): {
  percentage: number;
  stage: string;
  message: string;
} {
  if (document.status === 'completed') {
    return {
      percentage: 100,
      stage: 'completed',
      message: 'Document ready for queries'
    };
  }
  
  if (document.status === 'failed') {
    return {
      percentage: 0,
      stage: document.processing_stage || 'failed',
      message: document.error_message || 'Processing failed'
    };
  }
  
  if (document.status === 'pending') {
    return {
      percentage: 0,
      stage: 'queued',
      message: 'Document queued for processing'
    };
  }
  
  // Processing status with detailed stages
  if (document.status === 'processing') {
    const stage = document.processing_stage;
    
    switch (stage) {
      case 'downloading':
        return {
          percentage: 10,
          stage: 'downloading',
          message: 'Downloading file from storage'
        };
      case 'extracting':
        return {
          percentage: 30,
          stage: 'extracting',
          message: 'Extracting text from PDF'
        };
      case 'chunking':
        return {
          percentage: 50,
          stage: 'chunking',
          message: 'Breaking document into chunks'
        };
      case 'embedding':
        return {
          percentage: 70,
          stage: 'embedding',
          message: 'Generating embeddings'
        };
      case 'storing':
        return {
          percentage: 90,
          stage: 'storing',
          message: 'Storing in vector database'
        };
      default:
        return {
          percentage: 50,
          stage: 'processing',
          message: 'Processing document'
        };
    }
  }
  
  return {
    percentage: 0,
    stage: 'unknown',
    message: 'Unknown status'
  };
}

export default router;