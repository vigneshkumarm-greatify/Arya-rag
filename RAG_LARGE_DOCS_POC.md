# ARYA-RAG POC: Large Document Collections Q&A System

## Overview

This POC creates a RAG-based Q&A system designed for professionals who work with large document collections. The system handles 5-8 PDFs per user, with each PDF containing up to 1000 pages (total: 5,000-8,000 pages per user). Users can ask questions and receive accurate answers with precise source citations including document names and page numbers.

## Target Use Cases

- **Legal Professionals**: Query multiple contracts, case files, regulations
- **Researchers**: Search through academic papers, reports, studies  
- **Compliance Officers**: Find information across policy documents, regulations
- **Consultants**: Analyze client documents, industry reports

## POC Scope & Limitations

### What's Included
- ✅ Multiple large PDF upload (up to 8 documents)
- ✅ Smart chunking preserving page boundaries
- ✅ Vector-based semantic search across thousands of pages
- ✅ Q&A with accurate page citations
- ✅ Simple username identification (no authentication complexity)
- ✅ Environment-based model switching (local/cloud)

### What's NOT Included (POC Focus)
- ❌ User authentication/authorization
- ❌ Document versioning
- ❌ Advanced security features
- ❌ Multi-tenant isolation
- ❌ Audit trails
- ❌ Export/import features

## Architecture for Large Documents

### Database Schema (Optimized for Scale)

```sql
-- User documents table
user_documents (
    id UUID PRIMARY KEY,
    user_id TEXT NOT NULL,
    document_name TEXT NOT NULL,
    file_hash TEXT UNIQUE, -- Prevent duplicate uploads
    total_pages INTEGER,
    total_chunks INTEGER,
    file_size_bytes BIGINT,
    processing_status TEXT DEFAULT 'pending', -- pending|processing|completed|failed
    upload_date TIMESTAMP DEFAULT NOW(),
    processing_time_seconds INTEGER,
    metadata JSONB DEFAULT '{}'
);

-- Document chunks with page tracking
document_chunks (
    id UUID PRIMARY KEY,
    document_id UUID REFERENCES user_documents(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    chunk_text TEXT NOT NULL,
    chunk_tokens INTEGER NOT NULL,
    page_number INTEGER NOT NULL, -- Critical for citations
    page_position_start INTEGER, -- Character position on page
    page_position_end INTEGER,
    section_title TEXT, -- If detected (e.g., "Chapter 1", "Section 2.3")
    embedding vector(1536), -- Adjust based on model
    embedding_model TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    
    -- Indexes for performance
    INDEX idx_chunks_document (document_id),
    INDEX idx_chunks_user (user_id),
    INDEX idx_chunks_page (document_id, page_number),
    INDEX idx_embedding USING ivfflat (embedding vector_cosine_ops)
);

-- Query tracking for analytics
user_queries (
    id UUID PRIMARY KEY,
    user_id TEXT NOT NULL,
    query_text TEXT NOT NULL,
    response_text TEXT,
    sources_used JSONB, -- Array of {document_id, document_name, page_number, chunk_id}
    response_time_ms INTEGER,
    chunks_retrieved INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);
```

## Smart Chunking Strategy for Large Documents

### Chunking Rules
1. **Page Boundary Preservation**: Never split text across pages
2. **Optimal Size**: 600 tokens per chunk (balance between context and precision)
3. **Strategic Overlap**: 100 tokens overlap within the same page
4. **Section Awareness**: Try to keep sections/headings with their content
5. **Metadata Preservation**: Track page numbers, sections, positions

### Example Chunking for 1000-page Document
```
Page 1: [Chunk 1: 600 tokens] [Chunk 2: 500 tokens]
Page 2: [Chunk 3: 650 tokens] [Chunk 4: 400 tokens] 
Page 3: [Chunk 5: 600 tokens]
...
Page 1000: [Chunk 3847: 450 tokens]

Total: ~3,800 chunks for 1000-page document
8 documents × 3,800 chunks = ~30,400 chunks per user
```

## Environment Configuration

