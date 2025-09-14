import dotenv from 'dotenv';
dotenv.config();

// Import the background function directly
import { createClient } from '@supabase/supabase-js';

const client = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function testBackgroundProcessing() {
  try {
    console.log('🔧 Testing background processing directly...');
    
    // Get the latest document
    const { data: doc, error } = await client
      .from('user_documents')
      .select('*')
      .eq('user_id', 'logtest456')
      .eq('status', 'pending')
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .single();
    
    if (error) {
      console.error('❌ Error finding document:', error.message);
      process.exit(1);
    }
    
    if (!doc) {
      console.log('❌ No pending document found');
      process.exit(1);
    }
    
    console.log(`📄 Found document: ${doc.document_id}`);
    console.log(`   Status: ${doc.status}`);
    console.log(`   Storage path: ${doc.storage_path}`);
    
    // Now manually update status to test database
    console.log('🔧 Testing database update...');
    const { error: updateError } = await client
      .from('user_documents')
      .update({
        status: 'processing',
        processing_started_at: new Date(),
        processing_stage: 'downloading'
      })
      .eq('document_id', doc.document_id);
    
    if (updateError) {
      console.error('❌ Failed to update status:', updateError.message);
    } else {
      console.log('✅ Successfully updated document status to processing');
      
      // Check the update
      const { data: updatedDoc } = await client
        .from('user_documents')
        .select('status, processing_stage, processing_started_at')
        .eq('document_id', doc.document_id)
        .single();
      
      console.log('📊 Updated document:', updatedDoc);
    }
    
  } catch (err) {
    console.error('💥 Error:', err.message);
  } finally {
    process.exit(0);
  }
}

testBackgroundProcessing();