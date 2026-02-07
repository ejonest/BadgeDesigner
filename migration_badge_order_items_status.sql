-- Add status column to badge_order_items for draft -> order_placed -> fulfilled flow.
-- Run in Supabase: SQL Editor -> New query -> paste and Run.

ALTER TABLE public.badge_order_items
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft'
  CHECK (status IN ('draft', 'order_placed', 'fulfilled'));

CREATE INDEX IF NOT EXISTS idx_badge_order_items_status
  ON public.badge_order_items(status)
  WHERE status = 'draft';
