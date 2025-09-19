/*
  # Initial Schema Setup for Telegram Bot Manager

  1. New Tables
    - `bots`
      - `id` (uuid, primary key)
      - `name` (text)
      - `telegram_token` (text)
      - `status` (text)
      - `created_at` (timestamp)
    - `messages`
      - `id` (uuid, primary key)
      - `bot_id` (uuid, foreign key)
      - `trigger` (text)
      - `response_text` (text)
      - `created_at` (timestamp)
    
  2. Security
    - Enable RLS on both tables
    - Add policies for authenticated users
*/

-- Create bots table
CREATE TABLE IF NOT EXISTS bots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  telegram_token text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  user_id uuid NOT NULL REFERENCES auth.users(id)
);

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id uuid NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  trigger text NOT NULL,
  response_text text NOT NULL,
  created_at timestamptz DEFAULT now(),
  user_id uuid NOT NULL REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE bots ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Create policies for bots table
CREATE POLICY "Users can create their own bots"
  ON bots
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own bots"
  ON bots
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own bots"
  ON bots
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own bots"
  ON bots
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create policies for messages table
CREATE POLICY "Users can create messages for their bots"
  ON messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM bots
      WHERE bots.id = messages.bot_id
      AND bots.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view messages for their bots"
  ON messages
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM bots
      WHERE bots.id = messages.bot_id
      AND bots.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update messages for their bots"
  ON messages
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM bots
      WHERE bots.id = messages.bot_id
      AND bots.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete messages for their bots"
  ON messages
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM bots
      WHERE bots.id = messages.bot_id
      AND bots.user_id = auth.uid()
    )
  );