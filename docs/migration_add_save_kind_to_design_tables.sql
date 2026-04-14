-- Multi-slot design library: save_kind distinguishes autosave vs milestone snapshots.
-- Run in Supabase SQL editor. status: autosave -> draft; milestones -> saved (or ordered for purchases).

ALTER TABLE badge_designs ADD COLUMN IF NOT EXISTS save_kind text;
ALTER TABLE sign_designs ADD COLUMN IF NOT EXISTS save_kind text;

UPDATE badge_designs
SET save_kind = 'manual'
WHERE save_kind IS NULL AND status IN ('saved', 'ordered');

UPDATE sign_designs
SET save_kind = 'manual'
WHERE save_kind IS NULL AND status IN ('saved', 'ordered');

ALTER TABLE badge_designs DROP CONSTRAINT IF EXISTS badge_designs_save_kind_check;
ALTER TABLE badge_designs ADD CONSTRAINT badge_designs_save_kind_check
  CHECK (save_kind IS NULL OR save_kind = ANY (ARRAY['autosave','manual','cart','ordered']));

ALTER TABLE sign_designs DROP CONSTRAINT IF EXISTS sign_designs_save_kind_check;
ALTER TABLE sign_designs ADD CONSTRAINT sign_designs_save_kind_check
  CHECK (save_kind IS NULL OR save_kind = ANY (ARRAY['autosave','manual','cart','ordered']));

CREATE INDEX IF NOT EXISTS idx_badge_designs_user_shop_updated
  ON badge_designs (user_id, shop_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_sign_designs_user_shop_updated
  ON sign_designs (user_id, shop_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_badge_designs_user_shop_save_kind
  ON badge_designs (user_id, shop_id, save_kind);

CREATE INDEX IF NOT EXISTS idx_sign_designs_user_shop_save_kind
  ON sign_designs (user_id, shop_id, save_kind);
