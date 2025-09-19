export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      bots: {
        Row: {
          id: string
          name: string
          telegram_token: string
          status: string
          created_at: string
          user_id: string
          username: string | null
          photo_url: string | null
        }
        Insert: {
          id?: string
          name: string
          telegram_token: string
          status?: string
          created_at?: string
          user_id: string
          username?: string | null
          photo_url?: string | null
        }
        Update: {
          id?: string
          name?: string
          telegram_token?: string
          status?: string
          created_at?: string
          user_id?: string
          username?: string | null
          photo_url?: string | null
        }
      }
      messages: {
        Row: {
          id: string
          bot_id: string
          trigger: string
          response_text: string
          created_at: string
          user_id: string
        }
        Insert: {
          id?: string
          bot_id: string
          trigger: string
          response_text: string
          created_at?: string
          user_id: string
        }
        Update: {
          id?: string
          bot_id?: string
          trigger?: string
          response_text?: string
          created_at?: string
          user_id?: string
        }
      }
    }
  }
}