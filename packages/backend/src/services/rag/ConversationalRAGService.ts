/**
 * Conversational RAG Service
 * 
 * Enhanced RAG service that provides conversational, interactive responses
 * with intelligent query understanding and contextual follow-ups.
 * 
 * Features:
 * - Intent analysis and query classification
 * - Conversational response generation
 * - Context-aware follow-up suggestions
 * - Multi-turn conversation handling
 * - Personalized responses based on user history
 * 
 * @author ARYA RAG Team
 */

import { RAGService, RAGConfig } from './RAGService';
import { LLMService } from '../llm/LLMService';
import { ConversationContextService } from '../conversation/ConversationContextService';
import { RAGRequest, RAGResponse } from '@arya-rag/types';

export interface UserIntent {
  primaryIntent: 'question' | 'clarification' | 'comparison' | 'explanation' | 'procedure' | 'factual' | 'analytical';
  confidence: number;
  entities: string[];
  context: string[];
  requiresFollowUp: boolean;
  suggestedActions: string[];
}

export interface ConversationalResponse extends RAGResponse {
  conversationalElements: {
    greeting?: string;
    acknowledgment?: string;
    clarification?: string;
    followUpQuestions?: string[];
    relatedTopics?: string[];
    summary?: string;
    nextSteps?: string[];
  };
  intent: UserIntent;
  conversationFlow: {
    isFollowUp: boolean;
    previousContext?: string;
    suggestedContinuation?: string;
  };
}

export interface ConversationalRAGConfig extends RAGConfig {
  enableIntentAnalysis: boolean;
  enableConversationalMode: boolean;
  enableFollowUpSuggestions: boolean;
  enablePersonalization: boolean;
  responseStyle: 'formal' | 'friendly' | 'expert' | 'adaptive';
  maxFollowUpQuestions: number;
  enableContextualGreetings: boolean;
}

export class ConversationalRAGService {
  private baseRAGService: RAGService;
  private conversationService: ConversationContextService;
  private config: ConversationalRAGConfig;

  constructor(config: Partial<ConversationalRAGConfig> = {}) {
    this.baseRAGService = new RAGService(config);
    this.conversationService = new ConversationContextService();
    this.config = {
      maxSearchResults: 10,
      similarityThreshold: 0.7,
      maxResponseTokens: 1000,
      temperature: 0.7,
      maxContextTokens: 3000,
      includeSourceExcerpts: true,
      requireSourceCitations: true,
      maxSourcesPerResponse: 5,
      enableStructuredResponses: true,
      useQueryClassification: true,
      enforceJsonFormat: true,
      enablePromptOptimization: true,
      enableIntentAnalysis: true,
      enableConversationalMode: true,
      enableFollowUpSuggestions: true,
      enablePersonalization: true,
      responseStyle: 'adaptive',
      maxFollowUpQuestions: 3,
      enableContextualGreetings: true,
      ...config
    };

    console.log('💬 Conversational RAG Service initialized');
    console.log(`   Response style: ${this.config.responseStyle}`);
    console.log(`   Intent analysis: ${this.config.enableIntentAnalysis ? 'enabled' : 'disabled'}`);
  }

  /**
   * Process conversational RAG query with enhanced understanding
   */
  async processConversationalQuery(request: RAGRequest): Promise<ConversationalResponse> {
    const startTime = Date.now();
    
    console.log(`💬 Processing conversational query: "${request.query.substring(0, 100)}${request.query.length > 100 ? '...' : ''}"`);

    try {
      // Step 1: Analyze user intent
      const intent = await this.analyzeUserIntent(request);
      console.log(`🎯 Intent: ${intent.primaryIntent} (confidence: ${(intent.confidence * 100).toFixed(1)}%)`);

      // Step 2: Get conversation context
      const conversationContext = await this.getConversationContext(request.userId, request.sessionId || 'default');
      
      // Step 3: Enhance query based on intent and context
      const enhancedQuery = await this.enhanceQuery(request.query, intent, conversationContext);
      
      // Step 4: Process with base RAG service to get raw data
      const baseRequest = { ...request, query: enhancedQuery };
      const baseResponse = await this.baseRAGService.processQuery(baseRequest);
      
      // Step 5: Generate contextual and analytical response
      const contextualResponse = await this.generateContextualResponse(
        request.query,
        baseResponse,
        intent,
        conversationContext
      );
      
      // Step 6: Generate conversational elements
      const conversationalElements = await this.generateConversationalElements(
        request.query,
        contextualResponse,
        intent,
        conversationContext
      );
      
      // Step 7: Generate follow-up suggestions
      const followUpQuestions = await this.generateFollowUpQuestions(
        request.query,
        contextualResponse,
        intent,
        conversationContext
      );

      // Step 8: Build conversational response
      const conversationalResponse: ConversationalResponse = {
        ...contextualResponse,
        conversationalElements: {
          ...conversationalElements,
          followUpQuestions
        },
        intent,
        conversationFlow: {
          isFollowUp: conversationContext.isFollowUp,
          previousContext: conversationContext.lastResponse,
          suggestedContinuation: this.generateContinuationSuggestion(intent, contextualResponse)
        }
      };

      // Step 9: Update conversation context
      await this.updateConversationContext(request.userId, request.sessionId || 'default', request.query, conversationalResponse);

      const processingTime = Date.now() - startTime;
      console.log(`✅ Conversational query processed in ${processingTime}ms`);

      return conversationalResponse;

    } catch (error) {
      console.error('❌ Conversational RAG processing failed:', error);
      throw error;
    }
  }

