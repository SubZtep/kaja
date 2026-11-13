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
  -- one line on what the article says, written with its topics; tagged_at is NULL until that worked
  gist text,
  tagged_at timestamptz,
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

-- A user's own subjects, grown from what they save; state says whether discovery should look for more of it.
CREATE TABLE IF NOT EXISTS reading_topic (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  name text NOT NULL,
  -- the name lower-cased with single spaces, so "AI Agents" and "ai agents" are one topic
  name_key text NOT NULL,
  state text NOT NULL CHECK (state IN ('followed', 'neutral', 'muted')),
  -- when Kaja offered to follow it: once per topic
  offered_at timestamptz,
  created_at timestamptz NOT NULL,
  UNIQUE (user_id, name_key)
);

CREATE TABLE IF NOT EXISTS reading_article_topic (
  article_id uuid NOT NULL REFERENCES reading_article (id) ON DELETE CASCADE,
  topic_id uuid NOT NULL REFERENCES reading_topic (id) ON DELETE CASCADE,
  PRIMARY KEY (article_id, topic_id)
);

CREATE INDEX IF NOT EXISTS reading_article_topic_topic_idx ON reading_article_topic (topic_id);
`
