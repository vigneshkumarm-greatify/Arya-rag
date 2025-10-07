-- ============================================
-- COMPLETE SCHEMA FIX
-- Adds ALL missing columns across ALL tables
-- Then creates the PostgreSQL function
-- ============================================

DO $$ 
BEGIN
  RAISE NOTICE '🔧 Checking and fixing database schema...';
  RAISE NOTICE '';
  
  -- ==========================================
  -- Part 1: Fix user_documents table
  -- ==========================================
  RAISE NOTICE '📄 Checking user_documents table...';
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_documents' AND column_name = 'original_name'
  ) THEN
    ALTER TABLE user_documents ADD COLUMN original_name TEXT;
    RAISE NOTICE '  ✅ Added original_name';
  ELSE
    RAISE NOTICE '  ✓ original_name exists';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_documents' AND column_name = 'file_hash'
  ) THEN
    ALTER TABLE user_documents ADD COLUMN file_hash TEXT;
    RAISE NOTICE '  ✅ Added file_hash';
  ELSE
    RAISE NOTICE '  ✓ file_hash exists';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_documents' AND column_name = 'page_count'
  ) THEN
    ALTER TABLE user_documents ADD COLUMN page_count INTEGER DEFAULT 0;
    RAISE NOTICE '  ✅ Added page_count';
  ELSE
    RAISE NOTICE '  ✓ page_count exists';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_documents' AND column_name = 'storage_path'
  ) THEN
    ALTER TABLE user_documents ADD COLUMN storage_path TEXT;
    RAISE NOTICE '  ✅ Added storage_path';
  ELSE
    RAISE NOTICE '  ✓ storage_path exists';
  END IF;

  -- ==========================================
  -- Part 2: Fix document_chunks table
  -- ==========================================
  RAISE NOTICE '';
  RAISE NOTICE '📦 Checking document_chunks table...';
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'document_chunks' AND column_name = 'chunk_layer'
  ) THEN
    ALTER TABLE document_chunks ADD COLUMN chunk_layer VARCHAR(20) DEFAULT 'context';
    RAISE NOTICE '  ✅ Added chunk_layer';
  ELSE
    RAISE NOTICE '  ✓ chunk_layer exists';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'document_chunks' AND column_name = 'parent_chunk_id'
  ) THEN
    ALTER TABLE document_chunks ADD COLUMN parent_chunk_id VARCHAR(100);
    RAISE NOTICE '  ✅ Added parent_chunk_id';
  ELSE
    RAISE NOTICE '  ✓ parent_chunk_id exists';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'document_chunks' AND column_name = 'extracted_facts'
  ) THEN
    ALTER TABLE document_chunks ADD COLUMN extracted_facts JSONB DEFAULT '[]'::jsonb;
    RAISE NOTICE '  ✅ Added extracted_facts';
  ELSE
    RAISE NOTICE '  ✓ extracted_facts exists';
  END IF;

  -- ==========================================
  -- Part 3: Fix conversation_sessions table
  -- ==========================================
  RAISE NOTICE '';
  RAISE NOTICE '💬 Checking conversation_sessions table...';
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'conversation_sessions' AND column_name = 'last_activity_at'
  ) THEN
    ALTER TABLE conversation_sessions ADD COLUMN last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    RAISE NOTICE '  ✅ Added last_activity_at';
  ELSE
    RAISE NOTICE '  ✓ last_activity_at exists';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'conversation_sessions' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE conversation_sessions ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
    RAISE NOTICE '  ✅ Added metadata';
  ELSE
    RAISE NOTICE '  ✓ metadata exists';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'conversation_sessions' AND column_name = 'current_topic'
  ) THEN
    ALTER TABLE conversation_sessions ADD COLUMN current_topic VARCHAR(500);
    RAISE NOTICE '  ✅ Added current_topic';
  ELSE
    RAISE NOTICE '  ✓ current_topic exists';
  END IF;

  -- ==========================================
  -- Part 4: Fix conversation_messages table
  -- ==========================================
  RAISE NOTICE '';
  RAISE NOTICE '💬 Checking conversation_messages table...';
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'conversation_messages' AND column_name = 'resolved_query'
  ) THEN
    ALTER TABLE conversation_messages ADD COLUMN resolved_query TEXT;
    RAISE NOTICE '  ✅ Added resolved_query';
  ELSE
    RAISE NOTICE '  ✓ resolved_query exists';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'conversation_messages' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE conversation_messages ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
    RAISE NOTICE '  ✅ Added metadata';
  ELSE
    RAISE NOTICE '  ✓ metadata exists';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '✅ Schema check complete!';
  RAISE NOTICE '';
END $$;

