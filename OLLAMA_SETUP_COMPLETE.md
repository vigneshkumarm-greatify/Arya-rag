# Complete Ollama Setup for ARYA-RAG

## 🔒 Why Use Ollama?
- **100% Local**: No data sent to external APIs
- **Free**: No API costs
- **Private**: Complete data security
- **Fast**: Runs on your machine

## 📋 Prerequisites
✅ Ollama installed and running  
✅ `nomic-embed-text` model downloaded (768 dimensions)

## 🚀 Step-by-Step Setup

### 1. Update Your Environment Configuration

Edit your `.env` file:
```bash
cd /Users/vigneshkumarm/Documents/chatbot/arya-rag

# Update these values:
EMBEDDING_PROVIDER=ollama
EMBEDDING_MODEL=nomic-embed-text
EMBEDDING_DIMENSIONS=768
OLLAMA_BASE_URL=http://localhost:11434

# Also use Ollama for LLM (optional but recommended for full local setup)
LLM_PROVIDER=ollama
LLM_MODEL=mistral
```

### 2. Download Mistral for Text Generation (if not already done)
```bash
ollama pull mistral
```

### 3. Run Database Migration

**⚠️ WARNING: This will delete all existing embeddings!**

Run this SQL in Supabase Dashboard:

```sql
-- Step 1: Backup chunk count (optional)
SELECT COUNT(*) as total_chunks FROM document_chunks WHERE user_id = 'vicky';

-- Step 2: Drop old 1536-dimension embedding column
ALTER TABLE document_chunks DROP COLUMN IF EXISTS embedding;

-- Step 3: Add new 768-dimension embedding column
ALTER TABLE document_chunks ADD COLUMN embedding vector(768);

-- Step 4: Update vector_search function
DROP FUNCTION IF EXISTS vector_search;

CREATE OR REPLACE FUNCTION vector_search(
  query_embedding vector(768),
  user_id_param text,
  similarity_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  chunk_id text,
  document_id text,
  chunk_text text,
  page_number int,
  section_title text,
  filename text,
  similarity_score float
)
LANGUAGE sql
AS $$
  SELECT
    dc.chunk_id,
    dc.document_id,
    dc.chunk_text,
    dc.page_number,
    dc.section_title,
    ud.filename,
    (1 - (dc.embedding <=> query_embedding)) as similarity_score
  FROM document_chunks dc
  INNER JOIN user_documents ud ON dc.document_id = ud.document_id
  WHERE 
    dc.user_id = user_id_param
    AND dc.embedding IS NOT NULL
    AND (1 - (dc.embedding <=> query_embedding)) >= similarity_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Step 5: Recreate index
DROP INDEX IF EXISTS idx_document_chunks_embedding;

CREATE INDEX idx_document_chunks_embedding 
ON document_chunks 
USING hnsw (embedding vector_cosine_ops) 
WITH (m = 16, ef_construction = 64);
```

### 4. Update Document Status (Reset for Re-processing)

```sql
-- Reset all documents to pending so they get re-processed with Ollama
UPDATE user_documents 
SET processing_status = 'pending',
    processing_stage = 'pending_processing'
WHERE user_id = 'vicky';
```

### 5. Restart Backend Server

```bash
cd /Users/vigneshkumarm/Documents/chatbot/arya-rag/packages/backend
npm run dev
```

### 6. Re-upload Your Documents

Go to the frontend and re-upload your PDFs. They will now be processed using Ollama embeddings.

## 🧪 Verification

After uploading, verify Ollama is being used:

```sql
-- Check embedding dimensions
SELECT 
  chunk_id,
  array_length(embedding::real[], 1) as dimensions
FROM document_chunks 
WHERE embedding IS NOT NULL 
LIMIT 1;
```

Should show: `dimensions: 768`

## 📊 Performance Comparison

| Feature | OpenAI | Ollama |
|---------|---------|---------|
| Embedding Dimensions | 1536 | 768 |
| Cost | ~$0.0001/1K tokens | Free |
| Speed | ~500ms/request | ~50ms/request |
| Privacy | API calls | 100% local |
| Quality | Excellent | Very Good |

## 🔍 Testing

Test with a query:
```bash
curl -X POST http://localhost:3001/api/queries/process \
  -H "Content-Type: application/json" \
  -d '{
    "query": "what is mock exam?",
    "userId": "vicky",
    "responseStyle": "detailed"
  }'
```

## ⚠️ Important Notes

1. **All documents need re-processing** after switching to Ollama
2. **Embedding dimensions change** from 1536 to 768
3. **Keep Ollama running** whenever using the system
4. **Backup your data** before running migration

## 🎯 Benefits of This Setup

✅ **Complete Privacy**: No data leaves your machine  
✅ **Zero Cost**: No API fees  
✅ **Fast Processing**: Local inference is quick  
✅ **Full Control**: You own the entire pipeline  

This setup gives you a production-ready, fully local RAG system!