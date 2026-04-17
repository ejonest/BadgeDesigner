-- Optional: unique `design_id` lets you use Postgres ON CONFLICT in the future.
-- The app uses delete-then-insert on (user_id, shop_id, design_id) and does not
-- require this migration to function.
--
-- If this fails due to duplicate design_id values, dedupe first (keep newest per design_id).

CREATE UNIQUE INDEX IF NOT EXISTS badge_designs_design_id_key ON badge_designs (design_id);
CREATE UNIQUE INDEX IF NOT EXISTS sign_designs_design_id_key ON sign_designs (design_id);
