ALTER TABLE IF EXISTS "widget_key" RENAME TO "widget";

ALTER INDEX IF EXISTS "widget_key_user_id_idx" RENAME TO "widget_user_id_idx";
ALTER INDEX IF EXISTS "widget_key_key_hash_idx" RENAME TO "widget_key_hash_idx";
ALTER INDEX IF EXISTS "widget_key_key_hash_key" RENAME TO "widget_key_hash_key";
