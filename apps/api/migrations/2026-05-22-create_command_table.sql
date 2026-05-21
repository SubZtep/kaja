-- Command execution table
CREATE TABLE IF NOT EXISTS command (
  id uuid default uuidv7() not null primary key,
  node_id UUID NOT NULL REFERENCES node(id) ON DELETE CASCADE,

  -- Command details
  command TEXT NOT NULL,
  args JSONB DEFAULT '{}',
  timeout_seconds INTEGER DEFAULT 300,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'executing', 'completed', 'failed', 'timeout')),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Results
  result JSONB,
  error TEXT,
  exit_code INTEGER,

  -- Metadata
  created_by UUID REFERENCES "user"(id) ON DELETE SET NULL
);

CREATE INDEX idx_command_node_id ON command(node_id);
CREATE INDEX idx_command_status ON command(status);
CREATE INDEX idx_command_created_at ON command(created_at DESC);
