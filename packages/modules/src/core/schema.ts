/** The module system's own Postgres tables, applied before any module's. Edited in place until v1.0. */
export const CORE_SCHEMA = `
-- A module's settings for one account; the row appears with the first setting saved.
CREATE TABLE IF NOT EXISTS module_user (
  user_id uuid NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  module text NOT NULL,
  settings jsonb NOT NULL,
  started_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, module)
);

-- A module's background job: one row for everyone (user_id NULL) or one per account, run when due.
CREATE TABLE IF NOT EXISTS module_job (
  id uuid PRIMARY KEY,
  module text NOT NULL,
  job text NOT NULL,
  user_id uuid REFERENCES "user" (id) ON DELETE CASCADE,
  -- the user id, or '' for everyone: NULLs never clash, so uniqueness needs a value
  key text NOT NULL,
  due_at timestamptz NOT NULL,
  -- set while a run has the row
  started_at timestamptz,
  last_run_at timestamptz,
  -- the last failure's message; cleared by a run that worked
  last_error text,
  -- failed runs in a row
  attempts integer NOT NULL DEFAULT 0,
  UNIQUE (module, job, key)
);

CREATE INDEX IF NOT EXISTS module_job_due_idx ON module_job (module, job, due_at);

-- A module an admin switched off for everyone; a module without a row is on.
CREATE TABLE IF NOT EXISTS module_state (
  module text PRIMARY KEY,
  enabled boolean NOT NULL,
  updated_at timestamptz NOT NULL
);

-- Model calls a module's jobs made, outside any conversation, so usage counts their tokens.
CREATE TABLE IF NOT EXISTS module_model_call (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  module text NOT NULL,
  job text NOT NULL,
  model text NOT NULL,
  prompt_tokens integer,
  completion_tokens integer,
  latency_ms integer NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS module_model_call_user_idx ON module_model_call (user_id, created_at);
`
