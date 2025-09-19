import React, { useState, useEffect } from 'react';
import { X, Bot as BotIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';
import Confetti from 'react-confetti';

interface NewBotModalProps {
  onClose: () => void;
  onBotCreated: () => void;
}

export function NewBotModal({ onClose, onBotCreated }: NewBotModalProps) {
  const [showConfetti, setShowConfetti] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [verifyingToken, setVerifyingToken] = useState(false);
  const [newBotToken, setNewBotToken] = useState('');
  const [botInfo, setBotInfo] = useState<{
    id: number;
    name: string;
    username: string;
    photo_url?: string;
  } | null>(null);
  const [windowDimensions, setWindowDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight
  });

  useEffect(() => {
    const handleResize = () => {
      setWindowDimensions({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const verifyBotToken = async (token: string) => {
    try {
      setVerifyingToken(true);
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-bot-token`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to verify bot token');
      }

      const data = await response.json();
      
      // Si une photo de profil est disponible, la sauvegarder dans notre bucket
      if (data.photo_url) {
        try {
          const photoResponse = await fetch(data.photo_url);
          const photoBlob = await photoResponse.blob();
          
          const fileName = `bot-${data.id}-${Date.now()}.jpg`;
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('bot-avatars')
            .upload(fileName, photoBlob, {
              cacheControl: '31536000', // 1 an
              upsert: false
            });

          if (uploadError) throw uploadError;

          const { data: { publicUrl } } = supabase.storage
            .from('bot-avatars')
            .getPublicUrl(fileName);

          data.photo_url = publicUrl;
        } catch (error) {
          console.error('Error saving bot avatar:', error);
          // On continue même si la sauvegarde de l'avatar échoue
        }
      }

      setBotInfo(data);
    } catch (error) {
      console.error('Error verifying bot token:', error);
      toast.error(error.message);
      setBotInfo(null);
    } finally {
      setVerifyingToken(false);
    }
  };

  const setupWebhook = async (token: string) => {
    try {
      const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webhook?token=${token}`;
      const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.description || 'Failed to set webhook');
      }

      const data = await response.json();
      if (!data.ok) {
        throw new Error(data.description || 'Failed to set webhook');
      }

      toast.success('Webhook configured successfully');
    } catch (error) {
      console.error('Error setting webhook:', error);
      toast.error('Failed to configure webhook: ' + error.message);
    }
  };

  const createBot = async () => {
    if (!newBotToken || !botInfo) {
      toast.error('Please enter a valid bot token');
      return;
    }

    try {
      setIsCreating(true);
      const { data, error } = await supabase
        .from('bots')
        .insert([
          {
            name: botInfo.name,
            telegram_token: newBotToken,
            status: 'active',
            username: botInfo.username,
            photo_url: botInfo.photo_url,
            user_id: (await supabase.auth.getUser()).data.user!.id
          }
        ])
        .select()
        .single();

      if (error) throw error;

      // Set up webhook after bot creation
      await setupWebhook(newBotToken);

      setShowConfetti(true);
      setTimeout(() => {
        setShowConfetti(false);
        onBotCreated();
      }, 5000);
    } catch (error) {
      console.error('Error creating bot:', error);
      toast.error('Failed to add bot');
      setIsCreating(false);
    }
  };

  const isMobile = window.innerWidth < 768;

  return (
    <div className={`${isMobile ? 'fixed inset-0 z-50 bg-white' : 'fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm z-50 flex items-center justify-center'}`}>
      {showConfetti && (
        <Confetti
          width={windowDimensions.width}
          height={windowDimensions.height}
          recycle={false}
          numberOfPieces={500}
          gravity={0.3}
          initialVelocityY={20}
          colors={['#2563EB', '#3B82F6', '#60A5FA', '#93C5FD', '#BFDBFE']}
        />
      )}
      
      <div className={`bg-white ${isMobile ? 'h-full w-full' : 'rounded-2xl w-full max-w-2xl mx-4'} overflow-hidden shadow-2xl transform transition-all`}>
        {/* Header */}
        <div className="relative bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="bg-white p-2 rounded-lg">
                <BotIcon className="h-6 w-6 text-blue-600" />
              </div>
              <h2 className="text-xl font-semibold text-white">Add New Bot</h2>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:bg-white/10 rounded-full p-2 transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {showConfetti ? (
            <div className="text-center py-12 space-y-4">
              <div className="text-5xl">🎉</div>
              <h3 className="text-2xl font-bold text-gray-800">
                Congratulations!
              </h3>
              <p className="text-gray-600">
                Your bot has been successfully created and is ready to use.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                <label className="block">
                  <span className="text-gray-700 font-medium">Bot Token</span>
                  <div className="mt-1 relative">
                    <input
                      type="text"
                      placeholder="Enter your bot token from @BotFather"
                      value={newBotToken}
                      onChange={(e) => {
                        setNewBotToken(e.target.value);
                        setBotInfo(null);
                      }}
                      onBlur={() => {
                        if (newBotToken) {
                          verifyBotToken(newBotToken);
                        }
                      }}
                      className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    />
                    {verifyingToken && (
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                        <div className="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                      </div>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-gray-500">
                    You can get a token by messaging @BotFather on Telegram
                  </p>
                </label>

                {botInfo && (
                  <div className="bg-blue-50 rounded-xl p-6 space-y-4">
                    <div className="flex items-center space-x-4">
                      {botInfo.photo_url ? (
                        <img
                          src={botInfo.photo_url}
                          alt={botInfo.name}
                          className="w-16 h-16 rounded-full border-4 border-white shadow-lg"
                        />
                      ) : (
                        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center border-4 border-white shadow-lg">
                          <BotIcon className="h-8 w-8 text-blue-600" />
                        </div>
                      )}
                      <div>
                        <h4 className="text-lg font-semibold text-gray-800">
                          {botInfo.name}
                        </h4>
                        <p className="text-blue-600">@{botInfo.username}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end space-x-3 pt-6">
                <button
                  onClick={onClose}
                  className="px-6 py-2 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={createBot}
                  disabled={!botInfo || isCreating}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
                >
                  {isCreating ? (
                    <>
                      <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                      <span>Creating...</span>
                    </>
                  ) : (
                    <span>Create Bot</span>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}