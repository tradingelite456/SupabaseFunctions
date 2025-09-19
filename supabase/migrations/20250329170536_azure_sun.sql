/*
  # Add bot-avatars bucket

  1. Changes
    - Create a new storage bucket for bot avatars
    - Configure the bucket for permanent storage
    - Add appropriate security policies
*/

-- Create a new bucket for bot avatars
INSERT INTO storage.buckets (id, name, public)
VALUES ('bot-avatars', 'bot-avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policy to allow authenticated users to upload bot avatars
CREATE POLICY "Authenticated users can upload bot avatars"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'bot-avatars' AND
  auth.role() = 'authenticated'
);

-- Create storage policy to allow public access to bot avatars
CREATE POLICY "Public users can view bot avatars"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'bot-avatars');