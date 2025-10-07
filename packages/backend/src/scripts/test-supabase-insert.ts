/**
 * Test Supabase Client Insert
 * 
 * This script tests if the Supabase client can insert chunks with the new columns
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testInsert() {
  console.log('🧪 Testing Supabase Client Insert\n');
  
  const testDocId = `test_doc_${Date.now()}`;
  const testChunkId = `test_chunk_${Date.now()}`;
  const testUserId = 'test_user';
  
  try {
    // Step 1: Create test document
    console.log('1️⃣ Creating test document...');
    const { data: doc, error: docError } = await supabase
      .from('user_documents')
      .insert({
        document_id: testDocId,
        user_id: testUserId,
        filename: 'test.pdf',
        original_name: 'test.pdf',
        file_hash: 'test_hash_' + Date.now(),
        file_size: 1000,
        status: 'completed',
        storage_path: 'test/test.pdf',
        page_count: 1
      })
      .select()
      .single();
    
    if (docError) {
      console.error('❌ Failed to create document:', docError);
      return;
    }
    console.log('✅ Document created:', doc.document_id);
    
    // Step 2: Try inserting chunk WITHOUT new columns
    console.log('\n2️⃣ Testing insert WITHOUT new columns...');
    const { data: chunk1, error: error1 } = await supabase
      .from('document_chunks')
      .insert({
        chunk_id: testChunkId + '_basic',
        document_id: testDocId,
        user_id: testUserId,
        chunk_index: 0,
        chunk_text: 'Test content without new columns',
        chunk_tokens: 10,
        page_number: 1,
        embedding: Array(768).fill(0.1),
        embedding_model: 'test-model'
      })
      .select()
      .single();
    
    if (error1) {
      console.error('❌ Insert without new columns failed:', error1);
    } else {
      console.log('✅ Insert without new columns succeeded');
    }
    
    // Step 3: Try inserting chunk WITH new columns
    console.log('\n3️⃣ Testing insert WITH new columns...');
    const { data: chunk2, error: error2 } = await supabase
      .from('document_chunks')
      .insert({
        chunk_id: testChunkId + '_full',
        document_id: testDocId,
        user_id: testUserId,
        chunk_index: 1,
        chunk_text: 'Test content with new columns',
        chunk_tokens: 10,
        page_number: 1,
        embedding: Array(768).fill(0.1),
        embedding_model: 'test-model',
        chunk_layer: 'context',
        parent_chunk_id: null,
        extracted_facts: []
      })
      .select()
      .single();
    
    if (error2) {
      console.error('❌ Insert with new columns failed:', error2);
      console.error('Error details:', JSON.stringify(error2, null, 2));
    } else {
      console.log('✅ Insert with new columns succeeded');
      console.log('Inserted chunk:', chunk2);
    }
    
    // Step 4: Cleanup
    console.log('\n4️⃣ Cleaning up...');
    await supabase.from('document_chunks').delete().eq('document_id', testDocId);
    await supabase.from('user_documents').delete().eq('document_id', testDocId);
    console.log('✅ Cleanup complete');
    
    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 SUMMARY:');
    console.log('='.repeat(50));
    if (!error1 && !error2) {
      console.log('✅ Both inserts succeeded - No issue!');
    } else if (!error1 && error2) {
      console.log('⚠️  Basic insert works, but new columns fail');
      console.log('🔍 This means: PostgREST cache issue OR columns don\'t exist');
    } else {
      console.log('❌ Both inserts failed - Database connection issue');
    }
    
  } catch (error) {
    console.error('💥 Unexpected error:', error);
  }
}

testInsert();

