/**
 * Error Handling Middleware
 * 
 * Centralized error handling for the ARYA RAG API.
 * Provides consistent error responses and logging for debugging.
 * 
 * @author ARYA RAG Team
 */

import { Request, Response, NextFunction } from 'express';

/**
 * Standard API error response format
 */
export interface APIError {
  error: {
    code: string;
    message: string;
    details?: any;
    timestamp: string;
    requestId?: string;
  };
}

/**
 * Custom error class for API errors
 */
export class APIException extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: any;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    details?: any
  ) {
    super(message);
    this.name = 'APIException';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

/**
 * Predefined error types for common scenarios
 */
export class ValidationError extends APIException {
  constructor(message: string, details?: any) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class NotFoundError extends APIException {
  constructor(resource: string, id?: string) {
    const message = id 
      ? `${resource} with ID '${id}' not found`
      : `${resource} not found`;
    super(message, 404, 'NOT_FOUND');
  }
}

export class UnauthorizedError extends APIException {
  constructor(message: string = 'Unauthorized access') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ConflictError extends APIException {
  constructor(message: string, details?: any) {
    super(message, 409, 'CONFLICT', details);
  }
}

export class RateLimitError extends APIException {
  constructor(message: string = 'Rate limit exceeded') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
  }
}

export class ServiceUnavailableError extends APIException {
  constructor(service: string, details?: any) {
    super(`${service} service is currently unavailable`, 503, 'SERVICE_UNAVAILABLE', details);
  }
}

/**
 * Main error handling middleware
 * This should be the last middleware in the chain
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Generate request ID for tracking
  const requestId = req.headers['x-request-id'] as string || generateRequestId();
  
  // Log error for debugging
  console.error(`[${requestId}] Error in ${req.method} ${req.path}:`, {
    error: err.message,
    stack: err.stack,
    body: req.body,
    params: req.params,
    query: req.query
  });

  let statusCode = 500;
  let errorCode = 'INTERNAL_ERROR';
  let message = 'An unexpected error occurred';
  let details: any = undefined;

  // Handle known error types
  if (err instanceof APIException) {
    statusCode = err.statusCode;
    errorCode = err.code;
    message = err.message;
    details = err.details;
  } else if (err.name === 'ValidationError') {
    // Mongoose/Joi validation errors
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    message = err.message;
  } else if (err.name === 'CastError') {
    // MongoDB cast errors (invalid ObjectId, etc.)
    statusCode = 400;
    errorCode = 'INVALID_ID';
    message = 'Invalid ID format';
  } else if (err.name === 'MongoError' || err.name === 'MongoServerError') {
    // Database errors
    statusCode = 500;
    errorCode = 'DATABASE_ERROR';
    message = 'Database operation failed';
    details = process.env.NODE_ENV === 'development' ? err.message : undefined;
  } else if (err.message.includes('ECONNREFUSED')) {
    // Connection errors (Ollama, OpenAI, etc.)
    statusCode = 503;
    errorCode = 'SERVICE_UNAVAILABLE';
    message = 'External service connection failed';
  } else if (err.message.includes('timeout')) {
    // Timeout errors
    statusCode = 408;
    errorCode = 'TIMEOUT';
    message = 'Request timeout';
  }

  // Prepare error response
  const errorResponse: APIError = {
    error: {
      code: errorCode,
      message,
      details,
      timestamp: new Date().toISOString(),
      requestId
    }
  };

  // Add stack trace in development
  if (process.env.NODE_ENV === 'development') {
    (errorResponse.error as any).stack = err.stack;
  }

  // Send error response
  res.status(statusCode).json(errorResponse);
}

/**
 * Async error wrapper for route handlers
 * Catches async errors and passes them to error middleware
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * 404 handler for unmatched routes
 */
export function notFoundHandler(req: Request, res: Response, next: NextFunction): void {
  const error = new NotFoundError('API endpoint');
  next(error);
}

/**
 * Generate unique request ID
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Validation helper for common scenarios
 */
export function validateRequired(fields: Record<string, any>, requiredFields: string[]): void {
  const missing = requiredFields.filter(field => 
    fields[field] === undefined || 
    fields[field] === null || 
    fields[field] === ''
  );

  if (missing.length > 0) {
    throw new ValidationError(
      `Missing required fields: ${missing.join(', ')}`,
      { missingFields: missing }
    );
  }
}

/**
 * File validation helpers
 */
export function validateFileUpload(file: Express.Multer.File): void {
  const maxSizeBytes = parseInt(process.env.MAX_FILE_SIZE_MB || '100') * 1024 * 1024;
  const allowedTypes = ['application/pdf'];

  if (!file) {
    throw new ValidationError('No file uploaded');
  }

  if (!allowedTypes.includes(file.mimetype)) {
    throw new ValidationError(
      'Invalid file type. Only PDF files are allowed.',
      { allowedTypes, receivedType: file.mimetype }
    );
  }

  if (file.size > maxSizeBytes) {
    throw new ValidationError(
      `File size exceeds maximum limit of ${maxSizeBytes / 1024 / 1024}MB`,
      { maxSizeBytes, fileSize: file.size }
    );
  }
}

/**
 * User ID validation helper
 */
export function validateUserId(userId: string): void {
  if (!userId || userId.trim().length === 0) {
    throw new ValidationError('User ID is required');
  }

  // Basic alphanumeric + hyphens validation
  if (!/^[a-zA-Z0-9-_]+$/.test(userId)) {
    throw new ValidationError(
      'User ID can only contain letters, numbers, hyphens, and underscores'
    );
  }

  if (userId.length > 50) {
    throw new ValidationError('User ID cannot exceed 50 characters');
  }
}

/**
 * Pagination validation helper
 */
export function validatePagination(page?: string, limit?: string): { page: number; limit: number } {
  const pageNum = page ? parseInt(page, 10) : 1;
  const limitNum = limit ? parseInt(limit, 10) : 20;

  if (isNaN(pageNum) || pageNum < 1) {
    throw new ValidationError('Page must be a positive integer');
  }

  if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
    throw new ValidationError('Limit must be between 1 and 100');
  }

  return { page: pageNum, limit: limitNum };
}

/**
 * Success response helper
 */
export function successResponse<T>(
  data: T,
  message?: string,
  metadata?: Record<string, any>
): {
  success: boolean;
  data: T;
  message?: string;
  metadata?: Record<string, any>;
} {
  const response: any = {
    success: true,
    data
  };

  if (message) {
    response.message = message;
  }

  if (metadata) {
    response.metadata = metadata;
  }

  return response;
}