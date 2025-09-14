// ARYA-RAG Shared Types

// Document Types
export interface DocumentUpload {
  id: string;
  userId: string;
  documentName: string;
  fileHash: string;
  totalPages: number;
  totalChunks: number;
  fileSizeBytes: number;
  processingStatus: 'pending' | 'processing' | 'completed' | 'failed';
  uploadDate: string;
  processingTimeSeconds?: number;
  metadata?: Record<string, any>;
}

export interface UserDocument {
  documentId: string;
  userId: string;
  filename: string;
  originalName: string;
  title?: string;
  description?: string;
  mimeType: string;
  fileSize: number;
  fileHash: string;
  uploadedAt: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  processingStartedAt?: string | null;
  processingCompletedAt?: string | null;
  totalPages: number;
  totalChunks: number;
  embeddingModel: string;
  errorMessage?: string;
  tags?: string[];
  // Storage fields for Supabase Storage integration
  storagePath?: string;
  storageUrl?: string;
  fileUrl?: string;
}

export interface DocumentChunk {
  id: string;
  documentId: string;
  userId: string;
  chunkIndex: number;
  chunkText: string;
  chunkTokens: number;
  pageNumber: number;
  pagePositionStart: number;
  pagePositionEnd: number;
  sectionTitle?: string;
  embedding?: number[];
  embeddingModel: string;
  createdAt: string;
}

// Processing Types
export interface PageContent {
  pageNumber: number;
  text: string;
  sectionTitle?: string;
}

export interface ChunkWithEmbedding extends DocumentChunk {
  embedding: number[];
}

// Search Types
export interface SearchParams {
  userId: string;
  query: string;
  documentIds?: string[];
  topK?: number;
  minSimilarity?: number;
}

export interface SearchResult {
  chunkId: string;
  documentId: string;
  documentName: string;
  pageNumber: number;
  chunkText: string;
  similarityScore: number;
  sectionTitle?: string;
}

// RAG Types
export interface RAGQueryParams {
  userId: string;
  question: string;
  maxSources?: number;
  includePageContent?: boolean;
  options?: {
    documentIds?: string[];
    maxSources?: number;
    includeExcerpts?: boolean;
    minConfidence?: number;
  };
}

export interface RAGRequest {
  query: string;
  userId: string;
  documentIds?: string[];
  maxResults?: number;
  responseStyle?: 'detailed' | 'concise';
}

export interface SourceReference {
  documentId: string;
  documentName: string;
  pageNumber: number;
  chunkId: string;
  excerpt: string;
  confidence: number;
  sectionTitle?: string;
}

export interface DocumentSource {
  documentName: string;
  pageNumber: number;
  excerpt: string;
  confidence: number;
  sectionTitle?: string;
}

export interface RAGResponse {
  answer: string;
  sources: DocumentSource[];
  confidence: number;
  responseTime: number;
  totalSourcesFound?: number;
  processingTime?: number;
  metadata?: {
    searchTime?: number;
    generationTime?: number;
    totalChunksSearched?: number;
    model?: string;
    [key: string]: any;
  };
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface DocumentUploadResponse {
  success: boolean;
  documents: Array<{
    id: string;
    name: string;
    pages: number;
    status: 'processing' | 'completed';
    estimatedTime?: number;
  }>;
}

export interface DocumentListResponse {
  documents: Array<{
    id: string;
    name: string;
    totalPages: number;
    totalChunks: number;
    uploadDate: string;
    status: string;
  }>;
  totalDocuments: number;
  totalPages: number;
  totalChunks: number;
}

export interface ProcessingStatusResponse {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: {
    percentage: number;
    stage: string;
    message: string;
  };
  processingStartedAt?: string;
  processingCompletedAt?: string;
  errorMessage?: string;
  totalPages?: number;
  totalChunks?: number;
}

// Configuration Types
export interface EmbeddingConfig {
  provider: 'ollama' | 'openai';
  model: string;
  dimensions: number;
  baseUrl?: string;
  apiKey?: string;
}

export interface LLMConfig {
  provider: 'ollama' | 'openai';
  model: string;
  temperature: number;
  maxTokens: number;
  baseUrl?: string;
  apiKey?: string;
}

export interface ProcessingConfig {
  chunkSize: number;
  chunkOverlap: number;
  maxBatchSize: number;
  timeoutMinutes: number;
  maxFileSizeMB: number;
}

// Service Interfaces
export interface IEmbeddingService {
  generateEmbedding(text: string): Promise<number[]>;
  generateBatchEmbeddings(texts: string[]): Promise<number[][]>;
  getDimensions(): number;
  getModelName(): string;
}

export interface IChunkingService {
  chunkDocument(content: string, options?: ChunkOptions): Promise<DocumentChunk[]>;
  chunkPDF(buffer: Buffer): Promise<DocumentChunk[]>;
  chunkByPages(pages: PageContent[]): DocumentChunk[];
}

export interface ChunkOptions {
  maxTokens?: number;
  overlapTokens?: number;
  preserveBoundaries?: boolean;
  minTokens?: number;
}

export interface IVectorSearchService {
  search(params: SearchParams): Promise<SearchResult[]>;
  upsert(chunks: ChunkWithEmbedding[]): Promise<void>;
  delete(documentId: string): Promise<void>;
}

export interface ILLMService {
  generateResponse(params: {
    systemPrompt: string;
    context: string;
    query: string;
    temperature?: number;
  }): Promise<{
    content: string;
    tokensUsed: number;
  }>;
}

export interface IRAGService {
  processQuery(params: RAGQueryParams): Promise<RAGResponse>;
  addDocument(userId: string, document: Buffer, name: string): Promise<DocumentUpload>;
  removeDocument(userId: string, documentId: string): Promise<void>;
  listDocuments(userId: string): Promise<DocumentUpload[]>;
}

// Error Types
export enum ErrorCode {
  INVALID_INPUT = 'INVALID_INPUT',
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  UNSUPPORTED_FORMAT = 'UNSUPPORTED_FORMAT',
  PROCESSING_FAILED = 'PROCESSING_FAILED',
  EMBEDDING_FAILED = 'EMBEDDING_FAILED',
  CHUNKING_FAILED = 'CHUNKING_FAILED',
  LLM_FAILED = 'LLM_FAILED',
  DATABASE_ERROR = 'DATABASE_ERROR',
  VECTOR_SEARCH_FAILED = 'VECTOR_SEARCH_FAILED',
  UNAUTHORIZED = 'UNAUTHORIZED',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  INTERNAL_ERROR = 'INTERNAL_ERROR'
}

export interface RAGError {
  code: ErrorCode;
  message: string;
  details?: any;
}

// Query History Types
export interface UserQuery {
  id: string;
  userId: string;
  queryText: string;
  responseText: string;
  sourcesUsed: DocumentSource[];
  responseTimeMs: number;
  chunksRetrieved: number;
  createdAt: string;
}

export interface QueryHistoryResponse {
  queries: Array<{
    id: string;
    question: string;
    answer: string;
    sourcesCount: number;
    timestamp: string;
  }>;
}