### Local Development (Free)
```env
# Basic Configuration
NODE_ENV=development
PORT=3001

# Database
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-anon-key

# Models (Local/Free)
EMBEDDING_PROVIDER=ollama
EMBEDDING_MODEL=nomic-embed-text
EMBEDDING_DIMENSIONS=768

LLM_PROVIDER=ollama
LLM_MODEL=mistral
LLM_TEMPERATURE=0.3

# Ollama Settings
OLLAMA_BASE_URL=http://localhost:11434

# Processing Settings (Optimized for Large Docs)
CHUNK_SIZE_TOKENS=600
CHUNK_OVERLAP_TOKENS=100
MAX_CHUNKS_PER_BATCH=500
PROCESSING_TIMEOUT_MINUTES=30
MAX_FILE_SIZE_MB=100
```

### Cloud Development (Higher Quality)
```env
# Models (Cloud/Paid)
EMBEDDING_PROVIDER=openai
EMBEDDING_MODEL=text-embedding-ada-002
EMBEDDING_DIMENSIONS=1536

LLM_PROVIDER=openai
LLM_MODEL=gpt-4
LLM_TEMPERATURE=0.3

# OpenAI Settings
OPENAI_API_KEY=sk-your-key-here

# Same processing settings as above
```

## Core Services Architecture

### 1. Document Processor Service
```typescript
interface LargeDocumentProcessor {
  // Handle massive PDF processing
  processLargePDF(buffer: Buffer, documentName: string): Promise<{
    totalPages: number;
    chunks: DocumentChunk[];
    processingTime: number;
  }>;
  
  // Extract with page tracking
  extractTextWithPages(buffer: Buffer): Promise<PageContent[]>;
  
  // Smart chunking that respects pages
  chunkByPages(pages: PageContent[]): DocumentChunk[];
}

interface DocumentChunk {
  text: string;
  pageNumber: number;
  pagePositionStart: number;
  pagePositionEnd: number;
  tokens: number;
  sectionTitle?: string;
}
```

### 2. Vector Search Service
```typescript
interface LargeScaleVectorSearch {
  // Search across thousands of chunks efficiently
  searchSimilar(params: {
    userId: string;
    query: string;
    documentIds?: string[]; // Optional: limit to specific docs
    topK?: number; // Default: 10
    minSimilarity?: number; // Default: 0.7
  }): Promise<SearchResult[]>;
  
  // Batch embedding generation for efficiency
  generateBatchEmbeddings(texts: string[]): Promise<number[][]>;
  
  // Store embeddings in batches
  storeBatchEmbeddings(chunks: ChunkWithEmbedding[]): Promise<void>;
}

interface SearchResult {
  chunkId: string;
  documentId: string;
  documentName: string;
  pageNumber: number;
  chunkText: string;
  similarityScore: number;
  sectionTitle?: string;
}
```

### 3. RAG Service for Large Collections
```typescript
interface LargeDocumentRAG {
  // Process query across large document collection
  processQuery(params: {
    userId: string;
    question: string;
    maxSources?: number; // Default: 5
    includePageContent?: boolean;
  }): Promise<{
    answer: string;
    sources: DocumentSource[];
    confidence: number;
    responseTime: number;
  }>;
}

interface DocumentSource {
  documentName: string;
  pageNumber: number;
  excerpt: string; // Relevant text snippet
  confidence: number;
  sectionTitle?: string;
}
```

## API Endpoints

### Document Management
```typescript
// Upload large documents (supports multiple files)
POST /api/documents/upload
Content-Type: multipart/form-data
Body: {
  userId: string;
  files: File[]; // Up to 8 PDF files
  maxFileSize: 100MB per file;
}
Response: {
  success: boolean;
  documents: {
    id: string;
    name: string;
    pages: number;
    status: 'processing' | 'completed';
    estimatedTime?: number; // seconds
  }[];
}

// List user's document collection
GET /api/documents?userId=username
Response: {
  documents: {
    id: string;
    name: string;
    totalPages: number;
    totalChunks: number;
    uploadDate: string;
    status: string;
  }[];
  totalDocuments: number;
  totalPages: number;
  totalChunks: number;
}

// Get processing status
GET /api/documents/:documentId/status
Response: {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number; // 0-100
  currentPage?: number;
  totalPages?: number;
  estimatedTimeRemaining?: number; // seconds
}

// Delete document and all its chunks
DELETE /api/documents/:documentId?userId=username
```

