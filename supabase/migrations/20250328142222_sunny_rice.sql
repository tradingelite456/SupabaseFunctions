/*
  # Add disable_web_page_preview option to messages

  1. Changes
    - Add `disable_web_page_preview` column to messages table
    - Default value is true to disable previews by default
*/

ALTER TABLE messages ADD COLUMN IF NOT EXISTS disable_web_page_preview boolean DEFAULT true;