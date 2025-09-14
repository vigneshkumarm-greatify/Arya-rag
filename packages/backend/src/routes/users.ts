/**
 * User Management API Routes
 * 
 * Handles user preferences, settings, and account management.
 * Provides simple user isolation without complex authentication.
 * 
 * @author ARYA RAG Team
 */

import { Router, Request, Response } from 'express';
import { DatabaseClient } from '../config/database';
import { 
  asyncHandler, 
  ValidationError, 
  NotFoundError,
  successResponse 
} from '../middleware/errorHandler';
import { validators } from '../middleware/validation';

const router = Router();

/**
 * Get user profile and statistics
 * GET /api/users/:userId
 */
router.get('/:userId',
  validators.userId,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.params;

    console.log(`👤 Fetching profile for user: ${userId}`);

    const db = DatabaseClient.getInstance().getClient();

    // Get user document statistics
    const { data: documents, error: docsError } = await (db as any)
      .from('user_documents')
      .select('status, created_at, total_pages, total_chunks, file_size')
      .eq('user_id', userId);

    if (docsError) {
      throw new Error(`Failed to fetch user documents: ${docsError.message}`);
    }

    // Get user query statistics
    const { data: queries, error: queriesError } = await (db as any)
      .from('user_queries')
      .select('confidence_score, processing_time_ms, created_at')
      .eq('user_id', userId);

    if (queriesError) {
      throw new Error(`Failed to fetch user queries: ${queriesError.message}`);
    }

    // Calculate statistics
    const stats = calculateUserStatistics(documents || [], queries || []);

    // Get user preferences (if they exist)
    const { data: preferences, error: prefsError } = await (db as any)
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (prefsError && prefsError.code !== 'PGRST116') {
      console.warn('Failed to fetch user preferences:', prefsError.message);
    }

    const userProfile = {
      userId,
      statistics: stats,
      preferences: preferences || getDefaultPreferences(),
      accountInfo: {
        firstDocumentAt: documents && documents.length > 0 ? 
          new Date(Math.min(...documents.map(d => new Date(d.created_at).getTime()))) : null,
        lastActivityAt: getLastActivity(documents, queries),
        totalStorageUsed: stats.documents.totalSize
      }
    };

    res.json(successResponse(
      userProfile,
      'User profile retrieved'
    ));
  })
);

/**
 * Update user preferences
 * PUT /api/users/:userId/preferences
 */
router.put('/:userId/preferences',
  validators.userId,
  validators.userPreferences,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.params;
    const preferences = req.body;

    console.log(`⚙️ Updating preferences for user: ${userId}`);

    const db = DatabaseClient.getInstance().getClient();

    // Upsert user preferences
    const { data, error } = await (db as any)
      .from('user_preferences')
      .upsert({
        user_id: userId,
        ...preferences,
        updated_at: new Date()
      }, {
        onConflict: 'user_id'
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update preferences: ${error.message}`);
    }

    res.json(successResponse(
      data,
      'User preferences updated successfully'
    ));
  })
);

/**
 * Get user preferences
 * GET /api/users/:userId/preferences
 */
router.get('/:userId/preferences',
  validators.userId,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.params;

    const db = DatabaseClient.getInstance().getClient();

    const { data, error } = await (db as any)
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to fetch preferences: ${error.message}`);
    }

    res.json(successResponse(
      data || getDefaultPreferences(),
      'User preferences retrieved'
    ));
  })
);

/**
 * Get user's document statistics
 * GET /api/users/:userId/statistics/documents
 */
router.get('/:userId/statistics/documents',
  validators.userId,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.params;
    const timeframe = req.query.timeframe as string || '30d';

    console.log(`📊 Fetching document statistics for user: ${userId}`);

    const db = DatabaseClient.getInstance().getClient();

    // Calculate date range
    const startDate = getStartDate(timeframe);

    const { data, error } = await (db as any)
      .from('user_documents')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', startDate.toISOString());

    if (error) {
      throw new Error(`Failed to fetch document statistics: ${error.message}`);
    }

    const stats = calculateDocumentStatistics(data || [], timeframe);

    res.json(successResponse(
      stats,
      `Document statistics for ${timeframe}`
    ));
  })
);

/**
 * Get user's query statistics
 * GET /api/users/:userId/statistics/queries
 */
router.get('/:userId/statistics/queries',
  validators.userId,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.params;
    const timeframe = req.query.timeframe as string || '30d';

    console.log(`📊 Fetching query statistics for user: ${userId}`);

    const db = DatabaseClient.getInstance().getClient();

    const startDate = getStartDate(timeframe);

    const { data, error } = await (db as any)
      .from('user_queries')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', startDate.toISOString());

    if (error) {
      throw new Error(`Failed to fetch query statistics: ${error.message}`);
    }

    const stats = calculateQueryStatistics(data || [], timeframe);

    res.json(successResponse(
      stats,
      `Query statistics for ${timeframe}`
    ));
  })
);

/**
 * Get user's storage usage
 * GET /api/users/:userId/storage
 */
