-- Users' own secrets (ability API keys), AES-256-GCM encrypted with USER_SECRET_KEY (see services/secret.ts).
-- The user id and name are the cipher's associated data, so a row copied to another user or name fails to decrypt.
-- Values never leave the server: the API only says whether one is set.
CREATE TABLE IF NOT EXISTS user_secret (
  user_id uuid NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  -- what the secret is for, e.g. ability:<name>
  name text NOT NULL,
  ciphertext bytea NOT NULL,
  iv bytea NOT NULL,
  tag bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, name)
);

-- Server-wide secrets an admin manages (an ability's service key every user shares unless they saved their own),
-- encrypted the same way; the name is the associated data. Values never leave the server either.
CREATE TABLE IF NOT EXISTS service_secret (
  -- what the secret is for, e.g. ability:<name>
  name text PRIMARY KEY,
  ciphertext bytea NOT NULL,
  iv bytea NOT NULL,
  tag bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