  /**
   * Generate contextual and analytical response instead of direct extraction
   */
  private async generateContextualResponse(
    originalQuery: string,
    baseResponse: any,
    intent: any,
    conversationContext: any
  ): Promise<any> {
    try {
      const llmService = await this.getLLMService();
      
      // Build context-aware prompt for analytical response
      const contextualPrompt = this.buildContextualPrompt(
        originalQuery,
        baseResponse,
        intent,
        conversationContext
      );

      console.log('🧠 Generating contextual response with enhanced understanding...');
      
      const contextualAnswer = await llmService.generateResponse(contextualPrompt);
      
      return {
        ...baseResponse,
        answer: contextualAnswer,
        confidence: this.calculateContextualConfidence(baseResponse, intent),
        metadata: {
          ...baseResponse.metadata,
          contextualAnalysis: true,
          responseType: this.determineResponseType(intent, baseResponse)
        }
      };
      
    } catch (error) {
      console.warn('⚠️ Contextual response generation failed, falling back to base response:', error);
      return baseResponse;
    }
  }

  /**
   * Build context-aware prompt for analytical response generation
   */
  private buildContextualPrompt(
    originalQuery: string,
    baseResponse: any,
    intent: any,
    conversationContext: any
  ): string {
    const sources = baseResponse.sources || [];
    const sourceText = sources.map((source: any) => source.content).join('\n\n');
    
    const conversationHistory = conversationContext.messages?.slice(-3).map((msg: any) => 
      `${msg.role}: ${msg.content}`
    ).join('\n') || '';

    return `You are an expert AI assistant that provides deep, contextual understanding rather than just extracting text from documents. Your role is to analyze, synthesize, and explain information in a comprehensive and insightful way.

CONTEXT:
- User's original question: "${originalQuery}"
- User's intent: ${intent.primaryIntent} (${(intent.confidence * 100).toFixed(1)}% confidence)
- Conversation history: ${conversationHistory ? `\n${conversationHistory}` : 'This is the start of the conversation'}

SOURCE DOCUMENTS:
${sourceText || 'No relevant documents found'}

INSTRUCTIONS:
1. **ANALYZE** the information from the source documents
2. **SYNTHESIZE** the key concepts and relationships
3. **EXPLAIN** the topic in a comprehensive, contextual manner
4. **PROVIDE INSIGHTS** that go beyond simple text extraction
5. **CONNECT** related concepts and implications
6. **ADDRESS** the user's underlying intent, not just their literal question

RESPONSE GUIDELINES:
- Start with a clear, engaging introduction that shows you understand the context
- Provide detailed explanations with logical structure
- Include relevant examples, implications, and connections
- Explain "why" and "how" not just "what"
- Use conversational tone while maintaining accuracy
- If the information is incomplete, acknowledge limitations and suggest what additional information would be helpful

Generate a comprehensive, analytical response that demonstrates deep understanding of the topic:`;
  }

  /**
   * Calculate confidence based on contextual analysis
   */
  private calculateContextualConfidence(baseResponse: any, intent: any): number {
    let confidence = baseResponse.confidence || 0.5;
    
    // Boost confidence for analytical responses
    if (intent.primaryIntent === 'question' && baseResponse.sources?.length > 0) {
      confidence = Math.min(0.9, confidence + 0.2);
    }
    
    // Adjust based on source quality
    if (baseResponse.sources?.length > 1) {
      confidence = Math.min(0.95, confidence + 0.1);
    }
    
    return confidence;
  }

