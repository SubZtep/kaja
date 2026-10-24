-- Public provider catalog the TUI wizard builds models.toml from: synced from models.dev, curated in the admin.
CREATE TABLE IF NOT EXISTS catalog_provider (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  -- The [providers.<slug>] key users get; models.dev's id for synced rows.
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'hosted' CHECK (kind IN ('hosted', 'self-hosted')),
  -- models.dev's address (sync-owned); base_url is the admin's override, the one served when set.
  api_url text,
  base_url text,
  doc text,
  -- AI SDK package models.dev names: anything but @ai-sdk/openai-compatible hints at a non-OpenAI API.
  npm text,
  note text,
  -- Lower first: decides which listed provider a contested task defaults to.
  position integer NOT NULL DEFAULT 0,
  -- Offered by the wizard; synced providers arrive unlisted.
  listed boolean NOT NULL DEFAULT false,
  source text NOT NULL CHECK (source IN ('modelsdev', 'admin')),
  synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS catalog_model (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  provider_id uuid NOT NULL REFERENCES catalog_provider (id) ON DELETE CASCADE,
  -- The literal name sent to the provider's API.
  model text NOT NULL,
  name text,
  tasks text[] NOT NULL DEFAULT '{}',
  -- Set once the admin edits tasks, so the sync stops overwriting them.
  tasks_edited boolean NOT NULL DEFAULT false,
  -- Tasks this model is its provider's default for; one model per provider and task (kept by the service).
  default_tasks text[] NOT NULL DEFAULT '{}',
  context_window integer CHECK (context_window > 0),
  images boolean NOT NULL DEFAULT false,
  -- null is current; models.dev's deprecated, or removed once it no longer lists the model.
  status text CHECK (status IN ('deprecated', 'removed')),
  source text NOT NULL CHECK (source IN ('modelsdev', 'admin')),
  synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT catalog_model_provider_model_unique UNIQUE (provider_id, model)
);

-- Single row: the last models.dev sync, its ETag so an unchanged file isn't downloaded again.
CREATE TABLE IF NOT EXISTS catalog_sync (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  etag text,
  synced_at timestamptz,
  error text
);
