import React from 'react';
import { Bot as BotIcon, Plus, Trash2, LogOut } from 'lucide-react';
import type { Bot } from '../types';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';

interface BotListProps {
  bots: Bot[];
  selectedBot: Bot | null;
  loading: boolean;
  onBotSelect: (bot: Bot) => void;
  onBotsUpdate: (bots: Bot[]) => void;
  onSignOut: () => void;
  onNewBot: () => void;
}

export function BotList({
  bots,
  selectedBot,
  loading,
  onBotSelect,
  onBotsUpdate,
  onSignOut,
  onNewBot
}: BotListProps) {
  const deleteBot = async (botId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce bot ?')) return;

    try {
      const { error } = await supabase
        .from('bots')
        .delete()
        .eq('id', botId)
        .eq('user_id', (await supabase.auth.getUser()).data.user!.id);

      if (error) throw error;

      onBotsUpdate(bots.filter(bot => bot.id !== botId));
      if (selectedBot?.id === botId) {
        onBotSelect(null);
      }
      toast.success('Bot supprimé avec succès');
    } catch (error) {
      console.error('Error deleting bot:', error);
      toast.error('Échec de la suppression du bot');
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="hidden md:flex items-center justify-between mb-6">
          <div className="flex items-center space-x-2">
            <BotIcon className="h-5 w-5 text-blue-600" />
            <h1 className="text-lg font-semibold">Bot Manager</h1>
          </div>
          <button
            onClick={onSignOut}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            title="Se déconnecter"
          >
            <LogOut className="h-5 w-5 text-gray-600" />
          </button>
        </div>

        {/* New Bot Button */}
        {!loading && bots.length > 0 && (
          <button
            onClick={onNewBot}
            className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2"
          >
            <Plus className="h-5 w-5" />
            <span>Nouveau Bot</span>
          </button>
        )}
      </div>

      {/* Bot List with Scroll */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-2">
          {loading ? (
            <div className="text-center py-4">
              <div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full mx-auto"></div>
            </div>
          ) : bots.length === 0 ? (
            <button
              onClick={onNewBot}
              className="w-full py-3 px-4 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-500 hover:text-blue-500 transition-colors flex items-center justify-center space-x-2"
            >
              <Plus className="h-5 w-5" />
              <span>Ajouter votre premier bot</span>
            </button>
          ) : (
            <div className="space-y-1">
              {bots.map((bot) => (
                <div
                  key={bot.id}
                  className={`w-full rounded-lg transition-colors ${
                    selectedBot?.id === bot.id
                      ? 'bg-blue-50'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between p-2">
                    <button
                      className="flex-1 flex items-center space-x-3 text-left"
                      onClick={() => onBotSelect(bot)}
                    >
                      <div className="relative">
                        {bot.photo_url ? (
                          <img 
                            src={bot.photo_url} 
                            alt={bot.name}
                            className="w-8 h-8 rounded-full"
                          />
                        ) : (
                          <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                            <BotIcon className="h-4 w-4 text-gray-500" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{bot.name}</div>
                        {bot.username && (
                          <div className="text-sm text-gray-500 truncate">
                            <a 
                              href={`https://t.me/${bot.username}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800"
                              onClick={(e) => e.stopPropagation()}
                            >
                              @{bot.username}
                            </a>
                          </div>
                        )}
                      </div>
                    </button>
                    <button
                      onClick={() => deleteBot(bot.id)}
                      className="ml-2 p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors group"
                      title="Supprimer le bot"
                    >
                      <Trash2 className="h-4 w-4 group-hover:scale-110 transition-transform" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}