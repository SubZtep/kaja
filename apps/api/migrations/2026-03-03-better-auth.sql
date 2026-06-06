CREATE TABLE IF NOT EXISTS "user" (
  "id" UUID DEFAULT uuidv7 () NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "emailVerified" BOOLEAN NOT NULL,
  "image" TEXT,
  "role" TEXT,
  "banned" BOOLEAN,
  "banReason" TEXT,
  "banExpires" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS "session" (
  "id" UUID DEFAULT uuidv7 () NOT NULL PRIMARY KEY,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "impersonatedBy" UUID,
  "userId" UUID NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS "account" (
  "id" UUID DEFAULT uuidv7 () NOT NULL PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "userId" UUID NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" TIMESTAMPTZ,
  "refreshTokenExpiresAt" TIMESTAMPTZ,
  "scope" TEXT,
  "password" TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS "verification" (
  "id" UUID DEFAULT uuidv7 () NOT NULL PRIMARY KEY,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS "deviceCode" (
  "id" UUID DEFAULT uuidv7 () NOT NULL PRIMARY KEY,
  "deviceCode" TEXT NOT NULL UNIQUE,
  "userCode" TEXT NOT NULL UNIQUE,
  "userId" UUID REFERENCES "user" ("id") ON DELETE CASCADE,
  "clientId" TEXT,
  "scope" TEXT,
  "status" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "lastPolledAt" TIMESTAMPTZ,
  "pollingInterval" INTEGER
);

CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "session" ("userId");

CREATE INDEX IF NOT EXISTS "account_userId_idx" ON "account" ("userId");

CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "verification" ("identifier");

CREATE INDEX IF NOT EXISTS "deviceCode_userId_idx" ON "deviceCode" ("userId");

CREATE INDEX IF NOT EXISTS "deviceCode_expiresAt_idx" ON "deviceCode" ("expiresAt");
