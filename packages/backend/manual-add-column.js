import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function addColumn() {
  try {
    console.log('🔧 Manually adding processing_stage column...');
    
    // First check if the column exists by querying a document
    const { data: testDoc, error: testError } = await supabase
      .from('user_documents')
      .select('*')
      .limit(1)
      .single();
    
    if (testDoc) {
      console.log('📋 Current columns:', Object.keys(testDoc));
      
      if ('processing_stage' in testDoc) {
        console.log('✅ processing_stage column already exists');
      } else {
        console.log('❌ processing_stage column does NOT exist');
        console.log('🔧 Need to add it manually through Supabase dashboard');
        console.log('   SQL: ALTER TABLE user_documents ADD COLUMN processing_stage VARCHAR(50);');
      }
    }
    
  } catch (error) {
    console.error('💥 Error:', error.message);
  } finally {
    process.exit(0);
  }
}

addColumn();