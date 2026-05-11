CREATE TABLE IF NOT EXISTS "node" (
  "id" uuid default uuidv7() not null primary key,
  "user_id" uuid not null references "user"("id") on delete cascade,
  "name" text not null,
  "geo_location" jsonb,
  "status" text not null default 'idle',
  "last_seen" timestamptz default CURRENT_TIMESTAMP not null,
  "created_at" timestamptz default CURRENT_TIMESTAMP not null,
  "updated_at" timestamptz default CURRENT_TIMESTAMP not null,
  constraint "node_status_check" check ("status" in ('idle', 'busy', 'inactive'))
);

CREATE INDEX IF NOT EXISTS "node_user_id_idx" ON "node" ("user_id");
CREATE INDEX IF NOT EXISTS "node_status_idx" ON "node" ("status");
CREATE INDEX IF NOT EXISTS "node_last_seen_idx" ON "node" ("last_seen");
