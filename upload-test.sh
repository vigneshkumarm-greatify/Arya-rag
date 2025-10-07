#!/bin/bash
# Quick upload test script

echo "🔍 Testing document upload..."
echo ""

# Check if file exists
if [ ! -f "Fire_Safety_QA.pdf" ]; then
    echo "❌ Fire_Safety_QA.pdf not found!"
    echo "Using testing.pdf instead..."
    FILE="testing.pdf"
else
    FILE="Fire_Safety_QA.pdf"
fi

# Upload document
echo "📤 Uploading $FILE..."
curl -X POST http://localhost:3001/api/documents/upload \
  -F "file=@$FILE" \
  -F "userId=test-user" \
  -v

echo ""
echo ""
echo "🕐 Waiting 5 seconds..."
sleep 5

# Check status
echo "📊 Checking document status..."
curl -s "http://localhost:3001/api/documents/list?userId=test-user" | jq '.data.documents[] | {filename, status, chunks: .total_chunks}'

