-- Better Auth's tables, snake_cased (auth.ts maps its camelCase fields to these columns).
CREATE TABLE IF NOT EXISTS "user" (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  email_verified boolean NOT NULL,
  image text,
  role text,
  banned boolean,
  ban_reason text,
  ban_expires timestamptz,
  -- When they confirmed they're 18+, accepted the Terms and Privacy Policy, and gave explicit consent to health data (UK GDPR Art. 9); set on sign-up
  consented_at timestamptz,
  -- The language picked in any client (web picker, TUI); read by the Telegram bot and emails. NULL until a client sets it; the API validates it against @kaja/shared/locale locales
  locale text,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS session (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  expires_at timestamptz NOT NULL,
  token text NOT NULL UNIQUE,
  ip_address text,
  user_agent text,
  impersonated_by uuid,
  user_id uuid NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS session_user_id_idx ON session (user_id);

CREATE TABLE IF NOT EXISTS account (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  account_id text NOT NULL,
  provider_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  password text,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS account_user_id_idx ON account (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS account_provider_id_account_id_idx ON account (provider_id, account_id);

CREATE TABLE IF NOT EXISTS verification (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  identifier text NOT NULL,
  value text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS verification_identifier_idx ON verification (identifier);

CREATE TABLE IF NOT EXISTS device_code (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  device_code text NOT NULL UNIQUE,
  user_code text NOT NULL UNIQUE,
  user_id uuid REFERENCES "user" (id) ON DELETE CASCADE,
  client_id text,
  scope text,
  status text NOT NULL,
  expires_at timestamptz NOT NULL,
  last_polled_at timestamptz,
  polling_interval integer
);

CREATE INDEX IF NOT EXISTS device_code_user_id_idx ON device_code (user_id);
CREATE INDEX IF NOT EXISTS device_code_expires_at_idx ON device_code (expires_at);
