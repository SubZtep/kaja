CREATE TABLE IF NOT EXISTS "node" (
  "id" uuid default uuidv7 () not null primary key,
  "user_id" uuid not null references "user" ("id") on delete cascade,
  "name" text not null,
  "geo_location" jsonb,
  "status" text not null default 'idle',
  "last_seen" timestamptz default CURRENT_TIMESTAMP not null,
  "created_at" timestamptz default CURRENT_TIMESTAMP not null,
  "updated_at" timestamptz default CURRENT_TIMESTAMP not null,
  constraint "node_status_check" check ("status" in ('idle', 'busy', 'inactive'))
);

-- Command execution table
CREATE TABLE IF NOT EXISTS command (
  id uuid default uuidv7 () not null primary key,
  node_id UUID NOT NULL REFERENCES node (id) ON DELETE CASCADE,
  -- Command details
  command TEXT NOT NULL,
  args JSONB DEFAULT '{}',
  timeout_seconds INTEGER DEFAULT 300,
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN (
      'pending',
      'executing',
      'completed',
      'failed',
      'timeout'
    )
  ),
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  -- Results
  result JSONB,
  error TEXT,
  exit_code INTEGER,
  -- Metadata
  created_by UUID REFERENCES "user" (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "node_user_id_idx" ON "node" ("user_id");

CREATE INDEX IF NOT EXISTS "node_status_idx" ON "node" ("status");

CREATE INDEX IF NOT EXISTS "node_last_seen_idx" ON "node" ("last_seen");

CREATE INDEX IF NOT EXISTS idx_command_node_id ON command (node_id);

CREATE INDEX IF NOT EXISTS idx_command_status ON command (status);

CREATE INDEX IF NOT EXISTS idx_command_created_at ON command (created_at DESC);

-- Add composite index for command timeout query optimization
-- This speeds up the query in CommandService.markTimeoutCommands()
-- which filters by status='executing' AND checks started_at with timeout
CREATE INDEX IF NOT EXISTS idx_command_status_started_at ON command (status, started_at)
WHERE
  status = 'executing';

-- Add composite index for node cleanup query optimization
-- This speeds up the query in NodeService.markInactiveNodes()
-- which filters by status != 'inactive' AND checks last_seen
CREATE INDEX IF NOT EXISTS idx_node_status_last_seen ON node (status, last_seen)
WHERE
  status != 'inactive';
