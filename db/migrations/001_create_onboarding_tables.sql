-- Phase 2.5: Onboarding Tables
-- Created: 2026-10-13
-- Purpose: Store user schema definitions and onboarding sessions

-- Table: user_schema_definitions
-- Stores the complete UserSchemaDefinition for each user
CREATE TABLE IF NOT EXISTS user_schema_definitions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,

  -- Core schema (JSON, full UserSchemaDefinition)
  schema_data TEXT NOT NULL,

  -- Metadata
  version INTEGER DEFAULT 1,
  stage TEXT CHECK(stage IN ('initial', 'intermediate', 'advanced')) DEFAULT 'initial',
  completed_sections TEXT DEFAULT '[]', -- JSON array of completed section names

  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Index for user_id lookups
CREATE INDEX IF NOT EXISTS idx_user_schema_definitions_user_id
ON user_schema_definitions(user_id);

-- Table: onboarding_sessions
-- Tracks conversation history and progress for each onboarding session
CREATE TABLE IF NOT EXISTS onboarding_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,

  -- Session context
  type TEXT CHECK(type IN ('initial', 'progressive')) DEFAULT 'progressive',
  focus TEXT CHECK(focus IN ('investments', 'household', 'goals', 'tax', 'categories', null)),

  -- Conversation history (JSON array of messages)
  messages TEXT NOT NULL,

  -- Progress tracking
  started_at TEXT DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  schema_snapshot TEXT, -- JSON snapshot of schema before changes
  schema_proposed TEXT, -- JSON of proposed schema changes

  status TEXT CHECK(status IN ('in_progress', 'completed', 'abandoned')) DEFAULT 'in_progress'
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_user_id
ON onboarding_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_status
ON onboarding_sessions(status);

-- Table: ai_token_cache (Optional, for performance)
-- Caches Google access tokens to reduce API calls
CREATE TABLE IF NOT EXISTS ai_token_cache (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,

  google_access_token TEXT NOT NULL,
  google_refresh_token TEXT,

  expires_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Index for user_id lookups
CREATE INDEX IF NOT EXISTS idx_ai_token_cache_user_id
ON ai_token_cache(user_id);

-- Table: onboarding_audit_log
-- Audit trail for compliance and debugging
CREATE TABLE IF NOT EXISTS onboarding_audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,

  action TEXT NOT NULL, -- 'schema_created', 'schema_updated', 'session_started', 'session_completed'
  details TEXT, -- JSON with additional context

  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Index for user_id lookups
CREATE INDEX IF NOT EXISTS idx_onboarding_audit_log_user_id
ON onboarding_audit_log(user_id);

CREATE INDEX IF NOT EXISTS idx_onboarding_audit_log_action
ON onboarding_audit_log(action);
