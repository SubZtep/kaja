/**
 * The SQLite schema of `createSqlStore`: the Postgres `nasi_*` tables (apps/api/migrations/2026-09-07-nasi.sql) with
 * the same columns, SQLite types and no `"user"` table. The host applies it on open.
 */
export const SQLITE_SCHEMA = `
CREATE TABLE IF NOT EXISTS nasi_session (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  created_at text NOT NULL,
  updated_at text NOT NULL,
  persona text NOT NULL,
  model text NOT NULL,
  title text NOT NULL,
  owner text,
  channel text NOT NULL CHECK (channel IN ('web', 'telegram', 'widget', 'local')),
  system_prompt text,
  pending_call_id text,
  pending_kind text CHECK (pending_kind IN ('ask_user', 'run_command', 'tool_approval', 'client_tools')),
  granted_tools text NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS nasi_session_user_updated_idx ON nasi_session (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS nasi_session_user_owner_updated_idx ON nasi_session (user_id, owner, updated_at DESC);

CREATE TABLE IF NOT EXISTS nasi_message (
  id text PRIMARY KEY,
  session_id text NOT NULL REFERENCES nasi_session (id) ON DELETE CASCADE,
  seq integer NOT NULL,
  role text NOT NULL,
  content text,
  parts text,
  reasoning text,
  tool_call_id text,
  persona text,
  model text,
  prompt_tokens integer,
  completion_tokens integer,
  latency_ms integer,
  finish_reason text,
  created_at text NOT NULL,
  UNIQUE (session_id, seq)
);

CREATE TABLE IF NOT EXISTS nasi_tool_call (
  id text PRIMARY KEY,
  message_id text NOT NULL REFERENCES nasi_message (id) ON DELETE CASCADE,
  position integer NOT NULL,
  call_id text NOT NULL,
  name text NOT NULL,
  arguments text NOT NULL,
  result_message_id text REFERENCES nasi_message (id) ON DELETE SET NULL,
  status text CHECK (status IN ('ok', 'error', 'declined', 'skipped')),
  duration_ms integer,
  approval text CHECK (approval IN ('approved', 'declined')),
  result_summary text,
  UNIQUE (message_id, position)
);

CREATE INDEX IF NOT EXISTS nasi_tool_call_name_idx ON nasi_tool_call (name);
CREATE INDEX IF NOT EXISTS nasi_tool_call_result_message_idx ON nasi_tool_call (result_message_id);

CREATE TABLE IF NOT EXISTS nasi_session_summary (
  session_id text NOT NULL REFERENCES nasi_session (id) ON DELETE CASCADE,
  summary_from integer NOT NULL,
  summary text NOT NULL,
  created_at text NOT NULL,
  PRIMARY KEY (session_id, summary_from)
);

CREATE TABLE IF NOT EXISTS nasi_session_event (
  session_id text NOT NULL REFERENCES nasi_session (id) ON DELETE CASCADE,
  seq integer NOT NULL,
  type text NOT NULL,
  payload text NOT NULL,
  PRIMARY KEY (session_id, seq)
);

CREATE INDEX IF NOT EXISTS nasi_session_event_type_idx ON nasi_session_event (type, session_id, seq);

CREATE TABLE IF NOT EXISTS nasi_model_call (
  id text PRIMARY KEY,
  session_id text NOT NULL REFERENCES nasi_session (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('compact', 'condense', 'summarize', 'describe')),
  model text NOT NULL,
  prompt_tokens integer,
  completion_tokens integer,
  latency_ms integer NOT NULL,
  created_at text NOT NULL
);

CREATE INDEX IF NOT EXISTS nasi_model_call_session_idx ON nasi_model_call (session_id);

CREATE TABLE IF NOT EXISTS nasi_image (
  session_id text NOT NULL,
  user_id text NOT NULL,
  id text NOT NULL,
  mime_type text NOT NULL,
  width integer NOT NULL,
  height integer NOT NULL,
  bytes integer NOT NULL,
  source_url text,
  alt text,
  title text,
  file_name text,
  description text,
  description_model text,
  described_at text,
  describe_attempts integer NOT NULL DEFAULT 0,
  describe_tried_at text,
  created_at text NOT NULL,
  PRIMARY KEY (session_id, id)
);

CREATE INDEX IF NOT EXISTS nasi_image_user_idx ON nasi_image (user_id);

CREATE TABLE IF NOT EXISTS nasi_note (
  user_id text NOT NULL,
  owner text NOT NULL DEFAULT '',
  key text NOT NULL,
  content text NOT NULL,
  importance text NOT NULL CHECK (importance IN ('low', 'medium', 'high')),
  tags text NOT NULL,
  sticky integer NOT NULL,
  created_at text NOT NULL,
  last_used_at text NOT NULL,
  use_count integer NOT NULL,
  PRIMARY KEY (user_id, owner, key)
);

CREATE TABLE IF NOT EXISTS nasi_dataset_answer (
  user_id text NOT NULL,
  topic text NOT NULL,
  owner text NOT NULL DEFAULT '',
  version integer NOT NULL,
  field text NOT NULL,
  value text NOT NULL,
  answered_at text NOT NULL,
  PRIMARY KEY (user_id, topic, owner, version, field)
);

CREATE TABLE IF NOT EXISTS nasi_dataset_version (
  user_id text NOT NULL,
  topic text NOT NULL,
  owner text NOT NULL DEFAULT '',
  version integer NOT NULL,
  completed_at text NOT NULL,
  PRIMARY KEY (user_id, topic, owner, version)
);
`
