-- Migration Script: Switch from OpenAI (1536) to Ollama (768) embeddings

-- IMPORTANT: This will DELETE all existing embeddings!
-- Make sure to backup your data first if needed.

-- Step 1: Drop the old embedding column
ALTER TABLE document_chunks 
DROP COLUMN IF EXISTS embedding;

-- Step 2: Add new embedding column with 768 dimensions
ALTER TABLE document_chunks 
ADD COLUMN embedding vector(768);

-- Step 3: Drop old index
DROP INDEX IF EXISTS idx_document_chunks_embedding;

-- Step 4: Create new index for 768-dimensional vectors
CREATE INDEX idx_document_chunks_embedding 
ON document_chunks 
USING hnsw (embedding vector_cosine_ops) 
WITH (m = 16, ef_construction = 64);

-- Step 5: Update the vector_search function for 768 dimensions
CREATE OR REPLACE FUNCTION vector_search(
  query_embedding vector(768),  -- Changed from 1536 to 768
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

-- Step 6: Verify the changes
SELECT 
  column_name, 
  data_type, 
  udt_name
FROM information_schema.columns 
WHERE table_name = 'document_chunks' 
  AND column_name = 'embedding';

-- Should show: embedding | USER-DEFINED | vector