/**
 * Prompt Templates for Mistral 7B Instruct
 * 
 * Structured prompts with JSON schema enforcement for consistent, reliable responses.
 * Optimized for military/Navy documentation with precise citation requirements.
 * 
 * @author ARYA RAG Team
 */

import { MISTRAL_SYSTEM_PROMPTS, RESPONSE_SCHEMAS, QUERY_PATTERNS } from '../../config/mistral-config';

/**
 * Query classification result
 */
export interface QueryClassification {
  type: 'procedural' | 'definitional' | 'analytical' | 'general';
  confidence: number;
  patterns: string[];
}

/**
 * Structured prompt configuration
 */
export interface PromptConfig {
  systemPrompt: string;
  userPrompt: string;
  schema: any;
  temperature: number;
  maxTokens: number;
}

/**
 * Prompt template manager for Mistral 7B Instruct
 */
export class PromptTemplateManager {
  
  /**
   * Classify query type to determine appropriate prompt template
   * 
   * @param query - User query to classify
   * @returns Classification result with confidence score
   */
  classifyQuery(query: string): QueryClassification {
    const queryLower = query.toLowerCase();
    const matchedPatterns: { type: string; patterns: string[] }[] = [];

    // Check procedural patterns
    const proceduralMatches = QUERY_PATTERNS.PROCEDURAL.filter(pattern => 
      pattern.test(queryLower)
    );
    if (proceduralMatches.length > 0) {
      matchedPatterns.push({ 
        type: 'procedural', 
        patterns: proceduralMatches.map(p => p.source) 
      });
    }

    // Check definitional patterns
    const definitionalMatches = QUERY_PATTERNS.DEFINITIONAL.filter(pattern => 
      pattern.test(queryLower)
    );
    if (definitionalMatches.length > 0) {
      matchedPatterns.push({ 
        type: 'definitional', 
        patterns: definitionalMatches.map(p => p.source) 
      });
    }

    // Check analytical patterns
    const analyticalMatches = QUERY_PATTERNS.ANALYTICAL.filter(pattern => 
      pattern.test(queryLower)
    );
    if (analyticalMatches.length > 0) {
      matchedPatterns.push({ 
        type: 'analytical', 
        patterns: analyticalMatches.map(p => p.source) 
      });
    }

    // Determine primary classification
    if (matchedPatterns.length === 0) {
      return {
        type: 'general',
        confidence: 0.5,
        patterns: []
      };
    }

    // Sort by number of matching patterns
    matchedPatterns.sort((a, b) => b.patterns.length - a.patterns.length);
    const primaryMatch = matchedPatterns[0];

    return {
      type: primaryMatch.type as 'procedural' | 'definitional' | 'analytical' | 'general',
      confidence: Math.min(0.95, 0.6 + (primaryMatch.patterns.length * 0.1)),
      patterns: primaryMatch.patterns
    };
  }

  /**
   * Generate optimized prompt configuration based on query classification
   * 
   * @param query - User query
   * @param context - Document context
   * @param classification - Query classification result
   * @returns Complete prompt configuration
   */
  generatePromptConfig(
    query: string,
    context: string,
    classification: QueryClassification
  ): PromptConfig {
    switch (classification.type) {
      case 'procedural':
        return this.generateProceduralPrompt(query, context);
      case 'definitional':
        return this.generateDefinitionalPrompt(query, context);
      case 'analytical':
        return this.generateAnalyticalPrompt(query, context);
      default:
        return this.generateGeneralPrompt(query, context);
    }
  }

  /**
   * Generate procedural prompt for step-by-step instructions
   */
  private generateProceduralPrompt(query: string, context: string): PromptConfig {
    const systemPrompt = MISTRAL_SYSTEM_PROMPTS.PROCEDURE_EXTRACTION;
    
    const userPrompt = `${context}

QUERY: ${query}

Analyze the provided context and extract the complete procedure with step-by-step instructions. Return ONLY valid JSON matching this exact schema:

${JSON.stringify(RESPONSE_SCHEMAS.PROCEDURE_RESPONSE, null, 2)}

CRITICAL REQUIREMENTS:
- Extract ALL steps in the correct order
- Preserve exact numbering and hierarchy (e.g., "1.1.1", "1.1.2")
- Include one action per step in the "steps" array
- Provide accurate page and section citations for each referenced element
- Set confidence based on completeness and clarity of the procedure

If the procedure is incomplete or unclear, explain what additional information is needed in the answer field and set confidence accordingly.`;

    return {
      systemPrompt,
      userPrompt,
      schema: RESPONSE_SCHEMAS.PROCEDURE_RESPONSE,
      temperature: 0.05, // Very low for consistent procedural extraction
      maxTokens: 3000
    };
  }

  /**
   * Generate definitional prompt for explanatory queries
   */
  private generateDefinitionalPrompt(query: string, context: string): PromptConfig {
    const systemPrompt = MISTRAL_SYSTEM_PROMPTS.DOCUMENT_QA;
    
    const userPrompt = `${context}

QUERY: ${query}

Provide a clear, comprehensive answer based on the provided context. Return ONLY valid JSON matching this exact schema:

${JSON.stringify(RESPONSE_SCHEMAS.QA_RESPONSE, null, 2)}

RESPONSE GUIDELINES:
- Answer should be complete but concise
- Include all relevant information from the context
- Preserve technical terminology exactly as written
- Reference specific sections and hierarchical numbers
- Provide accurate citations for all factual claims

If the context doesn't contain sufficient information to fully answer the question, indicate what additional information would be needed and adjust confidence accordingly.`;

    return {
      systemPrompt,
      userPrompt,
      schema: RESPONSE_SCHEMAS.QA_RESPONSE,
      temperature: 0.1, // Low for factual accuracy
      maxTokens: 2500
    };
  }

