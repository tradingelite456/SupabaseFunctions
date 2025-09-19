import React, { useState, useEffect, useRef } from 'react';
import { Send, ArrowLeft, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Bot, BotUser, ChatMessage } from '../types';
import { toast } from 'react-hot-toast';

interface ChatProps {
  bot: Bot;
  onUnreadCountChange: (count: number) => void;
}

export function Chat({ bot, onUnreadCountChange }: ChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [users, setUsers] = useState<BotUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<BotUser | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    fetchUsers();
    fetchUnreadCounts();

    // Subscribe to new messages for unread counts
    const messagesSubscription = supabase
      .channel('chat-messages-all')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `bot_id=eq.${bot.id}`
      }, (payload) => {
        const newMessage = payload.new as ChatMessage;
        if (newMessage.is_from_user && newMessage.bot_user_id !== selectedUser?.id) {
          setUnreadCounts(prev => {
            const newCounts = {
              ...prev,
              [newMessage.bot_user_id]: (prev[newMessage.bot_user_id] || 0) + 1
            };
            // Update total unread count
            const total = Object.values(newCounts).reduce((sum, count) => sum + count, 0);
            onUnreadCountChange(total);
            return newCounts;
          });
        }
      })
      .subscribe();

    const usersSubscription = supabase
      .channel('bot-users')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'bot_users',
        filter: `bot_id=eq.${bot.id}`
      }, () => {
        fetchUsers();
      })
      .subscribe();

    return () => {
      messagesSubscription.unsubscribe();
      usersSubscription.unsubscribe();
    };
  }, [bot.id, selectedUser?.id]);

  useEffect(() => {
    if (selectedUser) {
      fetchMessages();
      // Mark messages as read when selecting a user
      markMessagesAsRead();
      setUnreadCounts(prev => {
        const newCounts = {
          ...prev,
          [selectedUser.id]: 0
        };
        // Update total unread count
        const total = Object.values(newCounts).reduce((sum, count) => sum + count, 0);
        onUnreadCountChange(total);
        return newCounts;
      });

      const messagesSubscription = supabase
        .channel(`chat-messages-${selectedUser.id}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `bot_user_id=eq.${selectedUser.id}`
        }, (payload) => {
          const newMessage = payload.new as ChatMessage;
          setMessages(prev => [...prev, newMessage]);
        })
        .subscribe();

      return () => {
        messagesSubscription.unsubscribe();
      };
    }
  }, [selectedUser?.id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchUnreadCounts = async () => {
    try {
      const { data, error } = await supabase
        .rpc('get_unread_messages_count', {
          p_bot_id: bot.id
        });

      if (error) throw error;

      const counts: Record<string, number> = {};
      if (Array.isArray(data)) {
        data.forEach(item => {
          counts[item.bot_user_id] = parseInt(item.count);
        });
      }
      setUnreadCounts(counts);
      // Update total unread count
      const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
      onUnreadCountChange(total);
    } catch (error) {
      console.error('Error fetching unread counts:', error);
    }
  };

  const markMessagesAsRead = async () => {
    if (!selectedUser) return;

    try {
      const timestamp = new Date().toISOString();
      const { error } = await supabase
        .from('chat_messages')
        .insert({
          bot_id: bot.id,
          bot_user_id: selectedUser.id,
          content: '__read__',
          is_from_user: false,
          user_id: (await supabase.auth.getUser()).data.user?.id
        });

      if (error) throw error;
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  };

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('bot_users')
        .select('*')
        .eq('bot_id', bot.id)
        .eq('is_closed', false)
        .order('last_interaction_at', { ascending: false });

      if (error) throw error;
      setUsers(data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error('Failed to fetch users');
      setLoading(false);
    }
  };

  const closeConversation = async (user: BotUser) => {
    try {
      const { error } = await supabase
        .from('bot_users')
        .update({ is_closed: true })
        .eq('id', user.id)
        .eq('bot_id', bot.id);

      if (error) throw error;

      // Remove the user from the list and clear selection
      setUsers(users.filter(u => u.id !== user.id));
      if (selectedUser?.id === user.id) {
        setSelectedUser(null);
      }

      // Update unread counts
      setUnreadCounts(prev => {
        const newCounts = { ...prev };
        delete newCounts[user.id];
        // Update total unread count
        const total = Object.values(newCounts).reduce((sum, count) => sum + count, 0);
        onUnreadCountChange(total);
        return newCounts;
      });

      toast.success('Conversation closed');
    } catch (error) {
      console.error('Error closing conversation:', error);
      toast.error('Failed to close conversation');
    }
  };

  const fetchMessages = async () => {
    if (!selectedUser) return;

    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select(`
          *,
          bot_user:bot_users(*)
        `)
        .eq('bot_user_id', selectedUser.id)
        .neq('content', '__read__')
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data);
    } catch (error) {
      console.error('Error fetching messages:', error);
      toast.error('Failed to fetch messages');
    }
  };

  const sendMessage = async () => {
    if (!selectedUser || !newMessage.trim()) return;

    try {
      // Store the message in the database
      const { data, error: dbError } = await supabase
        .from('chat_messages')
        .insert({
          bot_id: bot.id,
          bot_user_id: selectedUser.id,
          content: newMessage,
          is_from_user: false,
          user_id: (await supabase.auth.getUser()).data.user?.id
        })
        .select()
        .single();

      if (dbError) throw dbError;

      // Add message to local state immediately
      if (data) {
        setMessages(prev => [...prev, data]);
      }

      // Send the message via Telegram
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-message`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          bot_id: bot.id,
          chat_id: selectedUser.telegram_user_id,
          message: newMessage
        })
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Failed to send message');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  // Mobile view with selected user
  if (selectedUser && window.innerWidth < 768) {
    return (
      <div className="bg-white rounded-lg shadow-sm h-[calc(100vh-12rem)] flex flex-col">
        {/* Chat Header */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setSelectedUser(null)}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <ArrowLeft className="h-5 w-5 text-gray-600" />
            </button>
            <div>
              <h3 className="font-medium">
                {selectedUser.username ? `@${selectedUser.username}` : 'No username'}
              </h3>
              <p className="text-sm text-gray-500">
                {[selectedUser.first_name, selectedUser.last_name].filter(Boolean).join(' ') || 'Anonymous'}
              </p>
            </div>
          </div>
          <button
            onClick={() => closeConversation(selectedUser)}
            className="p-2 rounded-lg flex items-center space-x-2 bg-red-100 text-red-700 hover:bg-red-200"
          >
            <X className="h-4 w-4" />
            <span className="text-sm">Close</span>
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-4">
            {messages.map(message => (
              <div
                key={message.id}
                className={`flex ${message.is_from_user ? 'justify-start' : 'justify-end'}`}
              >
                <div
                  className={`max-w-[70%] p-3 rounded-lg ${
                    message.is_from_user
                      ? 'bg-gray-100'
                      : 'bg-blue-500 text-white'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  <p className={`text-xs mt-1 ${
                    message.is_from_user ? 'text-gray-500' : 'text-blue-100'
                  }`}>
                    {new Date(message.created_at).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Message Input */}
        <div className="p-4 border-t border-gray-200">
          <div className="flex space-x-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
              placeholder="Type a message..."
              className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={sendMessage}
              disabled={!newMessage.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm h-[calc(100vh-12rem)] flex">
      {/* Users List - Full width on mobile when no user is selected */}
      <div className={`${selectedUser ? 'hidden md:block w-64' : 'w-full md:w-64'} border-r border-gray-200 overflow-y-auto`}>
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Conversations</h3>
          
          </div>
          <div className="space-y-2">
            {users.map(user => (
              <button
                key={user.id}
                onClick={() => setSelectedUser(user)}
                className={`w-full p-3 rounded-lg text-left transition-colors relative ${
                  selectedUser?.id === user.id
                    ? 'bg-blue-50 text-blue-700'
                    : 'hover:bg-gray-50'
                }`}
              >
                <div className="font-medium">
                  {user.username ? `@${user.username}` : 'No username'}
                </div>
                <div className="text-sm text-gray-500">
                  {[user.first_name, user.last_name].filter(Boolean).join(' ') || 'Anonymous'}
                </div>
                {unreadCounts[user.id] > 0 && selectedUser?.id !== user.id && (
                  <div className="absolute top-2 right-2 bg-red-500 text-white text-xs rounded-full px-2 py-1 min-w-[20px] text-center">
                    {unreadCounts[user.id]}
                  </div>
                )}
              </button>
            ))}
            {users.length === 0 && (
              <div className="text-center py-4 text-gray-500">
                No active conversations
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chat Area - Hidden on mobile when no user is selected */}
      <div className={`${!selectedUser ? 'hidden' : ''} md:flex flex-1 flex-col`}>
        {selectedUser ? (
          <>
            {/* Chat Header */}
            <div className="hidden md:flex p-4 border-b border-gray-200 items-center justify-between">
              <div>
                <h3 className="font-medium">
                  {selectedUser.username ? `@${selectedUser.username}` : 'No username'}
                </h3>
                <p className="text-sm text-gray-500">
                  {[selectedUser.first_name, selectedUser.last_name].filter(Boolean).join(' ') || 'Anonymous'}
                </p>
              </div>
              <button
                onClick={() => closeConversation(selectedUser)}
                className="px-4 py-2 rounded-lg flex items-center space-x-2 bg-red-100 text-red-700 hover:bg-red-200"
              >
                <X className="h-4 w-4" />
                <span>Close Conversation</span>
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="space-y-4">
                {messages.map(message => (
                  <div
                    key={message.id}
                    className={`flex ${message.is_from_user ? 'justify-start' : 'justify-end'}`}
                  >
                    <div
                      className={`max-w-[70%] p-3 rounded-lg ${
                        message.is_from_user
                          ? 'bg-gray-100'
                          : 'bg-blue-500 text-white'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{message.content}</p>
                      <p className={`text-xs mt-1 ${
                        message.is_from_user ? 'text-gray-500' : 'text-blue-100'
                      }`}>
                        {new Date(message.created_at).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Message Input */}
            <div className="p-4 border-t border-gray-200">
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={sendMessage}
                  disabled={!newMessage.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="h-5 w-5" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            Select a conversation to start chatting
          </div>
        )}
      </div>
    </div>
  );
}