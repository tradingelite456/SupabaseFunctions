/*
  # Add blocked status to bot users

  1. Changes
    - Add `is_blocked` column to bot_users table
    - Default value is false for existing users
*/

ALTER TABLE bot_users ADD COLUMN IF NOT EXISTS is_blocked boolean DEFAULT false;

-- Create an index to help with filtering blocked users
CREATE INDEX IF NOT EXISTS bot_users_is_blocked_idx ON bot_users (bot_id, is_blocked);