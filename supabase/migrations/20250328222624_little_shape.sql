/*
  # Disable RLS for link click stats function

  1. Changes
    - Add SECURITY DEFINER to get_link_click_stats function to bypass RLS
    - This allows the function to access all rows regardless of RLS policies
*/

-- Drop the existing function
DROP FUNCTION IF EXISTS get_link_click_stats(uuid, integer);

-- Recreate the function with SECURITY DEFINER
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