/** The reading module's Postgres tables. Edited in place until v1.0, like the API's migrations. */
export const READING_SCHEMA = `
-- One row per link a user saved or Kaja found for them, with the page's text as it was read then.
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
  -- saved by the user, or where Kaja found it (a source's id)
  source text NOT NULL CHECK (source IN ('saved', 'hn')),
  -- for a found story: where it is talked about, and its points there when found
  discussion_url text,
  score integer,
  -- why the user saved it, in their words
  note text,
  -- suggested: found by Kaja and not looked at yet (deleted after two weeks); dismissed: a suggestion turned down
  status text NOT NULL CHECK (status IN ('suggested', 'inbox', 'read', 'archived', 'dismissed')),
  -- when it was saved or found
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

-- What the sources offered lately, for everyone: each account's search picks from here. Pruned after a week.
CREATE TABLE IF NOT EXISTS reading_source_item (
  id uuid PRIMARY KEY,
  source text NOT NULL,
  -- the source's own id for the story
  external_id text NOT NULL,
  title text NOT NULL,
  url text NOT NULL,
  url_key text NOT NULL,
  discussion_url text,
  score integer NOT NULL DEFAULT 0,
  comments integer NOT NULL DEFAULT 0,
  published_at timestamptz NOT NULL,
  -- an account's search only looks at what it hasn't seen: items first seen since its last run
  first_seen_at timestamptz NOT NULL,
  UNIQUE (source, external_id)
);

CREATE INDEX IF NOT EXISTS reading_source_item_seen_idx ON reading_source_item (first_seen_at);
`
