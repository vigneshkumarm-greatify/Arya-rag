/**
 * Request Validation Middleware
 * 
 * Provides validation middleware for API requests using Joi schema validation.
 * Ensures data integrity and provides consistent error messages.
 * 
 * @author ARYA RAG Team
 */

import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { ValidationError } from './errorHandler';

/**
 * Validation target types
 */
type ValidationTarget = 'body' | 'params' | 'query' | 'headers';

/**
 * Create validation middleware for a specific schema and target
 */
export function validate(schema: Joi.ObjectSchema, target: ValidationTarget = 'body', options?: { stripUnknown?: boolean }) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const dataToValidate = req[target];
    
    const { error, value } = schema.validate(dataToValidate, {
      abortEarly: false, // Return all errors, not just the first one
      stripUnknown: options?.stripUnknown ?? true, // Remove unknown properties (configurable)
      convert: true // Convert strings to appropriate types
    });

    if (error) {
      const errorDetails = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));

      throw new ValidationError(
        'Request validation failed',
        {
          errors: errorDetails,
          target
        }
      );
    }

    // Replace the original data with validated/converted data
    (req as any)[target] = value;
    next();
  };
}

/**
 * Common validation schemas
 */
export const schemas = {
  /**
   * User ID parameter validation
   */
  userId: Joi.object({
    userId: Joi.string()
      .alphanum()
      .min(1)
      .max(50)
      .required()
      .messages({
        'string.alphanum': 'User ID must contain only alphanumeric characters',
        'string.min': 'User ID must be at least 1 character long',
        'string.max': 'User ID cannot exceed 50 characters',
        'any.required': 'User ID is required'
      })
  }),

  /**
   * Document ID parameter validation
   */
  documentId: Joi.object({
    documentId: Joi.string()
      .min(1)
      .max(100)
      .required()
      .messages({
        'string.min': 'Document ID must be at least 1 character long',
        'string.max': 'Document ID cannot exceed 100 characters',
        'any.required': 'Document ID is required'
      })
  }),

  /**
   * Pagination query parameters validation
   */
  pagination: Joi.object({
    page: Joi.number()
      .integer()
      .min(1)
      .default(1)
      .messages({
        'number.base': 'Page must be a number',
        'number.integer': 'Page must be an integer',
        'number.min': 'Page must be at least 1'
      }),
    limit: Joi.number()
      .integer()
      .min(1)
      .max(100)
      .default(20)
      .messages({
        'number.base': 'Limit must be a number',
        'number.integer': 'Limit must be an integer',
        'number.min': 'Limit must be at least 1',
        'number.max': 'Limit cannot exceed 100'
      })
  }).unknown(true), // Allow unknown fields to pass through

  /**
   * Document upload validation
   */
  documentUpload: Joi.object({
    userId: Joi.string()
      .alphanum()
      .min(1)
      .max(50)
      .required()
      .messages({
        'string.alphanum': 'User ID must contain only alphanumeric characters',
        'any.required': 'User ID is required'
      }),
    title: Joi.string()
      .min(1)
      .max(200)
      .optional()
      .messages({
        'string.min': 'Title must be at least 1 character long',
        'string.max': 'Title cannot exceed 200 characters'
      }),
    description: Joi.string()
      .max(1000)
      .optional()
      .messages({
        'string.max': 'Description cannot exceed 1000 characters'
      }),
    tags: Joi.array()
      .items(Joi.string().max(50))
      .max(10)
      .optional()
      .messages({
        'array.max': 'Cannot have more than 10 tags',
        'string.max': 'Each tag cannot exceed 50 characters'
      })
  }),

  /**
   * RAG query validation
   */
  ragQuery: Joi.object({
    query: Joi.string()
      .min(1)
      .max(2000)
      .required()
      .messages({
        'string.min': 'Query cannot be empty',
        'string.max': 'Query cannot exceed 2000 characters',
        'any.required': 'Query is required'
      }),
    userId: Joi.string()
      .alphanum()
      .min(1)
      .max(50)
      .required()
      .messages({
        'string.alphanum': 'User ID must contain only alphanumeric characters',
        'any.required': 'User ID is required'
      }),
    documentIds: Joi.array()
      .items(Joi.string().min(1).max(100))
      .max(20)
      .optional()
      .messages({
        'array.max': 'Cannot query more than 20 documents at once'
      }),
    maxResults: Joi.number()
      .integer()
      .min(1)
      .max(20)
      .default(10)
      .optional()
      .messages({
        'number.base': 'Max results must be a number',
        'number.integer': 'Max results must be an integer',
        'number.min': 'Max results must be at least 1',
        'number.max': 'Max results cannot exceed 20'
      }),
    responseStyle: Joi.string()
      .valid('concise', 'detailed', 'academic', 'casual')
      .optional()
      .messages({
        'any.only': 'Response style must be one of: concise, detailed, academic, casual'
      }),
    includeExcerpts: Joi.boolean()
      .default(true)
      .optional()
      .messages({
        'boolean.base': 'Include excerpts must be a boolean value'
      })
  }),

  /**
   * Document search/filter validation
   */
  documentSearch: Joi.object({
    userId: Joi.string()
      .min(1)
      .max(100)
      .required()
      .messages({
        'string.min': 'User ID must be at least 1 character long',
        'string.max': 'User ID cannot exceed 100 characters',
        'any.required': 'userId query parameter is required'
      }),
    search: Joi.string()
      .max(200)
      .optional()
      .messages({
        'string.max': 'Search term cannot exceed 200 characters'
      }),
    status: Joi.string()
      .valid('pending', 'processing', 'completed', 'failed')
      .optional()
      .messages({
        'any.only': 'Status must be one of: pending, processing, completed, failed'
      }),
    tags: Joi.array()
      .items(Joi.string().max(50))
      .max(10)
      .optional()
      .messages({
        'array.max': 'Cannot filter by more than 10 tags'
      }),
    sortBy: Joi.string()
      .valid('created_at', 'updated_at', 'title', 'status')
      .default('created_at')
      .optional()
      .messages({
        'any.only': 'Sort by must be one of: created_at, updated_at, title, status'
      }),
    sortOrder: Joi.string()
      .valid('asc', 'desc')
      .default('desc')
      .optional()
      .messages({
        'any.only': 'Sort order must be either asc or desc'
      })
  }),

  /**
   * User preferences validation
   */
  userPreferences: Joi.object({
    embeddingProvider: Joi.string()
      .valid('ollama', 'openai')
      .optional()
      .messages({
        'any.only': 'Embedding provider must be either ollama or openai'
      }),
    llmProvider: Joi.string()
      .valid('ollama', 'openai')
      .optional()
      .messages({
        'any.only': 'LLM provider must be either ollama or openai'
      }),
    defaultResponseStyle: Joi.string()
      .valid('concise', 'detailed', 'academic', 'casual')
      .optional()
      .messages({
        'any.only': 'Default response style must be one of: concise, detailed, academic, casual'
      }),
    maxResultsPerQuery: Joi.number()
      .integer()
      .min(1)
      .max(20)
      .optional()
      .messages({
        'number.base': 'Max results per query must be a number',
        'number.integer': 'Max results per query must be an integer',
        'number.min': 'Max results per query must be at least 1',
        'number.max': 'Max results per query cannot exceed 20'
      }),
    language: Joi.string()
      .length(2)
      .optional()
      .messages({
        'string.length': 'Language must be a 2-character code (e.g., en, es, fr)'
      })
  }),

  /**
   * System configuration validation
   */
  systemConfig: Joi.object({
    maxFileSize: Joi.number()
      .integer()
      .min(1)
      .max(500)
      .optional()
      .messages({
        'number.base': 'Max file size must be a number',
        'number.integer': 'Max file size must be an integer',
        'number.min': 'Max file size must be at least 1MB',
        'number.max': 'Max file size cannot exceed 500MB'
      }),
    chunkSize: Joi.number()
      .integer()
      .min(100)
      .max(2000)
      .optional()
      .messages({
        'number.base': 'Chunk size must be a number',
        'number.integer': 'Chunk size must be an integer',
        'number.min': 'Chunk size must be at least 100 tokens',
        'number.max': 'Chunk size cannot exceed 2000 tokens'
      }),
    chunkOverlap: Joi.number()
      .integer()
      .min(0)
      .max(500)
      .optional()
      .messages({
        'number.base': 'Chunk overlap must be a number',
        'number.integer': 'Chunk overlap must be an integer',
        'number.min': 'Chunk overlap cannot be negative',
        'number.max': 'Chunk overlap cannot exceed 500 tokens'
      })
  })
};

