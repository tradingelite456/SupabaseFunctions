export interface Bot {
  id: string;
  name: string;
  telegram_token: string;
  status: 'active' | 'inactive';
  created_at: string;
  username?: string;
  photo_url?: string;
}

export interface InlineButton {
  text: string;
  url?: string;
  callback_data?: string;
}

export interface Message {
  id: string;
  bot_id: string;
  trigger: string;
  response_text: string;
  image_url?: string;
  order: number;
  delay: number;
  created_at: string;
  inline_keyboard?: InlineButton[][];
  disable_web_page_preview?: boolean;
}

export interface BotUser {
  id: string;
  bot_id: string;
  telegram_user_id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  created_at: string;
  last_interaction_at: string;
  is_blocked?: boolean;
  is_closed?: boolean;
  is_bot_blocked?: boolean;
  unread_count?: number;
}

export interface ChatMessage {
  id: string;
  bot_id: string;
  bot_user_id: string;
  content: string;
  is_from_user: boolean;
  created_at: string;
  bot_user?: BotUser;
}

export interface BulkMessagePayload {
  bot_id: string;
  user_ids: number[];
  message: string;
  image_url?: string;
  inline_keyboard?: InlineButton[][];
}