### Q&A Interface
```typescript
// Query across large document collection
POST /api/query
Body: {
  userId: string;
  question: string;
  options?: {
    documentIds?: string[]; // Limit search to specific docs
    maxSources?: number; // Max sources in response (default: 5)
    includeExcerpts?: boolean; // Include text excerpts (default: true)
    minConfidence?: number; // Minimum confidence threshold (default: 0.7)
  };
}
Response: {
  answer: string;
  sources: {
    documentName: string;
    pageNumber: number;
    excerpt: string;
    confidence: number;
    sectionTitle?: string;
  }[];
  totalSourcesFound: number;
  processingTime: number;
  confidence: number; // Overall answer confidence
}

// Get query history
GET /api/queries?userId=username&limit=50
Response: {
  queries: {
    id: string;
    question: string;
    answer: string;
    sourcesCount: number;
    timestamp: string;
  }[];
}
```

## Frontend Interface Design

### 1. Document Management Dashboard
```
┌─────────────────────────────────────────────────────────────┐
│ Username: [legal_analyst_john] [Set Username]               │
├─────────────────────────────────────────────────────────────┤
│ Document Collection (5 of 8 documents)                     │
├─────────────────────────────────────────────────────────────┤
│ 📄 Corporate_Merger_Agreement_2024.pdf                     │
│    Status: ✅ Processed | 345 pages | 1,247 chunks         │
│    Uploaded: 2 hours ago                                   │
│                                                             │
│ 📄 SEC_Filing_10K_2023.pdf                                 │
│    Status: 🔄 Processing (78% complete)                    │
│    156 of 200 pages | Est. 3 minutes remaining             │
│                                                             │
│ 📄 Compliance_Manual_v3.pdf                                │
│    Status: ✅ Processed | 892 pages | 3,201 chunks         │
│    Uploaded: Yesterday                                      │
│                                                             │
│ [+ Upload New Documents] [Select Files: Up to 3 more PDFs] │
│                                                             │
│ Total: 1,437 pages processed, 4,448 searchable chunks      │
└─────────────────────────────────────────────────────────────┘
```

### 2. Q&A Interface
```
┌─────────────────────────────────────────────────────────────┐
│ Ask questions about your documents                          │
├─────────────────────────────────────────────────────────────┤
│ User: What are the termination clauses in the merger?      │
│                                                             │
│ AI: Based on the Corporate Merger Agreement, there are     │
│ three main termination scenarios:                          │
│                                                             │
│ 1. **Material Adverse Change** (Page 67, Section 8.1)     │
│    Either party may terminate if there's a material        │
│    adverse change in the other party's business            │
│                                                             │
│ 2. **Regulatory Disapproval** (Page 68, Section 8.2)      │
│    Automatic termination if regulatory approval is         │
│    denied within 12 months                                 │
│                                                             │
│ 3. **Breach of Representations** (Page 69, Section 8.3)    │
│    30-day cure period, then termination right              │
│                                                             │
│ 📋 Sources Used:                                           │
│ • Corporate_Merger_Agreement_2024.pdf, Pages 67-69        │
│ • SEC_Filing_10K_2023.pdf, Page 45 (related disclosure)   │
│                                                             │
│ [View Source Pages] [Ask Follow-up] [Export Answer]        │
├─────────────────────────────────────────────────────────────┤
│ [Type your question here...]                    [Send] 🔍  │
└─────────────────────────────────────────────────────────────┘
```

### 3. Source Viewer with Page Context
```
┌─────────────────────────────────────────────────────────────┐
│ 📄 Corporate_Merger_Agreement_2024.pdf - Page 67           │
├─────────────────────────────────────────────────────────────┤
│ Section 8.1 - Termination for Material Adverse Change      │
│                                                             │
│ 8.1.1 Either Party's Right to Terminate                    │
│                                                             │
│ [HIGHLIGHTED CONTENT USED IN ANSWER]                       │
│ Either the Company or Parent may terminate this Agreement  │
│ at any time prior to the Closing Date if there has been   │
│ a Material Adverse Change with respect to the other party  │
│ that has not been cured within thirty (30) days after     │
│ written notice thereof has been given...                   │
│ [END HIGHLIGHT]                                             │
│                                                             │
│ The terminating party must provide written notification... │
│                                                             │
│ [Previous Page 66] [Next Page 68] [Back to Chat]          │
└─────────────────────────────────────────────────────────────┘
```

## Performance Optimizations for Large Collections

### 1. Efficient Processing
- **Parallel Processing**: Process multiple pages simultaneously
- **Batch Operations**: Generate embeddings in batches of 500
- **Progress Tracking**: Real-time status updates for long operations
- **Queue Management**: Background processing queue for large uploads

