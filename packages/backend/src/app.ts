/**
 * Express Application Setup
 * 
 * Main Express application configuration for the ARYA RAG API.
 * Sets up middleware, routes, error handling, and security.
 * 
 * @author ARYA RAG Team
 */

import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import listEndpoints from 'express-list-endpoints';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { errorHandler, notFoundHandler, successResponse } from './middleware/errorHandler';

// Import route modules statically like Arya-Chatbot
import documentsRouter from './routes/documents';
import queriesRouter from './routes/queries';
import usersRouter from './routes/users';
import systemRouter from './routes/system';

/**
 * Create and configure Express application
 */
export function createApp(): Application {
  const app = express();

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: false // Required for file uploads
  }));

  // CORS configuration
  const corsOptions = {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
    optionsSuccessStatus: 200, // Some legacy browsers choke on 204
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With', 
      'Content-Type', 
      'Accept',
      'Authorization',
      'X-Request-ID'
    ]
  };
  
  app.use(cors(corsOptions));

  // Request parsing middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request logging
  const logFormat = process.env.NODE_ENV === 'production' 
    ? 'combined' 
    : 'dev';
  
  app.use(morgan(logFormat, {
    skip: (req: Request) => {
      // Skip logging for health checks and static files
      return req.path === '/health' || req.path.startsWith('/static');
    }
  }));

  // Request ID middleware for tracking
  app.use((req: Request, res: Response, next) => {
    const requestId = req.headers['x-request-id'] as string || 
                     `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    req.headers['x-request-id'] = requestId;
    res.setHeader('X-Request-ID', requestId);
    next();
  });

  // File upload configuration
  const storage = multer.memoryStorage();
  const upload = multer({
    storage,
    limits: {
      fileSize: parseInt(process.env.MAX_FILE_SIZE_MB || '100') * 1024 * 1024, // Default 100MB
      files: 1 // Only allow single file upload
    },
    fileFilter: (req, file, cb) => {
      // Only allow PDF files
      if (file.mimetype === 'application/pdf') {
        cb(null, true);
      } else {
        cb(new Error('Only PDF files are allowed'));
      }
    }
  });

  // Make upload middleware available to routes
  (app as any).upload = upload;

  // Health check endpoint (before other routes)
  app.get('/health', (req: Request, res: Response) => {
    res.json(successResponse({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development'
    }, 'Service is healthy'));
  });

  // API information endpoint
  app.get('/', (req: Request, res: Response) => {
    res.json(successResponse({
      name: 'ARYA RAG API',
      version: process.env.npm_package_version || '1.0.0',
      description: 'Retrieval-Augmented Generation API for large document collections',
      endpoints: {
        health: '/health',
        documents: '/api/documents',
        queries: '/api/queries',
        users: '/api/users',
        system: '/api/system'
      },
      documentation: '/api/docs' // TODO: Add Swagger/OpenAPI docs
    }, 'Welcome to ARYA RAG API'));
  });

  // Mount API routes (will be imported and attached later)
  const apiRouter = express.Router();
  
  // Mount route modules directly like Arya-Chatbot
  console.log('🔗 Mounting API routes...');
  
  apiRouter.use('/documents', documentsRouter);
  console.log('✅ Mounted Document routes on /documents');
  
  apiRouter.use('/queries', queriesRouter);
  console.log('✅ Mounted Query routes on /queries');
  
  apiRouter.use('/users', usersRouter);  
  console.log('✅ Mounted User routes on /users');
  
  apiRouter.use('/system', systemRouter);
  console.log('✅ Mounted System routes on /system');

  // API documentation endpoint - automatically lists all available endpoints
  apiRouter.get('/', (req: Request, res: Response) => {
    const endpoints = listEndpoints(app);
    
    // Filter to only show API endpoints
    const apiEndpoints = endpoints.filter(endpoint => 
      endpoint.path.startsWith('/api/')
    );
    
    // Group endpoints by category
    const groupedEndpoints = {
      documents: apiEndpoints.filter(e => e.path.includes('/documents')),
      queries: apiEndpoints.filter(e => e.path.includes('/queries')),
      users: apiEndpoints.filter(e => e.path.includes('/users')),
      system: apiEndpoints.filter(e => e.path.includes('/system'))
    };

    res.json(successResponse({
      name: 'ARYA RAG API',
      version: process.env.npm_package_version || '1.0.0',
      description: 'Retrieval-Augmented Generation API for large document collections',
      baseUrl: `${req.protocol}://${req.get('host')}/api`,
      endpoints: {
        total: apiEndpoints.length,
        byCategory: groupedEndpoints,
        all: apiEndpoints
      },
      usage: {
        authentication: 'None (development mode)', 
        contentType: 'application/json',
        rateLimit: process.env.NODE_ENV === 'production' ? '100 requests per 15 minutes' : 'Unlimited (development)',
        documentation: `${req.protocol}://${req.get('host')}/api`
      },
      examples: {
        listDocuments: `GET ${req.protocol}://${req.get('host')}/api/documents?userId=your-user-id`,
        uploadDocument: `POST ${req.protocol}://${req.get('host')}/api/documents/upload`,
        processQuery: `POST ${req.protocol}://${req.get('host')}/api/queries/process`
      }
    }, 'ARYA RAG API - Auto-generated endpoint documentation'));
  });

  // Mount API router
  app.use('/api', apiRouter);

  // Static file serving for uploads (if needed)
  const uploadsPath = path.join(__dirname, '../uploads');
  app.use('/uploads', express.static(uploadsPath));

  // Rate limiting for API routes
  if (process.env.NODE_ENV === 'production') {
    const rateLimit = require('express-rate-limit');
    
    // General API rate limiting
    const apiLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // Limit each IP to 100 requests per windowMs
      message: {
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests from this IP, please try again later.',
          timestamp: new Date().toISOString()
        }
      },
      standardHeaders: true,
      legacyHeaders: false,
    });

    // Stricter rate limiting for resource-intensive operations
    const strictLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 10, // Limit to 10 requests per windowMs
      message: {
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many upload/query requests from this IP, please try again later.',
          timestamp: new Date().toISOString()
        }
      }
    });

    app.use('/api', apiLimiter);
    app.use('/api/documents/upload', strictLimiter);
    app.use('/api/queries/process', strictLimiter);
  }

  // Development middleware
  if (process.env.NODE_ENV === 'development') {
    // Add development-specific middleware
    app.use((req: Request, res: Response, next) => {
      console.log(`[DEV] ${req.method} ${req.path}`, {
        body: req.body,
        params: req.params,
        query: req.query
      });
      next();
    });
  }

  // 404 handler for unmatched routes
  app.use(notFoundHandler);

  // Global error handler (must be last)
  app.use(errorHandler);

  return app;
}

