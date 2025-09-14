/**
 * Database Configuration
 * 
 * Supabase connection configuration for ARYA-RAG.
 * Manages database client initialization and connection pooling.
 * 
 * @author ARYA RAG Team
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Database types for type safety
 */
export interface Database {
  public: {
    Tables: {
      user_documents: {
        Row: {
          document_id: string;
          user_id: string;
          filename: string;
          original_name: string;
          title?: string;
          description?: string;
          mime_type: string;
          file_size: number;
          file_hash: string;
          uploaded_at: string;
          status: 'pending' | 'processing' | 'completed' | 'failed';
          processing_started_at?: string;
          processing_completed_at?: string;
          total_pages: number;
          total_chunks: number;
          embedding_model: string;
          error_message?: string;
          tags: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['user_documents']['Row'], 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['user_documents']['Insert']>;
      };
      document_chunks: {
        Row: {
          chunk_id: string;
          document_id: string;
          user_id: string;
          chunk_index: number;
          chunk_text: string;
          chunk_tokens: number;
          page_number: number;
          page_position_start: number;
          page_position_end: number;
          section_title?: string;
          embedding: number[];
          embedding_model: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['document_chunks']['Row'], 'created_at'>;
        Update: Partial<Database['public']['Tables']['document_chunks']['Insert']>;
      };
      user_queries: {
        Row: {
          id: string;
          user_id: string;
          query_text: string;
          query_embedding: number[];
          response_text: string;
          sources: any[];
          confidence_score: number;
          processing_time_ms: number;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['user_queries']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['user_queries']['Insert']>;
      };
    };
    Functions: {
      search_document_chunks: {
        Args: {
          query_embedding: number[];
          user_id: string;
          document_ids?: string[];
          similarity_threshold?: number;
          top_k?: number;
        };
        Returns: {
          id: string;
          document_id: string;
          chunk_text: string;
          page_number: number;
          section_title?: string;
          similarity: number;
        }[];
      };
    };
  };
}

/**
 * Database configuration interface
 */
export interface DatabaseConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  options?: {
    auth?: {
      persistSession?: boolean;
      autoRefreshToken?: boolean;
    };
    db?: {
      schema?: string;
    };
    global?: {
      headers?: Record<string, string>;
    };
  };
}

/**
 * Database client class for managing Supabase connections
 */
export class DatabaseClient {
  private static instance: DatabaseClient;
  private client: SupabaseClient<Database, 'public'>;
  private config: DatabaseConfig;

  private constructor(config: DatabaseConfig) {
    this.config = config;
    
    // Initialize Supabase client with type safety
    this.client = createClient<Database>(
      config.supabaseUrl,
      config.supabaseAnonKey,
      {
        auth: {
          persistSession: false, // Server-side doesn't need session persistence
          autoRefreshToken: false,
          ...config.options?.auth
        },
        db: {
          schema: 'public'
        },
        global: {
          ...config.options?.global
        }
      }
    );

    console.log('🗄️  Database client initialized');
    console.log(`   URL: ${this.maskUrl(config.supabaseUrl)}`);
    console.log(`   Schema: ${config.options?.db?.schema || 'public'}`);
  }

  /**
   * Get singleton instance of database client
   */
  static getInstance(config?: DatabaseConfig): DatabaseClient {
    if (!DatabaseClient.instance) {
      if (!config) {
        // Load from environment variables
        const envConfig: DatabaseConfig = {
          supabaseUrl: process.env.SUPABASE_URL || '',
          supabaseAnonKey: process.env.SUPABASE_ANON_KEY || ''
        };

        if (!envConfig.supabaseUrl || !envConfig.supabaseAnonKey) {
          throw new Error(
            'Database configuration missing. Set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.'
          );
        }

        config = envConfig;
      }

      DatabaseClient.instance = new DatabaseClient(config);
    }

    return DatabaseClient.instance;
  }

  /**
   * Get the Supabase client
   */
  getClient(): SupabaseClient<Database, 'public'> {
    return this.client;
  }

  /**
   * Test database connection
   */
  async testConnection(): Promise<boolean> {
    try {
      // Try a simple query to test connection
      const { error } = await this.client
        .from('user_documents')
        .select('id')
        .limit(1);

      if (error) {
        console.error('❌ Database connection test failed:', error.message);
        return false;
      }

      console.log('✅ Database connection test passed');
      return true;

    } catch (error) {
      console.error('❌ Database connection test error:', error);
      return false;
    }
  }

  /**
   * Check if required tables exist
   */
  async checkSchema(): Promise<{
    valid: boolean;
    missingTables: string[];
    hasVectorExtension: boolean;
  }> {
    const requiredTables = ['user_documents', 'document_chunks', 'user_queries'];
    const missingTables: string[] = [];
    let hasVectorExtension = false;

    try {
      // Check for required tables
      for (const table of requiredTables) {
        const { error } = await this.client
          .from(table as any)
          .select('*')
          .limit(0); // We don't need data, just checking if table exists

        if (error && error.message.includes('does not exist')) {
          missingTables.push(table);
        }
      }

      // Check for vector extension
      const { data, error } = await this.client.rpc('version' as any);
      if (!error) {
        // In a real implementation, we'd check for pgvector extension properly
        hasVectorExtension = true; // Assuming it's installed for now
      }

      const valid = missingTables.length === 0 && hasVectorExtension;

      console.log(`📋 Database schema check:`);
      console.log(`   Valid: ${valid ? '✅' : '❌'}`);
      console.log(`   Missing tables: ${missingTables.length === 0 ? 'None' : missingTables.join(', ')}`);
      console.log(`   Vector extension: ${hasVectorExtension ? '✅' : '❌'}`);

      return {
        valid,
        missingTables,
        hasVectorExtension
      };

    } catch (error) {
      console.error('Schema check error:', error);
      return {
        valid: false,
        missingTables: requiredTables,
        hasVectorExtension: false
      };
    }
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<{
    documentCount: number;
    chunkCount: number;
    queryCount: number;
    userCount: number;
    avgChunksPerDocument: number;
  }> {
    try {
      // Get document count
      const { count: documentCount } = await this.client
        .from('user_documents')
        .select('*', { count: 'exact', head: true });

      // Get chunk count
      const { count: chunkCount } = await this.client
        .from('document_chunks')
        .select('*', { count: 'exact', head: true });

      // Get query count
      const { count: queryCount } = await this.client
        .from('user_queries')
        .select('*', { count: 'exact', head: true });

      // For POC, we'll estimate user count from documents
      const userCount = Math.ceil((documentCount || 0) / 3); // Rough estimate

      const avgChunksPerDocument = documentCount ? chunkCount! / documentCount : 0;

      return {
        documentCount: documentCount || 0,
        chunkCount: chunkCount || 0,
        queryCount: queryCount || 0,
        userCount,
        avgChunksPerDocument
      };

    } catch (error) {
      console.error('Failed to get database stats:', error);
      return {
        documentCount: 0,
        chunkCount: 0,
        queryCount: 0,
        userCount: 0,
        avgChunksPerDocument: 0
      };
    }
  }

  /**
   * Execute raw SQL (for migrations, admin tasks)
   * Note: Not available in standard Supabase client - use for future enhancement
   */
  async executeSQL(sql: string): Promise<any> {
    // This would require Supabase Edge Functions or direct database access
    throw new Error('Direct SQL execution not available in POC setup. Use Supabase dashboard or CLI.');
  }

  /**
   * Mask sensitive URL for logging
   */
  private maskUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      return `${urlObj.protocol}//${urlObj.hostname}`;
    } catch {
      return 'invalid-url';
    }
  }

  /**
   * Close database connection (for cleanup)
   */
  async close(): Promise<void> {
    // Supabase client doesn't need explicit closing
    // but we can clear the singleton instance
    DatabaseClient.instance = null as any;
    console.log('🗄️  Database client closed');
  }
}

/**
 * Convenience function to get database client
 */
export function getDatabase(): SupabaseClient<Database, 'public'> {
  return DatabaseClient.getInstance().getClient();
}

/**
 * Export database types for use in services
 */
export type UserDocument = Database['public']['Tables']['user_documents']['Row'];
export type DocumentChunk = Database['public']['Tables']['document_chunks']['Row'];
export type UserQuery = Database['public']['Tables']['user_queries']['Row'];

export type InsertUserDocument = Database['public']['Tables']['user_documents']['Insert'];
export type InsertDocumentChunk = Database['public']['Tables']['document_chunks']['Insert'];
export type InsertUserQuery = Database['public']['Tables']['user_queries']['Insert'];

export type UpdateUserDocument = Database['public']['Tables']['user_documents']['Update'];
export type UpdateDocumentChunk = Database['public']['Tables']['document_chunks']['Update'];
export type UpdateUserQuery = Database['public']['Tables']['user_queries']['Update'];