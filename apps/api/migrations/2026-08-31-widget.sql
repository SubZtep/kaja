-- Embeddable chat widgets: the key (stored as sha256) resolves the persona and mode server-side.
CREATE TABLE IF NOT EXISTS widget (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  label text NOT NULL,
  key_prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  config jsonb NOT NULL DEFAULT '{}',
  allowed_origins text[] NOT NULL DEFAULT '{}',
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at timestamptz
);

CREATE INDEX IF NOT EXISTS widget_user_id_idx ON widget (user_id);
