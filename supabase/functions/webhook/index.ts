import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { escapeMarkdownV2 } from "../utils/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Function to check if a message is a command
function isTelegramCommand(text: string): boolean {
  return text.startsWith('/');
}

// Function to extract URLs from text
function extractUrls(text: string): string[] {
  const urlRegex = /(https?:\/\/[^\s<>"]+|www\.[^\s<>"]+)/g;
  return text.match(urlRegex) || [];
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    console.log("Received webhook payload:", payload);
    
    const url = new URL(req.url);
    const botToken = url.searchParams.get('token');
    
    if (!botToken) {
      console.error("No bot token provided in URL");
      return new Response(
        JSON.stringify({ error: "Bot token is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: bot, error: botError } = await supabaseClient
      .from("bots")
      .select("id, telegram_token, user_id")
      .eq("telegram_token", botToken)
      .eq("status", "active")
      .single();

    if (botError || !bot) {
      console.error("Bot not found or inactive:", botError);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle link clicks from text messages
    if (payload.message?.entities) {
      const messageEntities = payload.message.entities;
      const messageText = payload.message.text;
      
      for (const entity of messageEntities) {
        if (entity.type === 'url' || entity.type === 'text_link') {
          const url = entity.type === 'url' 
            ? messageText.slice(entity.offset, entity.offset + entity.length)
            : entity.url;

          // Get or create bot user
          const { data: botUser } = await supabaseClient
            .from("bot_users")
            .select("id")
            .eq("bot_id", bot.id)
            .eq("telegram_user_id", payload.message.from.id)
            .single();

          if (botUser) {
            // Record the link click
            await supabaseClient
              .from("link_clicks")
              .insert({
                bot_id: bot.id,
                bot_user_id: botUser.id,
                url: url,
                user_id: bot.user_id
              });
          }
        }
      }
    }

    // Handle callback queries (button clicks)
    if (payload.callback_query) {
      const callbackData = payload.callback_query.data;
      const chatId = payload.callback_query.message.chat.id;
      
      console.log("Processing callback query:", callbackData, "from chat:", chatId);

      // Store or update user information
      if (payload.callback_query.from) {
        const { id: telegram_user_id, username, first_name, last_name } = payload.callback_query.from;
        
        // Upsert user information
        const { data: botUser, error: userError } = await supabaseClient
          .from("bot_users")
          .upsert({
            bot_id: bot.id,
            telegram_user_id,
            username,
            first_name,
            last_name,
            last_interaction_at: new Date().toISOString(),
            is_bot_blocked: false,
            is_closed: false,
            user_id: bot.user_id
          }, {
            onConflict: 'bot_id,telegram_user_id'
          })
          .select()
          .single();

        if (userError) {
          console.error("Error storing user information:", userError);
        }
      }

      // Check if there are messages configured for this callback data
      const { data: messages, error: messagesError } = await supabaseClient
        .from("messages")
        .select("id, response_text, image_url, inline_keyboard, disable_web_page_preview, delay")
        .eq("bot_id", bot.id)
        .eq("trigger", callbackData)
        .order("order", { ascending: true });

      // Send response messages if found
      if (!messagesError && messages?.length > 0) {
        console.log(`Found ${messages.length} matching messages for callback data: ${callbackData}`);
        
        // Send each message with its custom delay
        for (let i = 0; i < messages.length; i++) {
          if (i > 0) {
            // Use the delay from the previous message
            const delay = messages[i - 1].delay || 3000;
            await sleep(delay);
          }

          const message = messages[i];

          try {
            // Send image if available
            if (message.image_url) {
              const photoResponse = await fetch(
                `https://api.telegram.org/bot${bot.telegram_token}/sendPhoto`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    chat_id: chatId,
                    photo: message.image_url,
                    caption: message.response_text ? escapeMarkdownV2(message.response_text) : undefined,
                    parse_mode: message.response_text ? "MarkdownV2" : undefined,
                    reply_markup: message.inline_keyboard ? { inline_keyboard: message.inline_keyboard } : undefined,
                    disable_web_page_preview: message.disable_web_page_preview
                  })
                }
              );

              if (!photoResponse.ok) {
                const errorText = await photoResponse.text();
                console.error("Telegram API error (photo):", errorText);
                throw new Error(errorText);
              }
            }
            // Send text message if no image
            else if (message.response_text) {
              const messageResponse = await fetch(
                `https://api.telegram.org/bot${bot.telegram_token}/sendMessage`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    chat_id: chatId,
                    text: escapeMarkdownV2(message.response_text),
                    parse_mode: "MarkdownV2",
                    reply_markup: message.inline_keyboard ? { inline_keyboard: message.inline_keyboard } : undefined,
                    disable_web_page_preview: message.disable_web_page_preview
                  })
                }
              );

              if (!messageResponse.ok) {
                const errorText = await messageResponse.text();
                console.error("Telegram API error (message):", errorText);
                throw new Error(errorText);
              }
            }
          } catch (error) {
            console.error("Error sending callback response message:", error);
          }
        }
      } else {
        console.log("No messages found for callback data:", callbackData);
      }

      // Answer callback query to remove loading state
      await fetch(
        `https://api.telegram.org/bot${botToken}/answerCallbackQuery`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            callback_query_id: payload.callback_query.id,
            text: messages?.length > 0 ? undefined : "Action reçue !"
          })
        }
      );

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if the user has blocked the bot
    if (payload.my_chat_member?.new_chat_member?.status === 'kicked') {
      const telegram_user_id = payload.my_chat_member.from.id;
      
      const { error: updateError } = await supabaseClient
        .from("bot_users")
        .update({ 
          is_bot_blocked: true,
          last_interaction_at: new Date().toISOString()
        })
        .eq("bot_id", bot.id)
        .eq("telegram_user_id", telegram_user_id);

      if (updateError) {
        console.error("Error updating bot blocked status:", updateError);
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if the user has unblocked the bot
    if (payload.my_chat_member?.new_chat_member?.status === 'member') {
      const telegram_user_id = payload.my_chat_member.from.id;
      
      const { error: updateError } = await supabaseClient
        .from("bot_users")
        .update({ 
          is_bot_blocked: false,
          last_interaction_at: new Date().toISOString()
        })
        .eq("bot_id", bot.id)
        .eq("telegram_user_id", telegram_user_id);

      if (updateError) {
        console.error("Error updating bot blocked status:", updateError);
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!payload.message?.text || !payload.message?.chat?.id) {
      return new Response(
        JSON.stringify({ error: "Invalid Telegram message" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const chatId = payload.message.chat.id;
    const messageText = payload.message.text;
    console.log("Processing message:", messageText, "from chat:", chatId, "for bot token:", botToken);

    // Store or update user information when they interact with the bot
    if (payload.message.from) {
      const { id: telegram_user_id, username, first_name, last_name } = payload.message.from;
      
      // Upsert user information
      const { data: botUser, error: userError } = await supabaseClient
        .from("bot_users")
        .upsert({
          bot_id: bot.id,
          telegram_user_id,
          username,
          first_name,
          last_name,
          last_interaction_at: new Date().toISOString(),
          is_bot_blocked: false,
          is_closed: false,
          user_id: bot.user_id
        }, {
          onConflict: 'bot_id,telegram_user_id'
        })
        .select()
        .single();

      if (userError) {
        console.error("Error storing user information:", userError);
      } else if (botUser && !isTelegramCommand(messageText)) {
        // Store the incoming message only if it's not a command
        const { error: messageError } = await supabaseClient
          .from("chat_messages")
          .insert({
            bot_id: bot.id,
            bot_user_id: botUser.id,
            content: messageText,
            is_from_user: true,
            user_id: bot.user_id
          });

        if (messageError) {
          console.error("Error storing chat message:", messageError);
        }
      }
    }

    // Get all messages for this trigger, ordered by the order field
    const { data: messages, error: messagesError } = await supabaseClient
      .from("messages")
      .select("id, response_text, image_url, inline_keyboard, disable_web_page_preview, delay")
      .eq("bot_id", bot.id)
      .eq("trigger", messageText)
      .order("order", { ascending: true });

    if (messagesError || !messages?.length) {
      console.log("No matching messages found for bot:", bot.id);
      return new Response(
        JSON.stringify({ message: "No matching trigger found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${messages.length} matching messages, sending responses`);

    // Send each message with its custom delay
    for (let i = 0; i < messages.length; i++) {
      if (i > 0) {
        // Use the delay from the previous message
        const delay = messages[i - 1].delay || 3000;
        await sleep(delay);
      }

      const message = messages[i];

      try {
        // Send image if available
        if (message.image_url) {
          const photoResponse = await fetch(
            `https://api.telegram.org/bot${bot.telegram_token}/sendPhoto`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: chatId,
                photo: message.image_url,
                caption: message.response_text ? escapeMarkdownV2(message.response_text) : undefined,
                parse_mode: message.response_text ? "MarkdownV2" : undefined,
                reply_markup: message.inline_keyboard ? { inline_keyboard: message.inline_keyboard } : undefined,
                disable_web_page_preview: message.disable_web_page_preview
              })
            }
          );

          if (!photoResponse.ok) {
            const errorText = await photoResponse.text();
            console.error("Telegram API error (photo):", errorText);
            throw new Error(errorText);
          }
        }
        // Send text message if no image
        else if (message.response_text) {
          const messageResponse = await fetch(
            `https://api.telegram.org/bot${bot.telegram_token}/sendMessage`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: chatId,
                text: escapeMarkdownV2(message.response_text),
                parse_mode: "MarkdownV2",
                reply_markup: message.inline_keyboard ? { inline_keyboard: message.inline_keyboard } : undefined,
                disable_web_page_preview: message.disable_web_page_preview
              })
            }
          );

          if (!messageResponse.ok) {
            const errorText = await messageResponse.text();
            console.error("Telegram API error (message):", errorText);
            throw new Error(errorText);
          }
        }
      } catch (error) {
        console.error("Error sending message:", error);
        return new Response(
          JSON.stringify({ error: "Failed to send message", details: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    console.log("Successfully sent all responses to Telegram");
    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error processing webhook:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
