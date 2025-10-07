/**
 * Conversation Context Service
 * 
 * Manages conversation history and context for multi-turn dialogues
 * Enables reference resolution and context-aware RAG queries
 * 
 * Features:
 * - Track conversation history per user/session
 * - Resolve references (it, that, this procedure, etc.)
 * - Maintain entity tracking
 * - Provide context to RAG system
 * - Handle follow-up questions
 * 
 * @author ARYA RAG Team
 */

import { LLMServiceFactory } from '../llm/LLMServiceFactory';

/**
 * Conversation message with metadata
 */
export interface ConversationMessage {
  id: string;
  sessionId: string;
  userId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: {
    query?: string;
    sources?: string[];
    confidence?: number;
    resolvedReferences?: string[];
    entities?: string[];
    documentIds?: string[];
  };
}

/**
 * Conversation session
 */
export interface ConversationSession {
  sessionId: string;
  userId: string;
  messages: ConversationMessage[];
  entities: Map<string, string[]>; // entity type -> entity values
  currentTopic?: string;
  startedAt: Date;
  lastActivityAt: Date;
}

/**
 * Reference resolution result
 */
export interface ReferenceResolution {
  originalQuery: string;
  resolvedQuery: string;
  detectedReferences: string[];
  resolvedEntities: Map<string, string>;
  needsContext: boolean;
  contextSummary?: string;
}

/**
 * Conversation Context Service
 * Manages multi-turn conversation state and reference resolution
 */
export class ConversationContextService {
  private sessions: Map<string, ConversationSession> = new Map();
  private llmService: any;
  
  // Reference patterns to detect
  private referencePatterns = [
    /\b(it|its|that|this|these|those|them|they)\b/gi,
    /\b(the (one|document|procedure|process|requirement|specification))\b/gi,
    /\b(what about|tell me more|explain further|continue|elaborate)\b/gi,
    /\b(above|mentioned|previous|earlier|before)\b/gi
  ];

  // Entity patterns to track
  private entityPatterns = {
    procedures: /\b(procedure|process|protocol|guideline)\s+([A-Z0-9-]+)/gi,
    requirements: /\b(requirement|spec|specification)\s+([A-Z0-9.-]+)/gi,
    measurements: /\b(\d+\.?\d*)\s*(mm|cm|m|kg|g|°C|°F|psi|bar)/gi,
    documents: /\b(BR|MIL-STD|ISO|ANSI|NATO)\s*[0-9-]+/gi,
    definitions: /\b([A-Z]{2,}|[A-Z][A-Z0-9]{2,})\b/g // Acronyms
  };

  constructor() {
    // Initialize LLM service for advanced reference resolution
    try {
      const factory = LLMServiceFactory.getInstance();
      this.llmService = factory.createLLMService();
    } catch (error) {
      console.warn('⚠️  LLM service not available for conversation context');
    }
  }

  /**
   * Get or create a conversation session
   */
  getSession(userId: string, sessionId?: string): ConversationSession {
    const sid = sessionId || this.generateSessionId(userId);
    
    if (!this.sessions.has(sid)) {
      this.sessions.set(sid, {
        sessionId: sid,
        userId,
        messages: [],
        entities: new Map(),
        startedAt: new Date(),
        lastActivityAt: new Date()
      });
    }

    return this.sessions.get(sid)!;
  }

  /**
   * Add message to conversation
   */
  addMessage(
    userId: string,
    sessionId: string,
    role: 'user' | 'assistant',
    content: string,
    metadata?: ConversationMessage['metadata']
  ): ConversationMessage {
    const session = this.getSession(userId, sessionId);
    
    const message: ConversationMessage = {
      id: this.generateMessageId(),
      sessionId,
      userId,
      role,
      content,
      timestamp: new Date(),
      metadata
    };

    session.messages.push(message);
    session.lastActivityAt = new Date();

    // Extract and track entities
    this.extractAndTrackEntities(session, content);

    return message;
  }

  /**
   * Detect if query contains references to previous context
   */
  containsReferences(query: string): boolean {
    return this.referencePatterns.some(pattern => pattern.test(query));
  }

  /**
   * Resolve references in query using conversation context
   */
  async resolveReferences(
    query: string,
    userId: string,
    sessionId: string
  ): Promise<ReferenceResolution> {
    const session = this.getSession(userId, sessionId);
    const detectedReferences: string[] = [];
    let resolvedQuery = query;

    // Check for reference patterns
    const hasReferences = this.referencePatterns.some(pattern => {
      const matches = query.match(pattern);
      if (matches) {
        detectedReferences.push(...matches);
        return true;
      }
      return false;
    });

    if (!hasReferences || session.messages.length === 0) {
      return {
        originalQuery: query,
        resolvedQuery: query,
        detectedReferences: [],
        resolvedEntities: new Map(),
        needsContext: false
      };
    }

    // Build context from recent messages
    const recentMessages = session.messages.slice(-5);
    const contextSummary = this.buildContextSummary(recentMessages);

    // Use LLM to resolve references if available
    if (this.llmService) {
      try {
        resolvedQuery = await this.resolveReferencesWithLLM(
          query,
          contextSummary,
          session.entities
        );
      } catch (error) {
        console.warn('⚠️  LLM reference resolution failed, using fallback:', error);
        resolvedQuery = this.resolveReferencesSimple(query, session);
      }
    } else {
      resolvedQuery = this.resolveReferencesSimple(query, session);
    }

    return {
      originalQuery: query,
      resolvedQuery,
      detectedReferences,
      resolvedEntities: new Map(), // Could be populated from entity tracking
      needsContext: true,
      contextSummary
    };
  }

