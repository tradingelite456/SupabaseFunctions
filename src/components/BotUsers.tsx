import React, { useState } from 'react';
import { Download, Send, Ban, Trash2, Users, ChevronLeft, ChevronRight, Plus, Link2, Hash, X } from 'lucide-react';
import type { Bot, BotUser, BulkMessagePayload, InlineButton } from '../types';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';
import { ImageUpload } from './ImageUpload';

interface BotUsersProps {
  bot: Bot;
  users: BotUser[];
  onUsersUpdate: (users: BotUser[]) => void;
}

interface InlineButtonForm {
  text: string;
  type: 'url' | 'callback';
  value: string;
}

export function BotUsers({ bot, users, onUsersUpdate }: BotUsersProps) {
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [showBulkMessageForm, setShowBulkMessageForm] = useState(false);
  const [bulkMessage, setBulkMessage] = useState('');
  const [bulkMessageImage, setBulkMessageImage] = useState<string>();
  const [currentPage, setCurrentPage] = useState(1);
  const [showButtonForm, setShowButtonForm] = useState(false);
  const [inlineButtons, setInlineButtons] = useState<InlineButtonForm[]>([]);
  const [currentButtonForm, setCurrentButtonForm] = useState<InlineButtonForm>({
    text: '',
    type: 'url',
    value: ''
  });
  const usersPerPage = 15;

  const totalPages = Math.ceil(users.length / usersPerPage);
  const startIndex = (currentPage - 1) * usersPerPage;
  const endIndex = startIndex + usersPerPage;
  const currentUsers = users.slice(startIndex, endIndex);

  const toggleUserSelection = (userId: string) => {
    const newSelected = new Set(selectedUsers);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedUsers(newSelected);
  };

  const addInlineButton = () => {
    if (!currentButtonForm.text || !currentButtonForm.value) {
      toast.error('Please fill in all button fields');
      return;
    }

    const newButton: InlineButtonForm = {
      text: currentButtonForm.text,
      type: currentButtonForm.type,
      value: currentButtonForm.value
    };

    setInlineButtons([...inlineButtons, newButton]);
    setCurrentButtonForm({ text: '', type: 'url', value: '' });
  };

  const removeInlineButton = (index: number) => {
    setInlineButtons(buttons => buttons.filter((_, i) => i !== index));
  };

  const formatInlineKeyboard = (buttons: InlineButtonForm[]): InlineButton[][] => {
    return [buttons.map(button => ({
      text: button.text,
      ...(button.type === 'url' ? { url: button.value } : { callback_data: button.value })
    }))];
  };

  const toggleBlockUser = async (botUser: BotUser) => {
    try {
      const { error } = await supabase
        .from('bot_users')
        .update({ is_blocked: !botUser.is_blocked })
        .eq('id', botUser.id)
        .eq('bot_id', bot.id);

      if (error) throw error;

      onUsersUpdate(users.map(user => 
        user.id === botUser.id 
          ? { ...user, is_blocked: !user.is_blocked }
          : user
      ));

      toast.success(`User ${botUser.is_blocked ? 'unblocked' : 'blocked'} successfully`);
    } catch (error) {
      console.error('Error toggling user block status:', error);
      toast.error('Failed to update user status');
    }
  };

  const deleteUser = async (botUser: BotUser) => {
    if (!confirm('Are you sure you want to delete this user?')) return;

    try {
      // Récupérer l'utilisateur authentifié
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Supprimer l'utilisateur avec les conditions appropriées
      const { error } = await supabase
        .from('bot_users')
        .delete()
        .match({
          id: botUser.id,
          bot_id: bot.id,
          user_id: user.id
        });

      if (error) throw error;

      // Mettre à jour l'état local
      onUsersUpdate(users.filter(user => user.id !== botUser.id));
      
      // Mettre à jour la sélection si nécessaire
      setSelectedUsers(prev => {
        const newSelected = new Set(prev);
        newSelected.delete(botUser.id);
        return newSelected;
      });

      toast.success('User deleted successfully');
    } catch (error: any) {
      console.error('Error deleting user:', error);
      toast.error('Failed to delete user: ' + (error.message || 'Unknown error'));
    }
  };

  const exportUsers = () => {
    const usersToExport = selectedUsers.size > 0
      ? users.filter(user => selectedUsers.has(user.id))
      : users;

    const csvContent = [
      ['Telegram ID', 'Username', 'First Name', 'Last Name', 'Created At', 'Last Interaction', 'Status', 'Bot Blocked'].join(','),
      ...usersToExport.map(user => [
        user.telegram_user_id,
        user.username || '',
        user.first_name || '',
        user.last_name || '',
        new Date(user.created_at).toLocaleString(),
        new Date(user.last_interaction_at).toLocaleString(),
        user.is_blocked ? 'Blocked' : (user.is_bot_blocked ? 'Bot Blocked' : 'Active'),
        user.is_bot_blocked ? 'Yes' : 'No'
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bot-users-${bot.name}-${new Date().toISOString()}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const sendBulkMessage = async () => {
    if (!bot || (!bulkMessage.trim() && !bulkMessageImage)) {
      toast.error('Please enter a message or upload an image');
      return;
    }

    const selectedUsersList = selectedUsers.size > 0
      ? users.filter(user => selectedUsers.has(user.id))
      : users;

    if (selectedUsersList.length === 0) {
      toast.error('No users selected');
      return;
    }

    try {
      const payload: BulkMessagePayload = {
        bot_id: bot.id,
        user_ids: selectedUsersList.map(user => user.telegram_user_id),
        message: bulkMessage,
        image_url: bulkMessageImage,
        inline_keyboard: inlineButtons.length > 0 ? formatInlineKeyboard(inlineButtons) : undefined
      };

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-bulk-message`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error('Failed to send messages');
      }

      toast.success('Messages sent successfully');
      setBulkMessage('');
      setBulkMessageImage(undefined);
      setInlineButtons([]);
      setShowBulkMessageForm(false);
      setSelectedUsers(new Set());
    } catch (error) {
      console.error('Error sending bulk message:', error);
      toast.error('Failed to send messages');
    }
  };

  const getUserStatus = (user: BotUser) => {
    if (user.is_blocked) {
      return {
        text: 'Blocked',
        className: 'bg-red-100 text-red-800'
      };
    }
    if (user.is_bot_blocked) {
      return {
        text: 'Bot Blocked',
        className: 'bg-yellow-100 text-yellow-800'
      };
    }
    return {
      text: 'Active',
      className: 'bg-green-100 text-green-800'
    };
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-4 md:p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 space-y-4 md:space-y-0">
        <h3 className="text-lg font-semibold flex items-center space-x-2">
          <Users className="h-5 w-5 text-blue-600" />
          <span>Bot Users</span>
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={exportUsers}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center space-x-2"
          >
            <Download className="h-4 w-4" />
            <span>Export {selectedUsers.size > 0 ? 'Selected' : 'All'}</span>
          </button>
          {selectedUsers.size > 0 && (
            <button
              onClick={() => setShowBulkMessageForm(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2"
            >
              <Send className="h-4 w-4" />
              <span>Message Selected ({selectedUsers.size})</span>
            </button>
          )}
        </div>
      </div>

      {showBulkMessageForm && (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <textarea
            placeholder="Enter your message..."
            value={bulkMessage}
            onChange={(e) => setBulkMessage(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg min-h-[100px] mb-4"
          />
          <ImageUpload
            onImageUploaded={(url) => setBulkMessageImage(url)}
            currentImage={bulkMessageImage}
            onImageRemoved={() => setBulkMessageImage(undefined)}
          />

          {/* Inline Buttons Form */}
          <div className="mt-4">
            <button
              onClick={() => setShowButtonForm(!showButtonForm)}
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              {showButtonForm ? '- Hide Button Form' : '+ Add Inline Button'}
            </button>

            {showButtonForm && (
              <div className="mt-2 p-4 border rounded-lg bg-white">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Button Text
                    </label>
                    <input
                      type="text"
                      placeholder="Button Text"
                      value={currentButtonForm.text}
                      onChange={(e) => setCurrentButtonForm({ ...currentButtonForm, text: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Button Type
                    </label>
                    <select
                      value={currentButtonForm.type}
                      onChange={(e) => setCurrentButtonForm({ 
                        ...currentButtonForm, 
                        type: e.target.value as 'url' | 'callback',
                        value: '' 
                      })}
                      className="w-full px-3 py-2 border rounded-lg bg-white"
                    >
                      <option value="url">URL</option>
                      <option value="callback">Callback Data</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {currentButtonForm.type === 'url' ? 'URL' : 'Callback Data'}
                    </label>
                    <input
                      type="text"
                      placeholder={currentButtonForm.type === 'url' ? 'https://example.com' : 'callback_data'}
                      value={currentButtonForm.value}
                      onChange={(e) => setCurrentButtonForm({ ...currentButtonForm, value: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>

                  <div className="pt-2">
                    <button
                      onClick={addInlineButton}
                      className="w-full md:w-auto px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center space-x-2"
                    >
                      <Plus className="h-4 w-4" />
                      <span>Add Button</span>
                    </button>
                  </div>
                </div>

                {/* Inline Buttons Preview */}
                {inlineButtons.length > 0 && (
                  <div className="mt-6">
                    <h4 className="text-sm font-medium text-gray-700 mb-3">Buttons Preview</h4>
                    <div className="flex flex-wrap gap-2">
                      {inlineButtons.map((button, index) => (
                        <div
                          key={index}
                          className="flex items-center space-x-2 bg-gray-100 px-3 py-2 rounded-lg"
                        >
                          <span className="flex items-center space-x-2">
                            {button.type === 'url' ? <Link2 className="h-4 w-4" /> : <Hash className="h-4 w-4" />}
                            <span className="font-medium">{button.text}</span>
                            <span className="text-sm text-gray-500">
                              {button.type === 'url' ? button.value : `#${button.value}`}
                            </span>
                          </span>
                          <button
                            onClick={() => removeInlineButton(index)}
                            className="ml-2 text-red-600 hover:text-red-800 p-1 hover:bg-red-100 rounded-full"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end space-x-2 mt-4">
            <button
              onClick={() => {
                setBulkMessage('');
                setBulkMessageImage(undefined);
                setInlineButtons([]);
                setShowBulkMessageForm(false);
              }}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
            >
              Cancel
            </button>
            <button
              onClick={sendBulkMessage}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2"
            >
              <Send className="h-4 w-4" />
              <span>Send Message</span>
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto -mx-4 md:mx-0">
        <div className="inline-block min-w-full align-middle">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-8">
                  <input
                    type="checkbox"
                    checked={selectedUsers.size === users.length}
                    onChange={() => {
                      if (selectedUsers.size === users.length) {
                        setSelectedUsers(new Set());
                      } else {
                        setSelectedUsers(new Set(users.map(u => u.id)));
                      }
                    }}
                    className="rounded border-gray-300"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Username
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="hidden md:table-cell px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Interaction
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {currentUsers.map((user) => {
                const status = getUserStatus(user);
                return (
                  <tr key={user.id} className={user.is_blocked ? 'bg-red-50' : ''}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selectedUsers.has(user.id)}
                        onChange={() => toggleUserSelection(user.id)}
                        className="rounded border-gray-300"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.telegram_user_id}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {user.username ? `@${user.username}` : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {[user.first_name, user.last_name].filter(Boolean).join(' ') || '-'}
                    </td>
                    <td className="hidden md:table-cell px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(user.last_interaction_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${status.className}`}>
                        {status.text}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end space-x-2">
                        <button
                          onClick={() => toggleBlockUser(user)}
                          className={`p-1 rounded ${
                            user.is_blocked
                              ? 'text-gray-600 hover:bg-gray-100'
                              : 'text-red-600 hover:bg-red-100'
                          }`}
                        >
                          <Ban className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => deleteUser(user)}
                          className="p-1 text-red-600 hover:bg-red-100 rounded"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                    No users have interacted with this bot yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 sm:px-6 mt-4 border-t border-gray-200">
          <div className="flex-1 flex justify-between sm:hidden">
            <button
              onClick={() => setCurrentPage(page => Math.max(1, page - 1))}
              disabled={currentPage === 1}
              className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))}
              disabled={currentPage === totalPages}
              className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
          <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-gray-700">
                Showing <span className="font-medium">{startIndex + 1}</span> to{' '}
                <span className="font-medium">{Math.min(endIndex, users.length)}</span> of{' '}
                <span className="font-medium">{users.length}</span> users
              </p>
            </div>
            <div>
              <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                <button
                  onClick={() => setCurrentPage(page => Math.max(1, page - 1))}
                  disabled={currentPage === 1}
                  className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="sr-only">Previous</span>
                  <ChevronLeft className="h-5 w-5" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                      page === currentPage
                        ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                        : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    {page}
                  </button>
                ))}
                <button
                  onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))}
                  disabled={currentPage === totalPages}
                  className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="sr-only">Next</span>
                  <ChevronRight className="h-5 w-5" />
                </button>
              </nav>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}