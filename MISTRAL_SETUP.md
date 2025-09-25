# Mistral 7B Instruct Setup Guide

Complete guide to set up and optimize ARYA-RAG with Mistral 7B Instruct for fully offline, high-performance document Q&A.

## 🚀 Quick Setup

### 1. Install Required Models

```bash
# Core Mistral model for text generation
ollama pull mistral:7b-instruct

# High-quality embeddings (recommended)
ollama pull mxbai-embed-large

# Alternative lighter embeddings
# ollama pull nomic-embed-text
```

### 2. Configure Environment

Copy the optimized settings from `.env.example`:

```bash
cp .env.example .env
```

Key Mistral optimizations in `.env`:

```env
# LLM Configuration
LLM_PROVIDER=ollama
LLM_MODEL=mistral:7b-instruct
LLM_TEMPERATURE=0.1
LLM_MAX_TOKENS=4096
LLM_CONTEXT_WINDOW=8192

# Embedding Configuration  
EMBEDDING_PROVIDER=ollama
EMBEDDING_MODEL=mxbai-embed-large
EMBEDDING_DIMENSIONS=1024
EMBEDDING_MAX_BATCH_SIZE=100

# Processing Settings (Optimized for Mistral)
CHUNK_SIZE_TOKENS=800
CHUNK_OVERLAP_TOKENS=150

# Mistral 7B Instruct Optimizations
MISTRAL_NUM_CTX=8192
MISTRAL_TEMPERATURE=0.1
MISTRAL_TOP_P=0.9
MISTRAL_TOP_K=40
MISTRAL_REPEAT_PENALTY=1.1
MISTRAL_MIROSTAT=2
```

### 3. Test the Pipeline

```bash
cd packages/backend
npm run test:mistral
```

## 🎯 Key Features

### Enhanced RAG Pipeline
- **Query Classification**: Automatically detects procedural, definitional, analytical, and general queries
- **Structured JSON Responses**: Enforced response schemas for consistent output
- **Hierarchical Chunking**: Preserves document section boundaries (1.1, 1.1.1, etc.)
- **Enhanced Citations**: Precise page and section references

### Mistral Optimizations
- **Extended Context**: 8192 tokens for complex documents
- **Low Temperature**: 0.1 for consistent, factual responses
- **Mirostat Sampling**: Better coherence for long responses
- **JSON Format Enforcement**: Native JSON output mode

### Document Processing
- **Section Detection**: Recognizes military/technical document hierarchies
- **Procedure Extraction**: Identifies and preserves step-by-step instructions
- **Cross-Reference Mapping**: Tracks references between sections
- **Enhanced Metadata**: Content classification for better retrieval

## 📋 Usage Examples

### Basic RAG Query
```typescript
import { RAGService } from './services/rag/RAGService';

const ragService = new RAGService({
  enableStructuredResponses: true,
  useQueryClassification: true,
  enforceJsonFormat: true
});

const response = await ragService.processQuery({
  query: "What are the steps to submit a leave request?",
  userId: "user123"
});

// Structured JSON response with steps, citations, and confidence
console.log(response);
```

### Enhanced Query Processing
```typescript
const enhancedResponse = await ragService.processEnhancedQuery({
  query: "Compare Section 1.2 and Section 1.3 requirements",
  userId: "user123"
});

// Includes query classification and structured data
console.log(enhancedResponse.queryClassification.type); // 'analytical'
console.log(enhancedResponse.structuredData); // Parsed JSON response
```

### Hierarchical Chunking
```typescript
import { HierarchicalChunkingService } from './services/chunking/HierarchicalChunkingService';

const chunking = new HierarchicalChunkingService();
const result = await chunking.processHierarchicalPages(pages, docId);

console.log(`Sections detected: ${result.sectionMap.size}`);
console.log(`Complete procedures: ${result.hierarchicalChunks.filter(c => c.isCompleteProcedure).length}`);
```

