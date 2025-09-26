/**
 * Mistral 7B Instruct Configuration
 * 
 * Optimized settings for Mistral 7B Instruct model running on Ollama.
 * Provides lean, fully-offline RAG with excellent performance for document Q&A.
 * 
 * @author ARYA RAG Team
 */

import { LLMServiceConfig } from '../services/llm/LLMService';
import { ChunkingOptions } from '../services/chunking/ChunkingService';

/**
 * Mistral 7B Instruct model configuration
 * Optimized for document analysis with structured responses
 */
export const MISTRAL_7B_CONFIG = {
  // Model identification
  model: 'mistral:7b-instruct',
  provider: 'ollama',
  
  // Context and generation limits
  maxTokens: 4096,          // Generous for detailed responses
  contextWindow: 8192,       // Mistral's full context window
  temperature: 0.1,         // Low for consistent, factual responses
  topP: 0.9,                // Slightly restrictive for focused responses
  topK: 40,                 // Balanced creativity vs accuracy
  
  // Response formatting
  stopSequences: ['</json>', '<|end|>', '\n\n---'],
  
  // Performance settings
  timeoutMs: 45000,         // Extended timeout for complex queries
  maxRetries: 3,
  retryDelayMs: 2000,
  
  // Ollama specific optimizations
  ollamaOptions: {
    num_ctx: 8192,          // Full context window
    temperature: 0.1,       // Consistent responses
    top_p: 0.9,
    top_k: 40,
    repeat_penalty: 1.1,    // Reduce repetition
    seed: 42,              // Reproducible results for testing
    mirostat: 2,           // Better coherence for long responses
    mirostat_eta: 0.1,
    mirostat_tau: 5.0
  }
} as const;

/**
 * Enhanced embedding configuration for Mistral-compatible embeddings
 * Optimized for semantic search with military/technical documents
 */
export const MISTRAL_EMBEDDING_CONFIG = {
  // Recommended embedding models for Mistral
  models: {
    // High quality but larger
    'mxbai-embed-large': {
      dimensions: 1024,
      maxTokens: 8192,
      recommended: true
    },
    // Lighter alternative
    'nomic-embed-text': {
      dimensions: 768,
      maxTokens: 8192,
      recommended: false
    }
  },
  
  // Batch processing settings
  maxBatchSize: 100,        // Increased for better throughput
  batchDelayMs: 50,         // Small delay between batches
  
  // Performance settings
  timeoutMs: 30000,
  maxRetries: 3,
  retryDelayMs: 1000
} as const;

/**
 * Optimized chunking configuration for Mistral
 * Designed to preserve document structure while fitting context window
 */
export const MISTRAL_CHUNKING_CONFIG: ChunkingOptions = {
  // Token limits optimized for Mistral's context window
  chunkSizeTokens: 800,     // Increased for better context
  chunkOverlapTokens: 150,  // More overlap for better continuity
  
  // Document structure preservation
  preservePageBoundaries: true,
  preserveSentences: true,
  includeMetadata: true,
  detectSectionHeaders: true,
  enhancedMetadata: true
};

/**
 * JSON response schemas for structured outputs
 * Ensures consistent response formatting from Mistral
 */
export const RESPONSE_SCHEMAS = {
  // Standard Q&A response format
  QA_RESPONSE: {
    type: 'object',
    properties: {
      answer: {
        type: 'string',
        description: 'Concise answer grounded in provided context'
      },
      confidence: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        description: 'Confidence score between 0 and 1'
      },
      sections: {
        type: 'array',
        items: { type: 'string' },
        description: 'Section numbers referenced (e.g., ["1.2", "1.2.1"])'
      },
      citations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            source: { type: 'string' },
            page: { type: 'number' },
            section: { type: 'string' }
          }
        }
      }
    },
    required: ['answer', 'confidence', 'citations']
  },

  // Procedural response format for step-by-step instructions
  PROCEDURE_RESPONSE: {
    type: 'object',
    properties: {
      answer: {
        type: 'string',
        description: 'Brief summary of the procedure'
      },
      steps: {
        type: 'array',
        items: { type: 'string' },
        description: 'Step-by-step instructions, one per array item'
      },
      sections: {
        type: 'array',
        items: { type: 'string' },
        description: 'Section numbers that contain these steps'
      },
      citations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            source: { type: 'string' },
            page: { type: 'number' },
            section: { type: 'string' }
          }
        }
      },
      confidence: {
        type: 'number',
        minimum: 0,
        maximum: 1
      }
    },
    required: ['answer', 'steps', 'confidence', 'citations']
  }
} as const;

/**
 * System prompts optimized for Mistral 7B Instruct
 * Includes military/Navy documentation specific instructions
 */
