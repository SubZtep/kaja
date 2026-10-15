-- Marketplace abilities synced from the repo's marketplace/ folder (see services/marketplace.ts).
-- Rows are never deleted by the sync: an ability that leaves the marketplace gets removed_at, and
-- comes back if it returns. Every user has every available ability; personas pick what a turn uses.
CREATE TABLE IF NOT EXISTS ability (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  type text NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  -- relative path -> text content (SKILL.md and the skill's other text files)
  files jsonb NOT NULL DEFAULT '{}',
  -- needs a shell to be useful, so the cloud doesn't offer it
  has_scripts boolean NOT NULL DEFAULT false,
  content_hash text NOT NULL,
  commit text NOT NULL,
  removed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ability_type_name_unique UNIQUE (type, name)
);

-- Single row: the last synced commit, so an unchanged branch is skipped without downloading anything.
CREATE TABLE IF NOT EXISTS marketplace_sync (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  commit text,
  synced_at timestamptz,
  error text
);
