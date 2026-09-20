-- Sessions are stored as rows now (one per message and tool call) instead of two JSON blobs; the old rows are dropped, not converted.
DROP TABLE IF EXISTS nasi_session CASCADE;

CREATE TABLE nasi_session (
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

CREATE INDEX nasi_session_user_updated_idx ON nasi_session (user_id, updated_at DESC);
CREATE INDEX nasi_session_user_owner_updated_idx ON nasi_session (user_id, owner, updated_at DESC);

CREATE TABLE nasi_message (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES nasi_session (id) ON DELETE CASCADE,
  seq integer NOT NULL,
  role text NOT NULL,
  content text,
  parts jsonb,
  reasoning text,
  tool_call_id text,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (session_id, seq)
);

CREATE TABLE nasi_tool_call (
  id uuid PRIMARY KEY,
  message_id uuid NOT NULL REFERENCES nasi_message (id) ON DELETE CASCADE,
  position integer NOT NULL,
  call_id text NOT NULL,
  name text NOT NULL,
  arguments text NOT NULL,
  result_message_id uuid REFERENCES nasi_message (id) ON DELETE SET NULL,
  approval text CHECK (approval IN ('approved', 'declined')),
  UNIQUE (message_id, position)
);

CREATE INDEX nasi_tool_call_name_idx ON nasi_tool_call (name);
