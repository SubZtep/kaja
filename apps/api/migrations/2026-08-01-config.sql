-- Server-side model config: the providers the cloud talks to and their models (seeded by migrate.ts, edited in the admin).
CREATE TABLE IF NOT EXISTS provider (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  name text NOT NULL UNIQUE,
  base_url text NOT NULL,
  api_key text,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS model (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  provider_id uuid NOT NULL REFERENCES provider (id) ON DELETE CASCADE,
  model text NOT NULL,
  tasks text[] NOT NULL DEFAULT '{}',
  enabled boolean NOT NULL DEFAULT true,
  free boolean NOT NULL DEFAULT false,
  -- Tokens the model takes in; null means ask its server, else assume 32768.
  context_window integer CHECK (context_window > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS model_enabled_idx ON model (enabled);
CREATE INDEX IF NOT EXISTS model_free_idx ON model (free);
CREATE INDEX IF NOT EXISTS model_provider_id_idx ON model (provider_id);
