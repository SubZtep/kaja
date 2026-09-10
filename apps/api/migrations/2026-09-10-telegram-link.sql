CREATE TABLE IF NOT EXISTS "telegram_link" (
  "telegram_user_id" bigint not null primary key,
  "user_id" uuid not null references "user" ("id") on delete cascade,
  "linked_at" timestamptz default CURRENT_TIMESTAMP not null
);

CREATE INDEX IF NOT EXISTS "telegram_link_user_id_idx" ON "telegram_link" ("user_id");

CREATE TABLE IF NOT EXISTS "telegram_link_token" (
  "token_hash" text not null primary key,
  "user_id" uuid not null references "user" ("id") on delete cascade,
  "created_at" timestamptz default CURRENT_TIMESTAMP not null,
  "expires_at" timestamptz not null
);
