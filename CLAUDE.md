# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ARYA-RAG is a Retrieval-Augmented Generation (RAG) system for large document collections. It's designed to handle 5-8 PDFs per user, with each PDF containing up to 1000 pages, providing accurate Q&A with precise page citations.

## Development Commands

### Setup and Installation
```bash
# Install all dependencies across packages
npm install
npm run bootstrap

# Set up environment
cp .env.example .env
# Edit .env with your Supabase and model configuration
```

### Development Workflow
```bash
# Run all packages in development mode (backend + frontend)
npm run dev

# Build all packages
npm run build

# Type checking across all packages
npm run type-check

# Linting
npm run lint

# Clean build artifacts
npm run clean
```

### Package-specific Commands
```bash
# Backend only
cd packages/backend
npm run dev          # Start backend server with hot reload
npm run build        # Build TypeScript to dist/
npm run type-check   # Type check without emitting

# Frontend only
cd packages/frontend
npm run dev          # Start React dev server
npm run build        # Build for production

# Types only
cd packages/types
npm run build        # Compile shared types
npm run dev          # Watch mode for types
```

## Architecture

### Monorepo Structure
This is a Lerna-managed monorepo with three main packages:

- **`packages/types/`**: Shared TypeScript types and interfaces used across backend and frontend
- **`packages/backend/`**: Node.js Express API server with RAG services
- **`packages/frontend/`**: React web interface (planned)

### Backend Services Architecture
The backend uses a service-oriented architecture in `packages/backend/src/services/`:

- **`document/`**: PDF processing and page extraction (`DocumentProcessor.ts`)
- **`chunking/`**: Smart document chunking with page boundary preservation
- **`embedding/`**: Vector embedding generation (supports Ollama/OpenAI)  
- **`vector/`**: Vector storage and similarity search (Supabase pgvector)
- **`llm/`**: Language model integration (supports Ollama/OpenAI)
- **`rag/`**: RAG orchestration combining search + generation

### Key Design Patterns

**Page Boundary Preservation**: Critical for accurate citations. All chunking must respect page boundaries so responses can include precise page numbers.

**Environment-based Model Switching**: The system supports both local (Ollama) and cloud (OpenAI) models via environment variables:
- `EMBEDDING_PROVIDER=ollama|openai`
- `LLM_PROVIDER=ollama|openai`

**Large Document Handling**: Designed for documents up to 1000 pages. Processing includes:
- File hash calculation for duplicate detection
- Streaming/batch processing to handle memory constraints
- Progress tracking for long-running operations

## Environment Configuration

### Required Environment Variables
```env
# Database (required)
SUPABASE_URL=your-supabase-project-url
SUPABASE_ANON_KEY=your-anon-key

# Model providers (choose one set)
EMBEDDING_PROVIDER=ollama  # or openai
LLM_PROVIDER=ollama        # or openai

# For Ollama (local/free)
OLLAMA_BASE_URL=http://localhost:11434
EMBEDDING_MODEL=nomic-embed-text
EMBEDDING_DIMENSIONS=768
LLM_MODEL=mistral

# For OpenAI (cloud/paid)
OPENAI_API_KEY=sk-your-key
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=768
LLM_MODEL=gpt-4
```

### Key Processing Settings
```env
CHUNK_SIZE_TOKENS=600        # Optimized for accuracy vs context
CHUNK_OVERLAP_TOKENS=100     # Within-page overlap only
MAX_FILE_SIZE_MB=100         # Per PDF limit
MAX_CHUNKS_PER_BATCH=500     # For embedding generation
```

## Database Requirements

### Supabase Setup
1. Create Supabase project
2. Enable pgvector extension: `CREATE EXTENSION vector;`
3. Run schema from `RAG_LARGE_DOCS_POC.md` (lines 36-85)

### Core Tables
- `user_documents`: Document metadata and processing status
- `document_chunks`: Text chunks with embeddings and page numbers
- `user_queries`: Query history for analytics

## Performance Targets

The system is designed around specific performance goals:
- **Processing**: 1000-page PDF in <5 minutes
- **Query Response**: <3 seconds across 30,000+ chunks
- **Memory**: <2GB RAM per user with 8 documents
- **Scale**: Support 8 documents × 1000 pages per user

## Development Status

This is a POC implementation. See `RAG_IMPLEMENTATION_CHECKLIST.md` for the complete development roadmap with 10 phases over 10 weeks.

## Type Safety

All shared types are defined in `packages/types/src/index.ts`. Key interfaces:
- `DocumentChunk`: Includes page number and position for citations
- `SearchResult`: Vector search results with similarity scores
- `RAGResponse`: Final response with sources and confidence
- Service interfaces (`IEmbeddingService`, `IRAGService`, etc.)

## Model Integration

The system uses a factory pattern for swappable AI models:
- `EmbeddingServiceFactory` creates appropriate embedding service
- `LLMServiceFactory` creates appropriate language model service
- All services implement common interfaces defined in types

## Citation System

Page citations are the core feature. The flow is:
1. PDF processing preserves page boundaries
2. Chunks store exact page numbers and positions
3. Vector search returns chunks with page metadata
4. RAG responses include precise page references


## Your Role & Workflow

### 1. Primary Responsibilities
-Check the todo list for current implementation progress. 
- Update the implementation checklist after completing tasks
- **ALWAYS follow the workflow below - NEVER skip the explanation step**
- Always keep in mind this is monorepo project always install package based on that
- Always ask questions iof you have after my clarification go ahead implementation
- Always add detailed comments for every code.

### 2. Required Files to Maintain
- `implementation-checklist.md` - Track completed and pending tasks
- Technical documentation reference for specifications

### 3. Development Workflow

#### Before Making Changes (MANDATORY WORKFLOW):
1. **Clarification**: If you ahve any dounts clarify with me
2. **Explain the Change**: Describe what you're going to implement
3. **Why This Change**: Explain the purpose and benefits  
4. **Impact Assessment**: What files will be created/modified
5. **Get Approval**: Wait for user confirmation before proceeding

**CRITICAL**: NEVER start implementing without going through steps 1-5 above. This workflow must be followed for EVERY task.

#### After Completing Tasks:
1. **Update Checklist**: Mark completed items and add new discoveries
2. **Update Changelog**: Document what was implemented
3. **Status Report**: Brief summary of what's working and what's next


### When Starting a Task:
```
## Task: [Task Name]

**What I'm going to do:**
- [Specific implementation details]

**Files I'll create/modify:**
- [List of files]

**Why this change:**
- [Purpose and benefits]

**Estimated impact:**
- [What functionality this enables]

Please confirm if you want me to proceed with this implementation.
```

### After Completing a Task:
```
## Completed: [Task Name]

**What was implemented:**
- [Summary of changes]

**Files modified:**
- [List with brief description of changes]

**Testing status:**
- [What should work now]

**Next steps:**
- [What's ready to implement next]

Updated implementation-checklist.md with completion status.
```

## Error Handling Strategy
- Graceful degradation when APIs fail
- User-friendly error messages
- Retry mechanisms for transient failures
- Fallback options when possible


Remember: Always explain your planned changes and get approval before implementing. Update the checklist after each completed task.

## Reminders
1. Always test existing functionality after changes
2. Document all API changes
3. Keep backward compatibility
54 Always write detailed comments 

## Contact
For questions about requirements or implementation approach, ask the user for clarification before making breaking changes.
