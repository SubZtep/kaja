CREATE TABLE IF NOT EXISTS "user" (
  id UUID DEFAULT uuidv7 () NOT NULL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  email_verified BOOLEAN NOT NULL,
  image TEXT,
  role TEXT,
  banned BOOLEAN,
  ban_reason TEXT,
  ban_expires TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS session (
  id UUID DEFAULT uuidv7 () NOT NULL PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL,
  token TEXT NOT NULL UNIQUE,
  ip_address TEXT,
  user_agent TEXT,
  impersonated_by UUID,
  user_id UUID NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS account (
  id UUID DEFAULT uuidv7 () NOT NULL PRIMARY KEY,
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  access_token TEXT,
  refresh_token TEXT,
  id_token TEXT,
  access_token_expires_at TIMESTAMPTZ,
  refresh_token_expires_at TIMESTAMPTZ,
  scope TEXT,
  password TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS verification (
  id UUID DEFAULT uuidv7 () NOT NULL PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS device_code (
  id UUID DEFAULT uuidv7 () NOT NULL PRIMARY KEY,
  device_code TEXT NOT NULL UNIQUE,
  user_code TEXT NOT NULL UNIQUE,
  user_id UUID REFERENCES "user" (id) ON DELETE CASCADE,
  client_id TEXT,
  scope TEXT,
  status TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  last_polled_at TIMESTAMPTZ,
  polling_interval INTEGER
);

CREATE INDEX IF NOT EXISTS session_user_id_idx ON session (user_id);

CREATE INDEX IF NOT EXISTS account_user_id_idx ON account (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS account_provider_id_account_id_idx ON account (provider_id, account_id);

CREATE INDEX IF NOT EXISTS verification_identifier_idx ON verification (identifier);

CREATE INDEX IF NOT EXISTS device_code_user_id_idx ON device_code (user_id);

CREATE INDEX IF NOT EXISTS device_code_expires_at_idx ON device_code (expires_at);
