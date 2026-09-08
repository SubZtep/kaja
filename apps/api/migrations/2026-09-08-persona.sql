CREATE TABLE IF NOT EXISTS "persona" (
  "id" uuid default uuidv7 () not null primary key,
  "persona_id" text not null unique,
  "label" text not null,
  "when" text,
  "instructions" text,
  "dataset" text,
  "models" jsonb not null default '{}',
  "sampling" jsonb not null default '{}',
  "enabled" boolean not null default true,
  "sort_order" integer not null default 0,
  "created_at" timestamptz default CURRENT_TIMESTAMP not null,
  "updated_at" timestamptz default CURRENT_TIMESTAMP not null
);

CREATE INDEX IF NOT EXISTS "persona_enabled_idx" ON "persona" ("enabled");
