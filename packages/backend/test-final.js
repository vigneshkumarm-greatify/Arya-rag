import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

async function finalTest() {
  try {
    console.log('🧪 Final test with fixed background processing...');
    
    const form = new FormData();
    const pdfBuffer = fs.readFileSync('/Users/vigneshkumarm/Documents/chatbot/arya-rag/testing.pdf');
    
    form.append('document', pdfBuffer, {
      filename: 'final-test.pdf',
      contentType: 'application/pdf'
    });
    form.append('userId', 'finaltest789');
    form.append('title', 'Final Test Document');
    
    console.log('📤 Uploading final test...');
    
    const response = await fetch('http://localhost:3001/api/documents/upload', {
      method: 'POST',
      body: form,
      headers: form.getHeaders()
    });
    
    const result = await response.json();
    console.log('📋 Upload result:', result);
    
    if (result.success) {
      console.log(`✅ Upload successful! Document ID: ${result.data.documentId}`);
      console.log('🔄 Background processing should start immediately');
      console.log('📋 Check server console for detailed logs');
    }
    
  } catch (error) {
    console.error('💥 Error:', error.message);
  } finally {
    process.exit(0);
  }
}

finalTest();