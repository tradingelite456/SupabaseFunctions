/*
  # Add bot information columns

  1. Changes
    - Add `username` column to bots table
    - Add `photo_url` column to bots table
*/

ALTER TABLE bots 
ADD COLUMN IF NOT EXISTS username text,
ADD COLUMN IF NOT EXISTS photo_url text;