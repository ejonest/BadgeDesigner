-- Funnel / drop-off events from designer iframes (no PII).
-- Run in the Supabase SQL editor. Inserts are server-side (service role).

CREATE TABLE IF NOT EXISTS designer_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  tool TEXT NOT NULL,
  event TEXT NOT NULL,
  step TEXT,
  entry TEXT,
  duration_ms INTEGER,
  error_code TEXT,
  page_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_designer_events_created_at
  ON designer_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_designer_events_tool_event
  ON designer_events (tool, event);

CREATE INDEX IF NOT EXISTS idx_designer_events_session
  ON designer_events (session_id);

ALTER TABLE designer_events ENABLE ROW LEVEL SECURITY;
