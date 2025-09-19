/*
  # Add Link Tracking Support

  1. New Tables
    - `link_clicks`
      - `id` (uuid, primary key)
      - `bot_id` (uuid, foreign key)
      - `message_id` (uuid, foreign key)
      - `bot_user_id` (uuid, foreign key)
      - `url` (text)
      - `clicked_at` (timestamp)
      - `user_id` (uuid, foreign key)
    
  2. Security
    - Enable RLS
    - Add policies for authenticated users
*/

-- Create link_clicks table
CREATE TABLE IF NOT EXISTS link_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id uuid NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
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
CREATE POLICY "Users can view link clicks for their bots"
  ON link_clicks
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM bots
      WHERE bots.id = link_clicks.bot_id
      AND bots.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert link clicks"
  ON link_clicks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM bots
      WHERE bots.id = link_clicks.bot_id
      AND bots.user_id = auth.uid()
    )
  );

-- Create function to get link click statistics
CREATE OR REPLACE FUNCTION get_link_click_stats(p_bot_id uuid, p_days integer DEFAULT 30)
RETURNS TABLE (
  url text,
  total_clicks bigint,
  unique_users bigint,
  ctr numeric,
  first_click timestamptz,
  last_click timestamptz
) AS $$
BEGIN
  RETURN QUERY
  WITH message_links AS (
    SELECT DISTINCT m.id as message_id, 
           jsonb_array_elements(m.inline_keyboard->>0)->>'url' as url
    FROM messages m
    WHERE m.bot_id = p_bot_id
    AND m.inline_keyboard IS NOT NULL
  ),
  message_views AS (
    SELECT bot_user_id, COUNT(DISTINCT message_id) as view_count
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
      (COUNT(DISTINCT lc.bot_user_id)::numeric / NULLIF(COUNT(DISTINCT mv.bot_user_id), 0)) * 100,
      2
    ) as ctr,
    MIN(lc.clicked_at) as first_click,
    MAX(lc.clicked_at) as last_click
  FROM message_links ml
  LEFT JOIN link_clicks lc ON lc.url = ml.url 
    AND lc.clicked_at >= NOW() - (p_days || ' days')::interval
  LEFT JOIN message_views mv ON mv.bot_user_id = lc.bot_user_id
  GROUP BY ml.url;
END;
$$ LANGUAGE plpgsql;