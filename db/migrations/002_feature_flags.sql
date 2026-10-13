-- ADR-001 Increment 0: feature flags for small, switchable increments.
-- A flag is on for a user when enabled = 1 AND (allow_users is empty OR contains the user's id).
-- allow_users is a JSON array of Google subject ids, used for owner-only canary testing.

CREATE TABLE IF NOT EXISTS feature_flags (
  key TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  allow_users TEXT NOT NULL DEFAULT '[]',
  description TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Planned increments, all off until each one ships
INSERT OR IGNORE INTO feature_flags (key, enabled, description) VALUES
  ('byoai.drive_link', 0, 'Inc 1: link Google Drive and create the Ledger Sheet'),
  ('byoai.read',       0, 'Inc 2: read-only skill / Gem guidance in the app'),
  ('byoai.write',      0, 'Inc 3: Apps Script write gateway and action links'),
  ('byoai.upload',     0, 'Inc 4: Inbox upload processing'),
  ('mcp.read',         0, 'Inc 5: remote MCP read tools (Claude)'),
  ('mcp.propose',      0, 'Inc 6: propose-change tools and approval queue');
