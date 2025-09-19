import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { token } = await req.json();
    
    if (!token) {
      return new Response(
        JSON.stringify({ error: "Token is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Call Telegram API to get bot info
    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = await response.json();

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: "Invalid bot token" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get bot profile photos
    const photosResponse = await fetch(
      `https://api.telegram.org/bot${token}/getUserProfilePhotos?user_id=${data.result.id}&limit=1`
    );
    const photosData = await photosResponse.json();

    let photoUrl;
    if (photosData.ok && photosData.result.total_count > 0) {
      const fileId = photosData.result.photos[0][0].file_id;
      const fileResponse = await fetch(
        `https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`
      );
      const fileData = await fileResponse.json();
      
      if (fileData.ok) {
        const telegramPhotoUrl = `https://api.telegram.org/file/bot${token}/${fileData.result.file_path}`;
        
        // Initialize Supabase client
        const supabaseClient = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        try {
          // Fetch the photo
          const photoResponse = await fetch(telegramPhotoUrl);
          if (!photoResponse.ok) throw new Error('Failed to fetch photo');
          
          const photoBlob = await photoResponse.blob();
          const fileName = `bot-${data.result.id}-${Date.now()}.jpg`;

          // Upload to Supabase Storage
          const { data: uploadData, error: uploadError } = await supabaseClient.storage
            .from('bot-avatars')
            .upload(fileName, photoBlob, {
              contentType: 'image/jpeg',
              cacheControl: '31536000'
            });

          if (uploadError) throw uploadError;

          // Get public URL
          const { data: { publicUrl } } = supabaseClient.storage
            .from('bot-avatars')
            .getPublicUrl(fileName);

          photoUrl = publicUrl;
        } catch (error) {
          console.error('Error uploading bot avatar:', error);
          // Fall back to Telegram URL if upload fails
          photoUrl = telegramPhotoUrl;
        }
      }
    }

    return new Response(
      JSON.stringify({
        id: data.result.id,
        name: data.result.first_name,
        username: data.result.username,
        photo_url: photoUrl
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});