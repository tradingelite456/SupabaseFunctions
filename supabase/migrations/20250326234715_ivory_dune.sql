/*
  # Add function to count unread messages

  1. New Functions
    - `get_unread_messages_count`: Returns the count of unread messages per user
      - Parameters:
        - `p_bot_id`: The bot ID to count messages for
      - Returns: Table with bot_user_id and count columns
*/

CREATE OR REPLACE FUNCTION get_unread_messages_count(p_bot_id uuid)
RETURNS TABLE (bot_user_id uuid, count bigint) AS $$
BEGIN
  RETURN QUERY
  WITH last_read AS (
    SELECT DISTINCT ON (cm.bot_user_id)
      cm.bot_user_id,
      cm.created_at as last_read_at
    FROM chat_messages cm
    WHERE cm.bot_id = p_bot_id
      AND cm.is_from_user = false
    ORDER BY cm.bot_user_id, cm.created_at DESC
  )
  SELECT 
    cm.bot_user_id,
    COUNT(cm.id)::bigint
  FROM chat_messages cm
  LEFT JOIN last_read lr ON cm.bot_user_id = lr.bot_user_id
  WHERE cm.bot_id = p_bot_id
    AND cm.is_from_user = true
    AND (lr.last_read_at IS NULL OR cm.created_at > lr.last_read_at)
  GROUP BY cm.bot_user_id;
END;
$$ LANGUAGE plpgsql;