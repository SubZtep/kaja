CREATE TABLE IF NOT EXISTS "widget_key" (
  "id" uuid default uuidv7 () not null primary key,
  "user_id" uuid not null references "user" ("id") on delete cascade,
  "persona_id" text,
  "label" text not null,
  "key_prefix" text not null,
  "key_hash" text not null unique,
  "allowed_origins" text[] not null default '{}',
  "enabled" boolean not null default true,
  "created_at" timestamptz default CURRENT_TIMESTAMP not null,
  "last_used_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "widget_key_user_id_idx" ON "widget_key" ("user_id");
CREATE INDEX IF NOT EXISTS "widget_key_key_hash_idx" ON "widget_key" ("key_hash");
