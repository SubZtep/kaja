/** The reading module's Postgres tables. Edited in place until v1.0, like the API's migrations. */
export const READING_SCHEMA = `
-- The reading inbox: one row per link a user saved, with the page's text as it was read then.
CREATE TABLE IF NOT EXISTS reading_article (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  -- what the user and the model call it ("read 3"), counted per user
  number integer NOT NULL,
  url text NOT NULL,
  -- the url without its scheme, fragment and tracking parameters, so one page saved twice is one row
  url_key text NOT NULL,
  title text,
  site text,
  author text,
  -- Markdown, capped by the module; NULL when fetch_error says why the page couldn't be read
  content text,
  word_count integer NOT NULL DEFAULT 0,
  fetch_error text,
  source text NOT NULL CHECK (source IN ('saved')),
  -- why the user saved it, in their words
  note text,
  status text NOT NULL CHECK (status IN ('inbox', 'read', 'archived')),
  saved_at timestamptz NOT NULL,
  opened_at timestamptz,
  read_at timestamptz,
  archived_at timestamptz,
  UNIQUE (user_id, number),
  UNIQUE (user_id, url_key)
);

CREATE INDEX IF NOT EXISTS reading_article_user_status_idx ON reading_article (user_id, status, number DESC);
`
