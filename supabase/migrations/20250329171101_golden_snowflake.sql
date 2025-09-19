/*
  # Add function to check if message is a command
  
  1. New Functions
    - `is_telegram_command`: Checks if a message starts with "/"
*/

-- Create function to check if a message is a command
CREATE OR REPLACE FUNCTION is_telegram_command(message text)
RETURNS boolean AS $$
BEGIN
  RETURN message LIKE '/%';
END;
$$ LANGUAGE plpgsql;

-- Add policy to chat_messages to prevent storing commands
ALTER TABLE chat_messages
ADD CONSTRAINT prevent_command_storage
CHECK (NOT (is_from_user AND is_telegram_command(content)));