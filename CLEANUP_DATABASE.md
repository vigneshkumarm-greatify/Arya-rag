# Database Cleanup Guide

## Issue: Duplicate Chunk IDs

If you encountered "duplicate key value violates unique constraint" errors, you need to clean up the database before re-uploading.

---

## Quick Fix (Supabase SQL Editor)

### Option 1: Delete Failed Document

If you have the document ID (e.g., `doc_test_1759508371514_78skxw3xz`):

```sql
-- Delete all chunks for this document
DELETE FROM document_chunks 
WHERE document_id = 'doc_test_1759508371514_78skxw3xz';

-- Delete the document record
DELETE FROM user_documents 
WHERE document_id = 'doc_test_1759508371514_78skxw3xz';
```

### Option 2: Clean All Failed Documents

Delete all documents with "failed" or "embedding" status:

```sql
-- Find failed documents
SELECT document_id, title, status, processing_stage 
FROM user_documents 
WHERE status IN ('failed', 'processing') 
   OR processing_stage IN ('embedding', 'storing');

-- Delete their chunks
DELETE FROM document_chunks 
WHERE document_id IN (
  SELECT document_id 
  FROM user_documents 
  WHERE status IN ('failed', 'processing')
);

-- Delete the documents
DELETE FROM user_documents 
WHERE status IN ('failed', 'processing');
```

### Option 3: Clean Everything (Start Fresh)

⚠️ **Warning:** This deletes ALL documents and chunks!

```sql
-- Delete all chunks
DELETE FROM document_chunks;

-- Delete all documents
DELETE FROM user_documents;

-- Verify clean slate
SELECT COUNT(*) as chunk_count FROM document_chunks;
SELECT COUNT(*) as document_count FROM user_documents;
```

---

## What Was Fixed

### Before (Bug):
```
Context chunks: doc-chunk-0, doc-chunk-1, doc-chunk-2
Detail chunks:  doc-chunk-0, doc-chunk-1, doc-chunk-2  ❌ DUPLICATES!
```

### After (Fixed):
```
Context chunks: doc-chunk-0, doc-chunk-1, doc-chunk-2
Detail chunks:  doc-chunk-detail-0, doc-chunk-detail-1, doc-chunk-detail-2  ✅ UNIQUE!
```

---

## Next Steps

1. **Clean Database** (run one of the SQL queries above)
2. **Wait for Backend Reload** (tsx watch will auto-reload)
3. **Re-upload Document** via frontend or API
4. **Verify Success** - check backend logs for:
   ```
   ✅ Created 4 context chunks
   ✅ Created 7 detail chunks
   ✨ Generated embeddings for 11 chunks
   💾 Stored 11 chunks successfully
   ```

---

## Verification Queries

### Check Chunk IDs (After Upload)

```sql
-- See ID patterns
SELECT 
  id,
  chunk_layer,
  parent_chunk_id,
  chunk_index,
  page_number
FROM document_chunks
ORDER BY chunk_index
LIMIT 20;
```

Expected:
```
id                        | chunk_layer | parent_chunk_id
--------------------------|-------------|------------------
doc-chunk-0               | context     | null
doc-chunk-1               | context     | null
doc-chunk-detail-0        | detail      | doc-chunk-0
doc-chunk-detail-1        | detail      | doc-chunk-0
doc-chunk-detail-2        | detail      | doc-chunk-1
```

### Check for Duplicates

```sql
-- Should return 0 rows
SELECT id, COUNT(*) as count
FROM document_chunks
GROUP BY id
HAVING COUNT(*) > 1;
```

### View Layer Distribution

```sql
SELECT 
  chunk_layer,
  COUNT(*) as count,
  AVG(chunk_tokens) as avg_tokens
FROM document_chunks
GROUP BY chunk_layer;
```

Expected:
```
chunk_layer | count | avg_tokens
------------|-------|------------
context     | 4     | 250
detail      | 7     | 165
```

---

## Troubleshooting

### "Still getting duplicate errors"
- Make sure backend reloaded (check terminal)
- Clear browser cache
- Delete old chunks from database

### "No chunks being created"
- Check backend logs for errors
- Verify migration was run
- Check OpenAI API key is valid

### "Document stuck in 'processing'"
- Check backend logs for actual error
- Delete the document and retry
- Verify database connection

---

**After cleanup, your uploads should work perfectly!** ✅

