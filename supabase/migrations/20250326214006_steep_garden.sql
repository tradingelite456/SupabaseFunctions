/*
  # Add Bot Users Table

  1. New Tables
    - `bot_users`
      - `id` (uuid, primary key)
      - `bot_id` (uuid, foreign key)
      - `telegram_user_id` (bigint)
      - `username` (text)
      - `first_name` (text)
      - `last_name` (text)
      - `created_at` (timestamp)
      - `last_interaction_at` (timestamp)
    
  2. Security
    - Enable RLS
    - Add policies for authenticated users
*/

-- Create bot_users table
CREATE TABLE IF NOT EXISTS bot_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id uuid NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  telegram_user_id bigint NOT NULL,
  username text,
  first_name text,
  last_name text,
  created_at timestamptz DEFAULT now(),
  last_interaction_at timestamptz DEFAULT now(),
  user_id uuid NOT NULL REFERENCES auth.users(id)
);

-- Create unique constraint for bot_id and telegram_user_id
CREATE UNIQUE INDEX IF NOT EXISTS bot_users_bot_id_telegram_user_id_idx 
  ON bot_users (bot_id, telegram_user_id);

-- Enable RLS
ALTER TABLE bot_users ENABLE ROW LEVEL SECURITY;

-- Create policies for bot_users table
CREATE POLICY "Users can view bot users for their bots"
  ON bot_users
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM bots
      WHERE bots.id = bot_users.bot_id
      AND bots.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can insert bot users"
  ON bot_users
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM bots
      WHERE bots.id = bot_users.bot_id
      AND bots.user_id = auth.uid()
    )
  );