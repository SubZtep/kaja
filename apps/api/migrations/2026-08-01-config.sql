CREATE TABLE IF NOT EXISTS "mcp_server" (
  "id" uuid default uuidv7 () not null primary key,
  "server_id" text not null unique,
  "command" text not null,
  "args" jsonb not null default '[]',
  "env" jsonb not null default '{}',
  "enabled" boolean not null default true,
  "created_at" timestamptz default CURRENT_TIMESTAMP not null,
  "updated_at" timestamptz default CURRENT_TIMESTAMP not null
);

CREATE INDEX IF NOT EXISTS "mcp_server_enabled_idx" ON "mcp_server" ("enabled");

CREATE TABLE IF NOT EXISTS "provider" (
  "id" uuid default uuidv7 () not null primary key,
  "name" text not null unique,
  "base_url" text not null,
  "api_key" text,
  "created_at" timestamptz default CURRENT_TIMESTAMP not null,
  "updated_at" timestamptz default CURRENT_TIMESTAMP not null
);

CREATE TABLE IF NOT EXISTS "model" (
  "id" uuid default uuidv7 () not null primary key,
  "provider_id" uuid not null references "provider" ("id") on delete cascade,
  "model" text not null,
  "tasks" text[] not null default '{}',
  "enabled" boolean not null default true,
  "created_at" timestamptz default CURRENT_TIMESTAMP not null,
  "updated_at" timestamptz default CURRENT_TIMESTAMP not null
);

CREATE INDEX IF NOT EXISTS "model_enabled_idx" ON "model" ("enabled");
CREATE INDEX IF NOT EXISTS "model_provider_id_idx" ON "model" ("provider_id");
