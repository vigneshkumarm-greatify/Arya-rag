import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const client = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function checkDocument() {
  try {
    console.log('🔍 Querying document: doc_testuser1757860483600_1757860485636_u3cirg2k8');
    
    const { data, error } = await client
      .from('user_documents')
      .select('*')
      .eq('document_id', 'doc_testuser1757860483600_1757860485636_u3cirg2k8')
      .single();
    
    if (error) {
      console.log('❌ Error:', error.message);
      return;
    }
    
    console.log('\n📄 Document record:');
    console.log('- document_id:', data.document_id);
    console.log('- user_id:', data.user_id);
    console.log('- status:', data.status);
    console.log('- total_pages:', data.total_pages);
    console.log('- total_chunks:', data.total_chunks);
    console.log('- embedding_model:', data.embedding_model);
    console.log('- filename:', data.filename);
    console.log('- uploaded_at:', data.uploaded_at);
    console.log('- processing_started_at:', data.processing_started_at);
    console.log('- processing_completed_at:', data.processing_completed_at);
    
    // Check related chunks
    const { data: chunks, error: chunkError } = await client
      .from('document_chunks')
      .select('document_id, chunk_index, embedding_model, user_id')
      .eq('document_id', 'doc_testuser1757860483600_1757860485636_u3cirg2k8')
      .limit(3);
      
    if (!chunkError && chunks && chunks.length > 0) {
      console.log('\n📊 Document chunks found:', chunks.length);
      console.log('Sample chunks:');
      chunks.forEach(chunk => {
        console.log(`- Chunk ${chunk.chunk_index}: embedding_model = ${chunk.embedding_model}`);
      });
    } else {
      console.log('\n📊 No chunks found:', chunkError?.message || 'No error');
    }
    
  } catch (err) {
    console.error('💥 Script error:', err.message);
  } finally {
    process.exit(0);
  }
}

checkDocument();