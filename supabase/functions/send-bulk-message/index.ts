import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { escapeMarkdownV2 } from "../utils/index.ts";

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
    const { bot_id, user_ids, message, image_url, inline_keyboard } = await req.json();
    
    if (!bot_id || !user_ids?.length || (!message && !image_url)) {
      return new Response(
        JSON.stringify({ error: "Missing required parameters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: bot, error: botError } = await supabaseClient
      .from("bots")
      .select("telegram_token, status")
      .eq("id", bot_id)
      .single();

    if (botError || !bot) {
      return new Response(
        JSON.stringify({ error: "Bot not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (bot.status !== "active") {
      return new Response(
        JSON.stringify({ error: "Bot is inactive" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results = [];

    for (const userId of user_ids) {
      try {
        // Send image if provided
        if (image_url) {
          const photoResponse = await fetch(
            `https://api.telegram.org/bot${bot.telegram_token}/sendPhoto`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: userId,
                photo: image_url,
                caption: message ? escapeMarkdownV2(message) : undefined,
                parse_mode: message ? "MarkdownV2" : undefined,
                reply_markup: inline_keyboard ? { inline_keyboard } : undefined
              })
            }
          );

          if (!photoResponse.ok) {
            throw new Error(await photoResponse.text());
          }
        } 
        // Send text message if no image or if there's both image and text
        else if (message) {
          const messageResponse = await fetch(
            `https://api.telegram.org/bot${bot.telegram_token}/sendMessage`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: userId,
                text: escapeMarkdownV2(message),
                parse_mode: "MarkdownV2",
                reply_markup: inline_keyboard ? { inline_keyboard } : undefined
              })
            }
          );

          if (!messageResponse.ok) {
            throw new Error(await messageResponse.text());
          }
        }

        results.push({
          user_id: userId,
          success: true
        });
      } catch (error) {
        results.push({
          user_id: userId,
          success: false,
          error: error.message
        });
      }
    }

    return new Response(
      JSON.stringify({ results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});