  /**
   * Generate analytical prompt for complex analysis queries
   */
  private generateAnalyticalPrompt(query: string, context: string): PromptConfig {
    const systemPrompt = MISTRAL_SYSTEM_PROMPTS.DOCUMENT_ANALYSIS;
    
    const userPrompt = `${context}

QUERY: ${query}

Provide a thorough analysis based on the provided context. Return ONLY valid JSON matching this exact schema:

${JSON.stringify(RESPONSE_SCHEMAS.QA_RESPONSE, null, 2)}

ANALYSIS REQUIREMENTS:
- Examine relationships between different sections and concepts
- Identify patterns, dependencies, and hierarchical structures
- Provide comprehensive but organized response
- Support all analytical claims with specific citations
- Consider multiple perspectives if relevant

Ensure your analysis is grounded in the provided context and includes accurate section references and page citations.`;

    return {
      systemPrompt,
      userPrompt,
      schema: RESPONSE_SCHEMAS.QA_RESPONSE,
      temperature: 0.15, // Slightly higher for analytical thinking
      maxTokens: 3500
    };
  }

  /**
   * Generate general prompt for unclassified queries
   */
  private generateGeneralPrompt(query: string, context: string): PromptConfig {
    const systemPrompt = MISTRAL_SYSTEM_PROMPTS.DOCUMENT_QA;
    
    const userPrompt = `${context}

QUERY: ${query}

Answer the question based on the provided context. Return ONLY valid JSON matching this exact schema:

${JSON.stringify(RESPONSE_SCHEMAS.QA_RESPONSE, null, 2)}

RESPONSE GUIDELINES:
- Use only information from the provided context
- Include accurate page and section citations
- Maintain professional, clear language
- Preserve document hierarchy and numbering
- If uncertain, explain what additional context would help

Focus on accuracy and completeness while staying grounded in the source material.`;

    return {
      systemPrompt,
      userPrompt,
      schema: RESPONSE_SCHEMAS.QA_RESPONSE,
      temperature: 0.1,
      maxTokens: 2500
    };
  }

  /**
   * Validate and sanitize JSON response from Mistral
   * 
   * @param rawResponse - Raw text response from model
   * @param expectedSchema - Expected JSON schema
   * @returns Parsed and validated JSON object
   */
  validateAndSanitizeResponse(rawResponse: string, expectedSchema: any): any {
    try {
      // Extract JSON from response if it contains additional text
      let jsonStr = rawResponse.trim();
      
      // Look for JSON block markers
      const jsonStart = jsonStr.indexOf('{');
      const jsonEnd = jsonStr.lastIndexOf('}');
      
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        jsonStr = jsonStr.substring(jsonStart, jsonEnd + 1);
      }

      // Parse JSON
      const parsed = JSON.parse(jsonStr);

      // Basic validation against schema
      if (expectedSchema.required) {
        for (const field of expectedSchema.required) {
          if (!(field in parsed)) {
            throw new Error(`Missing required field: ${field}`);
          }
        }
      }

      // Sanitize specific fields
      if (parsed.confidence !== undefined) {
        parsed.confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
      }

      if (parsed.citations && Array.isArray(parsed.citations)) {
        parsed.citations = parsed.citations.map((citation: any) => ({
          source: String(citation.source || ''),
          page: Number(citation.page) || 0,
          section: String(citation.section || '')
        }));
      }

      if (parsed.sections && Array.isArray(parsed.sections)) {
        parsed.sections = parsed.sections.map((section: any) => String(section));
      }

      return parsed;

    } catch (error) {
      console.error('Failed to parse JSON response:', error);
      
      // Return fallback response
      return {
        answer: 'I encountered an error processing the response. Please try rephrasing your question.',
        confidence: 0.1,
        citations: [],
        sections: []
      };
    }
  }

  /**
   * Generate fallback response for model failures
   * 
   * @param query - Original user query
   * @param error - Error that occurred
   * @returns Structured error response
   */
  generateFallbackResponse(query: string, error: string): any {
    return {
      answer: `I apologize, but I encountered an error while processing your question: "${query.substring(0, 100)}${query.length > 100 ? '...' : ''}". Please try rephrasing your question or contact support if the issue persists.`,
      confidence: 0.0,
      citations: [],
      sections: [],
      error: error,
      fallback: true
    };
  }

  /**
   * Optimize prompt length to fit within context window
   * 
   * @param prompt - Full prompt text
   * @param maxTokens - Maximum token limit
   * @returns Optimized prompt that fits within limits
   */
  optimizePromptLength(prompt: string, maxTokens: number): string {
    // Rough token estimation (4 characters per token)
    const estimatedTokens = Math.ceil(prompt.length / 4);
    
    if (estimatedTokens <= maxTokens) {
      return prompt;
    }

    // If too long, truncate context section while preserving query and instructions
    const sections = prompt.split('\n\nQUERY:');
    if (sections.length !== 2) {
      return prompt; // Can't safely truncate
    }

    const [contextSection, querySection] = sections;
    const queryPartTokens = Math.ceil(querySection.length / 4);
    const availableForContext = maxTokens - queryPartTokens - 100; // 100 token buffer

    if (availableForContext <= 0) {
      return prompt; // Query too long, can't truncate safely
    }

    const maxContextChars = availableForContext * 4;
    const truncatedContext = contextSection.length > maxContextChars 
      ? contextSection.substring(0, maxContextChars) + '\n\n[... context truncated for length ...]'
      : contextSection;

    return truncatedContext + '\n\nQUERY:' + querySection;
  }
}

/**
 * Singleton instance for global use
 */
export const promptTemplateManager = new PromptTemplateManager();