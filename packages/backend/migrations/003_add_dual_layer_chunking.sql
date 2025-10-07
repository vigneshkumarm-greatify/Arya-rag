-- Migration 003: Add Dual-Layer Chunking Support
-- Adds columns for context/detail chunks and fact extraction
--
-- This migration enables:
-- 1. Dual-layer chunking (context chunks + detail chunks)
-- 2. Fact extraction and storage
-- 3. Parent-child chunk relationships

-- Add chunk_layer column to distinguish between context and detail chunks
ALTER TABLE document_chunks 
ADD COLUMN IF NOT EXISTS chunk_layer VARCHAR(20) DEFAULT 'context' CHECK (chunk_layer IN ('context', 'detail'));

-- Add parent_chunk_id for detail chunks to reference their context chunk
ALTER TABLE document_chunks 
ADD COLUMN IF NOT EXISTS parent_chunk_id UUID REFERENCES document_chunks(id) ON DELETE CASCADE;

-- Add extracted_facts column to store structured facts as JSON
ALTER TABLE document_chunks 
ADD COLUMN IF NOT EXISTS extracted_facts JSONB DEFAULT '[]'::jsonb;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_chunks_layer ON document_chunks(chunk_layer);
CREATE INDEX IF NOT EXISTS idx_chunks_parent ON document_chunks(parent_chunk_id);
CREATE INDEX IF NOT EXISTS idx_chunks_facts ON document_chunks USING GIN (extracted_facts);

-- Add comment explaining the schema
COMMENT ON COLUMN document_chunks.chunk_layer IS 'Layer type: context (large, broad) or detail (small, focused)';
COMMENT ON COLUMN document_chunks.parent_chunk_id IS 'Reference to parent context chunk for detail chunks';
COMMENT ON COLUMN document_chunks.extracted_facts IS 'Structured facts extracted from chunk (measurements, dates, definitions, etc.)';

-- Example fact structure in extracted_facts:
-- [
--   {
--     "type": "measurement",
--     "value": "0.05",
--     "unit": "mm",
--     "context": "tolerance is ±0.05mm",
--     "confidence": 0.9,
--     "position": {"start": 150, "end": 160}
--   },
--   {
--     "type": "temperature",
--     "value": "25",
--     "unit": "C",
--     "context": "operating at 25°C",
--     "confidence": 0.9,
--     "position": {"start": 200, "end": 210}
--   }
-- ]

-- Update existing chunks to have 'context' layer
UPDATE document_chunks 
SET chunk_layer = 'context' 
WHERE chunk_layer IS NULL;

-- Verification query (commented out for safety)
-- SELECT 
--   chunk_layer,
--   COUNT(*) as chunk_count,
--   AVG(chunk_tokens) as avg_tokens,
--   COUNT(DISTINCT document_id) as document_count
-- FROM document_chunks
-- GROUP BY chunk_layer;

