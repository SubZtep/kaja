CREATE TABLE IF NOT EXISTS nasi_session (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  persona text NOT NULL,
  model text NOT NULL,
  title text NOT NULL,
  owner text,
  session jsonb NOT NULL,
  events jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS nasi_session_user_updated_idx ON nasi_session (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS nasi_session_user_owner_updated_idx ON nasi_session (user_id, owner, updated_at DESC);

CREATE TABLE IF NOT EXISTS nasi_note (
  user_id uuid NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  key text NOT NULL,
  content text NOT NULL,
  importance text NOT NULL CHECK (importance IN ('low', 'medium', 'high')),
  tags jsonb NOT NULL,
  sticky boolean NOT NULL,
  created_at text NOT NULL,
  last_used_at text NOT NULL,
  use_count integer NOT NULL,
  PRIMARY KEY (user_id, key)
);

CREATE TABLE IF NOT EXISTS nasi_dataset_answer (
  user_id uuid NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  topic text NOT NULL,
  owner text NOT NULL DEFAULT '',
  version integer NOT NULL,
  field text NOT NULL,
  value text NOT NULL,
  answered_at text NOT NULL,
  PRIMARY KEY (user_id, topic, owner, version, field)
);

CREATE TABLE IF NOT EXISTS nasi_dataset_version (
  user_id uuid NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  topic text NOT NULL,
  owner text NOT NULL DEFAULT '',
  version integer NOT NULL,
  completed_at text NOT NULL,
  PRIMARY KEY (user_id, topic, owner, version)
);