### 2. Search Optimizations
- **Hierarchical Search**: Document → Page → Chunk filtering
- **Similarity Threshold**: Skip low-relevance chunks early
- **Result Caching**: Cache frequent queries per user
- **Index Optimization**: Regular vector index maintenance

### 3. Memory Management
- **Streaming Processing**: Process documents in chunks, not all at once
- **Lazy Loading**: Load embeddings only when needed
- **Cleanup Jobs**: Remove unused embeddings periodically
- **Connection Pooling**: Efficient database connections

## Testing Scenarios for Large Documents

### Test Dataset Examples
1. **Legal Contract Set**:
   - 3 merger agreements (300-500 pages each)
   - 2 employment contracts (50-100 pages each)
   - 1 compliance manual (800 pages)
   - 2 regulatory filings (200-400 pages each)
   - **Total**: ~3,000 pages

2. **Research Paper Collection**:
   - 5 academic papers (20-50 pages each)
   - 2 comprehensive reports (300-500 pages each)
   - 1 survey compilation (600 pages)
   - **Total**: ~1,600 pages

### Performance Benchmarks
- **Document Upload**: <2 minutes per 100 pages
- **Processing Time**: <5 minutes per 1000 pages
- **Query Response**: <3 seconds across 5,000+ pages
- **Search Accuracy**: >90% relevant citations
- **Memory Usage**: <2GB RAM per user with 8 documents

### Test Queries
1. **Specific Information**: "What is the termination notice period?"
2. **Comparative**: "How do the payment terms differ across contracts?"
3. **Definition Lookup**: "Define material adverse change"
4. **Multi-Document**: "Find all references to intellectual property"
5. **Complex Analysis**: "What are the key risk factors mentioned?"

## Deployment Instructions

### Development Setup
```bash
# 1. Create new project directory
mkdir arya-rag && cd arya-rag

# 2. Copy from arya-chatbot (excluding unnecessary features)
cp -r ../arya-chatbot/packages ./
# Remove: metrics, location, voice services

# 3. Install dependencies
npm install

# 4. Set up Supabase
# - Create new project at supabase.com
# - Enable pgvector extension
# - Run database migrations

# 5. Configure environment
cp .env.example .env
# Edit with your Supabase credentials and model preferences

# 6. Start services
npm run dev
```

### For Local Models (Ollama)
```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Pull required models
ollama pull nomic-embed-text  # For embeddings
ollama pull mistral          # For chat (or mixtral for better quality)

# Start Ollama service
ollama serve
```

## Success Criteria

### POC Completion Checklist
- [ ] Upload 5+ PDFs totaling 3,000+ pages
- [ ] Process documents with page-accurate chunking
- [ ] Generate embeddings for all chunks
- [ ] Perform semantic search across entire collection
- [ ] Return answers with precise page citations
- [ ] Handle concurrent queries without performance degradation
- [ ] Demonstrate cost-effectiveness vs current approach

### Performance Goals
- **Processing**: Handle 1000-page PDF in <5 minutes
- **Search Speed**: Query response in <3 seconds
- **Accuracy**: 90%+ correct page citations
- **Scale**: Support 8 documents × 1000 pages per user
- **Memory**: Efficient operation within 2GB RAM

## Cost Analysis (POC Phase)

### Local Development (Free)
- Supabase: Free tier (500MB database, sufficient for POC)
- Ollama: Free local models
- Compute: Local development machine
- **Total**: $0/month

### Cloud Development
- Supabase: Pro plan $25/month (if needed)
- OpenAI: ~$50-100/month (depending on usage)
- **Total**: $75-125/month

### Production Considerations
- Scale Supabase based on user count
- OpenAI costs grow with usage
- Consider hybrid approach (local embeddings, cloud LLM)

## Next Steps After POC

If POC proves successful:

1. **User Authentication**: Add proper user management
2. **Advanced Features**: Document comparison, export capabilities
3. **Performance Tuning**: Optimize for larger scale
4. **Security**: Implement proper data isolation and encryption
5. **Monitoring**: Add analytics and performance tracking
6. **API Expansion**: More sophisticated search and filtering options

This POC focuses on proving that RAG can efficiently handle large document collections while providing accurate, cited responses that professionals can trust and verify.