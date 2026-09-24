-- Users' own secrets (ability API keys), AES-256-GCM encrypted with USER_SECRET_KEY (see services/secret.ts).
-- The user id and name are the cipher's associated data, so a row copied to another user or name fails to decrypt.
-- Values never leave the server: the API only says whether one is set.
CREATE TABLE IF NOT EXISTS "user_secret" (
  "user_id" uuid not null references "user" ("id") on delete cascade,
  -- what the secret is for, e.g. ability:<name>
  "name" text not null,
  "ciphertext" bytea not null,
  "iv" bytea not null,
  "tag" bytea not null,
  "created_at" timestamptz default CURRENT_TIMESTAMP not null,
  "updated_at" timestamptz default CURRENT_TIMESTAMP not null,
  PRIMARY KEY ("user_id", "name")
);
