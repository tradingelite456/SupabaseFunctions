/*
  # Add image support to messages and bulk messages

  1. Changes
    - Add `image_url` column to messages table
    - Create storage bucket for message images
*/

-- Create a new bucket for message images
INSERT INTO storage.buckets (id, name, public)
VALUES ('message-images', 'message-images', true);

-- Create storage policy to allow authenticated users to upload images
CREATE POLICY "Authenticated users can upload message images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'message-images' AND
  auth.role() = 'authenticated'
);

-- Create storage policy to allow public access to message images
CREATE POLICY "Public users can view message images"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'message-images');

-- Add image_url column to messages table
ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_url text;