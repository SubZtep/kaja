-- Add composite index for command timeout query optimization
-- This speeds up the query in CommandService.markTimeoutCommands()
-- which filters by status='executing' AND checks started_at with timeout
CREATE INDEX IF NOT EXISTS idx_command_status_started_at
  ON command(status, started_at)
  WHERE status = 'executing';

-- Add composite index for node cleanup query optimization
-- This speeds up the query in NodeService.markInactiveNodes()
-- which filters by status != 'inactive' AND checks last_seen
CREATE INDEX IF NOT EXISTS idx_node_status_last_seen
  ON node(status, last_seen)
  WHERE status != 'inactive';