-- ==========================================
-- Part 5: Create indexes if missing
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_chunks_layer ON document_chunks(chunk_layer);
CREATE INDEX IF NOT EXISTS idx_chunks_parent ON document_chunks(parent_chunk_id);
CREATE INDEX IF NOT EXISTS idx_sessions_activity ON conversation_sessions(last_activity_at);

-- ==========================================
-- Part 6: Create PostgreSQL function
-- ==========================================
DROP FUNCTION IF EXISTS insert_document_chunks_batch(jsonb);

CREATE OR REPLACE FUNCTION insert_document_chunks_batch(chunks_json jsonb)
RETURNS TABLE (
  inserted_count integer,
  error_message text
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  chunk_record jsonb;
  inserted int := 0;
BEGIN
  FOR chunk_record IN SELECT * FROM jsonb_array_elements(chunks_json)
  LOOP
    BEGIN
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
        section_title,
        embedding,
        embedding_model,
        chunk_layer,
        parent_chunk_id,
        extracted_facts
      ) VALUES (
        (chunk_record->>'chunk_id')::text,
        (chunk_record->>'document_id')::text,
        (chunk_record->>'user_id')::text,
        (chunk_record->>'chunk_index')::integer,
        (chunk_record->>'chunk_text')::text,
        (chunk_record->>'chunk_tokens')::integer,
        (chunk_record->>'page_number')::integer,
        (chunk_record->>'page_position_start')::integer,
        (chunk_record->>'page_position_end')::integer,
        (chunk_record->>'section_title')::text,
        (chunk_record->'embedding')::vector(768),
        (chunk_record->>'embedding_model')::text,
        COALESCE((chunk_record->>'chunk_layer')::text, 'context'),
        (chunk_record->>'parent_chunk_id')::text,
        COALESCE((chunk_record->'extracted_facts')::jsonb, '[]'::jsonb)
      );
      
      inserted := inserted + 1;
      
    EXCEPTION WHEN OTHERS THEN
      RETURN QUERY SELECT 0, SQLERRM;
      RETURN;
    END;
  END LOOP;
  
  RETURN QUERY SELECT inserted, NULL::text;
END;
$$;

GRANT EXECUTE ON FUNCTION insert_document_chunks_batch(jsonb) TO authenticated, anon;

-- ==========================================
-- Part 7: Test everything
-- ==========================================
DO $$
DECLARE
  result record;
  test_doc_id text := 'test_complete_' || NOW()::text;
BEGIN
  -- Create test document
  INSERT INTO user_documents (
    document_id, 
    user_id, 
    filename,
    original_name,
    file_hash,
    page_count,
    storage_path,
    status,
    file_size
  )
  VALUES (
    test_doc_id, 
    'test_user', 
    'test.pdf',
    'test.pdf',
    'test_hash',
    1,
    'test/test.pdf',
    'completed',
    1000
  );
  
  -- Test the function
  SELECT * INTO result FROM insert_document_chunks_batch(
    jsonb_build_array(
      jsonb_build_object(
        'chunk_id', 'test_chunk_complete',
        'document_id', test_doc_id,
        'user_id', 'test_user',
        'chunk_index', 0,
        'chunk_text', 'Test complete',
        'chunk_tokens', 10,
        'page_number', 1,
        'page_position_start', 0,
        'page_position_end', 100,
        'section_title', null,
        'embedding', array_to_json(array_fill(0.1::float, ARRAY[768])),
        'embedding_model', 'test-model',
        'chunk_layer', 'context',
        'parent_chunk_id', null,
        'extracted_facts', '[]'::jsonb
      )
    )
  );
  
  IF result.error_message IS NULL THEN
    RAISE NOTICE '════════════════════════════════════════════════════════';
    RAISE NOTICE '🎉 SUCCESS! Everything is working!';
    RAISE NOTICE '════════════════════════════════════════════════════════';
    RAISE NOTICE '';
    RAISE NOTICE '✅ All schema fixes applied';
    RAISE NOTICE '✅ PostgreSQL function created';
    RAISE NOTICE '✅ Test insert successful';
    RAISE NOTICE '✅ Inserted % chunk(s) with advanced features', result.inserted_count;
    RAISE NOTICE '';
    RAISE NOTICE '🚀 Your database is ready!';
    RAISE NOTICE '👉 Now restart your backend to start using it';
    RAISE NOTICE '';
    RAISE NOTICE '════════════════════════════════════════════════════════';
  ELSE
    RAISE NOTICE '❌ Test failed: %', result.error_message;
  END IF;
  
  -- Cleanup
  DELETE FROM document_chunks WHERE document_id = test_doc_id;
  DELETE FROM user_documents WHERE document_id = test_doc_id;
END $$;

