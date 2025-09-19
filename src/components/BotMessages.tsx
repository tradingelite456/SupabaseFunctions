import React, { useState } from 'react';
import { Edit3, Trash2, ChevronUp, ChevronDown, MessageCircle, Plus, Link2, Hash, X } from 'lucide-react';
import type { Bot, Message, InlineButton } from '../types';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';
import { ImageUpload } from './ImageUpload';

interface BotMessagesProps {
  bot: Bot;
  messages: Message[];
  onMessagesUpdate: (messages: Message[]) => void;
}

interface InlineButtonForm {
  text: string;
  type: 'url' | 'callback';
  value: string;
}

export function BotMessages({ bot, messages, onMessagesUpdate }: BotMessagesProps) {
  const [newMessage, setNewMessage] = useState({ trigger: '', response_text: '', order: 0, delay: 3000 });
  const [newMessageImage, setNewMessageImage] = useState<string>();
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [showButtonForm, setShowButtonForm] = useState(false);
  const [inlineButtons, setInlineButtons] = useState<InlineButtonForm[]>([]);
  const [currentButtonForm, setCurrentButtonForm] = useState<InlineButtonForm>({
    text: '',
    type: 'url',
    value: ''
  });

  // Group messages by trigger
  const groupedMessages = messages.reduce((acc, message) => {
    if (!acc[message.trigger]) {
      acc[message.trigger] = [];
    }
    acc[message.trigger].push(message);
    return acc;
  }, {} as Record<string, Message[]>);

  // Sort messages within each group by order
  Object.values(groupedMessages).forEach(group => {
    group.sort((a, b) => a.order - b.order);
  });

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

  const resetForm = () => {
    setNewMessage({ trigger: '', response_text: '', order: 0, delay: 3000 });
    setNewMessageImage(undefined);
    setInlineButtons([]);
  };

  const createMessage = async () => {
    if (!bot || (!newMessage.trigger || (!newMessage.response_text && !newMessageImage))) {
      toast.error('Please fill in the required fields');
      return;
    }

    try {
      const existingMessages = messages.filter(m => m.trigger === newMessage.trigger);
      const nextOrder = existingMessages.length > 0 
        ? Math.max(...existingMessages.map(m => m.order)) + 1 
        : 0;

      const { data, error } = await supabase
        .from('messages')
        .insert([
          {
            bot_id: bot.id,
            trigger: newMessage.trigger,
            response_text: newMessage.response_text,
            image_url: newMessageImage,
            order: nextOrder,
            delay: newMessage.delay,
            inline_keyboard: inlineButtons.length > 0 ? formatInlineKeyboard(inlineButtons) : undefined,
            user_id: (await supabase.auth.getUser()).data.user!.id
          }
        ])
        .select()
        .single();

      if (error) throw error;

      onMessagesUpdate([...messages, data]);
      resetForm();
      toast.success('Message created successfully');
    } catch (error) {
      console.error('Error creating message:', error);
      toast.error('Failed to create message');
    }
  };

  const updateMessage = async () => {
    if (!editingMessage || !editingMessage.trigger || (!editingMessage.response_text && !editingMessage.image_url)) {
      toast.error('Please fill in the required fields');
      return;
    }

    try {
      const { error } = await supabase
        .from('messages')
        .update({
          trigger: editingMessage.trigger,
          response_text: editingMessage.response_text,
          image_url: editingMessage.image_url,
          order: editingMessage.order,
          delay: editingMessage.delay,
          inline_keyboard: inlineButtons.length > 0 ? formatInlineKeyboard(inlineButtons) : undefined
        })
        .eq('id', editingMessage.id)
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id);

      if (error) throw error;

      onMessagesUpdate(messages.map(msg =>
        msg.id === editingMessage.id ? {
          ...editingMessage,
          inline_keyboard: inlineButtons.length > 0 ? formatInlineKeyboard(inlineButtons) : undefined
        } : msg
      ));
      setEditingMessage(null);
      setInlineButtons([]);
      toast.success('Message updated successfully');
    } catch (error) {
      console.error('Error updating message:', error);
      toast.error('Failed to update message');
    }
  };

  const moveMessage = async (message: Message, direction: 'up' | 'down') => {
    const sameGroupMessages = messages.filter(m => m.trigger === message.trigger)
      .sort((a, b) => a.order - b.order);
    
    const currentIndex = sameGroupMessages.findIndex(m => m.id === message.id);
    if ((direction === 'up' && currentIndex === 0) || 
        (direction === 'down' && currentIndex === sameGroupMessages.length - 1)) {
      return;
    }

    const swapWith = direction === 'up' 
      ? sameGroupMessages[currentIndex - 1] 
      : sameGroupMessages[currentIndex + 1];

    try {
      const { error: error1 } = await supabase
        .from('messages')
        .update({ order: swapWith.order })
        .eq('id', message.id);

      const { error: error2 } = await supabase
        .from('messages')
        .update({ order: message.order })
        .eq('id', swapWith.id);

      if (error1 || error2) throw error1 || error2;

      onMessagesUpdate(messages.map(m => {
        if (m.id === message.id) return { ...m, order: swapWith.order };
        if (m.id === swapWith.id) return { ...m, order: message.order };
        return m;
      }));
    } catch (error) {
      console.error('Error reordering messages:', error);
      toast.error('Failed to reorder messages');
    }
  };

  const deleteMessage = async (messageId: string) => {
    if (!confirm('Are you sure you want to delete this message?')) return;

    try {
      const { error } = await supabase
        .from('messages')
        .delete()
        .eq('id', messageId)
        .eq('user_id', (await supabase.auth.getUser()).data.user!.id);

      if (error) throw error;

      onMessagesUpdate(messages.filter(msg => msg.id !== messageId));
      toast.success('Message deleted successfully');
    } catch (error) {
      console.error('Error deleting message:', error);
      toast.error('Failed to delete message');
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-4 md:p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold flex items-center space-x-2">
          <MessageCircle className="h-5 w-5 text-blue-600" />
          <span>Automatic Messages</span>
        </h3>
      </div>

      {/* New Message Form */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <div className="space-y-4">
          <input
            type="text"
            placeholder="Trigger (e.g., /start)"
            value={newMessage.trigger}
            onChange={(e) => setNewMessage({ ...newMessage, trigger: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg"
          />
          <textarea
            placeholder="Response Text"
            value={newMessage.response_text}
            onChange={(e) => setNewMessage({ ...newMessage, response_text: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg min-h-[200px] resize-y"
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Delay before next message (ms)
            </label>
            <input
              type="number"
              min="0"
              step="100"
              value={newMessage.delay}
              onChange={(e) => setNewMessage({ ...newMessage, delay: parseInt(e.target.value) || 0 })}
              className="w-full px-3 py-2 border rounded-lg"
            />
            <p className="mt-1 text-sm text-gray-500">
              Time to wait before sending the next message (in milliseconds)
            </p>
          </div>
        </div>
        <ImageUpload
          onImageUploaded={(url) => setNewMessageImage(url)}
          currentImage={newMessageImage}
          onImageRemoved={() => setNewMessageImage(undefined)}
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

        <button
          onClick={createMessage}
          className="w-full mt-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center space-x-2"
        >
          <Plus className="h-4 w-4" />
          <span>Add Message</span>
        </button>
      </div>

      {/* Messages List */}
      <div className="space-y-4">
        {Object.entries(groupedMessages).map(([trigger, triggerMessages]) => (
          <div key={trigger} className="border rounded-lg p-4">
            <h4 className="font-medium text-gray-700 mb-2">Trigger: {trigger}</h4>
            <div className="space-y-2">
              {triggerMessages.map((message, index) => (
                <div
                  key={message.id}
                  className="p-4 border rounded-lg hover:border-blue-200 transition-colors"
                >
                  {editingMessage?.id === message.id ? (
                    <div className="space-y-4">
                      <div className="space-y-4">
                        <input
                          type="text"
                          value={editingMessage.trigger}
                          onChange={(e) => setEditingMessage({
                            ...editingMessage,
                            trigger: e.target.value
                          })}
                          className="w-full px-3 py-2 border rounded-lg"
                        />
                        <textarea
                          value={editingMessage.response_text}
                          onChange={(e) => setEditingMessage({
                            ...editingMessage,
                            response_text: e.target.value
                          })}
                          className="w-full px-3 py-2 border rounded-lg min-h-[200px] resize-y"
                        />
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Delay before next message (ms)
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="100"
                            value={editingMessage.delay}
                            onChange={(e) => setEditingMessage({
                              ...editingMessage,
                              delay: parseInt(e.target.value) || 0
                            })}
                            className="w-full px-3 py-2 border rounded-lg"
                          />
                        </div>
                      </div>
                      <ImageUpload
                        onImageUploaded={(url) => setEditingMessage({
                          ...editingMessage,
                          image_url: url
                        })}
                        currentImage={editingMessage.image_url}
                        onImageRemoved={() => setEditingMessage({
                          ...editingMessage,
                          image_url: undefined
                        })}
                      />

                      {/* Inline Buttons Form for Editing */}
                      <div className="mt-4">
                        <button
                          onClick={() => setShowButtonForm(!showButtonForm)}
                          className="text-blue-600 hover:text-blue-800 font-medium"
                        >
                          {showButtonForm ? '- Hide Button Form' : '+ Edit Inline Buttons'}
                        </button>

                        {showButtonForm && (
                          <div className="mt-2 p-4 border rounded-lg bg-white">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <input
                                type="text"
                                placeholder="Button Text"
                                value={currentButtonForm.text}
                                onChange={(e) => setCurrentButtonForm({ ...currentButtonForm, text: e.target.value })}
                                className="px-3 py-2 border rounded-lg"
                              />
                              <div className="flex space-x-2">
                                <select
                                  value={currentButtonForm.type}
                                  onChange={(e) => setCurrentButtonForm({ 
                                    ...currentButtonForm, 
                                    type: e.target.value as 'url' | 'callback',
                                    value: '' 
                                  })}
                                  className="px-3 py-2 border rounded-lg"
                                >
                                  <option value="url">URL</option>
                                  <option value="callback">Callback Data</option>
                                </select>
                                <input
                                  type="text"
                                  placeholder={currentButtonForm.type === 'url' ? 'https://example.com' : 'callback_data'}
                                  value={currentButtonForm.value}
                                  onChange={(e) => setCurrentButtonForm({ ...currentButtonForm, value: e.target.value })}
                                  className="flex-1 px-3 py-2 border rounded-lg"
                                />
                              </div>
                            </div>
                            <div className="mt-2 flex justify-end">
                              <button
                                onClick={addInlineButton}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                              >
                                Add Button
                              </button>
                            </div>

                            {/* Inline Buttons Preview */}
                            {inlineButtons.length > 0 && (
                              <div className="mt-4">
                                <h4 className="text-sm font-medium text-gray-700 mb-2">Buttons Preview:</h4>
                                <div className="flex flex-wrap gap-2">
                                  {inlineButtons.map((button, index) => (
                                    <div
                                      key={index}
                                      className="flex items-center space-x-2 bg-gray-100 px-3 py-1 rounded-lg"
                                    >
                                      <span className="flex items-center space-x-1">
                                        {button.type === 'url' ? <Link2 className="h-4 w-4" /> : <Hash className="h-4 w-4" />}
                                        <span>{button.text}</span>
                                      </span>
                                      <button
                                        onClick={() => removeInlineButton(index)}
                                        className="text-red-600 hover:text-red-800"
                                      >
                                        ×
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex justify-end space-x-2">
                        <button
                          onClick={updateMessage}
                          className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setEditingMessage(null);
                            setInlineButtons([]);
                            setShowButtonForm(false);
                          }}
                          className="px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col md:flex-row md:items-center justify-between space-y-4 md:space-y-0">
                      <div className="flex-1">
                        <div className="text-gray-600 whitespace-pre-wrap">{message.response_text}</div>
                        {message.image_url && (
                          <div className="mt-2">
                            <img
                              src={message.image_url}
                              alt="Message image"
                              className="w-full md:max-w-xs h-auto rounded-lg object-cover"
                              style={{ maxHeight: '200px' }}
                            />
                          </div>
                        )}
                        {message.inline_keyboard && message.inline_keyboard.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {message.inline_keyboard[0].map((button, index) => (
                              <div
                                key={index}
                                className="flex items-center space-x-1 bg-gray-100 px-2 py-1 rounded text-sm"
                              >
                                {button.url ? <Link2 className="h-3 w-3" /> : <Hash className="h-3 w-3" />}
                                <span>{button.text}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="mt-2 text-sm text-gray-500">
                          Delay: {message.delay || 3000}ms
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="flex flex-col">
                          <button
                            onClick={() => moveMessage(message, 'up')}
                            disabled={index === 0}
                            className={`p-1 rounded ${
                              index === 0 ? 'text-gray-300' : 'text-gray-600 hover:bg-gray-100'
                            }`}
                          >
                            <ChevronUp className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => moveMessage(message, 'down')}
                            disabled={index === triggerMessages.length - 1}
                            className={`p-1 rounded ${
                              index === triggerMessages.length - 1 
                                ? 'text-gray-300' 
                                : 'text-gray-600 hover:bg-gray-100'
                            }`}
                          >
                            <ChevronDown className="h-4 w-4" />
                          </button>
                        </div>
                        <button
                          onClick={() => {
                            setEditingMessage(message);
                            setInlineButtons(
                              message.inline_keyboard?.[0].map(button => ({
                                text: button.text,
                                type: button.url ? 'url' : 'callback',
                                value: button.url || button.callback_data || ''
                              })) || []
                            );
                          }}
                          className="p-1 text-blue-600 hover:bg-blue-100 rounded"
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => deleteMessage(message.id)}
                          className="p-1 text-red-600 hover:bg-red-100 rounded"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
        {messages.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No messages configured yet
          </div>
        )}
      </div>
    </div>
  );
}