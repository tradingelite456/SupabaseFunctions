/*
  # Add Message Link Tracking

  1. New Tables
    - `message_links`
      - `id` (uuid, primary key)
      - `message_id` (uuid, foreign key)
      - `url` (text)
      - `is_extracted` (boolean) - true if link was extracted from message content
    
  2. Functions
    - `extract_urls`: Extracts URLs from text content
    - `update_message_link_stats`: Updated link click statistics function
*/

-- Create message_links table to store all links (both inline and extracted)
CREATE TABLE IF NOT EXISTS message_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  url text NOT NULL,
  is_extracted boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS message_links_message_id_idx ON message_links (message_id);
CREATE INDEX IF NOT EXISTS message_links_url_idx ON message_links (url);

-- Enable RLS
ALTER TABLE message_links ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view message links for their messages"
  ON message_links
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM messages m
      JOIN bots b ON b.id = m.bot_id
      WHERE m.id = message_links.message_id
      AND b.user_id = auth.uid()
    )
  );

-- Function to extract URLs from text
CREATE OR REPLACE FUNCTION extract_urls(text_content text)
RETURNS TABLE (url text) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE
    -- Initial pattern match for URLs
    matches AS (
      SELECT (regexp_matches(text_content, 'https?://[^\s<>"]+|www\.[^\s<>"]+', 'g'))[1] AS url
    )
  SELECT DISTINCT m.url
  FROM matches m
  WHERE m.url IS NOT NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger function to automatically extract and store links from message content
CREATE OR REPLACE FUNCTION process_message_links()
RETURNS TRIGGER AS $$
BEGIN
  -- Extract and insert links from message content
  INSERT INTO message_links (message_id, url, is_extracted)
  SELECT NEW.id, url, true
  FROM extract_urls(NEW.response_text);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER extract_message_links
  AFTER INSERT OR UPDATE OF response_text
  ON messages
  FOR EACH ROW
  EXECUTE FUNCTION process_message_links();

-- Update the link statistics function to include extracted links
CREATE OR REPLACE FUNCTION get_link_click_stats(p_bot_id uuid, p_days integer DEFAULT 30)
RETURNS TABLE (
  url text,
  total_clicks bigint,
  unique_users bigint,
  ctr numeric,
  first_click timestamptz,
  last_click timestamptz,
  is_extracted boolean
) AS $$
BEGIN
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