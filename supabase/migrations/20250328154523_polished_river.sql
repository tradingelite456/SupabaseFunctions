/*
  # Add bot blocked status tracking

  1. Changes
    - Add `is_bot_blocked` column to bot_users table
    - Default value is false for existing users
    - Add index for efficient filtering
*/

ALTER TABLE bot_users ADD COLUMN IF NOT EXISTS is_bot_blocked boolean DEFAULT false;

-- Create an index to help with filtering blocked bots
CREATE INDEX IF NOT EXISTS bot_users_is_bot_blocked_idx ON bot_users (bot_id, is_bot_blocked);