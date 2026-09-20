-- Personas are marketplace abilities now (type 'persona' in "ability"), picked per user like skills.
DROP TABLE IF EXISTS "persona";

-- Forget the last synced commit so the next sync brings the personas in.
UPDATE "marketplace_sync" SET "commit" = NULL WHERE "commit" IS NOT NULL;
