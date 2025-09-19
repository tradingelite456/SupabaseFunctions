/*
  # Add inline keyboard support to messages

  1. Changes
    - Add `inline_keyboard` column to messages table to store button configurations
*/

ALTER TABLE messages ADD COLUMN IF NOT EXISTS inline_keyboard jsonb;

-- Create an index for faster JSON operations
CREATE INDEX IF NOT EXISTS messages_inline_keyboard_idx ON messages USING gin(inline_keyboard);