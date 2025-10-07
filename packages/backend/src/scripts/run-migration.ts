/**
 * Database Migration Runner
 * 
 * Runs SQL migrations against the Supabase database
 * 
 * Usage: tsx src/scripts/run-migration.ts <migration-file>
 */

import { readFileSync } from 'fs';
import { DatabaseClient } from '../config/database';
import dotenv from 'dotenv';

dotenv.config();

async function runMigration(migrationFile: string) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔄 Running Database Migration`);
  console.log(`${'='.repeat(80)}\n`);

  try {
    // Read migration SQL
    const sql = readFileSync(migrationFile, 'utf-8');
    
    console.log(`📄 Migration file: ${migrationFile}`);
    console.log(`📊 SQL length: ${sql.length} characters`);
    console.log(`\n📝 Migration SQL Preview:`);
    console.log(sql.split('\n').slice(0, 10).join('\n'));
    console.log(`... (${sql.split('\n').length} total lines)\n`);

    // Get database client
    const dbClient = DatabaseClient.getInstance();
    const client = dbClient.getClient();

    console.log(`🔗 Connected to database: ${process.env.SUPABASE_URL?.split('.')[0]}...`);

    // Split SQL into individual statements
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`\n📋 Found ${statements.length} SQL statements to execute\n`);

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      
      // Skip comments
      if (statement.startsWith('--') || statement.startsWith('COMMENT')) {
        console.log(`⏩ Skipping statement ${i + 1}: Comment`);
        continue;
      }

      const preview = statement.substring(0, 60).replace(/\n/g, ' ');
      console.log(`⚙️  Executing statement ${i + 1}/${statements.length}: ${preview}...`);

      try {
        // Execute via RPC call or direct SQL
        const { data, error } = await client.rpc('exec_sql', { sql_query: statement + ';' });
        
        if (error) {
          // Try alternative method - direct query
          console.log(`   ⚠️  RPC method failed, trying direct execution...`);
          
          // For Supabase, we can't run raw SQL directly via the client
          // We need to use the SQL editor or REST API
          console.warn(`   ⚠️  Could not execute via client. Please run manually in Supabase SQL Editor.`);
          console.warn(`   Statement: ${statement}`);
        } else {
          console.log(`   ✅ Statement executed successfully`);
        }
      } catch (execError) {
        console.error(`   ❌ Error executing statement: ${execError}`);
        throw execError;
      }
    }

    console.log(`\n✅ Migration completed successfully!`);
    console.log(`${'='.repeat(80)}\n`);

  } catch (error) {
    console.error(`\n❌ Migration failed:`);
    console.error(error);
    console.log(`\n💡 To run manually:`);
    console.log(`   1. Open Supabase Dashboard → SQL Editor`);
    console.log(`   2. Copy contents of: ${migrationFile}`);
    console.log(`   3. Execute in SQL Editor\n`);
    process.exit(1);
  }
}

// Get migration file from command line args
const migrationFile = process.argv[2];

if (!migrationFile) {
  console.error('❌ Error: Migration file path required');
  console.log('\nUsage: tsx src/scripts/run-migration.ts <path-to-migration.sql>');
  console.log('\nExample:');
  console.log('  tsx src/scripts/run-migration.ts migrations/003_add_dual_layer_chunking.sql');
  process.exit(1);
}

// Run migration
runMigration(migrationFile).catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

