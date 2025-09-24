-- Vector Search Function for ARYA-RAG
-- This function performs cosine similarity search using pgvector extension

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

-- Create index for fast vector similarity search if not exists
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding 
ON document_chunks 
USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100);

-- Grant permissions
GRANT EXECUTE ON FUNCTION vector_search TO anon;
GRANT EXECUTE ON FUNCTION vector_search TO authenticated;