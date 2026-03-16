import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, X, Send, Loader2, Sparkles, HelpCircle, BookOpen, Highlighter, StickyNote, Paperclip } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import { cn } from '../lib/utils';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYSTEM_INSTRUCTION = `You are the Flipverse Guide, an AI assistant built into the Flipverse reading platform. 
Your goal is to help users understand how to use the app and explain its features.

Flipverse Features:
1. Library: The main hub where all your PDF books are stored. You can search, delete, and organize them.
2. PDF Upload: Click "Add Book" in the library to upload your own PDF files.
3. AI Cover Generation: If a book doesn't have a cover, you can click the image icon on the book card to generate a beautiful, minimalist cover using AI.
4. Reader: Click any book to open the immersive reader. It supports light/dark themes, zoom, and font settings (in text mode).
5. Sticky Notes: In the reader, use the Sticky Note tool to place notes anywhere on a page. You can type in them and even ask the AI to explain your notes.
6. Bookmark Pins: Use the Paperclip tool to snap pins to the edges of pages. These act as visual bookmarks.
7. Flipverse AI Sidebar: Open the AI panel in the reader to ask questions about the current page, summarize content, or translate text.
8. Bookmarks Tab: Inside the AI sidebar, there's a Bookmarks tab that lists all your pins for quick navigation.
9. Highlights: Use the Highlighter tool to mark important text on the page.

Be helpful, concise, and professional. If a user asks a question not related to the app, gently guide them back to how Flipverse can help them read better.
Use the gemini-3.1-pro-preview model to provide high-quality responses.`;

interface Message {
  role: 'user' | 'model';
  text: string;
}

export const AppExplainer = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', text: "Hi! I'm your Flipverse Guide. How can I help you explore the platform today?" }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setIsLoading(true);

    try {
      const chat = ai.chats.create({
        model: 'gemini-3.1-pro-preview',
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
        },
        history: messages.map(m => ({
          role: m.role,
          parts: [{ text: m.text }]
        }))
      });

      const result = await chat.sendMessage({ message: userMessage });
      setMessages(prev => [...prev, { role: 'model', text: result.text || "I'm sorry, I couldn't process that." }]);
    } catch (error) {
      console.error('AI Error:', error);
      setMessages(prev => [...prev, { role: 'model', text: "I'm having a bit of trouble connecting right now. Please try again in a moment!" }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[100]">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9, transformOrigin: 'bottom right' }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="absolute bottom-20 right-0 w-[380px] h-[520px] bg-zinc-900 border border-zinc-50/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden backdrop-blur-xl"
          >
            {/* Header */}
            <div className="p-5 border-b border-zinc-50/5 bg-zinc-50/5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
                  <Sparkles className="w-5 h-5 text-zinc-50" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-50">Flipverse Guide</h3>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                    <span className="text-[10px] text-emerald-500 font-medium uppercase tracking-wider">Online</span>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-2 hover:bg-zinc-50/10 rounded-full transition-colors text-zinc-400 hover:text-zinc-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Messages */}
            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-5 space-y-4 scrollbar-hide"
            >
              {messages.map((m, i) => (
                <motion.div
                  initial={{ opacity: 0, x: m.role === 'user' ? 10 : -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  key={i}
                  className={cn(
                    "max-w-[85%] p-3.5 rounded-2xl text-sm leading-relaxed",
                    m.role === 'user' 
                      ? "bg-emerald-500 text-zinc-50 ml-auto rounded-tr-none" 
                      : "bg-zinc-50/5 text-zinc-300 mr-auto rounded-tl-none border border-zinc-50/5"
                  )}
                >
                  {m.text}
                </motion.div>
              ))}
              {isLoading && (
                <div className="flex items-center gap-2 text-zinc-500 text-xs italic ml-2">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Flipverse Guide is thinking...
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div className="px-5 py-2 flex gap-2 overflow-x-auto no-scrollbar">
              {[
                { icon: BookOpen, label: 'Library' },
                { icon: StickyNote, label: 'Notes' },
                { icon: Paperclip, label: 'Pins' },
                { icon: Highlighter, label: 'Highlights' }
              ].map((action, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setInput(`Tell me about ${action.label}`);
                  }}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-zinc-50/5 hover:bg-zinc-50/10 border border-zinc-50/10 rounded-full text-[10px] text-zinc-400 hover:text-zinc-200 transition-all"
                >
                  <action.icon className="w-3 h-3" />
                  {action.label}
                </button>
              ))}
            </div>

            {/* Input */}
            <div className="p-5 border-t border-zinc-50/5 bg-zinc-950/20">
              <div className="relative">
                <input
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSend()}
                  placeholder="Ask about Flipverse..."
                  className="w-full bg-zinc-50/5 border border-zinc-50/10 rounded-2xl pl-4 pr-12 py-3 text-sm text-zinc-50 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-700 disabled:opacity-50 text-zinc-50 rounded-xl transition-all active:scale-95 shadow-lg shadow-emerald-500/20"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-14 h-14 rounded-2xl flex items-center justify-center shadow-2xl transition-all duration-300",
          isOpen 
            ? "bg-teal-500 text-zinc-50 rotate-90" 
            : "bg-emerald-500 text-zinc-50 shadow-emerald-500/20"
        )}
      >
        {isOpen ? <X className="w-6 h-6" /> : <HelpCircle className="w-6 h-6" />}
      </motion.button>
    </div>
  );
};
