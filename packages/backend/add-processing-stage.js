import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const client = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function addProcessingStageColumn() {
  try {
    console.log('🔧 Adding processing_stage column to user_documents table...');
    
    // Check if column exists first
    const { data: columns, error: checkError } = await client
      .from('INFORMATION_SCHEMA.COLUMNS')
      .select('column_name')
      .eq('table_name', 'user_documents')
      .eq('column_name', 'processing_stage');
    
    if (checkError) {
      console.log('Note: Could not check for existing column, proceeding with ALTER TABLE...');
    }
    
    if (columns && columns.length > 0) {
      console.log('✅ processing_stage column already exists');
      return;
    }
    
    // Add the column using RPC if available or direct SQL
    const { error } = await client.rpc('exec_sql', {
      query: `
        ALTER TABLE user_documents 
        ADD COLUMN IF NOT EXISTS processing_stage VARCHAR(50);
        
        COMMENT ON COLUMN user_documents.processing_stage 
        IS 'Current processing stage: downloading, extracting, chunking, embedding, storing';
      `
    });
    
    if (error) {
      console.error('❌ Error adding column:', error.message);
      process.exit(1);
    }
    
    console.log('✅ processing_stage column added successfully');
    
  } catch (err) {
    console.error('💥 Script error:', err.message);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

addProcessingStageColumn();