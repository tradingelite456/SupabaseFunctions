/*
  # Add Chat Messages Table

  1. New Tables
    - `chat_messages`
      - `id` (uuid, primary key)
      - `bot_id` (uuid, foreign key)
      - `bot_user_id` (uuid, foreign key)
      - `content` (text)
      - `is_from_user` (boolean)
      - `created_at` (timestamp)
    
  2. Security
    - Enable RLS
    - Add policies for authenticated users
*/

-- Create chat_messages table
CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id uuid NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  bot_user_id uuid NOT NULL REFERENCES bot_users(id) ON DELETE CASCADE,
  content text NOT NULL,
  is_from_user boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  user_id uuid NOT NULL REFERENCES auth.users(id)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS chat_messages_bot_user_id_created_at_idx 
  ON chat_messages (bot_user_id, created_at DESC);

-- Enable RLS
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Create policies for chat_messages table
CREATE POLICY "Users can view chat messages for their bots"
  ON chat_messages
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM bots
      WHERE bots.id = chat_messages.bot_id
      AND bots.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert chat messages"
  ON chat_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM bots
      WHERE bots.id = chat_messages.bot_id
      AND bots.user_id = auth.uid()
    )
  );