-- Marketplace packages synced from the repo's marketplace/ folder (see services/marketplace.ts).
-- Rows are never deleted by the sync: a package that leaves the marketplace gets removed_at, so
-- users' selections survive and come back if it returns.
CREATE TABLE IF NOT EXISTS "package" (
  "id" uuid default uuidv7 () not null primary key,
  "type" text not null,
  "name" text not null,
  "description" text not null,
  -- relative path -> text content (SKILL.md and the skill's other text files)
  "files" jsonb not null default '{}',
  -- needs a shell to be useful, so the cloud doesn't offer it
  "has_scripts" boolean not null default false,
  "content_hash" text not null,
  "commit" text not null,
  "removed_at" timestamptz,
  "created_at" timestamptz default CURRENT_TIMESTAMP not null,
  "updated_at" timestamptz default CURRENT_TIMESTAMP not null,
  CONSTRAINT "package_type_name_unique" UNIQUE ("type", "name")
);

CREATE TABLE IF NOT EXISTS "user_package" (
  "user_id" uuid not null references "user" ("id") on delete cascade,
  "package_id" uuid not null references "package" ("id") on delete cascade,
  "enabled_at" timestamptz default CURRENT_TIMESTAMP not null,
  PRIMARY KEY ("user_id", "package_id")
);

CREATE INDEX IF NOT EXISTS "user_package_package_id_idx" ON "user_package" ("package_id");

-- Single row: the last synced commit, so an unchanged branch is skipped without downloading anything.
CREATE TABLE IF NOT EXISTS "marketplace_sync" (
  "id" integer not null primary key default 1 CHECK ("id" = 1),
  "commit" text,
  "synced_at" timestamptz,
  "error" text
);