router.get('/:userId/storage',
  validators.userId,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.params;

    console.log(`💾 Fetching storage usage for user: ${userId}`);

    const db = DatabaseClient.getInstance().getClient();

    // Get document storage usage
    const { data: documents, error: docsError } = await (db as any)
      .from('user_documents')
      .select('file_size, total_chunks, status')
      .eq('user_id', userId);

    if (docsError) {
      throw new Error(`Failed to fetch storage data: ${docsError.message}`);
    }

    // Get chunk count (for vector storage estimation)
    const { count: totalChunks, error: chunksError } = await (db as any)
      .from('document_chunks')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (chunksError) {
      console.warn('Failed to get chunk count:', chunksError.message);
    }

    const storageStats = calculateStorageUsage(documents || [], totalChunks || 0);

    res.json(successResponse(
      storageStats,
      'Storage usage retrieved'
    ));
  })
);

/**
 * Delete user account and all data
 * DELETE /api/users/:userId
 */
router.delete('/:userId',
  validators.userId,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.params;
    const confirmUserId = req.body.confirmUserId;

    // Safety check - require confirmation
    if (confirmUserId !== userId) {
      throw new ValidationError('User ID confirmation required for account deletion');
    }

    console.log(`🗑️ Deleting all data for user: ${userId}`);

    const db = DatabaseClient.getInstance().getClient();

    try {
      // Delete in correct order due to foreign key constraints
      
      // 1. Delete document chunks
      const { error: chunksError } = await (db as any)
        .from('document_chunks')
        .delete()
        .eq('user_id', userId);

      if (chunksError) {
        console.warn('Failed to delete chunks:', chunksError.message);
      }

      // 2. Delete user queries
      const { error: queriesError } = await (db as any)
        .from('user_queries')
        .delete()
        .eq('user_id', userId);

      if (queriesError) {
        console.warn('Failed to delete queries:', queriesError.message);
      }

      // 3. Delete user documents
      const { error: docsError } = await (db as any)
        .from('user_documents')
        .delete()
        .eq('user_id', userId);

      if (docsError) {
        console.warn('Failed to delete documents:', docsError.message);
      }

      // 4. Delete user preferences
      const { error: prefsError } = await (db as any)
        .from('user_preferences')
        .delete()
        .eq('user_id', userId);

      if (prefsError) {
        console.warn('Failed to delete preferences:', prefsError.message);
      }

      res.json(successResponse(
        { userId, deleted: true },
        'User account and all associated data deleted successfully'
      ));

    } catch (error) {
      throw new Error(`Failed to delete user data: ${error instanceof Error ? error.message : error}`);
    }
  })
);

/**
 * Get user activity timeline
 * GET /api/users/:userId/activity
 */
router.get('/:userId/activity',
  validators.userId,
  validators.pagination,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.params;
    const { page, limit } = req.query;
    const activityType = req.query.type as string; // 'documents', 'queries', 'all'

    console.log(`📅 Fetching activity timeline for user: ${userId}`);

    const db = DatabaseClient.getInstance().getClient();

    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 20;

    const activities = [];

    // Get document activities
    if (!activityType || activityType === 'all' || activityType === 'documents') {
      const { data: docActivities, error: docsError } = await (db as any)
        .from('user_documents')
        .select('document_id, title, filename, status, created_at, processing_completed_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (docsError) {
        console.warn('Failed to fetch document activities:', docsError.message);
      } else {
        docActivities?.forEach(doc => {
          activities.push({
            type: 'document_upload',
            timestamp: doc.created_at,
            data: {
              documentId: doc.document_id,
              title: doc.title,
              filename: doc.filename,
              status: doc.status
            }
          });

          if (doc.processing_completed_at) {
            activities.push({
              type: 'document_processed',
              timestamp: doc.processing_completed_at,
              data: {
                documentId: doc.document_id,
                title: doc.title
              }
            });
          }
        });
      }
    }

    // Get query activities
    if (!activityType || activityType === 'all' || activityType === 'queries') {
      const { data: queryActivities, error: queriesError } = await (db as any)
        .from('user_queries')
        .select('query_id, query_text, confidence_score, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (queriesError) {
        console.warn('Failed to fetch query activities:', queriesError.message);
      } else {
        queryActivities?.forEach(query => {
          activities.push({
            type: 'query_processed',
            timestamp: query.created_at,
            data: {
              queryId: query.query_id,
              queryText: query.query_text.substring(0, 100) + (query.query_text.length > 100 ? '...' : ''),
              confidence: query.confidence_score
            }
          });
        });
      }
    }

    // Sort activities by timestamp (most recent first)
    activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply pagination
    const offset = (pageNum - 1) * limitNum;
    const paginatedActivities = activities.slice(offset, offset + limitNum);
    const totalPages = Math.ceil(activities.length / limitNum);

    res.json(successResponse(
      paginatedActivities,
      `Retrieved ${paginatedActivities.length} activities`,
      {
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalItems: activities.length,
          itemsPerPage: limitNum
        },
        filters: { type: activityType }
      }
    ));
  })
);

/**
 * Helper functions
 */

