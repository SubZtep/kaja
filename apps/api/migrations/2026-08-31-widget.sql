-- Cloud widget principals: a secret token (stored as sha256), a pinned model, and generated source published apart from the row.
CREATE TABLE IF NOT EXISTS widget (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  -- a child widget minted by another; nothing writes it yet
  parent_widget_id uuid REFERENCES widget (id) ON DELETE CASCADE,
  label text NOT NULL,
  intent text NOT NULL,
  model text NOT NULL,
  -- { "kind": "browser", "page": "home", "selector": "#…" } or { "kind": "server" }
  target jsonb NOT NULL CHECK (target ->> 'kind' IN ('browser', 'server')),
  token_prefix text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT true,
  -- both point into widget_generation (constraints below, since that table needs this one first)
  draft_generation_id uuid,
  published_generation_id uuid,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at timestamptz
);

CREATE INDEX IF NOT EXISTS widget_user_id_idx ON widget (user_id);

-- Directed: the board links to the player it calls. Both ends belong to the same user (checked by the API).
CREATE TABLE IF NOT EXISTS widget_link (
  from_widget_id uuid NOT NULL REFERENCES widget (id) ON DELETE CASCADE,
  to_widget_id uuid NOT NULL REFERENCES widget (id) ON DELETE CASCADE,
  PRIMARY KEY (from_widget_id, to_widget_id),
  CHECK (from_widget_id <> to_widget_id)
);

CREATE INDEX IF NOT EXISTS widget_link_to_widget_id_idx ON widget_link (to_widget_id);

-- One model-written source. `error` is set when the reply couldn't be kept; such a draft can't be published.
CREATE TABLE IF NOT EXISTS widget_generation (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  widget_id uuid NOT NULL REFERENCES widget (id) ON DELETE CASCADE,
  source text NOT NULL,
  error text,
  prompt_version integer NOT NULL,
  -- intent, model, target, links and prompt version it was written from, so an unchanged config isn't regenerated
  config_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS widget_generation_widget_id_idx ON widget_generation (widget_id);

-- Re-runnable: an edited migration is applied again before v1.0, and ADD CONSTRAINT has no IF NOT EXISTS
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'widget_draft_generation_id_fkey') THEN
    ALTER TABLE widget ADD CONSTRAINT widget_draft_generation_id_fkey
      FOREIGN KEY (draft_generation_id) REFERENCES widget_generation (id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'widget_published_generation_id_fkey') THEN
    ALTER TABLE widget ADD CONSTRAINT widget_published_generation_id_fkey
      FOREIGN KEY (published_generation_id) REFERENCES widget_generation (id) ON DELETE SET NULL;
  END IF;
END
$$;

-- A small JSON bag per visitor (the API caps it at 16 KB); for the homepage game, the transcript.
CREATE TABLE IF NOT EXISTS widget_state (
  widget_id uuid NOT NULL REFERENCES widget (id) ON DELETE CASCADE,
  visitor_id uuid NOT NULL,
  state jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (widget_id, visitor_id)
);

-- Each model call a widget made, added to its owner's token totals on the stats page.
CREATE TABLE IF NOT EXISTS widget_call (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  widget_id uuid NOT NULL REFERENCES widget (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('chat', 'generate')),
  model text NOT NULL,
  prompt_tokens integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS widget_call_widget_created_idx ON widget_call (widget_id, created_at);
