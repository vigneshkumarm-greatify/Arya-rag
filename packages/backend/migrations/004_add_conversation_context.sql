-- Migration 004: Add Conversation Context Support
-- Adds tables for conversation history and context tracking
--
-- This migration enables:
-- 1. Multi-turn conversation tracking
-- 2. Reference resolution across messages
-- 3. Entity tracking per conversation
-- 4. Session management

-- Create conversation_sessions table
CREATE TABLE IF NOT EXISTS conversation_sessions (
  session_id VARCHAR(100) PRIMARY KEY,
  user_id VARCHAR(100) NOT NULL,
  current_topic VARCHAR(500),
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create conversation_messages table
CREATE TABLE IF NOT EXISTS conversation_messages (
  message_id VARCHAR(100) PRIMARY KEY,
  session_id VARCHAR(100) NOT NULL REFERENCES conversation_sessions(session_id) ON DELETE CASCADE,
  user_id VARCHAR(100) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  resolved_query TEXT, -- For queries with resolved references
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create conversation_entities table (track entities mentioned in conversations)
CREATE TABLE IF NOT EXISTS conversation_entities (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(100) NOT NULL REFERENCES conversation_sessions(session_id) ON DELETE CASCADE,
  entity_type VARCHAR(50) NOT NULL,
  entity_value VARCHAR(500) NOT NULL,
  first_mentioned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_mentioned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  mention_count INTEGER DEFAULT 1,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_sessions_user ON conversation_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_activity ON conversation_sessions(last_activity_at);
CREATE INDEX IF NOT EXISTS idx_messages_session ON conversation_messages(session_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_user ON conversation_messages(user_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_entities_session ON conversation_entities(session_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_entities_value ON conversation_entities(entity_value);

-- Add comments
COMMENT ON TABLE conversation_sessions IS 'Tracks conversation sessions for multi-turn dialogue';
COMMENT ON TABLE conversation_messages IS 'Stores individual messages in conversations';
COMMENT ON TABLE conversation_entities IS 'Tracks entities mentioned in conversations for reference resolution';

COMMENT ON COLUMN conversation_messages.resolved_query IS 'Query with references resolved to explicit entities';
COMMENT ON COLUMN conversation_entities.entity_type IS 'Type of entity: procedures, requirements, measurements, documents, definitions';

-- Example data structure:
-- conversation_sessions:
-- {
--   "session_id": "session_user123_1234567890_abc",
--   "user_id": "user123",
--   "current_topic": "LSO procedures",
--   "metadata": {
--     "document_ids": ["doc_123", "doc_456"],
--     "tags": ["naval", "procedures"]
--   }
-- }

-- conversation_messages:
-- {
--   "message_id": "msg_1234567890_xyz",
--   "session_id": "session_user123_1234567890_abc",
--   "role": "user",
--   "content": "What is the LSO?",
--   "metadata": {
--     "sources": ["doc_123"],
--     "confidence": 0.85,
--     "entities": ["LSO"]
--   }
-- }

-- conversation_entities:
-- {
--   "session_id": "session_user123_1234567890_abc",
--   "entity_type": "definitions",
--   "entity_value": "LSO",
--   "mention_count": 3,
--   "metadata": {
--     "full_text": "Landing Signal Officer",
--     "context": "naval operations"
--   }
-- }

-- Function to cleanup old sessions (optional, can be called by scheduled job)
CREATE OR REPLACE FUNCTION cleanup_old_conversation_sessions(age_hours INTEGER DEFAULT 24)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM conversation_sessions
  WHERE last_activity_at < NOW() - (age_hours || ' hours')::INTERVAL;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_conversation_sessions IS 'Delete conversation sessions older than specified hours';

-- Verification query (commented out for safety)
-- SELECT 
--   (SELECT COUNT(*) FROM conversation_sessions) as sessions,
--   (SELECT COUNT(*) FROM conversation_messages) as messages,
--   (SELECT COUNT(*) FROM conversation_entities) as entities;

