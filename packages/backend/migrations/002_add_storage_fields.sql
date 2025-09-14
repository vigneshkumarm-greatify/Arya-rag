-- Add file storage fields to user_documents table
-- This migration adds support for Supabase Storage integration

-- Add storage-related fields to user_documents table
ALTER TABLE user_documents 
ADD COLUMN IF NOT EXISTS storage_path VARCHAR(500),
ADD COLUMN IF NOT EXISTS storage_url TEXT,
ADD COLUMN IF NOT EXISTS file_url TEXT;

-- Update existing records to have null storage paths (they will need re-upload)
UPDATE user_documents 
SET storage_path = NULL, storage_url = NULL, file_url = NULL 
WHERE storage_path IS NULL;

-- Create index for storage path lookups
CREATE INDEX IF NOT EXISTS idx_user_documents_storage_path ON user_documents(storage_path);