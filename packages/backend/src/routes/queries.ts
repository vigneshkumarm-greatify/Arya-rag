/**
 * RAG Query Processing API Routes
 * 
 * Handles query processing for document-based question answering.
 * Provides RAG functionality with accurate page citations and source tracking.
 * 
 * @author ARYA RAG Team
 */

import { Router, Request, Response } from 'express';
// Services imported lazily to avoid initialization crashes
import { 
  asyncHandler, 
  ValidationError, 
  ServiceUnavailableError,
  successResponse 
} from '../middleware/errorHandler';
import { validators } from '../middleware/validation';
import { RAGRequest, RAGResponse } from '@arya-rag/types';

const router = Router();

import { ConversationalRAGService } from '../services/rag/ConversationalRAGService';

// Services will be initialized lazily like Arya-Chatbot
let ragService: any;
let conversationalRAGService: any;
let databaseClient: any;
let conversationService: any;

// Initialize services lazily to avoid import-time crashes
async function initializeServices() {
  if (!ragService) {
    try {
      const { RAGService } = await import('../services/rag/RAGService');
      const { DatabaseClient } = await import('../config/database');
      
      const ragConfig = {
        maxSearchResults: parseInt(process.env.RAG_MAX_SEARCH_RESULTS || '10'),
        similarityThreshold: parseFloat(process.env.RAG_SIMILARITY_THRESHOLD || '0.65'),
        maxResponseTokens: parseInt(process.env.RAG_MAX_RESPONSE_TOKENS || '1000'),
        temperature: parseFloat(process.env.RAG_TEMPERATURE || '0.7'),
        maxContextTokens: parseInt(process.env.RAG_MAX_CONTEXT_TOKENS || '3000'),
        includeSourceExcerpts: process.env.RAG_INCLUDE_EXCERPTS !== 'false',
        requireSourceCitations: process.env.RAG_REQUIRE_CITATIONS !== 'false',
        maxSourcesPerResponse: parseInt(process.env.RAG_MAX_SOURCES || '5')
      };

      ragService = new RAGService(ragConfig);
      
      // Initialize conversational RAG service
      conversationalRAGService = new ConversationalRAGService({
        ...ragConfig,
        enableIntentAnalysis: true,
        enableConversationalMode: true,
        enableFollowUpSuggestions: true,
        responseStyle: 'adaptive'
      });
      
      databaseClient = DatabaseClient.getInstance();
      
      // Initialize conversation context service
      const { ConversationContextService } = await import('../services/conversation/ConversationContextService');
      conversationService = new ConversationContextService();
      console.log('✅ RAG Service, Conversational RAG, and Conversation Context initialized for query processing');
      
    } catch (error) {
      console.error('❌ Failed to initialize RAG Service:', error);
      throw new ServiceUnavailableError('RAG service initialization failed');
    }
  }
}

/**
 * Process a RAG query
 * POST /api/queries/process
 */
