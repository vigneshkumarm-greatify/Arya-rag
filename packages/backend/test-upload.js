import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

async function testUpload() {
  try {
    console.log('🧪 Testing document upload...');
    
    // Create form data
    const form = new FormData();
    const pdfBuffer = fs.readFileSync('/Users/vigneshkumarm/Documents/chatbot/arya-rag/testing.pdf');
    
    form.append('document', pdfBuffer, {
      filename: 'testing.pdf',
      contentType: 'application/pdf'
    });
    form.append('userId', 'testuser123');
    form.append('title', 'Test Document with Logs');
    
    console.log('📤 Uploading document...');
    
    const response = await fetch('http://localhost:3001/api/documents/upload', {
      method: 'POST',
      body: form,
      headers: form.getHeaders()
    });
    
    const result = await response.json();
    console.log('📋 Upload response:', result);
    
    if (result.success) {
      console.log(`✅ Upload successful! Document ID: ${result.data.documentId}`);
      console.log('🔄 Background processing should start now - check server logs');
      
      // Poll status for 30 seconds to see logs
      const documentId = result.data.documentId;
      console.log('⏱️  Polling status for 30 seconds...');
      
      for (let i = 0; i < 15; i++) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const statusResponse = await fetch(`http://localhost:3001/api/documents/${documentId}/status?userId=testuser123`);
        const statusData = await statusResponse.json();
        
        if (statusData.success) {
          console.log(`📊 Status check ${i + 1}: ${statusData.data.status} - ${statusData.data.progress?.stage} (${statusData.data.progress?.percentage}%)`);
          console.log(`   Message: ${statusData.data.progress?.message}`);
          
          if (statusData.data.status === 'completed' || statusData.data.status === 'failed') {
            console.log(`🏁 Processing finished with status: ${statusData.data.status}`);
            break;
          }
        }
      }
    }
    
  } catch (error) {
    console.error('💥 Test failed:', error.message);
  } finally {
    process.exit(0);
  }
}

testUpload();