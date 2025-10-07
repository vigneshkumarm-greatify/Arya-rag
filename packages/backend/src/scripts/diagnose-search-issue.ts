/**
 * Diagnose Search Issue
 * 
 * Checks database state and search functionality
 * 
 * Usage: tsx src/scripts/diagnose-search-issue.ts
 */

import { DatabaseClient } from '../config/database';
import dotenv from 'dotenv';

dotenv.config();

async function diagnoseSearchIssue() {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔍 Diagnosing Search Issue`);
  console.log(`${'='.repeat(80)}\n`);

  try {
    const dbClient = DatabaseClient.getInstance();
    const db = dbClient.getClient();

    // Check 1: Count total chunks
    console.log(`📊 Check 1: Counting chunks in database...`);
    const { data: countData, error: countError } = await (db as any)
      .from('document_chunks')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      console.error(`❌ Error counting chunks:`, countError);
    } else {
      console.log(`✅ Total chunks in database: ${countData || 0}`);
    }

    // Check 2: Check recent chunks
    console.log(`\n📊 Check 2: Fetching recent chunks...`);
    const { data: recentChunks, error: recentError } = await (db as any)
      .from('document_chunks')
      .select('chunk_id, document_id, user_id, page_number, chunk_layer, chunk_text')
      .order('created_at', { ascending: false })
      .limit(5);

    if (recentError) {
      console.error(`❌ Error fetching chunks:`, recentError);
    } else {
      console.log(`✅ Recent chunks:`);
      recentChunks?.forEach((chunk: any, idx: number) => {
        console.log(`   ${idx + 1}. Chunk: ${chunk.chunk_id}`);
        console.log(`      Document: ${chunk.document_id}`);
        console.log(`      User: ${chunk.user_id}`);
        console.log(`      Page: ${chunk.page_number}`);
        console.log(`      Layer: ${chunk.chunk_layer || 'N/A'}`);
        console.log(`      Text: ${chunk.chunk_text?.substring(0, 100)}...`);
        console.log(``);
      });
    }

    // Check 3: Search for LSO manually
    console.log(`\n📊 Check 3: Searching for LSO in chunks...`);
    const { data: lsoChunks, error: lsoError } = await (db as any)
      .from('document_chunks')
      .select('chunk_id, document_id, page_number, chunk_text')
      .ilike('chunk_text', '%LSO%')
      .limit(3);

    if (lsoError) {
      console.error(`❌ Error searching for LSO:`, lsoError);
    } else {
      console.log(`✅ Found ${lsoChunks?.length || 0} chunks mentioning LSO`);
      lsoChunks?.forEach((chunk: any, idx: number) => {
        console.log(`   ${idx + 1}. Document: ${chunk.document_id}, Page: ${chunk.page_number}`);
        console.log(`      Text: ${chunk.chunk_text?.substring(0, 150)}...`);
      });
    }

    // Check 4: Check if chunks have embeddings
    console.log(`\n📊 Check 4: Checking embeddings...`);
    const { data: embeddingCheck, error: embeddingError } = await (db as any)
      .from('document_chunks')
      .select('chunk_id, embedding')
      .not('embedding', 'is', null)
      .limit(3);

    if (embeddingError) {
      console.error(`❌ Error checking embeddings:`, embeddingError);
    } else {
      console.log(`✅ Chunks with embeddings found: ${embeddingCheck?.length || 0}`);
      embeddingCheck?.forEach((chunk: any) => {
        const embeddingSize = chunk.embedding ? (Array.isArray(chunk.embedding) ? chunk.embedding.length : 'unknown') : 0;
        console.log(`   Chunk: ${chunk.chunk_id}, Embedding size: ${embeddingSize}`);
      });
    }

    // Check 5: Check user documents
    console.log(`\n📊 Check 5: Checking user documents...`);
    const { data: docs, error: docsError } = await (db as any)
      .from('user_documents')
      .select('document_id, user_id, filename, status')
      .eq('user_id', 'test')
      .order('created_at', { ascending: false })
      .limit(3);

    if (docsError) {
      console.error(`❌ Error checking documents:`, docsError);
    } else {
      console.log(`✅ Recent documents for user 'test':`);
      docs?.forEach((doc: any, idx: number) => {
        console.log(`   ${idx + 1}. ${doc.filename} (${doc.status})`);
        console.log(`      ID: ${doc.document_id}`);
      });
    }

    // Check 6: Check database schema for new columns
    console.log(`\n📊 Check 6: Checking if migration was run...`);
    const { data: schemaCheck, error: schemaError } = await (db as any)
      .rpc('exec_sql', {
        sql_query: `
          SELECT column_name, data_type 
          FROM information_schema.columns 
          WHERE table_name = 'document_chunks' 
          AND column_name IN ('chunk_layer', 'parent_chunk_id', 'extracted_facts')
        `
      });

    if (schemaError) {
      console.log(`⚠️  Cannot check schema (migration might not be needed):`, schemaError.message);
    } else {
      console.log(`✅ Migration columns:`, schemaCheck);
      if (!schemaCheck || schemaCheck.length === 0) {
        console.log(`⚠️  WARNING: Migration columns not found! Run migration 003 first!`);
      }
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`✅ Diagnosis Complete`);
    console.log(`${'='.repeat(80)}\n`);

  } catch (error) {
    console.error(`❌ Diagnosis failed:`, error);
  }
}

// Run diagnosis
diagnoseSearchIssue().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

