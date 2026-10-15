-- Cloud Telegram bot: which Kaja account a Telegram user is, and the one-time tokens that link them (stored as sha256).
CREATE TABLE IF NOT EXISTS telegram_link (
  telegram_user_id bigint PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  linked_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS telegram_link_user_id_idx ON telegram_link (user_id);

CREATE TABLE IF NOT EXISTS telegram_link_token (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS telegram_link_token_user_id_idx ON telegram_link_token (user_id);
