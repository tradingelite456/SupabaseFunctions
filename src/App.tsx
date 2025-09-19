import React, { useState, useEffect } from 'react';
import { Toaster, toast } from 'react-hot-toast';
import { Bot as BotIcon, Menu, X, BarChart, Users, MessageSquare, MessageCircle, ChevronDown } from 'lucide-react';
import { supabase } from './lib/supabase';
import { Auth } from './components/Auth';
import { Analytics } from './components/Analytics';
import { Chat } from './components/Chat';
import { BotList } from './components/BotList';
import { BotMessages } from './components/BotMessages';
import { BotUsers } from './components/BotUsers';
import { NewBotModal } from './components/NewBotModal';
import type { Bot, Message, BotUser } from './types';
import type { User } from '@supabase/supabase-js';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [bots, setBots] = useState<Bot[]>([]);
  const [selectedBot, setSelectedBot] = useState<Bot | null>(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [botUsers, setBotUsers] = useState<BotUser[]>([]);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showUsers, setShowUsers] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showMessages, setShowMessages] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [totalUnreadCount, setTotalUnreadCount] = useState(0);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showNewBotModal, setShowNewBotModal] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      fetchBots();
    }
  }, [user]);

  useEffect(() => {
    if (selectedBot) {
      fetchMessages(selectedBot.id);
      fetchBotUsers(selectedBot.id);
      fetchUnreadCount();

      const messagesSubscription = supabase
        .channel('chat-messages-all')
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `bot_id=eq.${selectedBot.id}`
        }, (payload) => {
          if (payload.new.is_from_user) {
            fetchUnreadCount();
          }
        })
        .subscribe();

      return () => {
        messagesSubscription.unsubscribe();
      };
    }
  }, [selectedBot]);

  useEffect(() => {
    if (showChat && selectedBot) {
      setUnreadCount(0);
      setTotalUnreadCount(0); // Reset total unread count when opening chat
    }
  }, [showChat]);

  // Close sidebar when selecting a bot on mobile
  useEffect(() => {
    if (window.innerWidth < 768 && selectedBot) {
      setShowSidebar(false);
    }
  }, [selectedBot]);

  const fetchUnreadCount = async () => {
    if (!selectedBot) return;

    try {
      const { data, error } = await supabase
        .rpc('get_unread_messages_count', {
          p_bot_id: selectedBot.id
        });

      if (error) throw error;

      const total = data.reduce((sum, item) => sum + parseInt(item.count), 0);
      setUnreadCount(total);
      setTotalUnreadCount(total);
    } catch (error) {
      console.error('Error fetching unread count:', error);
    }
  };

  const handleSignOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setUser(null);
      setBots([]);
      setSelectedBot(null);
      setMessages([]);
      setBotUsers([]);
    } catch (error) {
      console.error('Error signing out:', error);
      toast.error('Failed to sign out');
    }
  };

  const fetchBots = async () => {
    try {
      const { data, error } = await supabase
        .from('bots')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setBots(data || []);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching bots:', error);
      toast.error('Failed to fetch bots');
      setLoading(false);
    }
  };

  const fetchMessages = async (botId: string) => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('bot_id', botId)
        .order('trigger', { ascending: true })
        .order('order', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error('Error fetching messages:', error);
      toast.error('Failed to fetch messages');
    }
  };

  const fetchBotUsers = async (botId: string) => {
    try {
      const { data, error } = await supabase
        .from('bot_users')
        .select('*')
        .eq('bot_id', botId)
        .order('last_interaction_at', { ascending: false });

      if (error) throw error;
      setBotUsers(data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching bot users:', error);
      toast.error('Failed to fetch bot users');
      setLoading(false);
    }
  };

  const switchToMessages = () => {
    setShowAnalytics(false);
    setShowUsers(false);
    setShowChat(false);
    setShowMessages(true);
    setShowMobileMenu(false);
  };

  const switchToAnalytics = () => {
    setShowUsers(false);
    setShowChat(false);
    setShowMessages(false);
    setShowAnalytics(true);
    setShowMobileMenu(false);
  };

  const switchToUsers = () => {
    setShowAnalytics(false);
    setShowChat(false);
    setShowMessages(false);
    setShowUsers(true);
    setShowMobileMenu(false);
  };

  const switchToChat = () => {
    setShowAnalytics(false);
    setShowUsers(false);
    setShowMessages(false);
    setShowChat(true);
    setShowMobileMenu(false);
  };

  const getCurrentTabName = () => {
    if (showAnalytics) return 'Analytics';
    if (showUsers) return 'Users';
    if (showChat) return 'Chat';
    if (showMessages) return 'Messages';
    return 'Select Tab';
  };

  if (!user) {
    return <Auth />;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden bg-white border-b border-gray-200 p-4 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <BotIcon className="h-6 w-6 text-blue-600" />
          <h1 className="text-xl font-semibold">Bot Manager</h1>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            {showSidebar ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Sidebar */}
      <div className={`
        ${showSidebar ? 'translate-x-0' : '-translate-x-full'}
        md:translate-x-0
        fixed md:relative
        inset-y-0 left-0
        w-64
        bg-white border-r border-gray-200
        transform transition-transform duration-200 ease-in-out
        md:transform-none
        z-30
        overflow-y-auto
        ${showSidebar ? 'mt-0' : 'mt-16 md:mt-0'}
      `}>
        <BotList
          bots={bots}
          selectedBot={selectedBot}
          loading={loading}
          onBotSelect={setSelectedBot}
          onBotsUpdate={setBots}
          onSignOut={handleSignOut}
          onNewBot={() => {
            setShowNewBotModal(true);
            setShowSidebar(false);
          }}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 p-4 md:p-8 mt-0 md:mt-0 overflow-y-auto">
        {selectedBot ? (
          <div>
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 space-y-4 md:space-y-0">
              <h2 className="text-2xl font-semibold">{selectedBot.name}</h2>
              
              {/* Mobile Dropdown Menu */}
              <div className="md:hidden relative">
                <button
                  onClick={() => setShowMobileMenu(!showMobileMenu)}
                  className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg shadow-sm flex items-center justify-between"
                >
                  <span className="flex items-center space-x-2">
                    {showAnalytics && <BarChart className="h-4 w-4" />}
                    {showUsers && <Users className="h-4 w-4" />}
                    {showChat && <MessageSquare className="h-4 w-4" />}
                    {showMessages && <MessageCircle className="h-4 w-4" />}
                    <span>{getCurrentTabName()}</span>
                  </span>
                  <div className="flex items-center space-x-2">
                    {!showChat && totalUnreadCount > 0 && (
                      <div className="bg-red-500 text-white text-xs rounded-full px-2 py-1 min-w-[20px] text-center">
                        {totalUnreadCount}
                      </div>
                    )}
                    <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${showMobileMenu ? 'transform rotate-180' : ''}`} />
                  </div>
                </button>

                {/* Dropdown Menu */}
                {showMobileMenu && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden z-50">
                    <button
                      onClick={switchToAnalytics}
                      className={`w-full px-4 py-3 flex items-center space-x-2 hover:bg-gray-50 ${
                        showAnalytics ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                      }`}
                    >
                      <BarChart className="h-4 w-4" />
                      <span>Analytics</span>
                    </button>
                    <button
                      onClick={switchToUsers}
                      className={`w-full px-4 py-3 flex items-center space-x-2 hover:bg-gray-50 ${
                        showUsers ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                      }`}
                    >
                      <Users className="h-4 w-4" />
                      <span>Users</span>
                    </button>
                    <button
                      onClick={switchToChat}
                      className={`w-full px-4 py-3 flex items-center space-x-2 hover:bg-gray-50 ${
                        showChat ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                      }`}
                    >
                      <MessageSquare className="h-4 w-4" />
                      <span>Chat</span>
                      {!showChat && totalUnreadCount > 0 && (
                        <div className="bg-red-500 text-white text-xs rounded-full px-2 py-1 min-w-[20px] text-center">
                          {totalUnreadCount}
                        </div>
                      )}
                    </button>
                    <button
                      onClick={switchToMessages}
                      className={`w-full px-4 py-3 flex items-center space-x-2 hover:bg-gray-50 ${
                        showMessages ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                      }`}
                    >
                      <MessageCircle className="h-4 w-4" />
                      <span>Messages</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Desktop Menu */}
              <div className="hidden md:flex items-center space-x-2 md:space-x-4">
                <button
                  onClick={switchToAnalytics}
                  className={`px-4 py-2 rounded-lg flex items-center space-x-2 whitespace-nowrap ${
                    showAnalytics ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
                  } hover:bg-blue-100 hover:text-blue-700`}
                >
                  <BarChart className="h-4 w-4" />
                  <span>Analytics</span>
                </button>
                <button
                  onClick={switchToUsers}
                  className={`px-4 py-2 rounded-lg flex items-center space-x-2 whitespace-nowrap ${
                    showUsers ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
                  } hover:bg-blue-100 hover:text-blue-700`}
                >
                  <Users className="h-4 w-4" />
                  <span>Users</span>
                </button>
                <button
                  onClick={switchToChat}
                  className={`px-4 py-2 rounded-lg flex items-center space-x-2 whitespace-nowrap ${
                    showChat ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
                  } hover:bg-blue-100 hover:text-blue-700`}
                >
                  <MessageSquare className="h-4 w-4" />
                  <span>Chat</span>
                  {!showChat && totalUnreadCount > 0 && (
                    <div className="bg-red-500 text-white text-xs rounded-full px-2 py-1 min-w-[20px] text-center">
                      {totalUnreadCount}
                    </div>
                  )}
                </button>
                <button
                  onClick={switchToMessages}
                  className={`px-4 py-2 rounded-lg flex items-center space-x-2 whitespace-nowrap ${
                    showMessages ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
                  } hover:bg-blue-100 hover:text-blue-700`}
                >
                  <MessageCircle className="h-4 w-4" />
                  <span>Messages</span>
                </button>
              </div>
            </div>

            {showAnalytics ? (
              <Analytics bot={selectedBot} />
            ) : showChat ? (
              <Chat 
                bot={selectedBot} 
                onUnreadCountChange={(count) => {
                  setTotalUnreadCount(count);
                }}
              />
            ) : showUsers ? (
              <BotUsers
                bot={selectedBot}
                users={botUsers}
                onUsersUpdate={setBotUsers}
              />
            ) : (
              <BotMessages
                bot={selectedBot}
                messages={messages}
                onMessagesUpdate={setMessages}
              />
            )}
          </div>
        ) : (
          <div className="text-center py-12">
            <BotIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-medium text-gray-600">
              Select a bot to manage or create a new one
            </h2>
          </div>
        )}
      </div>

      {/* New Bot Modal */}
      {showNewBotModal && (
        <NewBotModal
          onClose={() => setShowNewBotModal(false)}
          onBotCreated={() => {
            setShowNewBotModal(false);
            fetchBots();
          }}
        />
      )}

      <Toaster position="top-right" />
    </div>
  );
}

export default App;