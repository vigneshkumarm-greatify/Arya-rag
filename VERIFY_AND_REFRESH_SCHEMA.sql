-- ============================================
-- VERIFY AND FORCE SCHEMA REFRESH
-- ============================================

-- Step 1: Verify the columns exist
SELECT 
  'Column Check' as test_type,
  column_name, 
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'document_chunks' 
  AND column_name IN ('chunk_layer', 'parent_chunk_id', 'extracted_facts')
ORDER BY column_name;

-- Step 2: Check if we can insert with the new columns
-- This will force Supabase to refresh its cache
DO $$ 
BEGIN
  -- Try to insert a test record with the new columns
  INSERT INTO document_chunks (
    chunk_id,
    document_id,
    user_id,
    chunk_index,
    chunk_text,
    chunk_tokens,
    page_number,
    page_position_start,
    page_position_end,
    embedding,
    embedding_model,
    chunk_layer,
    parent_chunk_id,
    extracted_facts
  ) VALUES (
    'test_schema_refresh_' || NOW()::text,
    'test_doc',
    'test_user',
    0,
    'Test content',
    10,
    1,
    0,
    100,
    array_fill(0.0::float, ARRAY[768]),
    'test-model',
    'context',
    NULL,
    '[]'::jsonb
  );
  
  -- Delete the test record
  DELETE FROM document_chunks WHERE document_id = 'test_doc';
  
  RAISE NOTICE 'Schema refresh successful! Columns are accessible.';
END $$;

-- Step 3: Show final confirmation
SELECT 
  'Final Confirmation' as status,
  COUNT(*) FILTER (WHERE column_name = 'chunk_layer') as has_chunk_layer,
  COUNT(*) FILTER (WHERE column_name = 'parent_chunk_id') as has_parent_chunk_id,
  COUNT(*) FILTER (WHERE column_name = 'extracted_facts') as has_extracted_facts
FROM information_schema.columns 
WHERE table_name = 'document_chunks';