  /**
   * Simple reference resolution using pattern matching
   */
  private resolveReferencesSimple(
    query: string,
    session: ConversationSession
  ): string {
    let resolved = query;
    const recentMessages = session.messages.slice(-3);

    // Find the last mentioned entity or topic
    for (let i = recentMessages.length - 1; i >= 0; i--) {
      const msg = recentMessages[i];
      
      // Look for entities in previous messages
      for (const [entityType, values] of session.entities.entries()) {
        if (values.length > 0) {
          const lastEntity = values[values.length - 1];
          
          // Replace "it" with the entity
          resolved = resolved.replace(/\bit\b/gi, lastEntity);
          resolved = resolved.replace(/\bthat\b/gi, `that ${lastEntity}`);
          break;
        }
      }
    }

    return resolved;
  }

  /**
   * Advanced reference resolution using LLM
   */
  private async resolveReferencesWithLLM(
    query: string,
    contextSummary: string,
    entities: Map<string, string[]>
  ): Promise<string> {
    const entitiesText = Array.from(entities.entries())
      .map(([type, values]) => `${type}: ${values.slice(-3).join(', ')}`)
      .join('\n');

    const prompt = `Given the conversation context and detected entities, resolve references in the user's query to make it self-contained.

Conversation Context:
${contextSummary}

Tracked Entities:
${entitiesText}

User Query: "${query}"

Provide a resolved version of the query where pronouns and references are replaced with explicit entities.
Only output the resolved query, nothing else.

Resolved Query:`;

    const response = await this.llmService.generateCompletion({
      systemPrompt: 'You are a reference resolution assistant. Convert queries with pronouns into explicit, self-contained queries.',
      prompt,
      maxTokens: 200,
      temperature: 0.3
    });

    return response.content.trim();
  }

  /**
   * Build context summary from recent messages
   */
  private buildContextSummary(messages: ConversationMessage[]): string {
    return messages
      .map(msg => `${msg.role.toUpperCase()}: ${msg.content}`)
      .join('\n');
  }

  /**
   * Extract and track entities from message content
   */
  private extractAndTrackEntities(
    session: ConversationSession,
    content: string
  ): void {
    for (const [entityType, pattern] of Object.entries(this.entityPatterns)) {
      const matches = content.matchAll(pattern);
      const values: string[] = [];

      for (const match of matches) {
        values.push(match[0]);
      }

      if (values.length > 0) {
        const existing = session.entities.get(entityType) || [];
        session.entities.set(entityType, [...existing, ...values]);
      }
    }
  }

  /**
   * Get conversation context for RAG query
   */
  getContextForQuery(
    userId: string,
    sessionId: string,
    includeMessages: number = 5
  ): string {
    const session = this.getSession(userId, sessionId);
    const recentMessages = session.messages.slice(-includeMessages);

    if (recentMessages.length === 0) {
      return '';
    }

    return `Previous conversation context:
${this.buildContextSummary(recentMessages)}

Current topic: ${session.currentTopic || 'General discussion'}`;
  }

  /**
   * Update current topic based on messages
   */
  updateTopic(userId: string, sessionId: string, topic: string): void {
    const session = this.getSession(userId, sessionId);
    session.currentTopic = topic;
  }

  /**
   * Clear conversation history
   */
  clearSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /**
   * Get conversation history
   */
  getHistory(userId: string, sessionId: string): ConversationMessage[] {
    const session = this.getSession(userId, sessionId);
    return session.messages;
  }

  /**
   * Cleanup old sessions (call periodically)
   */
  cleanupOldSessions(maxAgeMs: number = 24 * 60 * 60 * 1000): void {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastActivityAt.getTime() > maxAgeMs) {
        toDelete.push(sessionId);
      }
    }

    toDelete.forEach(sid => this.sessions.delete(sid));
    
    if (toDelete.length > 0) {
      console.log(`🧹 Cleaned up ${toDelete.length} old conversation sessions`);
    }
  }

  /**
   * Generate session ID
   */
  private generateSessionId(userId: string): string {
    return `session_${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate message ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get statistics about a session
   */
  getSessionStats(sessionId: string): {
    messageCount: number;
    entityCount: number;
    duration: number;
    lastActivity: Date;
  } | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const entityCount = Array.from(session.entities.values())
      .reduce((sum, arr) => sum + arr.length, 0);

    return {
      messageCount: session.messages.length,
      entityCount,
      duration: session.lastActivityAt.getTime() - session.startedAt.getTime(),
      lastActivity: session.lastActivityAt
    };
  }
}

