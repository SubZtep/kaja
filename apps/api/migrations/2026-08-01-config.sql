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
