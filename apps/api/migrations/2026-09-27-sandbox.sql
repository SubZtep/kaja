-- MCP sandboxes people run themselves (apps/sandbox): each connects out to the API over a WebSocket and registers here.
-- user_id null and official false is an anonymous sandbox, shared with everyone; official is the operator's own box (SANDBOX_SYSTEM_KEY).
CREATE TABLE IF NOT EXISTS "sandbox" (
  "id" uuid default uuidv7() primary key,
  "user_id" uuid references "user" ("id") on delete cascade,
  "official" boolean default false not null,
  -- sha256 of the secret the sandbox got on its first connect, which it sends back to come back as this row
  "secret_hash" text not null,
  "name" text,
  "online" boolean default false not null,
  "connected_at" timestamptz,
  "last_seen_at" timestamptz,
  "ip" inet,
  -- the geolocation service's whole answer for the ip; the columns below are picked out of it for routing and display
  "geo" jsonb,
  "country" text,
  "country_code" text,
  "city" text,
  "latitude" double precision,
  "longitude" double precision,
  -- the hello frame (version, arch, os, cpu, memory, maxProcesses, abilities) and the latest heartbeat (running, load, memoryUsed)
  "info" jsonb,
  "load" jsonb,
  "created_at" timestamptz default CURRENT_TIMESTAMP not null
);

CREATE INDEX IF NOT EXISTS "sandbox_user_id_idx" ON "sandbox" ("user_id");
CREATE INDEX IF NOT EXISTS "sandbox_online_idx" ON "sandbox" ("online") WHERE "online";

-- A user's sandbox settings and the key their sandboxes connect with (stored as sha256; shown once when made).
CREATE TABLE IF NOT EXISTS "sandbox_owner" (
  "user_id" uuid primary key references "user" ("id") on delete cascade,
  "key_hash" text unique,
  "key_created_at" timestamptz,
  -- others may use this user's sandboxes
  "share" boolean default true not null,
  -- this user's turns may run in other people's sandboxes (whose operators can see that traffic)
  "use_shared" boolean default false not null
);

-- Every heartbeat (about one a minute) of every sandbox, kept 7 days (hourly cron), for its load chart.
CREATE TABLE IF NOT EXISTS "sandbox_sample" (
  "sandbox_id" uuid not null references "sandbox" ("id") on delete cascade,
  "at" timestamptz default CURRENT_TIMESTAMP not null,
  "running" integer not null,
  "load" real not null,
  "memory_used" bigint not null,
  PRIMARY KEY ("sandbox_id", "at")
);
