/**
 * Direct PostgreSQL Connection
 * 
 * Bypasses Supabase's PostgREST layer to avoid schema cache issues.
 * Uses native PostgreSQL driver for direct database access.
 */

import { Pool } from 'pg';

let pool: Pool | null = null;

export function getPostgresPool(): Pool {
  if (pool) {
    return pool;
  }

  const supabaseUrl = process.env.SUPABASE_URL!;
  
  // Extract project ref from Supabase URL
  // Format: https://PROJECT_REF.supabase.co
  const projectRef = supabaseUrl.replace('https://', '').split('.')[0];
  
  // Construct direct PostgreSQL connection string
  // Format: postgresql://postgres:[YOUR-PASSWORD]@db.PROJECT_REF.supabase.co:5432/postgres
  const connectionString = `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD}@db.${projectRef}.supabase.co:5432/postgres`;

  pool = new Pool({
    connectionString,
    ssl: {
      rejectUnauthorized: false
    },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  console.log('🔌 Initialized Direct PostgreSQL Connection Pool');
  console.log(`   Project: ${projectRef}`);

  return pool;
}

export async function closePostgresPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('✅ Closed PostgreSQL connection pool');
  }
}


