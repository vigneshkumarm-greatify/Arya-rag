import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const client = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function checkLatestDocument() {
  try {
    console.log('🔍 Checking latest uploaded document...');
    
    const { data, error } = await client
      .from('user_documents')
      .select('*')
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .single();
    
    if (error) {
      console.log('❌ Error:', error.message);
      return;
    }
    
    if (!data) {
      console.log('❌ No documents found');
      return;
    }
    
    console.log('📄 Latest document:');
    console.log('- document_id:', data.document_id);
    console.log('- user_id:', data.user_id);
    console.log('- status:', data.status);
    console.log('- processing_stage:', data.processing_stage);
    console.log('- processing_started_at:', data.processing_started_at);
    console.log('- error_message:', data.error_message);
    console.log('- embedding_model:', data.embedding_model);
    console.log('- uploaded_at:', data.uploaded_at);
    console.log('- storage_path:', data.storage_path);
    
  } catch (err) {
    console.error('💥 Script error:', err.message);
  } finally {
    process.exit(0);
  }
}

checkLatestDocument();