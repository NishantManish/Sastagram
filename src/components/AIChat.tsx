import React, { useState, useRef, useEffect } from 'react';
import { Send, ArrowLeft, Bot, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';

export default function AIChat({ onBack }: { onBack: () => void }) {
  const [messages, setMessages] = useState<{ id: string; text: string; isAi: boolean; isLoading?: boolean }[]>([
    { id: '1', text: "Hi there! I'm your AI assistant. How can I help you today?", isAi: true }
  ]);
  const [newMessage, setNewMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || isTyping) return;

    const userMsg = { id: Date.now().toString(), text: newMessage, isAi: false };
    setMessages(prev => [...prev, userMsg]);
    setNewMessage('');
    setIsTyping(true);

    const tempAiId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { id: tempAiId, text: '', isAi: true, isLoading: true }]);

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMsg].map(m => ({
            role: m.isAi ? 'assistant' : 'user',
            content: m.text
          }))
        })
      });

      if (!response.ok) throw new Error('Failed to get response');
      const data = await response.json();

      setMessages(prev => prev.map(m => m.id === tempAiId ? { ...m, text: data.reply, isLoading: false } : m));
    } catch (error) {
      console.error("AI chat error:", error);
      setMessages(prev => prev.map(m => m.id === tempAiId ? { 
        ...m, 
        text: "Sorry, I'm having trouble connecting right now. Please try again later.", 
        isLoading: false 
      } : m));
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="max-w-md mx-auto bg-white dark:bg-zinc-950 h-[100dvh] flex flex-col overflow-hidden fixed inset-0 z-50 transition-colors duration-300">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white/70 dark:bg-zinc-950/70 backdrop-blur-2xl border-b border-zinc-100/50 dark:border-zinc-800/50 px-4 py-3 flex items-center shadow-sm shrink-0">
        <button 
          onClick={onBack} 
          className="p-2.5 -ml-2 mr-2 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100/80 dark:hover:bg-zinc-800/80 rounded-full transition-all active:scale-90"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 p-[2px]">
            <div className="w-full h-full bg-white dark:bg-zinc-950 rounded-full flex items-center justify-center">
              <Bot className="w-5 h-5 text-indigo-500" />
            </div>
          </div>
          <div className="flex flex-col">
            <span className="font-black text-zinc-900 dark:text-zinc-100 leading-tight flex items-center gap-1.5 text-[15px] tracking-tight">
              Sastagram AI
              <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
            </span>
            <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">
              {isTyping ? 'typing...' : 'Online'}
            </span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-6 bg-zinc-50/50 dark:bg-zinc-950/50 relative scroll-smooth no-scrollbar">
        <div className="flex flex-col items-center justify-center pt-8 pb-12 w-full">
          <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-indigo-500/20 via-purple-500/20 to-pink-500/20 flex flex-col items-center justify-center mb-4">
             <Bot className="w-12 h-12 text-indigo-500 mb-1" />
          </div>
          <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 leading-tight">Sastagram AI</h2>
          <p className="text-[15px] font-medium text-zinc-500 dark:text-zinc-400 mt-1 mb-1 text-center max-w-[240px]">
            Your personal assistant on Sastagram.
          </p>
        </div>

        <div className="space-y-4 max-w-[85vw] mx-auto w-full relative">
          <AnimatePresence initial={false}>
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className={`flex gap-3 relative group ${message.isAi ? 'justify-start' : 'justify-end'}`}
              >
                {message.isAi ? (
                  <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center shrink-0 mt-auto mb-1">
                    <Bot className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  </div>
                ) : null}

                <div className={`relative px-4 py-2.5 max-w-[75%] break-words ${
                  message.isAi 
                    ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 rounded-2xl rounded-bl-sm border border-zinc-100 dark:border-zinc-800 shadow-sm'
                    : 'bg-indigo-600 dark:bg-indigo-500 text-white rounded-2xl rounded-br-sm shadow-sm'
                }`}>
                  {message.isLoading ? (
                    <div className="flex items-center gap-1.5 h-6 px-1">
                      <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1 }} className="w-1.5 h-1.5 bg-indigo-400/50 rounded-full" />
                      <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-1.5 h-1.5 bg-indigo-400/50 rounded-full" />
                      <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-1.5 h-1.5 bg-indigo-400/50 rounded-full" />
                    </div>
                  ) : (
                    <div className={`text-[15px] leading-relaxed ${message.isAi ? 'markdown-body text-sm' : ''}`}>
                      {message.isAi ? (
                         <div className="markdown-body">
                           <ReactMarkdown>{message.text}</ReactMarkdown>
                         </div>
                      ) : (
                        message.text
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          <div ref={messagesEndRef} className="h-2" />
        </div>
      </div>

      {/* Input */}
      <div className="bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl border-t border-zinc-100 dark:border-zinc-900 p-3 pb-8 sm:pb-3 shrink-0">
        <form onSubmit={handleSend} className="relative flex items-end gap-2 bg-zinc-100/80 dark:bg-zinc-900/80 rounded-3xl p-1 shadow-inner border border-zinc-200/50 dark:border-zinc-800/50 transition-all focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500/50">
          <textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (newMessage.trim() && !isTyping) {
                  handleSend(e as unknown as React.FormEvent);
                }
              }
            }}
            placeholder="Message AI..."
            className="flex-1 max-h-32 min-h-[44px] bg-transparent resize-none outline-none py-3 px-4 text-[15px] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 w-full"
            rows={1}
            disabled={isTyping}
          />
          <button
            type="submit"
            disabled={!newMessage.trim() || isTyping}
            className={`shrink-0 p-3 rounded-full flex items-center justify-center transition-all ${
              newMessage.trim() && !isTyping
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md active:scale-95'
                : 'bg-transparent text-zinc-400'
            }`}
          >
            <Send className="w-5 h-5 ml-0.5" />
          </button>
        </form>
      </div>
    </div>
  );
}
