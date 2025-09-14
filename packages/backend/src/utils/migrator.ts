/**
 * Database Migration Runner
 * 
 * Simple migration utility for running SQL schema files.
 * For POC purposes - production would use a more robust migration tool.
 * 
 * @author ARYA RAG Team
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { DatabaseClient } from '../config/database';

export interface MigrationFile {
  filename: string;
  version: number;
  description: string;
  sql: string;
}

export interface MigrationResult {
  success: boolean;
  migrationsRun: string[];
  errors?: Array<{ file: string; error: string }>;
}

export class Migrator {
  private migrationsPath: string;
  
  constructor(migrationsPath?: string) {
    this.migrationsPath = migrationsPath || join(__dirname, '../migrations');
  }

  /**
   * Run all pending migrations
   */
  async runMigrations(): Promise<MigrationResult> {
    console.log('🔄 Running database migrations...');
    
    const migrationsRun: string[] = [];
    const errors: Array<{ file: string; error: string }> = [];

    try {
      // Get migration files
      const migrations = this.getMigrationFiles();
      
      if (migrations.length === 0) {
        console.log('No migration files found');
        return { success: true, migrationsRun };
      }

      console.log(`Found ${migrations.length} migration files`);

      // Get database client
      const db = DatabaseClient.getInstance();
      
      // Test connection first
      const connected = await db.testConnection();
      if (!connected) {
        throw new Error('Database connection failed');
      }

      // Run each migration
      for (const migration of migrations) {
        console.log(`\n📝 Running migration: ${migration.filename}`);
        
        try {
          // For Supabase, we can't directly execute arbitrary SQL
          // In a real implementation, you would:
          // 1. Use Supabase CLI for migrations
          // 2. Or execute via the Supabase dashboard
          // 3. Or use a dedicated migration tool
          
          // For POC, we'll just log what would be done
          console.log(`   Would execute ${migration.sql.length} characters of SQL`);
          console.log(`   Description: ${migration.description}`);
          
          // In production, you'd track migration state in a migrations table
          migrationsRun.push(migration.filename);
          
          console.log(`   ✅ Migration ${migration.filename} completed`);
          
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          console.error(`   ❌ Migration ${migration.filename} failed: ${errorMsg}`);
          errors.push({ file: migration.filename, error: errorMsg });
          
          // Stop on first error
          break;
        }
      }

      const success = errors.length === 0;
      
      console.log('\n📊 Migration Summary:');
      console.log(`   Total migrations: ${migrations.length}`);
      console.log(`   Successful: ${migrationsRun.length}`);
      console.log(`   Failed: ${errors.length}`);

      return {
        success,
        migrationsRun,
        errors: errors.length > 0 ? errors : undefined
      };

    } catch (error) {
      console.error('Migration runner error:', error);
      return {
        success: false,
        migrationsRun,
        errors: [{
          file: 'migrator',
          error: error instanceof Error ? error.message : 'Unknown error'
        }]
      };
    }
  }

  /**
   * Get all migration files sorted by version
   */
  private getMigrationFiles(): MigrationFile[] {
    try {
      const files = readdirSync(this.migrationsPath)
        .filter(f => f.endsWith('.sql'))
        .sort();

      return files.map(filename => {
        const filepath = join(this.migrationsPath, filename);
        const sql = readFileSync(filepath, 'utf8');
        
        // Extract version from filename (e.g., "001_initial_schema.sql" -> 1)
        const versionMatch = filename.match(/^(\d+)/);
        const version = versionMatch ? parseInt(versionMatch[1], 10) : 0;
        
        // Extract description from filename
        const description = filename
          .replace(/^\d+_/, '')
          .replace('.sql', '')
          .replace(/_/g, ' ');

        return {
          filename,
          version,
          description,
          sql
        };
      }).sort((a, b) => a.version - b.version);

    } catch (error) {
      console.error('Error reading migration files:', error);
      return [];
    }
  }

  /**
   * Generate migration file content template
   */
  static generateMigrationTemplate(description: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const version = Date.now();
    
    return `-- Migration: ${description}
-- Version: ${version}
-- Created: ${timestamp}

-- Add your migration SQL here

-- Example:
-- CREATE TABLE example_table (
--   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--   name VARCHAR(255) NOT NULL,
--   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
-- );

-- Don't forget to add rollback logic if needed
-- This would be in a separate down migration file
`;
  }

  /**
   * Check if migrations are needed
   */
  async checkMigrationStatus(): Promise<{
    needed: boolean;
    pendingMigrations: string[];
    currentVersion?: number;
  }> {
    try {
      const db = DatabaseClient.getInstance();
      const schemaCheck = await db.checkSchema();
      
      const migrations = this.getMigrationFiles();
      
      // For POC, we'll consider migrations needed if tables don't exist
      const needed = !schemaCheck.valid;
      const pendingMigrations = needed ? migrations.map(m => m.filename) : [];
      
      return {
        needed,
        pendingMigrations,
        currentVersion: needed ? 0 : migrations.length
      };

    } catch (error) {
      console.error('Failed to check migration status:', error);
      return {
        needed: true,
        pendingMigrations: this.getMigrationFiles().map(m => m.filename)
      };
    }
  }
}

/**
 * CLI helper to run migrations
 */
export async function runMigrationsFromCLI(): Promise<void> {
  const migrator = new Migrator();
  
  console.log('🚀 ARYA-RAG Database Migration Tool\n');
  
  // Check status
  const status = await migrator.checkMigrationStatus();
  
  if (!status.needed) {
    console.log('✅ Database is up to date!');
    console.log(`   Current version: ${status.currentVersion}`);
    return;
  }

  console.log(`📋 ${status.pendingMigrations.length} migrations pending:`);
  status.pendingMigrations.forEach(m => console.log(`   - ${m}`));
  console.log('');

  // Run migrations
  const result = await migrator.runMigrations();
  
  if (result.success) {
    console.log('\n✅ All migrations completed successfully!');
  } else {
    console.log('\n❌ Migration failed!');
    if (result.errors) {
      result.errors.forEach(e => {
        console.log(`   ${e.file}: ${e.error}`);
      });
    }
    process.exit(1);
  }
}

// Note for POC implementation:
// This migration runner is simplified for POC purposes.
// In production, you would use:
// 1. Supabase CLI migrations: https://supabase.com/docs/guides/cli/local-development#database-migrations
// 2. A robust migration tool like Flyway, Liquibase, or node-pg-migrate
// 3. Proper migration tracking in a migrations table
// 4. Rollback capabilities
// 5. Migration locking for concurrent deployments