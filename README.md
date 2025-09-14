# ARYA-RAG: Large Document Collections Q&A System

A RAG (Retrieval-Augmented Generation) based Q&A system designed for professionals who work with large document collections. Handles 5-8 PDFs per user, with each PDF containing up to 1000 pages.

## Features

- 📄 **Large Document Support**: Process PDFs up to 1000 pages each
- 🔍 **Semantic Search**: Vector-based search across thousands of pages
- 📍 **Accurate Citations**: Precise page numbers and source references
- ⚡ **Fast Responses**: <3 second query response time
- 🔄 **Flexible Models**: Switch between local (Ollama) and cloud (OpenAI) models
- 👤 **Simple User System**: Username-based identification (POC)

## Project Structure

```
arya-rag/
├── packages/
│   ├── backend/          # Node.js API server
│   │   ├── src/
│   │   │   ├── services/ # Core business logic
│   │   │   ├── routes/   # API endpoints
│   │   │   └── server.ts # Main server file
│   │   └── package.json
│   ├── frontend/         # React web interface
│   │   ├── src/
│   │   └── package.json
│   └── types/           # Shared TypeScript types
│       ├── src/
│       └── package.json
├── package.json         # Root package.json (Lerna)
└── lerna.json          # Lerna configuration
```

## Quick Start

### Prerequisites

- Node.js 18+
- npm
- Supabase account
- Ollama (for local models) OR OpenAI API key

### Installation

1. **Clone and install dependencies:**
   ```bash
   git clone <repository>
   cd arya-rag
   npm install
   npm run bootstrap
   ```

2. **Set up environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **For local models (free):**
   ```bash
   # Install Ollama
   curl -fsSL https://ollama.ai/install.sh | sh
   
   # Pull required models
   ollama pull nomic-embed-text
   ollama pull mistral
   
   # Start Ollama service
   ollama serve
   ```

4. **Set up Supabase:**
   - Create new project at supabase.com
   - Enable pgvector extension: `CREATE EXTENSION vector;`
   - Run database migrations (coming soon)

5. **Start development:**
   ```bash
   npm run dev
   ```

## Environment Configuration

### Local Development (Free)
```env
EMBEDDING_PROVIDER=ollama
EMBEDDING_MODEL=nomic-embed-text
LLM_PROVIDER=ollama
LLM_MODEL=mistral
OLLAMA_BASE_URL=http://localhost:11434
```

### Cloud Development (Higher Quality)
```env
EMBEDDING_PROVIDER=openai
EMBEDDING_MODEL=text-embedding-ada-002
LLM_PROVIDER=openai
LLM_MODEL=gpt-4
OPENAI_API_KEY=sk-your-key-here
```

## Usage

1. **Upload Documents**: Add up to 8 PDFs (100MB each)
2. **Wait for Processing**: Documents are chunked and vectorized
3. **Ask Questions**: Get answers with precise source citations
4. **View Sources**: Click citations to see original page content

## Performance Targets

- **Processing**: 1000-page PDF in <5 minutes
- **Query Speed**: Response in <3 seconds
- **Accuracy**: 90%+ correct page citations
- **Scale**: 8 documents × 1000 pages per user
- **Memory**: <2GB RAM per user

## Technology Stack

- **Backend**: Node.js, Express, TypeScript
- **Frontend**: React, TypeScript, Tailwind CSS
- **Database**: Supabase (PostgreSQL + pgvector)
- **AI Models**: Ollama (local) / OpenAI (cloud)
- **Build Tools**: Lerna, Vite, TSC

## API Endpoints

- `POST /api/documents/upload` - Upload documents
- `GET /api/documents` - List user documents
- `POST /api/query` - Ask questions
- `GET /api/queries` - Query history

## Development Status

This is a POC (Proof of Concept) implementation. See `RAG_IMPLEMENTATION_CHECKLIST.md` for detailed development roadmap.

## License

MIT