function getDefaultPreferences() {
  return {
    embeddingProvider: process.env.EMBEDDING_PROVIDER || 'ollama',
    llmProvider: process.env.LLM_PROVIDER || 'ollama',
    defaultResponseStyle: 'detailed',
    maxResultsPerQuery: 10,
    language: 'en'
  };
}

function calculateUserStatistics(documents: any[], queries: any[]) {
  const now = new Date();
  
  return {
    documents: {
      total: documents.length,
      completed: documents.filter(d => d.status === 'completed').length,
      processing: documents.filter(d => d.status === 'processing').length,
      failed: documents.filter(d => d.status === 'failed').length,
      totalPages: documents.reduce((sum, d) => sum + (d.total_pages || 0), 0),
      totalChunks: documents.reduce((sum, d) => sum + (d.total_chunks || 0), 0),
      totalSize: documents.reduce((sum, d) => sum + (d.file_size || 0), 0)
    },
    queries: {
      total: queries.length,
      averageConfidence: queries.length > 0 ? 
        queries.reduce((sum, q) => sum + (q.confidence_score || 0), 0) / queries.length : 0,
      averageResponseTime: queries.length > 0 ? 
        queries.reduce((sum, q) => sum + (q.processing_time_ms || 0), 0) / queries.length : 0,
      last7Days: queries.filter(q => 
        new Date(q.created_at) > new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      ).length,
      last30Days: queries.filter(q => 
        new Date(q.created_at) > new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      ).length
    }
  };
}

function calculateDocumentStatistics(documents: any[], timeframe: string) {
  const totalDocs = documents.length;
  const completedDocs = documents.filter(d => d.status === 'completed').length;
  const failedDocs = documents.filter(d => d.status === 'failed').length;
  const avgPages = totalDocs > 0 ? 
    documents.reduce((sum, d) => sum + (d.total_pages || 0), 0) / totalDocs : 0;

  return {
    timeframe,
    totalDocuments: totalDocs,
    completedDocuments: completedDocs,
    failedDocuments: failedDocs,
    successRate: totalDocs > 0 ? (completedDocs / totalDocs) * 100 : 0,
    averagePagesPerDocument: Math.round(avgPages * 10) / 10,
    totalPages: documents.reduce((sum, d) => sum + (d.total_pages || 0), 0),
    totalChunks: documents.reduce((sum, d) => sum + (d.total_chunks || 0), 0)
  };
}

function calculateQueryStatistics(queries: any[], timeframe: string) {
  const totalQueries = queries.length;
  const avgConfidence = totalQueries > 0 ? 
    queries.reduce((sum, q) => sum + (q.confidence_score || 0), 0) / totalQueries : 0;
  const avgResponseTime = totalQueries > 0 ? 
    queries.reduce((sum, q) => sum + (q.processing_time_ms || 0), 0) / totalQueries : 0;

  // Group queries by day for frequency analysis
  const queryDates = queries.map(q => new Date(q.created_at).toDateString());
  const uniqueDates = [...new Set(queryDates)];
  const avgQueriesPerDay = uniqueDates.length > 0 ? totalQueries / uniqueDates.length : 0;

  return {
    timeframe,
    totalQueries,
    averageConfidence: Math.round(avgConfidence * 100) / 100,
    averageResponseTime: Math.round(avgResponseTime),
    averageQueriesPerDay: Math.round(avgQueriesPerDay * 10) / 10,
    activeDays: uniqueDates.length
  };
}

function calculateStorageUsage(documents: any[], totalChunks: number) {
  const totalFileSize = documents.reduce((sum, d) => sum + (d.file_size || 0), 0);
  
  // Estimate vector storage size (embedding dimensions * 4 bytes per float)
  const embeddingSize = parseInt(process.env.EMBEDDING_DIMENSIONS || '384');
  const estimatedVectorStorage = totalChunks * embeddingSize * 4;

  // Estimate text storage (rough approximation)
  const estimatedTextStorage = totalChunks * 500; // ~500 chars per chunk average

  const totalEstimatedStorage = totalFileSize + estimatedVectorStorage + estimatedTextStorage;

  return {
    originalFiles: {
      totalSize: totalFileSize,
      totalDocuments: documents.length,
      averageSize: documents.length > 0 ? totalFileSize / documents.length : 0
    },
    processedData: {
      totalChunks,
      estimatedVectorStorage,
      estimatedTextStorage,
      embeddingDimensions: embeddingSize
    },
    total: {
      estimatedTotalStorage: totalEstimatedStorage,
      formattedSize: formatBytes(totalEstimatedStorage)
    }
  };
}

function getStartDate(timeframe: string): Date {
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
    case '1y':
      startDate.setFullYear(now.getFullYear() - 1);
      break;
    default:
      startDate.setDate(now.getDate() - 30);
  }

  return startDate;
}

function getLastActivity(documents: any[], queries: any[]): Date | null {
  const allActivities = [
    ...documents.map(d => d.created_at),
    ...queries.map(q => q.created_at)
  ].filter(Boolean).map(date => new Date(date));

  if (allActivities.length === 0) return null;

  return new Date(Math.max(...allActivities.map(date => date.getTime())));
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default router;