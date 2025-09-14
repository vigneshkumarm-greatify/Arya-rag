-- ARYA-RAG Database Schema Migration
-- Create the necessary tables for RAG functionality

-- Enable pgvector extension for vector operations
CREATE EXTENSION IF NOT EXISTS vector;

-- User Documents table - stores uploaded PDF metadata
CREATE TABLE IF NOT EXISTS user_documents (
    document_id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    filename VARCHAR(500) NOT NULL,
    original_name VARCHAR(500) NOT NULL,
    title VARCHAR(500),
    description TEXT,
    mime_type VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
    file_size BIGINT NOT NULL,
    file_hash VARCHAR(64) NOT NULL,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    processing_started_at TIMESTAMP WITH TIME ZONE,
    processing_completed_at TIMESTAMP WITH TIME ZONE,
    total_pages INTEGER DEFAULT 0,
    total_chunks INTEGER DEFAULT 0,
    embedding_model VARCHAR(100) NOT NULL DEFAULT 'nomic-embed-text',
    error_message TEXT,
    tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Document Chunks table - stores chunked text with embeddings
CREATE TABLE IF NOT EXISTS document_chunks (
    chunk_id VARCHAR(255) PRIMARY KEY,
    document_id VARCHAR(255) NOT NULL REFERENCES user_documents(document_id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL,
    chunk_index INTEGER NOT NULL,
    chunk_text TEXT NOT NULL,
    chunk_tokens INTEGER NOT NULL,
    page_number INTEGER NOT NULL,
    page_position_start INTEGER DEFAULT 0,
    page_position_end INTEGER DEFAULT 0,
    section_title VARCHAR(500),
    embedding vector(768), -- nomic-embed-text dimension
    embedding_model VARCHAR(100) NOT NULL DEFAULT 'nomic-embed-text',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User Queries table - stores query history for analytics
CREATE TABLE IF NOT EXISTS user_queries (
    query_id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    query_text TEXT NOT NULL,
    response_text TEXT NOT NULL,
    sources_used JSONB DEFAULT '[]',
    response_time_ms INTEGER NOT NULL,
    chunks_retrieved INTEGER DEFAULT 0,
    confidence_score DECIMAL(3,2),
    model_used VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_documents_user_id ON user_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_user_documents_status ON user_documents(status);
CREATE INDEX IF NOT EXISTS idx_user_documents_hash ON user_documents(file_hash);

CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id ON document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_user_id ON document_chunks(user_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_page_number ON document_chunks(page_number);

-- Vector similarity search index (HNSW is good for similarity search)
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding 
ON document_chunks USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_user_queries_user_id ON user_queries(user_id);
CREATE INDEX IF NOT EXISTS idx_user_queries_created_at ON user_queries(created_at);

-- Row Level Security (RLS) policies for multi-tenant security
ALTER TABLE user_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_queries ENABLE ROW LEVEL SECURITY;

-- Policies: Users can only access their own data
CREATE POLICY IF NOT EXISTS "Users can access their own documents" ON user_documents
    FOR ALL USING (true); -- For now, allow all access - implement user auth later

CREATE POLICY IF NOT EXISTS "Users can access their own chunks" ON document_chunks
    FOR ALL USING (true); -- For now, allow all access - implement user auth later

CREATE POLICY IF NOT EXISTS "Users can access their own queries" ON user_queries
    FOR ALL USING (true); -- For now, allow all access - implement user auth later

-- Update trigger to maintain updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_user_documents_updated_at 
BEFORE UPDATE ON user_documents 
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Insert some test data (optional)
-- This can be removed in production
INSERT INTO user_documents (
    document_id, user_id, filename, original_name, title, 
    mime_type, file_size, file_hash, status, total_pages
) VALUES (
    'test_doc_001', 'test_user', 'sample.pdf', 'sample.pdf', 'Test Document',
    'application/pdf', 1024, 'sample_hash_123', 'completed', 5
) ON CONFLICT (document_id) DO NOTHING;