router.post('/process',
  validators.ragQuery,
  validators.queryRateLimit,
  asyncHandler(async (req: Request, res: Response) => {
    // Initialize services if not already done
    if (!ragService) {
      await initializeServices();
    }

    const { query, userId, documentIds, maxResults, responseStyle, includeExcerpts, sessionId } = req.body;

    console.log(`🔍 Processing RAG query for user: ${userId}`);
    console.log(`   Query: "${query}"`);
    console.log(`   Session: ${sessionId || 'new session'}`);
    console.log(`   Document scope: ${documentIds ? documentIds.length + ' specific documents' : 'all user documents'}`);

    // Verify user has access to requested documents
    if (documentIds && documentIds.length > 0) {
      await verifyDocumentAccess(userId, documentIds);
    }

    // Get or create conversation session
    const session = conversationService.getSession(userId, sessionId);
    const activeSessionId = session.sessionId;

    // Add user message to conversation
    conversationService.addMessage(userId, activeSessionId, 'user', query);

    // Check for references and resolve if needed
    let effectiveQuery = query;
    let referenceResolution = null;
    
    if (conversationService.containsReferences(query)) {
      console.log(`🔗 Query contains references, resolving...`);
      referenceResolution = await conversationService.resolveReferences(
        query,
        userId,
        activeSessionId
      );
      effectiveQuery = referenceResolution.resolvedQuery;
      console.log(`✅ Resolved query: "${effectiveQuery}"`);
    }

    // Build RAG request
    const ragRequest: RAGRequest = {
      query: effectiveQuery,
      userId,
      documentIds,
      maxResults: maxResults || 10,
      responseStyle: responseStyle || 'detailed'
    };

    // Process the query with conversational RAG
    const startTime = Date.now();
    const ragResponse = await conversationalRAGService.processConversationalQuery(ragRequest);
    const processingTime = Date.now() - startTime;

    console.log(`✅ Query processed in ${processingTime}ms`);
    console.log(`   Sources: ${ragResponse.sources.length}`);
    console.log(`   Confidence: ${(ragResponse.confidence * 100).toFixed(1)}%`);

    // Enhance response with conversational elements and metadata
    const enhancedResponse = {
      ...ragResponse,
      query: {
        text: query,
        originalQuery: query,
        resolvedQuery: effectiveQuery,
        userId,
        documentIds,
        responseStyle
      },
      conversation: {
        sessionId: activeSessionId,
        hasReferences: referenceResolution !== null,
        referenceResolution: referenceResolution ? {
          detectedReferences: referenceResolution.detectedReferences,
          needsContext: referenceResolution.needsContext
        } : null,
        // Add conversational elements
        conversationalElements: ragResponse.conversationalElements,
        intent: ragResponse.intent,
        conversationFlow: ragResponse.conversationFlow
      },
      metadata: {
        ...ragResponse.metadata,
        apiProcessingTime: processingTime,
        requestId: req.headers['x-request-id'],
        timestamp: new Date().toISOString()
      }
    };

    res.json(successResponse(
      enhancedResponse,
      'Query processed successfully'
    ));
  })
);

/**
 * Process a conversational query with enhanced understanding
 * POST /api/queries/conversational
 */
router.post('/conversational',
  validators.ragQuery,
  validators.queryRateLimit,
  asyncHandler(async (req: Request, res: Response) => {
    // Initialize services if not already done
    if (!conversationalRAGService) {
      await initializeServices();
    }

    const { 
      query, 
      userId, 
      documentIds, 
      maxResults, 
      responseStyle, 
      sessionId,
      enableIntentAnalysis = true,
      enableFollowUps = true,
      responseStyle: conversationalStyle = 'adaptive'
    } = req.body;

    console.log(`💬 Processing conversational query for user: ${userId}`);
    console.log(`   Query: "${query}"`);
    console.log(`   Session: ${sessionId || 'new session'}`);
    console.log(`   Style: ${conversationalStyle}`);

    // Verify user has access to requested documents
    if (documentIds && documentIds.length > 0) {
      await verifyDocumentAccess(userId, documentIds);
    }

    // Build conversational RAG request
    const ragRequest: RAGRequest = {
      query,
      userId,
      documentIds,
      maxResults: maxResults || 10,
      responseStyle: responseStyle || 'detailed',
      sessionId
    };

    // Process with conversational RAG service
    const startTime = Date.now();
    const conversationalResponse = await conversationalRAGService.processConversationalQuery(ragRequest);
    const processingTime = Date.now() - startTime;

    console.log(`✅ Conversational query processed in ${processingTime}ms`);
    console.log(`   Intent: ${conversationalResponse.intent.primaryIntent}`);
    console.log(`   Follow-ups: ${conversationalResponse.conversationalElements.followUpQuestions?.length || 0}`);

    res.json(successResponse(
      {
        ...conversationalResponse,
        metadata: {
          ...conversationalResponse.metadata,
          apiProcessingTime: processingTime,
          requestId: req.headers['x-request-id'],
          timestamp: new Date().toISOString()
        }
      },
      'Conversational query processed successfully'
    ));
  })
);

/**
 * Get conversation history for a session
 * GET /api/queries/conversation/:sessionId
 */
router.get('/conversation/:sessionId',
  asyncHandler(async (req: Request, res: Response) => {
    if (!conversationService) {
      await initializeServices();
    }

    const { sessionId } = req.params;
    const { userId } = req.query;

    if (!userId) {
      throw new ValidationError('userId query parameter is required');
    }

    console.log(`💬 Fetching conversation history: ${sessionId}`);

    const history = conversationService.getHistory(userId as string, sessionId);
    const stats = conversationService.getSessionStats(sessionId);

    res.json(successResponse(
      {
        sessionId,
        messages: history,
        stats
      },
      'Conversation history retrieved'
    ));
  })
);

