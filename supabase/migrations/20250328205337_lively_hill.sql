/*
  # Fix link click statistics function

  1. Changes
    - Update get_link_click_stats function to correctly handle message links and CTR calculation
*/

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
           btn->>'url' as url
    FROM messages m,
         jsonb_array_elements(m.inline_keyboard->0) as btn
    WHERE m.bot_id = p_bot_id
    AND m.inline_keyboard IS NOT NULL
    AND btn->>'url' IS NOT NULL
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
    MAX(lc.clicked_at) as last_click
  FROM message_links ml
  LEFT JOIN link_clicks lc ON lc.url = ml.url 
    AND lc.clicked_at >= NOW() - (p_days || ' days')::interval
  GROUP BY ml.url;
END;
$$ LANGUAGE plpgsql;