CREATE TABLE IF NOT EXISTS "node" (
  "id" uuid default uuidv7() not null primary key,
  "name" text not null,
  "ip" inet,
  "geo" jsonb,
  "status" text not null default 'idle',
  "last_seen" timestamptz default CURRENT_TIMESTAMP not null,
  "created_at" timestamptz default CURRENT_TIMESTAMP not null,
  "updated_at" timestamptz default CURRENT_TIMESTAMP not null,
  constraint "node_status_check" check ("status" in ('idle', 'busy', 'inactive'))
);

CREATE INDEX IF NOT EXISTS "node_status_idx" ON "node" ("status");
CREATE INDEX IF NOT EXISTS "node_last_seen_idx" ON "node" ("last_seen");
