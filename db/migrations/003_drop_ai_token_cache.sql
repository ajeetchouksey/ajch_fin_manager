-- GDPR data minimisation: ai_token_cache was never used and was designed to hold raw
-- Google access/refresh tokens. Identity now comes from verified tokens cached in KV by hash.
DROP INDEX IF EXISTS idx_ai_token_cache_user_id;
DROP TABLE IF EXISTS ai_token_cache;
