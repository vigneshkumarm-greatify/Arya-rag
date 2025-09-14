-- Add processing_stage column to user_documents table
ALTER TABLE user_documents 
ADD COLUMN IF NOT EXISTS processing_stage VARCHAR(50);

-- Add comment explaining the column
COMMENT ON COLUMN user_documents.processing_stage IS 'Current processing stage: downloading, extracting, chunking, embedding, storing';