DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'account' AND column_name = 'issuer'
  ) THEN
    ALTER TABLE "account" ALTER COLUMN "issuer" DROP NOT NULL;
  END IF;
END $$;

DROP INDEX IF EXISTS "account_issuer_accountId_idx";

ALTER TABLE "account" DROP COLUMN IF EXISTS "issuer";

CREATE UNIQUE INDEX IF NOT EXISTS "account_providerId_accountId_idx" ON "account" ("providerId", "accountId");
