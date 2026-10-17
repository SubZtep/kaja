-- Server-wide secrets an admin manages (an ability's API key every user shares), AES-256-GCM encrypted with
-- USER_SECRET_KEY (see services/secret.ts). The name is the cipher's associated data, so a row copied to another
-- name fails to decrypt. Values never leave the server: the API only says whether one is set.
CREATE TABLE IF NOT EXISTS service_secret (
  -- what the secret is for, e.g. ability:<name>
  name text PRIMARY KEY,
  ciphertext bytea NOT NULL,
  iv bytea NOT NULL,
  tag bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
