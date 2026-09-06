ALTER TABLE "account" ALTER COLUMN "issuer" DROP NOT NULL;

DROP INDEX IF EXISTS "account_issuer_accountId_idx";

ALTER TABLE "account" DROP COLUMN IF EXISTS "issuer";

CREATE UNIQUE INDEX IF NOT EXISTS "account_providerId_accountId_idx" ON "account" ("providerId", "accountId");