/**
 * Clear conversation session
 * DELETE /api/queries/conversation/:sessionId
 */
router.delete('/conversation/:sessionId',
  asyncHandler(async (req: Request, res: Response) => {
    if (!conversationService) {
      await initializeServices();
    }

    const { sessionId } = req.params;

    console.log(`🗑️  Clearing conversation: ${sessionId}`);

    conversationService.clearSession(sessionId);

    res.json(successResponse(
      { sessionId },
      'Conversation cleared'
    ));
  })
);

/**
 * Get query history for a user
 * GET /api/queries/history
 */
router.get('/history',
  validators.pagination,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.query.userId as string;
    const { page, limit } = req.query;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    if (!userId) {
      throw new ValidationError('userId query parameter is required');
    }

    console.log(`📚 Fetching query history for user: ${userId}`);

    if (!databaseClient) {
      await initializeServices();
    }

    const db = databaseClient.getClient();

    let query = (db as any)
      .from('user_queries')
      .select('*')
      .eq('user_id', userId);

    // Apply date filters
    if (startDate) {
      query = query.gte('created_at', startDate);
    }
    if (endDate) {
      query = query.lte('created_at', endDate);
    }

    // Apply sorting (most recent first)
    query = query.order('created_at', { ascending: false });

    // Apply pagination
    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 20;
    const offset = (pageNum - 1) * limitNum;

    query = query.range(offset, offset + limitNum - 1);

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Failed to fetch query history: ${error.message}`);
    }

    // Calculate statistics
    const totalQueries = data?.length || 0;
    let avgConfidence = 0;
    let avgProcessingTime = 0;

    if (data && data.length > 0) {
      avgConfidence = data.reduce((sum: number, q: any) => sum + (q.confidence_score || 0), 0) / data.length;
      avgProcessingTime = data.reduce((sum: number, q: any) => sum + (q.processing_time_ms || 0), 0) / data.length;
    }

    const { count: totalCount } = await (db as any)
      .from('user_queries')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    const totalPages = Math.ceil((totalCount || 0) / limitNum);

    res.json(successResponse(
      data || [],
      `Retrieved ${totalQueries} queries from history`,
      {
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalItems: totalCount || 0,
          itemsPerPage: limitNum
        },
        statistics: {
          totalQueries: totalCount || 0,
          avgConfidence: Math.round(avgConfidence * 100) / 100,
          avgProcessingTime: Math.round(avgProcessingTime)
        },
        filters: { startDate, endDate }
      }
    ));
  })
);

/**
 * Get specific query details
 * GET /api/queries/:queryId
 */
router.get('/:queryId',
  asyncHandler(async (req: Request, res: Response) => {
    const { queryId } = req.params;
    const userId = req.query.userId as string;

    if (!userId) {
      throw new ValidationError('userId query parameter is required');
    }

    console.log(`🔍 Fetching query details: ${queryId}`);

    if (!databaseClient) {
      await initializeServices();
    }

    const db = databaseClient.getClient();

    const { data, error } = await (db as any)
      .from('user_queries')
      .select('*')
      .eq('query_id', queryId)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new ValidationError(`Query not found: ${queryId}`);
      }
      throw new Error(`Failed to fetch query: ${error.message}`);
    }

    res.json(successResponse(
      data,
      'Query details retrieved'
    ));
  })
);

/**
 * Get query analytics and statistics
 * GET /api/queries/analytics
 */
router.get('/analytics/summary',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.query.userId as string;
    const timeframe = req.query.timeframe as string || '7d'; // 7d, 30d, 90d

    if (!userId) {
      throw new ValidationError('userId query parameter is required');
    }

    console.log(`📊 Generating query analytics for user: ${userId} (${timeframe})`);

    if (!databaseClient) {
      await initializeServices();
    }

    const db = databaseClient.getClient();

    // Calculate date range based on timeframe
    const now = new Date();
    const startDate = new Date();
    
    switch (timeframe) {
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(now.getDate() - 90);
        break;
      default:
        startDate.setDate(now.getDate() - 7);
    }

    // Get queries in timeframe
    const { data: queries, error } = await (db as any)
      .from('user_queries')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', startDate.toISOString());

    if (error) {
      throw new Error(`Failed to fetch analytics data: ${error.message}`);
    }

    // Calculate analytics
    const analytics = calculateQueryAnalytics(queries || [], timeframe);

    res.json(successResponse(
      analytics,
      `Analytics for ${timeframe} timeframe`
    ));
  })
);

/**
 * Test RAG system connectivity and configuration
 * GET /api/queries/test
 */
router.get('/test/connectivity',
  asyncHandler(async (req: Request, res: Response) => {
    console.log('🧪 Testing RAG system connectivity...');

    if (!ragService) {
      throw new ServiceUnavailableError('RAG Service');
    }

    // Test RAG pipeline
    const pipelineTest = await ragService.testPipeline();

    // Get service statistics
    const ragStats = ragService.getStats();

    const testResults = {
      ragService: {
        initialized: true,
        pipelineTest,
        statistics: ragStats
      },
      configuration: {
        maxSearchResults: process.env.RAG_MAX_SEARCH_RESULTS || '10',
        similarityThreshold: process.env.RAG_SIMILARITY_THRESHOLD || '0.65',
        maxResponseTokens: process.env.RAG_MAX_RESPONSE_TOKENS || '1000',
        embeddingProvider: process.env.EMBEDDING_PROVIDER || 'not configured',
        llmProvider: process.env.LLM_PROVIDER || 'not configured'
      }
    };

    res.json(successResponse(
      testResults,
      pipelineTest.success ? 'RAG system is operational' : 'RAG system has issues'
    ));
  })
);

/**
 * Get similar queries (for suggestion/completion)
 * GET /api/queries/suggestions
 */
router.get('/suggestions/similar',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.query.userId as string;
    const queryText = req.query.query as string;
    const limit = parseInt(req.query.limit as string) || 5;

    if (!userId || !queryText) {
      throw new ValidationError('userId and query parameters are required');
    }

    console.log(`🔎 Finding similar queries for: "${queryText}"`);

    if (!databaseClient) {
      await initializeServices();
    }

    const db = databaseClient.getClient();

    // Simple text similarity search using PostgreSQL
    // In production, could use vector similarity on query embeddings
    const { data, error } = await (db as any)
      .from('user_queries')
      .select('query_text, response_text, confidence_score, created_at')
      .eq('user_id', userId)
      .textSearch('query_text', queryText)
      .order('confidence_score', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn('Similar query search failed:', error.message);
      // Return empty results instead of throwing error
      return res.json(successResponse([], 'No similar queries found'));
    }

    res.json(successResponse(
      data || [],
      `Found ${data?.length || 0} similar queries`
    ));
  })
);

/**
 * Reprocess a query with different parameters
 * POST /api/queries/:queryId/reprocess
 */
router.post('/:queryId/reprocess',
  asyncHandler(async (req: Request, res: Response) => {
    const { queryId } = req.params;
    const userId = req.body.userId;
    const { maxResults, responseStyle, documentIds } = req.body;

    if (!userId) {
      throw new ValidationError('userId is required');
    }

    console.log(`🔄 Reprocessing query: ${queryId}`);

    if (!databaseClient) {
      await initializeServices();
    }

    const db = databaseClient.getClient();

    // Get original query
    const { data: originalQuery, error } = await (db as any)
      .from('user_queries')
      .select('query_text')
      .eq('query_id', queryId)
      .eq('user_id', userId)
      .single();

    if (error) {
      throw new ValidationError(`Original query not found: ${queryId}`);
    }

    // Create new RAG request with updated parameters
    const ragRequest: RAGRequest = {
      query: originalQuery.query_text,
      userId,
      documentIds: documentIds,
      maxResults: maxResults || 10,
      responseStyle: responseStyle || 'detailed'
    };

    // Process the query
    const ragResponse = await ragService.processQuery(ragRequest);

    res.json(successResponse(
      {
        ...ragResponse,
        originalQueryId: queryId,
        reprocessed: true
      },
      'Query reprocessed successfully'
    ));
  })
);

/**
 * Helper function to verify user has access to requested documents
 */
async function verifyDocumentAccess(userId: string, documentIds: string[]): Promise<void> {
  if (!databaseClient) {
    const { DatabaseClient } = await import('../config/database');
    databaseClient = DatabaseClient.getInstance();
  }
  
  const db = databaseClient.getClient();

  const { data, error } = await (db as any)
    .from('user_documents')
    .select('document_id')
    .eq('user_id', userId)
    .in('document_id', documentIds);

  if (error) {
    throw new Error(`Failed to verify document access: ${error.message}`);
  }

  const accessibleIds = (data || []).map((doc: any) => doc.document_id);
  const inaccessibleIds = documentIds.filter(id => !accessibleIds.includes(id));

  if (inaccessibleIds.length > 0) {
    throw new ValidationError(
      'Access denied to some documents',
      { 
        inaccessibleDocuments: inaccessibleIds,
        message: 'You do not have access to the specified documents'
      }
    );
  }
}

/**
 * Calculate query analytics from raw data
 */
function calculateQueryAnalytics(queries: any[], timeframe: string) {
  const totalQueries = queries.length;

  if (totalQueries === 0) {
    return {
      timeframe,
      totalQueries: 0,
      avgConfidence: 0,
      avgProcessingTime: 0,
      avgSourcesPerQuery: 0,
      queryFrequency: 0,
      topDocuments: [],
      confidenceDistribution: {
        high: 0,    // > 0.8
        medium: 0,  // 0.5 - 0.8
        low: 0      // < 0.5
      },
      commonTopics: []
    };
  }

  // Basic statistics
  const avgConfidence = queries.reduce((sum, q) => sum + (q.confidence_score || 0), 0) / totalQueries;
  const avgProcessingTime = queries.reduce((sum, q) => sum + (q.processing_time_ms || 0), 0) / totalQueries;
  
  // Calculate average sources per query from stored sources data
  const avgSourcesPerQuery = queries.reduce((sum, q) => {
    const sources = q.sources ? (Array.isArray(q.sources) ? q.sources.length : 0) : 0;
    return sum + sources;
  }, 0) / totalQueries;

  // Calculate query frequency (queries per day)
  const days = timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : 90;
  const queryFrequency = totalQueries / days;

  // Confidence distribution
  let highConfidence = 0;
  let mediumConfidence = 0;
  let lowConfidence = 0;

  queries.forEach(q => {
    const confidence = q.confidence_score || 0;
    if (confidence > 0.8) highConfidence++;
    else if (confidence >= 0.5) mediumConfidence++;
    else lowConfidence++;
  });

  // Top documents (by query frequency)
  const documentCounts: { [key: string]: number } = {};
  queries.forEach(q => {
    if (q.sources && Array.isArray(q.sources)) {
      q.sources.forEach((source: any) => {
        if (source.documentName) {
          documentCounts[source.documentName] = (documentCounts[source.documentName] || 0) + 1;
        }
      });
    }
  });

  const topDocuments = Object.entries(documentCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([name, count]) => ({ name, queryCount: count }));

  // Simple topic extraction from query text (basic keyword analysis)
  const commonTopics = extractCommonTopics(queries.map(q => q.query_text));

  return {
    timeframe,
    totalQueries,
    avgConfidence: Math.round(avgConfidence * 100) / 100,
    avgProcessingTime: Math.round(avgProcessingTime),
    avgSourcesPerQuery: Math.round(avgSourcesPerQuery * 10) / 10,
    queryFrequency: Math.round(queryFrequency * 100) / 100,
    topDocuments,
    confidenceDistribution: {
      high: highConfidence,
      medium: mediumConfidence,
      low: lowConfidence
    },
    commonTopics
  };
}

/**
 * Extract common topics from query texts (simple keyword analysis)
 */
function extractCommonTopics(queryTexts: string[]): Array<{ topic: string; frequency: number }> {
  const stopWords = new Set(['the', 'is', 'at', 'which', 'on', 'what', 'how', 'when', 'where', 'why', 'who', 'and', 'or', 'but', 'in', 'with', 'to', 'for', 'of', 'as', 'by', 'from', 'up', 'about', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'among', 'can', 'could', 'would', 'should', 'may', 'might', 'will', 'shall']);
  
  const wordCounts: { [key: string]: number } = {};

  queryTexts.forEach(text => {
    if (!text) return;
    
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));

    words.forEach(word => {
      wordCounts[word] = (wordCounts[word] || 0) + 1;
    });
  });

  return Object.entries(wordCounts)
    .filter(([_, count]) => count > 1)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10)
    .map(([topic, frequency]) => ({ topic, frequency }));
}

export default router;