## 🔧 Advanced Configuration

### Custom Mistral Model (Optional)

Create a tuned model with enhanced guardrails:

```typescript
const llmService = new OllamaLLMService();
await llmService.createOptimizedMistralModel('navy-mistral:7b');
```

This creates a model with:
- Extended 8192 token context
- Navy documentation system prompt
- Optimized parameters for technical documents
- JSON response enforcement

### Performance Tuning

**Memory Optimization:**
- Use `mxbai-embed-large` for quality vs `nomic-embed-text` for speed
- Adjust `CHUNK_SIZE_TOKENS` based on document complexity
- Set `MAX_CHUNKS_PER_BATCH` based on available RAM

**Response Quality:**
- Lower `MISTRAL_TEMPERATURE` (0.05-0.1) for factual accuracy
- Increase `MISTRAL_TOP_K` (50-100) for more creative responses
- Adjust `MISTRAL_REPEAT_PENALTY` to reduce repetition

## 🎯 Performance Targets

With Mistral 7B Instruct, expect:

- **Response Time**: 2-5 seconds for complex queries
- **Accuracy**: 85-95% for structured responses
- **Memory Usage**: ~4GB RAM with full models
- **Token Generation**: 30-50 tokens/second on modern hardware

## 📚 Document Types Optimized For

- Military manuals and procedures
- Technical documentation with hierarchical sections
- Standard Operating Procedures (SOPs)
- Regulatory documents with cross-references
- Training materials with step-by-step instructions

## 🔍 Response Schemas

### Procedural Responses
```json
{
  "answer": "Brief summary of the procedure",
  "steps": [
    "Step 1: Complete Form XYZ", 
    "Step 2: Obtain approval",
    "Step 3: Submit documentation"
  ],
  "sections": ["1.2.1", "1.2.2"],
  "citations": [
    {"source": "Manual.pdf", "page": 15, "section": "1.2.1"}
  ],
  "confidence": 0.92
}
```

### Definitional Responses
```json
{
  "answer": "Operational readiness is defined as...",
  "confidence": 0.89,
  "sections": ["1.3", "2.1.1"],
  "citations": [
    {"source": "Definitions.pdf", "page": 8, "section": "1.3"}
  ]
}
```

## 🚨 Troubleshooting

### Common Issues

**Model Not Found:**
```bash
ollama pull mistral:7b-instruct
ollama pull mxbai-embed-large
```

**JSON Parsing Errors:**
- Check `MISTRAL_TEMPERATURE` is low (≤0.1)
- Verify `enforceJsonFormat` is enabled
- Review system prompts for JSON schema compliance

**Poor Response Quality:**
- Increase `CHUNK_OVERLAP_TOKENS` for better context
- Lower temperature for more consistent responses
- Check document chunking preserves section boundaries

**Memory Issues:**
- Reduce `MAX_CHUNKS_PER_BATCH`
- Use `nomic-embed-text` instead of `mxbai-embed-large`
- Decrease `MISTRAL_NUM_CTX` if needed

## 📈 Monitoring

Check pipeline health:

```bash
# Run comprehensive tests
npm run test:mistral

# Check model status
curl http://localhost:11434/api/tags

# Monitor performance
tail -f logs/arya-rag.log
```

## 🎉 Success Indicators

Your pipeline is working correctly when:

- ✅ Query classification accuracy >80%
- ✅ JSON responses parse correctly
- ✅ Section hierarchies preserved in chunks
- ✅ Citations include accurate page numbers
- ✅ Response times under 5 seconds
- ✅ Confidence scores reflect answer quality

## 📞 Support

For issues or optimization questions:
1. Check the test output: `npm run test:mistral`
2. Review logs for specific error messages
3. Verify environment configuration matches this guide
4. Test with simpler queries first

Your ARYA-RAG system is now optimized for Mistral 7B Instruct! 🚢⚓