  /**
   * Determine the type of response based on intent and content
   */
  private determineResponseType(intent: any, baseResponse: any): string {
    if (intent.primaryIntent === 'question') {
      return baseResponse.sources?.length > 0 ? 'analytical_explanation' : 'clarification_request';
    }
    if (intent.primaryIntent === 'clarification') {
      return 'contextual_clarification';
    }
    return 'conversational_response';
  }

  /**
   * Get LLM service for generating responses
   */
  private async getLLMService(): Promise<any> {
    try {
      const { LLMServiceFactory } = await import('../llm/LLMServiceFactory');
      const factory = LLMServiceFactory.getInstance();
      return factory.createLLMService();
    } catch (error) {
      console.warn('⚠️  LLM service not available:', error);
      return null;
    }
  }
  private async analyzeUserIntent(request: RAGRequest): Promise<UserIntent> {
    if (!this.config.enableIntentAnalysis) {
      return {
        primaryIntent: 'question',
        confidence: 0.8,
        entities: [],
        context: [],
        requiresFollowUp: false,
        suggestedActions: []
      };
    }

    const intentPrompt = `Analyze this user query and determine their intent:

Query: "${request.query}"

Classify the primary intent as one of:
- question: Direct question seeking information
- clarification: Asking for clarification or more details
- comparison: Comparing different options or approaches
- explanation: Requesting detailed explanation of a concept
- procedure: Asking about step-by-step processes
- factual: Seeking specific facts, numbers, or data
- analytical: Requiring analysis, evaluation, or synthesis

Also identify:
- Key entities mentioned
- Context clues
- Whether this seems like a follow-up question
- Suggested actions the user might want to take

Return as JSON:
{
  "primaryIntent": "question",
  "confidence": 0.9,
  "entities": ["entity1", "entity2"],
  "context": ["context1", "context2"],
  "requiresFollowUp": true,
  "suggestedActions": ["action1", "action2"]
}`;

    try {
      const llmService = await this.getLLMService();
      if (!llmService) {
        throw new Error('LLM service not available');
      }

      const response = await llmService.generateResponse(intentPrompt, {
        maxTokens: 500,
        temperature: 0.3,
        responseFormat: 'json'
      });

      const parsed = JSON.parse(response);
      return {
        primaryIntent: parsed.primaryIntent || 'question',
        confidence: parsed.confidence || 0.8,
        entities: parsed.entities || [],
        context: parsed.context || [],
        requiresFollowUp: parsed.requiresFollowUp || false,
        suggestedActions: parsed.suggestedActions || []
      };

    } catch (error) {
      console.warn('⚠️  Intent analysis failed, using default:', error);
      return {
        primaryIntent: 'question',
        confidence: 0.7,
        entities: [],
        context: [],
        requiresFollowUp: false,
        suggestedActions: []
      };
    }
  }

  /**
   * Get conversation context for the user
   */
  private async getConversationContext(userId: string, sessionId?: string): Promise<any> {
    try {
      const session = this.conversationService.getSession(userId, sessionId);
      const messages = this.conversationService.getHistory(userId, session.sessionId);
      
      return {
        sessionId: session.sessionId,
        messageCount: messages.length,
        lastResponse: messages[messages.length - 1]?.content || null,
        isFollowUp: messages.length > 1,
        recentTopics: this.extractRecentTopics(messages)
      };
    } catch (error) {
      console.warn('⚠️  Failed to get conversation context:', error);
      return {
        sessionId: sessionId || 'new',
        messageCount: 0,
        lastResponse: null,
        isFollowUp: false,
        recentTopics: []
      };
    }
  }

  /**
   * Enhance query based on intent and context
   */
  private async enhanceQuery(originalQuery: string, intent: UserIntent, context: any): Promise<string> {
    if (!this.config.enableConversationalMode) {
      return originalQuery;
    }

    // Add context if this is a follow-up question
    if (context.isFollowUp && context.lastResponse) {
      return `${originalQuery}\n\nContext from previous conversation: ${context.lastResponse}`;
    }

    // Enhance based on intent
    switch (intent.primaryIntent) {
      case 'clarification':
        return `Please provide detailed clarification for: ${originalQuery}`;
      case 'comparison':
        return `Compare and contrast the following: ${originalQuery}`;
      case 'procedure':
        return `Provide step-by-step procedure for: ${originalQuery}`;
      case 'analytical':
        return `Analyze and evaluate: ${originalQuery}`;
      default:
        return originalQuery;
    }
  }

