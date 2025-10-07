# Update Your .env File

## Step 1: Open Your .env File

**File location:** `packages/backend/.env`

Open it in your code editor.

---

## Step 2: Replace These Two Lines

Find these lines:
```bash
SUPABASE_URL=https://hgzsysnijjbbrpafymds.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhnenN5c25pampiYnJwYWZ5bWRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc4NTY1NTgsImV4cCI6MjA3MzQzMjU1OH0.mXwU8mrKuHEzcXAaGBfMo-asSnLPVjnFZ5sp7hXEvRg
```

**Replace with YOUR credentials:**
```bash
SUPABASE_URL=https://kdmkdbsxbsxgecwykbut.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkbWtkYnN4YnN4Z2Vjd3lrYnV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1MTE2NDcsImV4cCI6MjA3NTA4NzY0N30.BZStMG43QK2GYoTOAWRs_pDKjKofbDmlMRbpABr1kOA
```

---

## Step 3: Save the File

Press `Cmd+S` (Mac) or `Ctrl+S` (Windows) to save.

---

## Step 4: Run Database Schema

Now that your `.env` is updated, create the database tables:

1. **Go to Supabase SQL Editor:**
   - https://app.supabase.com/project/kdmkdbsxbsxgecwykbut/sql
   
2. **Click "New Query"**

3. **Copy ALL contents from:** `COMPLETE_SCHEMA.sql`

4. **Paste into SQL Editor**

5. **Click "Run"** (or press Cmd/Ctrl + Enter)

6. **Wait for success message** - You'll see:
   ```
   ✅ DATABASE SCHEMA CREATED SUCCESSFULLY!
   Tables created: 5
   Indexes created: 15+
   ```

---

## Step 5: Restart Your Backend

Stop the backend (Ctrl+C) and restart:

```bash
cd packages/backend
npm run dev
```

Watch the logs - you should see:
```
✅ Environment validation passed
   Database: Supabase (https://kdmkdbsxbsxgecwykbut...)
```

---

## Step 6: Test Upload

1. Go to: http://localhost:3000
2. Upload a PDF document
3. Watch backend logs for:
   ```
   ✅ Created 4 context chunks
   ✅ Created 7 detail chunks
   ✅ Document processing complete!
   ```

4. Try querying:
   ```
   Query: "What is this document about?"
   Result: Should return answer with page citations! ✅
   ```

---

**That's it! Your system will be fully operational!** 🚀

