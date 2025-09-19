/*
  # Add order field to messages table

  1. Changes
    - Add `order` column to messages table to support multiple messages per trigger
    - Default order to 0 for existing messages
*/

ALTER TABLE messages ADD COLUMN IF NOT EXISTS "order" integer DEFAULT 0;

-- Create an index to help with ordering
CREATE INDEX IF NOT EXISTS messages_bot_id_trigger_order_idx ON messages (bot_id, trigger, "order");