  /**
   * Generate conversational elements for the response
   */
  private async generateConversationalElements(
    originalQuery: string,
    baseResponse: RAGResponse,
    intent: UserIntent,
    context: any
  ): Promise<any> {
    const elements: any = {};

    // Generate greeting for first interaction
    if (context.messageCount === 0 && this.config.enableContextualGreetings) {
      elements.greeting = this.generateContextualGreeting(intent);
    }

    // Generate acknowledgment
    if (context.isFollowUp) {
      elements.acknowledgment = this.generateAcknowledgment(intent);
    }

    // Generate contextual insights based on response content
    if (baseResponse.sources && baseResponse.sources.length > 0) {
      elements.contextualInsight = this.generateContextualInsight(baseResponse, intent);
      elements.keyTakeaways = this.extractKeyTakeaways(baseResponse);
    }

    // Add analytical depth indicators
    if (baseResponse.metadata?.contextualAnalysis) {
      elements.analysisDepth = this.determineAnalysisDepth(baseResponse);
    }

    // Generate clarification if needed
    if (intent.confidence < 0.7) {
      elements.clarification = this.generateClarificationRequest(intent);
    }

    // Generate summary for complex responses
    if (baseResponse.sources.length > 3) {
      elements.summary = await this.generateResponseSummary(baseResponse);
    }

    return elements;
  }

  /**
   * Generate contextual insight based on response content
   */
  private generateContextualInsight(response: any, intent: any): string {
    const sourceCount = response.sources?.length || 0;
    const confidence = response.confidence || 0.5;
    
    if (sourceCount === 0) {
      return "I notice this topic isn't covered in the available documents. Would you like me to help you find related information?";
    }
    
    if (confidence > 0.8) {
      return `Based on ${sourceCount} relevant source${sourceCount > 1 ? 's' : ''}, I can provide a comprehensive explanation.`;
    }
    
    return `I found ${sourceCount} relevant source${sourceCount > 1 ? 's' : ''} that help explain this topic.`;
  }

  /**
   * Extract key takeaways from the response
   */
  private extractKeyTakeaways(response: any): string[] {
    const takeaways: string[] = [];
    
    if (response.sources?.length > 0) {
      takeaways.push(`Information sourced from ${response.sources.length} document${response.sources.length > 1 ? 's' : ''}`);
    }
    
    if (response.metadata?.contextualAnalysis) {
      takeaways.push('Response includes analytical insights beyond direct text extraction');
    }
    
    if (response.confidence > 0.8) {
      takeaways.push('High confidence in the accuracy of this information');
    }
    
    return takeaways;
  }

  /**
   * Determine the depth of analysis provided
   */
  private determineAnalysisDepth(response: any): string {
    const sourceCount = response.sources?.length || 0;
    const confidence = response.confidence || 0.5;
    
    if (sourceCount >= 3 && confidence > 0.8) {
      return 'comprehensive';
    } else if (sourceCount >= 2 && confidence > 0.6) {
      return 'detailed';
    } else if (sourceCount >= 1) {
      return 'basic';
    } else {
      return 'limited';
    }
  }

  /**
   * Generate follow-up questions
   */
  private async generateFollowUpQuestions(
    originalQuery: string,
    baseResponse: RAGResponse,
    intent: UserIntent,
    context: any
  ): Promise<string[]> {
    if (!this.config.enableFollowUpSuggestions) {
      return [];
    }

    const followUpPrompt = `Based on this conversation:

User Query: "${originalQuery}"
Response: "${baseResponse.answer}"

Generate 3-5 intelligent follow-up questions that would help the user explore this topic further. The questions should:
1. Be related to the original query and response
2. Help dive deeper into the topic
3. Explore different aspects or angles
4. Be natural and conversational
5. Build on the information already provided

Return as JSON array:
["Follow-up question 1", "Follow-up question 2", ...]`;

    try {
      const llmService = await this.getLLMService();
      if (!llmService) {
        throw new Error('LLM service not available');
      }

      const response = await llmService.generateResponse(followUpPrompt, {
        maxTokens: 400,
        temperature: 0.7,
        responseFormat: 'json'
      });

      const followUps = JSON.parse(response);
      return followUps.slice(0, this.config.maxFollowUpQuestions);

    } catch (error) {
      console.warn('⚠️  Follow-up generation failed:', error);
      return this.generateDefaultFollowUps(intent);
    }
  }

  /**
   * Generate contextual greeting
   */
  private generateContextualGreeting(intent: UserIntent): string {
    const greetings = {
      question: "I'd be happy to help you find that information!",
      clarification: "Let me help clarify that for you.",
      comparison: "I can help you compare those options.",
      explanation: "I'll explain that in detail for you.",
      procedure: "I can walk you through that procedure step by step.",
      factual: "Let me find those specific details for you.",
      analytical: "I'll analyze that for you and provide insights."
    };

    return greetings[intent.primaryIntent] || "I'm here to help!";
  }

