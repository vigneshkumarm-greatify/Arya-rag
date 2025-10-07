# Get Supabase Database Password

To bypass PostgREST's schema cache, we need direct PostgreSQL access.

## Steps to Get Your Database Password:

1. **Go to Supabase Dashboard**: https://supabase.com/dashboard/project/kdmkdbsxbsxgecwykbut

2. **Click "Settings" (gear icon) in the left sidebar**

3. **Click "Database" in the settings menu**

4. **Scroll down to "Connection string"**

5. **Select "URI" tab**

6. **You'll see something like:**
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.kdmkdbsxbsxgecwykbut.supabase.co:5432/postgres
   ```

7. **Copy the password** (the part after `postgres:` and before `@`)

8. **Add it to your `.env` file:**
   ```bash
   SUPABASE_DB_PASSWORD=your_password_here
   ```

## Why We Need This:

Supabase's PostgREST API has a schema cache that hasn't refreshed in 12+ hours. This is a known bug.

By using a direct PostgreSQL connection, we bypass the REST API entirely and access the database directly, avoiding all cache issues.

## Security Note:

This password is for **direct database access**. Keep it secure and never commit it to git!


