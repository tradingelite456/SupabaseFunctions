/*
  # Add update policy for bot_users table

  1. Changes
    - Add policy to allow users to update their bot users
    
  2. Security
    - Users can only update bot users for their own bots
*/

-- Create policy for updating bot users
CREATE POLICY "Users can update bot users for their bots"
  ON bot_users
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM bots
      WHERE bots.id = bot_users.bot_id
      AND bots.user_id = auth.uid()
    )
  );