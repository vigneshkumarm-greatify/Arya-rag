import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

async function testChunkingFix() {
  try {
    console.log('🧪 Testing chunking fix...');
    
    const form = new FormData();
    const pdfBuffer = fs.readFileSync('/Users/vigneshkumarm/Documents/chatbot/arya-rag/testing.pdf');
    
    form.append('document', pdfBuffer, {
      filename: 'chunking-fix-test.pdf',
      contentType: 'application/pdf'
    });
    form.append('userId', 'chunktest123');
    form.append('title', 'Chunking Fix Test');
    
    console.log('📤 Uploading...');
    
    const response = await fetch('http://localhost:3001/api/documents/upload', {
      method: 'POST',
      body: form,
      headers: form.getHeaders()
    });
    
    const result = await response.json();
    console.log('📋 Upload result:', result);
    
    if (result.success) {
      console.log(`✅ Upload successful! Document ID: ${result.data.documentId}`);
      console.log('🔄 Should now pass chunking stage - check server logs');
    }
    
  } catch (error) {
    console.error('💥 Error:', error.message);
  } finally {
    process.exit(0);
  }
}

testChunkingFix();