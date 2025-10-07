# Quick Fix for Search Issue

## Problem
Your query returns "No results found" because the database migration hasn't been run yet.

**Error:** `column document_chunks.chunk_layer does not exist`

---

## Solution: Run Migration 003

### Step 1: Open Supabase SQL Editor

1. Go to https://supabase.com/dashboard
2. Select your project: `hgzsysnijjbbrpafymds`
3. Click "SQL Editor" in the left sidebar
4. Click "New Query"

### Step 2: Copy Migration SQL

Copy the contents of:
```
packages/backend/migrations/003_add_dual_layer_chunking.sql
```

Or copy this:

```sql
-- Migration 003: Add Dual-Layer Chunking Support

-- Add chunk_layer column
ALTER TABLE document_chunks 
ADD COLUMN IF NOT EXISTS chunk_layer VARCHAR(20) DEFAULT 'context' CHECK (chunk_layer IN ('context', 'detail'));

-- Add parent_chunk_id
ALTER TABLE document_chunks 
ADD COLUMN IF NOT EXISTS parent_chunk_id UUID REFERENCES document_chunks(chunk_id) ON DELETE CASCADE;

-- Add extracted_facts
ALTER TABLE document_chunks 
ADD COLUMN IF NOT EXISTS extracted_facts JSONB DEFAULT '[]'::jsonb;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_chunks_layer ON document_chunks(chunk_layer);
CREATE INDEX IF NOT EXISTS idx_chunks_parent ON document_chunks(parent_chunk_id);
CREATE INDEX IF NOT EXISTS idx_chunks_facts ON document_chunks USING GIN (extracted_facts);

-- Update existing chunks
UPDATE document_chunks 
SET chunk_layer = 'context' 
WHERE chunk_layer IS NULL;
```

### Step 3: Execute Migration

1. Paste SQL into the query editor
2. Click "Run" (or press Ctrl/Cmd + Enter)
3. Wait for "Success" message

### Step 4: Verify

Run this verification query:

```sql
SELECT 
  column_name, 
  data_type, 
  is_nullable 
FROM information_schema.columns 
WHERE table_name = 'document_chunks' 
AND column_name IN ('chunk_layer', 'parent_chunk_id', 'extracted_facts');
```

You should see 3 rows returned.

---

## After Migration

### Test the search:

```bash
# In your browser or via curl
curl -X POST http://localhost:3001/api/queries/process \
  -H "Content-Type: application/json" \
  -d '{
    "query": "explain about LSO and why they are important",
    "userId": "test"
  }'
```

**Expected result:** You should now get an answer about LSO with page citations! ✅

---

## Why This Happened

1. ✅ Your document uploaded successfully (224 chunks)
2. ❌ But the new `chunk_layer` column wasn't in the database yet
3. ❌ The query tried to read `chunk_layer` and failed
4. ❌ Search returned 0 results

**After migration:** Everything will work! 🚀

---

## Alternative: Quick Backward-Compatible Fix

If you can't run the migration right now, I can make the code backward-compatible to work without the new columns. Let me know!

