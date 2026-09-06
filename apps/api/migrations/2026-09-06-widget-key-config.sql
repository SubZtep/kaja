ALTER TABLE "widget_key" ADD COLUMN IF NOT EXISTS "config" jsonb not null default '{}';

UPDATE "widget_key" SET "config" = jsonb_build_object('persona', "persona") WHERE "persona" IS NOT NULL;

ALTER TABLE "widget_key" DROP COLUMN IF EXISTS "persona";