  /**
   * Generate acknowledgment
   */
  private generateAcknowledgment(intent: UserIntent): string {
    const acknowledgments = {
      question: "Great follow-up question!",
      clarification: "I understand you need more details.",
      comparison: "Let me help you compare those.",
      explanation: "I'll elaborate on that for you.",
      procedure: "I can provide more details on that procedure.",
      factual: "Let me get those specific facts for you.",
      analytical: "I'll dive deeper into that analysis."
    };

    return acknowledgments[intent.primaryIntent] || "Let me help you with that.";
  }

  /**
   * Generate clarification request
   */
  private generateClarificationRequest(intent: UserIntent): string {
    return "I want to make sure I understand exactly what you're looking for. Could you provide a bit more context?";
  }

  /**
   * Generate response summary
   */
  private async generateResponseSummary(baseResponse: RAGResponse): Promise<string> {
    const summaryPrompt = `Summarize this response in 1-2 sentences:

"${baseResponse.answer}"

Focus on the key points and main takeaways.`;

    try {
      const llmService = await this.getLLMService();
      if (!llmService) {
        throw new Error('LLM service not available');
      }

      const response = await llmService.generateResponse(summaryPrompt, {
        maxTokens: 100,
        temperature: 0.5
      });
      return response.trim();
    } catch (error) {
      return "Here's a comprehensive answer to your question.";
    }
  }

  /**
   * Generate continuation suggestion
   */
  private generateContinuationSuggestion(intent: UserIntent, baseResponse: RAGResponse): string {
    const suggestions = {
      question: "Would you like me to elaborate on any specific part?",
      clarification: "Is there anything else you'd like me to clarify?",
      comparison: "Would you like me to compare with other options?",
      explanation: "Would you like me to explain any part in more detail?",
      procedure: "Would you like me to walk through any specific steps?",
      factual: "Would you like me to find more specific details?",
      analytical: "Would you like me to analyze any other aspects?"
    };

    return suggestions[intent.primaryIntent] || "Is there anything else I can help you with?";
  }

  /**
   * Generate default follow-up questions
   */
  private generateDefaultFollowUps(intent: UserIntent): string[] {
    const defaults = {
      question: [
        "Can you provide more details about this?",
        "What are the key considerations?",
        "How does this apply in practice?"
      ],
      clarification: [
        "Could you give me an example?",
        "What are the specific requirements?",
        "How does this work in different scenarios?"
      ],
      comparison: [
        "What are the advantages of each option?",
        "Which approach is more effective?",
        "What are the trade-offs?"
      ],
      explanation: [
        "Can you break this down further?",
        "What are the practical implications?",
        "How does this relate to other concepts?"
      ],
      procedure: [
        "What are the prerequisites?",
        "What tools or resources are needed?",
        "What are common pitfalls to avoid?"
      ],
      factual: [
        "What are the latest updates?",
        "How do these numbers compare to standards?",
        "What are the sources for this information?"
      ],
      analytical: [
        "What are the key factors to consider?",
        "How would you evaluate the options?",
        "What are the potential outcomes?"
      ]
    };

    return defaults[intent.primaryIntent] || [
      "Can you tell me more about this?",
      "What else should I know?",
      "How can I apply this information?"
    ];
  }

  /**
   * Extract recent topics from conversation
   */
  private extractRecentTopics(messages: any[]): string[] {
    const topics = new Set<string>();
    
    messages.forEach(message => {
      if (message.content) {
        // Simple keyword extraction
        const words = message.content.toLowerCase()
          .replace(/[^\w\s]/g, ' ')
          .split(/\s+/)
          .filter((word: string) => word.length > 4);
        
        words.forEach((word: string) => topics.add(word));
      }
    });

    return Array.from(topics).slice(0, 10);
  }

  /**
   * Update conversation context
   */
  private async updateConversationContext(
    userId: string,
    sessionId: string,
    query: string,
    response: ConversationalResponse
  ): Promise<void> {
    try {
      this.conversationService.addMessage(userId, sessionId, 'user', query);
      this.conversationService.addMessage(
        userId,
        sessionId,
        'assistant',
        response.answer,
        {
          sources: response.sources.map(s => s.documentName || 'unknown'),
          confidence: response.confidence
        }
      );
    } catch (error) {
      console.warn('⚠️  Failed to update conversation context:', error);
    }
  }
}
