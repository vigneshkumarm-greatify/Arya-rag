-- ARYA-RAG: Migration to 768 Dimensions for Cross-Provider Compatibility
-- This script updates the database to support 768-dimensional vectors
-- Compatible with both Ollama (nomic-embed-text) and OpenAI (text-embedding-3-small/large)
-- 
-- ⚠️  WARNING: This will delete all existing documents and chunks!
-- ✅ Safe for testing environment

-- Step 1: Clear all existing data (order matters due to foreign key constraints)
DELETE FROM document_chunks;
DELETE FROM user_queries;
DELETE FROM user_documents;

-- Step 2: Update the document_chunks table embedding column to 768 dimensions
ALTER TABLE document_chunks DROP COLUMN IF EXISTS embedding;
ALTER TABLE document_chunks ADD COLUMN embedding vector(768);

-- Step 3: Update the user_queries table embedding column to 768 dimensions
ALTER TABLE user_queries DROP COLUMN IF EXISTS query_embedding;
ALTER TABLE user_queries ADD COLUMN query_embedding vector(768);

-- Step 4: Create/Update the vector search function for 768 dimensions
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

-- Step 5: Recreate the vector index for 768 dimensions
DROP INDEX IF EXISTS idx_document_chunks_embedding;
CREATE INDEX idx_document_chunks_embedding 
ON document_chunks 
USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100);

-- Step 6: Grant permissions
GRANT EXECUTE ON FUNCTION vector_search TO anon;
GRANT EXECUTE ON FUNCTION vector_search TO authenticated;

-- Step 7: Add helpful comments
COMMENT ON COLUMN document_chunks.embedding IS 'Vector embedding (768 dimensions) - compatible with both Ollama and OpenAI v3 models';
COMMENT ON COLUMN user_queries.query_embedding IS 'Query vector embedding (768 dimensions)';
COMMENT ON FUNCTION vector_search IS 'Vector similarity search function for 768-dimensional embeddings (cross-provider compatible)';

-- Step 8: Verification
SELECT 'Migration completed! Database now supports 768-dimensional vectors.' as status;

-- Configuration recommendations:
-- 
-- For OpenAI:
-- EMBEDDING_PROVIDER=openai
-- EMBEDDING_MODEL=text-embedding-3-small
-- EMBEDDING_DIMENSIONS=768
--
-- For Ollama:
-- EMBEDDING_PROVIDER=ollama  
-- EMBEDDING_MODEL=nomic-embed-text
-- EMBEDDING_DIMENSIONS=768