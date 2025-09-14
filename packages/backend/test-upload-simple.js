import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

async function testSimpleUpload() {
  try {
    console.log('🧪 Testing simple upload...');
    
    const form = new FormData();
    const pdfBuffer = fs.readFileSync('/Users/vigneshkumarm/Documents/chatbot/arya-rag/testing.pdf');
    
    form.append('document', pdfBuffer, {
      filename: 'testing-logs.pdf',
      contentType: 'application/pdf'
    });
    form.append('userId', 'logtest456');
    form.append('title', 'Log Test Document');
    
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
      console.log('⏱️  Waiting 10 seconds then checking database...');
      
      // Wait 10 seconds for processing to start
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      console.log('🔍 Checking database...');
    }
    
  } catch (error) {
    console.error('💥 Error:', error.message);
  } finally {
    process.exit(0);
  }
}

testSimpleUpload();