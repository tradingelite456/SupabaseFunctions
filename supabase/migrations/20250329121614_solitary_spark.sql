/*
  # Add message delay customization

  1. Changes
    - Add `delay` column to messages table
    - Default value is 3000 milliseconds (3 seconds)
*/

ALTER TABLE messages ADD COLUMN IF NOT EXISTS delay integer DEFAULT 3000;