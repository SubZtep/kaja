-- Cloud agent state: a session is rows (one per message and tool call), plus the user's memory notes and dataset answers.
CREATE TABLE IF NOT EXISTS nasi_session (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  persona text NOT NULL,
  -- TODO: rethink this — free-text per-session model with no dedicated last-used-per-model tracking
  model text NOT NULL,
  title text NOT NULL,
  owner text,
  channel text NOT NULL CHECK (channel IN ('web', 'telegram', 'widget')),
  system_prompt text,
  pending_call_id text,
  pending_kind text CHECK (pending_kind IN ('ask_user', 'run_command', 'client_tool', 'tool_approval'))
);

CREATE INDEX IF NOT EXISTS nasi_session_user_updated_idx ON nasi_session (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS nasi_session_user_owner_updated_idx ON nasi_session (user_id, owner, updated_at DESC);

CREATE TABLE IF NOT EXISTS nasi_message (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES nasi_session (id) ON DELETE CASCADE,
  seq integer NOT NULL,
  role text NOT NULL,
  content text,
  parts jsonb,
  reasoning text,
  tool_call_id text,
  -- one model round: set on assistant messages
  persona text,
  model text,
  prompt_tokens integer,
  completion_tokens integer,
  latency_ms integer,
  finish_reason text,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (session_id, seq)
);

CREATE TABLE IF NOT EXISTS nasi_tool_call (
  id uuid PRIMARY KEY,
  message_id uuid NOT NULL REFERENCES nasi_message (id) ON DELETE CASCADE,
  position integer NOT NULL,
  call_id text NOT NULL,
  name text NOT NULL,
  arguments text NOT NULL,
  result_message_id uuid REFERENCES nasi_message (id) ON DELETE SET NULL,
  -- null when a person or a client answered the call instead of the agent
  status text CHECK (status IN ('ok', 'error', 'declined', 'skipped')),
  duration_ms integer,
  approval text CHECK (approval IN ('approved', 'declined')),
  UNIQUE (message_id, position)
);

CREATE INDEX IF NOT EXISTS nasi_tool_call_name_idx ON nasi_tool_call (name);

CREATE TABLE IF NOT EXISTS nasi_note (
  user_id uuid NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  -- whose notes: '' is the web app and the CLI, else a Telegram user or a widget visitor (like sessions and datasets)
  owner text NOT NULL DEFAULT '',
  key text NOT NULL,
  content text NOT NULL,
  importance text NOT NULL CHECK (importance IN ('low', 'medium', 'high')),
  tags jsonb NOT NULL,
  sticky boolean NOT NULL,
  created_at timestamptz NOT NULL,
  last_used_at timestamptz NOT NULL,
  use_count integer NOT NULL,
  PRIMARY KEY (user_id, owner, key)
);

CREATE TABLE IF NOT EXISTS nasi_dataset_answer (
  user_id uuid NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  topic text NOT NULL,
  owner text NOT NULL DEFAULT '',
  version integer NOT NULL,
  field text NOT NULL,
  value text NOT NULL,
  answered_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, topic, owner, version, field)
);

CREATE TABLE IF NOT EXISTS nasi_dataset_version (
  user_id uuid NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  topic text NOT NULL,
  owner text NOT NULL DEFAULT '',
  version integer NOT NULL,
  completed_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, topic, owner, version)
);
