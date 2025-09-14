/**
 * ARYA-RAG Services Export Index
 * 
 * Central export file for all services to enable clean imports.
 * 
 * @author ARYA RAG Team
 */

// Document Processing (exported separately to avoid pdf-parse initialization issues)
// export { DocumentProcessor } from './document/DocumentProcessor';
// export type { DocumentProcessingResult, ProcessingOptions } from './document/DocumentProcessor';

// Chunking Services
export { ChunkingService } from './chunking/ChunkingService';
export type { 
  ChunkingOptions, 
  ChunkingResult 
} from './chunking/ChunkingService';

// Embedding Services
export { EmbeddingService } from './embedding/EmbeddingService';
export { OllamaEmbeddingService } from './embedding/OllamaEmbeddingService';
export { OpenAIEmbeddingService } from './embedding/OpenAIEmbeddingService';
export { EmbeddingServiceFactory } from './embedding/EmbeddingServiceFactory';

export type {
  EmbeddingRequest,
  EmbeddingResponse,
  BatchEmbeddingRequest,
  BatchEmbeddingResponse,
  EmbeddingServiceConfig,
  EmbeddingServiceStats,
  EmbeddingProvider,
  EmbeddingModel
} from './embedding/EmbeddingService';

export type {
  OllamaEmbeddingConfig
} from './embedding/OllamaEmbeddingService';

export type {
  OpenAIEmbeddingConfig
} from './embedding/OpenAIEmbeddingService';

export type {
  EmbeddingFactoryConfig
} from './embedding/EmbeddingServiceFactory';

// Vector Services
export { VectorStorageService, VectorSearchService } from './vector';
export type {
  VectorStorageConfig,
  StorageResult,
  StorageError,
  DocumentStorageStats,
  VectorSearchConfig,
  SearchOptions,
  ExtendedSearchResult,
  SearchStats
} from './vector';

// Database
export { DatabaseClient, getDatabase } from '../config/database';

// Utilities
export { 
  countTokens, 
  estimateTokens, 
  splitTextAtTokenCount, 
  findSentenceBoundary,
  getTokenStats,
  isWithinTokenLimit
} from '../utils/tokenCounter';

export type { TokenStats } from '../utils/tokenCounter';