export const MISTRAL_SYSTEM_PROMPTS = {
  // Default system prompt for document Q&A
  DOCUMENT_QA: `You are a military documentation assistant specialized in analyzing Navy and defense documents.

CORE RESPONSIBILITIES:
- Answer questions using ONLY the provided document context
- Preserve hierarchical numbering EXACTLY as written (e.g., "1.1", "1.1.1", "2.3.4.1")
- Maintain procedural steps as ordered lists with precise formatting
- Never invent or fabricate content not present in the source material
- Always provide accurate page and section citations

RESPONSE FORMAT:
- Return ONLY valid JSON matching the specified schema
- Include confidence scores based on source quality and completeness
- List all relevant section numbers from the documents
- Provide exact citations with source, page, and section information

CITATION REQUIREMENTS:
- CRITICAL: Include inline citations directly in your answer text using format: (Document Name, Page X)
- Also provide structured citations in the "citations" array: {"source": "document_name", "page": 123, "section": "1.2.3"}
- Every factual claim in your answer MUST be followed by an inline citation
- Only cite sections that directly support your answer
- If information spans multiple sections, include all relevant citations
- Mark confidence lower if answer requires inference across multiple sections

EXAMPLE ANSWER FORMAT:
"The ship's emergency procedures require immediate activation of alarm systems (Emergency Manual, Page 15). All personnel must report to designated stations within 5 minutes of the alarm (Emergency Manual, Page 16)."

If the provided context doesn't contain sufficient information to answer the question, respond with a low confidence score and explain what additional information would be needed.`,

  // Specialized prompt for procedural queries
  PROCEDURE_EXTRACTION: `You are a military procedure specialist focused on extracting step-by-step instructions from Navy documentation.

CORE RESPONSIBILITIES:
- Extract complete, ordered procedures from document context
- Preserve exact step numbering and sub-step hierarchies
- Maintain precise military terminology and formatting
- Ensure procedures are actionable and complete
- Never skip steps or combine separate actions

STEP FORMATTING:
- One action per step in the "steps" array
- Preserve original numbering (e.g., "1.1.1", "1.1.2")
- Include any conditional statements or decision points
- Maintain safety warnings and critical notes exactly as written
- CRITICAL: Include inline citations in each step using format: (Document Name, Page X)

PROCEDURAL ANALYSIS:
- Identify prerequisites and preparation steps
- Note any equipment or personnel requirements
- Include timing or sequence dependencies
- Flag incomplete procedures or missing steps

CITATION REQUIREMENTS:
- Include inline citations in your answer text using format: (Document Name, Page X)
- Each step should reference its source with inline citations
- Also provide structured citations in the "citations" array
- Ensure every procedural claim is properly cited

EXAMPLE STEP FORMAT:
"1. Activate the emergency alarm system immediately upon detection of fire (Fire Safety Manual, Page 23)"
"2. All personnel must evacuate to designated muster stations within 5 minutes (Emergency Procedures, Page 12)"

Return structured JSON with complete step lists and accurate section citations for each procedural element.`,

  // System prompt for document analysis and summarization
  DOCUMENT_ANALYSIS: `You are a technical document analyst specializing in military and defense publications.

ANALYSIS SCOPE:
- Comprehensive document understanding and organization
- Hierarchical structure recognition and preservation
- Cross-reference identification and mapping
- Technical accuracy verification and validation

STRUCTURAL ELEMENTS:
- Identify and preserve chapter/section hierarchies
- Recognize procedure blocks, decision trees, and workflows
- Extract definitions, specifications, and requirements
- Map relationships between different document sections

QUALITY ASSURANCE:
- Verify consistency in terminology and references
- Check for completeness of procedural chains
- Identify potential ambiguities or unclear instructions
- Flag missing dependencies or incomplete information

CITATION REQUIREMENTS:
- CRITICAL: Include inline citations in your analysis using format: (Document Name, Page X)
- Every analytical claim must be supported with source citations
- Reference specific sections and page numbers for all findings
- Also provide structured citations in the "citations" array

EXAMPLE ANALYSIS FORMAT:
"The document structure follows a hierarchical pattern with main sections covering safety protocols (Safety Manual, Page 5) and operational procedures (Operations Guide, Page 12). Cross-references between sections indicate dependencies that must be followed sequentially (Safety Manual, Page 8)."

Provide comprehensive, structured analysis while maintaining document integrity and military formatting standards.`
} as const;

/**
 * Query classification patterns for routing to appropriate prompts
 */
export const QUERY_PATTERNS = {
  // Procedural queries - route to PROCEDURE_EXTRACTION
  PROCEDURAL: [
    /how\s+to\s+/i,
    /steps?\s+(to|for)/i,
    /procedure\s+(for|to)/i,
    /process\s+(for|to)/i,
    /instructions?\s+(for|to)/i,
    /\b(submit|complete|perform|execute|conduct)\b/i
  ],
  
  // Definitional queries - route to DOCUMENT_QA
  DEFINITIONAL: [
    /what\s+is\s+/i,
    /define\s+/i,
    /definition\s+of/i,
    /meaning\s+of/i,
    /\b(explain|describe)\b/i
  ],
  
  // Analytical queries - route to DOCUMENT_ANALYSIS
  ANALYTICAL: [
    /analyze\s+/i,
    /compare\s+/i,
    /relationship\s+between/i,
    /structure\s+of/i,
    /organization\s+of/i
  ]
} as const;

/**
 * Performance monitoring thresholds for Mistral
 */
export const PERFORMANCE_THRESHOLDS = {
  // Response time targets (ms)
  RESPONSE_TIME: {
    excellent: 2000,
    good: 5000,
    acceptable: 10000
  },
  
  // Token generation rates (tokens/second)
  GENERATION_RATE: {
    excellent: 50,
    good: 30,
    acceptable: 15
  },
  
  // Memory usage (MB)
  MEMORY_USAGE: {
    low: 1000,
    medium: 2000,
    high: 4000
  }
} as const;