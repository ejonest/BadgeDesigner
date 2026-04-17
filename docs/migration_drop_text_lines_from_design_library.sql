-- Line text lives in design_data (allBadges[].lines, badge.lines). text_lines was redundant.
-- Run in Supabase SQL editor after deploying app code that no longer reads/writes text_lines.

ALTER TABLE badge_designs DROP COLUMN IF EXISTS text_lines;
ALTER TABLE sign_designs DROP COLUMN IF EXISTS text_lines;