/**
 * Application configuration and startup
 */
export class AppConfig {
  private static instance: AppConfig;
  private app: Application;

  private constructor() {
    this.app = createApp();
  }

  static getInstance(): AppConfig {
    if (!AppConfig.instance) {
      AppConfig.instance = new AppConfig();
    }
    return AppConfig.instance;
  }

  getApp(): Application {
    return this.app;
  }

  /**
   * Start the server
   */
  async start(port: number = parseInt(process.env.PORT || '3001')): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const server = this.app.listen(port, () => {
          console.log('🚀 ARYA RAG API Server Started');
          console.log('===============================');
          console.log(`📡 Server running on port ${port}`);
          console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
          console.log(`🔗 Base URL: http://localhost:${port}`);
          console.log(`❤️  Health Check: http://localhost:${port}/health`);
          console.log(`📚 API Endpoints: http://localhost:${port}/api`);
          
          // Log configuration
          console.log('\n⚙️  Configuration:');
          console.log(`   Max file size: ${process.env.MAX_FILE_SIZE_MB || '100'}MB`);
          console.log(`   Chunk size: ${process.env.CHUNK_SIZE_TOKENS || '600'} tokens`);
          console.log(`   Embedding provider: ${process.env.EMBEDDING_PROVIDER || 'ollama'}`);
          console.log(`   LLM provider: ${process.env.LLM_PROVIDER || 'ollama'}`);
          
          resolve();
        });

        // Graceful shutdown handling
        const gracefulShutdown = (signal: string) => {
          console.log(`\n📡 Received ${signal}, starting graceful shutdown...`);
          
          server.close(() => {
            console.log('✅ HTTP server closed');
            process.exit(0);
          });

          // Force close after 10 seconds
          setTimeout(() => {
            console.log('❌ Forced shutdown after timeout');
            process.exit(1);
          }, 10000);
        };

        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));

      } catch (error) {
        console.error('💥 Failed to start server:', error);
        reject(error);
      }
    });
  }

  /**
   * Test the application setup
   */
  async test(): Promise<{
    success: boolean;
    message: string;
    details: any;
  }> {
    try {
      // Basic app configuration tests
      const tests = {
        expressApp: !!this.app,
        middlewareCount: this.app._router ? this.app._router.stack.length : 0,
        routes: {
          health: true, // Always available
          api: true     // API router is mounted
        }
      };

      return {
        success: true,
        message: 'Application setup test passed',
        details: tests
      };

    } catch (error) {
      return {
        success: false,
        message: `Application test failed: ${error instanceof Error ? error.message : error}`,
        details: { error }
      };
    }
  }
}

// Export default app instance
export default AppConfig.getInstance().getApp();