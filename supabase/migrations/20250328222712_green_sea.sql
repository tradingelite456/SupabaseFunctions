/*
  # Fix Link Clicks Table

  1. Changes
    - Ensure link_clicks table exists with correct structure
    - Drop and recreate get_link_click_stats function to handle missing data gracefully
*/

-- Create link_clicks table if it doesn't exist
CREATE TABLE IF NOT EXISTS link_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id uuid NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  message_id uuid REFERENCES messages(id) ON DELETE CASCADE,
  bot_user_id uuid NOT NULL REFERENCES bot_users(id) ON DELETE CASCADE,
  url text NOT NULL,
  clicked_at timestamptz DEFAULT now(),
  user_id uuid NOT NULL REFERENCES auth.users(id)
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS link_clicks_bot_id_idx ON link_clicks (bot_id);
CREATE INDEX IF NOT EXISTS link_clicks_message_id_idx ON link_clicks (message_id);
CREATE INDEX IF NOT EXISTS link_clicks_bot_user_id_idx ON link_clicks (bot_user_id);
CREATE INDEX IF NOT EXISTS link_clicks_clicked_at_idx ON link_clicks (clicked_at);

-- Enable RLS
ALTER TABLE link_clicks ENABLE ROW LEVEL SECURITY;

-- Create policies for link_clicks table
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'link_clicks' AND policyname = 'Users can view link clicks for their bots'
  ) THEN
    CREATE POLICY "Users can view link clicks for their bots"
      ON link_clicks
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM bots
          WHERE bots.id = link_clicks.bot_id
          AND bots.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'link_clicks' AND policyname = 'Users can insert link clicks'
  ) THEN
    CREATE POLICY "Users can insert link clicks"
      ON link_clicks
      FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM bots
          WHERE bots.id = link_clicks.bot_id
          AND bots.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Drop and recreate the function to handle missing data gracefully
DROP FUNCTION IF EXISTS get_link_click_stats(uuid, integer);

CREATE OR REPLACE FUNCTION get_link_click_stats(p_bot_id uuid, p_days integer DEFAULT 30)
RETURNS TABLE (
  url text,
  total_clicks bigint,
  unique_users bigint,
  ctr numeric,
  first_click timestamptz,
  last_click timestamptz,
  is_extracted boolean
)
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Ensure the required tables exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'link_clicks') THEN
    RETURN QUERY SELECT 
      NULL::text,
      0::bigint,
      0::bigint,
      0::numeric,
      NULL::timestamptz,
      NULL::timestamptz,
      NULL::boolean
    WHERE false;
    RETURN;
  END IF;

  RETURN QUERY
  WITH message_links_all AS (
    -- Get all links (both inline buttons and extracted from content)
    SELECT 
      m.id as message_id,
      ml.url,
      ml.is_extracted
    FROM messages m
    LEFT JOIN message_links ml ON ml.message_id = m.id
    WHERE m.bot_id = p_bot_id
  ),
  message_views AS (
    SELECT bot_user_id
    FROM chat_messages
    WHERE bot_id = p_bot_id
    AND created_at >= NOW() - (p_days || ' days')::interval
    GROUP BY bot_user_id
  )
  SELECT 
    ml.url,
    COUNT(lc.id) as total_clicks,
    COUNT(DISTINCT lc.bot_user_id) as unique_users,
    ROUND(
      (COUNT(DISTINCT lc.bot_user_id)::numeric / NULLIF((SELECT COUNT(*) FROM message_views), 0)) * 100,
      2
    ) as ctr,
    MIN(lc.clicked_at) as first_click,
    MAX(lc.clicked_at) as last_click,
    ml.is_extracted
  FROM message_links_all ml
  LEFT JOIN link_clicks lc ON lc.url = ml.url 
    AND lc.clicked_at >= NOW() - (p_days || ' days')::interval
  GROUP BY ml.url, ml.is_extracted;
END;
$$ LANGUAGE plpgsql;