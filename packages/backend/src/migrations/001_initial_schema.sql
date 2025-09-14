-- ARYA-RAG Database Schema
-- Requires pgvector extension for vector similarity search
-- 
-- This schema supports:
-- - Multiple users with isolated documents
-- - Large document collections (5-8 PDFs per user, up to 1000 pages each)
-- - Vector embeddings for semantic search
-- - Accurate page-level citations
-- - Query history and analytics

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create user_documents table
-- Stores document metadata and processing status
CREATE TABLE IF NOT EXISTS user_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL, -- Simple username for POC
    document_name VARCHAR(500) NOT NULL,
    file_hash VARCHAR(64) NOT NULL, -- SHA-256 hash for duplicate detection
    total_pages INTEGER NOT NULL,
    total_chunks INTEGER DEFAULT 0,
    file_size_bytes BIGINT NOT NULL,
    processing_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    upload_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processing_time_seconds INTEGER,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_status CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
    CONSTRAINT valid_pages CHECK (total_pages > 0 AND total_pages <= 2000), -- Max 2000 pages
    CONSTRAINT valid_file_size CHECK (file_size_bytes > 0 AND file_size_bytes <= 104857600), -- Max 100MB
    
    -- Prevent duplicate uploads for same user
    CONSTRAINT unique_user_file UNIQUE (user_id, file_hash)
);

-- Create document_chunks table
-- Stores text chunks with embeddings for vector search
CREATE TABLE IF NOT EXISTS document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES user_documents(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL, -- Denormalized for faster queries
    chunk_index INTEGER NOT NULL,
    chunk_text TEXT NOT NULL,
    chunk_tokens INTEGER NOT NULL,
    page_number INTEGER NOT NULL,
    page_position_start INTEGER NOT NULL, -- Character position start on page
    page_position_end INTEGER NOT NULL,   -- Character position end on page
    section_title VARCHAR(500),
    embedding vector(1536), -- Default for OpenAI ada-002, can be adjusted
    embedding_model VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_chunk_index CHECK (chunk_index >= 0),
    CONSTRAINT valid_page_number CHECK (page_number > 0),
    CONSTRAINT valid_positions CHECK (page_position_start >= 0 AND page_position_end > page_position_start),
    CONSTRAINT valid_tokens CHECK (chunk_tokens > 0 AND chunk_tokens <= 1000), -- Max 1000 tokens per chunk
    
    -- Ensure unique chunk indexes per document
    CONSTRAINT unique_chunk_per_doc UNIQUE (document_id, chunk_index)
);

-- Create user_queries table
-- Stores query history for analytics and caching
CREATE TABLE IF NOT EXISTS user_queries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL,
    query_text TEXT NOT NULL,
    query_embedding vector(1536), -- Store query embeddings for analysis
    response_text TEXT NOT NULL,
    sources JSONB NOT NULL DEFAULT '[]', -- Array of source references
    confidence_score FLOAT,
    processing_time_ms INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_confidence CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1))
);

-- Create indexes for performance

-- User documents indexes
CREATE INDEX idx_user_documents_user_id ON user_documents(user_id);
CREATE INDEX idx_user_documents_status ON user_documents(processing_status);
CREATE INDEX idx_user_documents_upload_date ON user_documents(upload_date DESC);
CREATE INDEX idx_user_documents_file_hash ON user_documents(file_hash);

-- Document chunks indexes
CREATE INDEX idx_document_chunks_document_id ON document_chunks(document_id);
CREATE INDEX idx_document_chunks_user_id ON document_chunks(user_id);
CREATE INDEX idx_document_chunks_page_number ON document_chunks(document_id, page_number);

-- Vector similarity search index (using ivfflat for better performance at scale)
-- Note: For production with 30k+ vectors, consider using ivfflat with proper parameters
CREATE INDEX idx_document_chunks_embedding ON document_chunks 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100); -- Adjust 'lists' based on data size (sqrt(n) is a good starting point)

-- User queries indexes
CREATE INDEX idx_user_queries_user_id ON user_queries(user_id);
CREATE INDEX idx_user_queries_created_at ON user_queries(created_at DESC);

-- Create helper functions

-- Function to search document chunks with vector similarity
CREATE OR REPLACE FUNCTION search_document_chunks(
    query_embedding vector(1536),
    p_user_id VARCHAR(255),
    p_document_ids UUID[] DEFAULT NULL,
    p_similarity_threshold FLOAT DEFAULT 0.7,
    p_top_k INTEGER DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    document_id UUID,
    document_name VARCHAR(500),
    chunk_text TEXT,
    page_number INTEGER,
    section_title VARCHAR(500),
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        dc.id,
        dc.document_id,
        ud.document_name,
        dc.chunk_text,
        dc.page_number,
        dc.section_title,
        1 - (dc.embedding <=> query_embedding) as similarity -- Cosine similarity
    FROM document_chunks dc
    JOIN user_documents ud ON dc.document_id = ud.id
    WHERE 
        dc.user_id = p_user_id
        AND (p_document_ids IS NULL OR dc.document_id = ANY(p_document_ids))
        AND dc.embedding IS NOT NULL
        AND (1 - (dc.embedding <=> query_embedding)) >= p_similarity_threshold
    ORDER BY dc.embedding <=> query_embedding -- Distance ordering
    LIMIT p_top_k;
END;
$$;

-- Function to get document statistics
CREATE OR REPLACE FUNCTION get_document_stats(p_user_id VARCHAR(255))
RETURNS TABLE (
    total_documents BIGINT,
    total_chunks BIGINT,
    total_pages BIGINT,
    avg_chunks_per_page FLOAT,
    total_size_mb FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(DISTINCT ud.id) as total_documents,
        COUNT(dc.id) as total_chunks,
        SUM(ud.total_pages) as total_pages,
        CASE 
            WHEN SUM(ud.total_pages) > 0 THEN COUNT(dc.id)::FLOAT / SUM(ud.total_pages)::FLOAT
            ELSE 0
        END as avg_chunks_per_page,
        SUM(ud.file_size_bytes)::FLOAT / 1048576 as total_size_mb
    FROM user_documents ud
    LEFT JOIN document_chunks dc ON ud.id = dc.document_id
    WHERE ud.user_id = p_user_id
    AND ud.processing_status = 'completed';
END;
$$;

-- Create triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_user_documents_updated_at BEFORE UPDATE
    ON user_documents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE user_documents IS 'Stores document metadata and processing status for RAG system';
COMMENT ON TABLE document_chunks IS 'Stores document chunks with vector embeddings for similarity search';
COMMENT ON TABLE user_queries IS 'Stores user query history for analytics and potential caching';
COMMENT ON FUNCTION search_document_chunks IS 'Performs vector similarity search on document chunks with user isolation';
COMMENT ON FUNCTION get_document_stats IS 'Returns statistics about a user''s document collection';