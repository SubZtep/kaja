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
`