/**
 * Custom validation functions
 */
export const customValidations = {
  /**
   * Validate file upload middleware
   */
  validateFileUpload: (req: Request, res: Response, next: NextFunction) => {
    if (!req.file) {
      throw new ValidationError('No file uploaded');
    }

    const file = req.file;
    const maxSizeBytes = parseInt(process.env.MAX_FILE_SIZE_MB || '100') * 1024 * 1024;
    const allowedTypes = ['application/pdf'];

    // Check file type
    if (!allowedTypes.includes(file.mimetype)) {
      throw new ValidationError(
        'Invalid file type. Only PDF files are allowed.',
        { 
          allowedTypes, 
          receivedType: file.mimetype,
          fileName: file.originalname 
        }
      );
    }

    // Check file size
    if (file.size > maxSizeBytes) {
      throw new ValidationError(
        `File size exceeds maximum limit of ${maxSizeBytes / 1024 / 1024}MB`,
        { 
          maxSizeBytes, 
          fileSize: file.size,
          fileName: file.originalname 
        }
      );
    }

    next();
  },

  /**
   * Validate request rate limiting
   */
  validateRateLimit: (maxRequests: number, windowMs: number) => {
    const requestCounts = new Map<string, { count: number; resetTime: number }>();

    return (req: Request, res: Response, next: NextFunction) => {
      const clientId = req.ip || 'unknown';
      const now = Date.now();
      
      const clientData = requestCounts.get(clientId);
      
      if (!clientData || now > clientData.resetTime) {
        // Reset window
        requestCounts.set(clientId, {
          count: 1,
          resetTime: now + windowMs
        });
        next();
        return;
      }

      if (clientData.count >= maxRequests) {
        throw new ValidationError(
          'Rate limit exceeded. Please try again later.',
          {
            maxRequests,
            windowMs,
            retryAfter: Math.ceil((clientData.resetTime - now) / 1000)
          }
        );
      }

      // Increment count
      clientData.count++;
      next();
    };
  }
};

/**
 * Validation middleware factory for common patterns
 */
export const validators = {
  // Parameter validators
  userId: validate(schemas.userId, 'params'),
  documentId: validate(schemas.documentId, 'params'),
  
  // Body validators
  documentUpload: validate(schemas.documentUpload, 'body'),
  ragQuery: validate(schemas.ragQuery, 'body'),
  userPreferences: validate(schemas.userPreferences, 'body'),
  systemConfig: validate(schemas.systemConfig, 'body'),
  
  // Query validators
  pagination: validate(schemas.pagination, 'query', { stripUnknown: false }),
  documentSearch: validate(schemas.documentSearch, 'query'),
  
  // File validators
  fileUpload: customValidations.validateFileUpload,
  
  // Rate limiting
  queryRateLimit: customValidations.validateRateLimit(10, 60000), // 10 requests per minute
  uploadRateLimit: customValidations.validateRateLimit(5, 300000) // 5 uploads per 5 minutes
};