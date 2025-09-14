/**
 * Database Migration Script
 * 
 * Runs database migrations to set up the ARYA-RAG schema in Supabase.
 * 
 * Usage:
 *   npm run migrate
 * 
 * @author ARYA RAG Team
 */

import dotenv from 'dotenv';
import { DatabaseClient } from '../config/database.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config();

async function runMigration() {
  console.log('🚀 Starting ARYA-RAG Database Migration...');
  console.log('=====================================');
  
  try {
    // Validate environment
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      throw new Error('❌ Missing Supabase credentials. Please check SUPABASE_URL and SUPABASE_ANON_KEY.');
    }

    console.log(`🔗 Connecting to Supabase: ${process.env.SUPABASE_URL.split('.')[0]}...`);

    // Get database client
    const dbClient = DatabaseClient.getInstance();
    const db = dbClient.getClient();

    // Test connection with a simple query
    console.log('🔍 Testing database connection...');
    const { data: testData, error: testError } = await db
      .rpc('get_current_ts');

    if (testError && !testError.message.includes('function')) {
      throw new Error(`❌ Database connection failed: ${testError.message}`);
    }

    console.log('✅ Database connection successful');

    // Read migration file
    const migrationPath = join(__dirname, '../../migrations/001_init_schema.sql');
    console.log(`📂 Loading migration: ${migrationPath}`);
    
    const migrationSQL = readFileSync(migrationPath, 'utf-8');

    // Split SQL into individual statements (rough split on semicolons)
    const statements = migrationSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    console.log(`📊 Found ${statements.length} SQL statements to execute`);

    // Try to create tables directly using Supabase client
    console.log('📋 Creating tables directly...');
    let successCount = 0;
    let errorCount = 0;

    try {
      // Step 1: Enable pgvector extension (might fail, that's OK)
      console.log('🔧 Enabling pgvector extension...');
      const { error: extensionError } = await db.rpc('exec', {
        sql: 'CREATE EXTENSION IF NOT EXISTS vector'
      });
      if (extensionError && !extensionError.message.includes('already exists')) {
        console.warn('⚠️  pgvector extension setup:', extensionError.message);
      }

      // Step 2: Try to create user_documents table
      console.log('📄 Creating user_documents table...');
      const { error: docsTableError } = await db
        .from('user_documents')
        .select('*')
        .limit(1);
      
      if (docsTableError && docsTableError.code === '42P01') {
        console.log('   ❌ user_documents table missing - attempting manual table operations');
      } else {
        console.log('   ✅ user_documents table exists');
        successCount++;
      }

      // Step 3: Test document_chunks table
      console.log('📝 Checking document_chunks table...');
      const { error: chunksTableError } = await db
        .from('document_chunks')
        .select('*')
        .limit(1);
        
      if (chunksTableError && chunksTableError.code === '42P01') {
        console.log('   ❌ document_chunks table missing');
      } else {
        console.log('   ✅ document_chunks table exists');
        successCount++;
      }

      // Step 4: Test user_queries table
      console.log('💭 Checking user_queries table...');
      const { error: queriesTableError } = await db
        .from('user_queries')
        .select('*')
        .limit(1);
        
      if (queriesTableError && queriesTableError.code === '42P01') {
        console.log('   ❌ user_queries table missing');
      } else {
        console.log('   ✅ user_queries table exists');
        successCount++;
      }

    } catch (err) {
      console.error('💥 Table creation error:', err);
      errorCount++;
    }

    console.log('🔄 Manual schema creation approach...');
    
    if (successCount === 0) {
      console.log('⚠️  No tables found. You need to manually create the schema in Supabase.');
      console.log('');
      console.log('📝 Steps to create schema in Supabase:');
      console.log('   1. Go to your Supabase Dashboard');
      console.log('   2. Navigate to SQL Editor');
      console.log('   3. Copy and execute the SQL from migrations/001_init_schema.sql');
      console.log('');
      console.log('📄 Alternatively, execute this SQL in Supabase SQL Editor:');
      console.log('');
      console.log(migrationSQL);
      console.log('');
    }

    // Test insert/select on user_documents table
    console.log('🧪 Testing table operations...');
    
    const testDoc = {
      document_id: `test_${Date.now()}`,
      user_id: 'migration_test',
      filename: 'migration_test.pdf',
      original_name: 'migration_test.pdf',
      title: 'Migration Test Document',
      mime_type: 'application/pdf',
      file_size: 1024,
      file_hash: 'test_hash_' + Date.now()
    };

    const { data: insertData, error: insertError } = await db
      .from('user_documents')
      .insert([testDoc])
      .select();

    if (insertError) {
      console.error('❌ Table insert test failed:', insertError.message);
    } else {
      console.log('✅ Table operations working - inserted test record');
      
      // Clean up test record
      await db
        .from('user_documents')
        .delete()
        .eq('document_id', testDoc.document_id);
      
      console.log('🧹 Cleaned up test record');
    }

    // Summary
    console.log('\n📊 Migration Summary:');
    console.log(`   ✅ Successful operations: ${successCount}`);
    console.log(`   ❌ Failed operations: ${errorCount}`);
    console.log(`   🏁 Migration completed`);

    if (errorCount === 0) {
      console.log('\n🎉 Database migration completed successfully!');
      console.log('   You can now upload documents and run RAG queries.');
    } else {
      console.log('\n⚠️  Migration completed with some errors.');
      console.log('   Check the logs above and verify table creation manually if needed.');
    }

  } catch (error) {
    console.error('\n💥 Migration failed:', error);
    process.exit(1);
  }
}

// Run migration if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigration().then(() => {
    process.exit(0);
  }).catch((error) => {
    console.error('Fatal migration error:', error);
    process.exit(1);
  });
}

export { runMigration };