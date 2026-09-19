-- Personas are marketplace packages now (type 'persona' in "package"), picked per user like skills.
DROP TABLE IF EXISTS "persona";

-- Forget the last synced commit so the next sync brings the personas in.
UPDATE "marketplace_sync" SET "commit" = NULL WHERE "commit" IS NOT NULL;
