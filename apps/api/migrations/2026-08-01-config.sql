CREATE TABLE IF NOT EXISTS "mcp_server" (
  "id" uuid default uuidv7 () not null primary key,
  "server_id" text not null unique,
  "command" text,
  "args" jsonb not null default '[]',
  "env" jsonb not null default '{}',
  "url" text,
  "headers" jsonb not null default '{}',
  "enabled" boolean not null default true,
  "created_at" timestamptz default CURRENT_TIMESTAMP not null,
  "updated_at" timestamptz default CURRENT_TIMESTAMP not null,
  CONSTRAINT "mcp_server_transport_check" CHECK (
    ("command" is not null and "url" is null)
    or ("command" is null and "url" is not null)
  )
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
  "free" boolean not null default false,
  "created_at" timestamptz default CURRENT_TIMESTAMP not null,
  "updated_at" timestamptz default CURRENT_TIMESTAMP not null
);

CREATE INDEX IF NOT EXISTS "model_enabled_idx" ON "model" ("enabled");
CREATE INDEX IF NOT EXISTS "model_free_idx" ON "model" ("free");
CREATE INDEX IF NOT EXISTS "model_provider_id_idx" ON "model" ("provider_id");
