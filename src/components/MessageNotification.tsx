import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Chat, User } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquare, X } from 'lucide-react';
import UserAvatar from './UserAvatar';

// Global cache to survive component remounts
const notifiedChatsCache: Record<string, string> = {};
let isFirstGlobalLoad = true;

interface MessageNotificationProps {
  onNavigate: (tab: 'messages') => void;
  activeTab: string;
}

export default function MessageNotification({ onNavigate, activeTab }: MessageNotificationProps) {
  const [notification, setNotification] = useState<{
    chatId: string;
    senderId: string;
    text: string;
    senderName: string;
    senderPhoto: string;
  } | null>(null);
  const activeTabRef = useRef(activeTab);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', auth.currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      // On first load, just populate the cache to avoid notifying for old messages
      if (isFirstGlobalLoad) {
        snapshot.docs.forEach(doc => {
          const data = doc.data() as Chat;
          notifiedChatsCache[doc.id] = data.lastMessage || '';
        });
        isFirstGlobalLoad = false;
        return;
      }

      snapshot.docChanges().forEach(async (change) => {
        if (change.type === 'added' || change.type === 'modified') {
          const chatData = change.doc.data() as Chat;
          const chatId = change.doc.id;
          const isUnread = chatData.readStatus?.[auth.currentUser!.uid] === false;
          const currentLastMessage = chatData.lastMessage || '';
          
          // Notify if:
          // 1. It's unread
          // 2. We're not on the messages tab
          // 3. The message content has changed since we last notified (or since initial load)
          if (isUnread && activeTabRef.current !== 'messages' && currentLastMessage !== notifiedChatsCache[chatId]) {
            notifiedChatsCache[chatId] = currentLastMessage;
            const senderId = chatData.participants.find(id => id !== auth.currentUser?.uid);
            
            if (senderId) {
              const userDoc = await getDoc(doc(db, 'users', senderId));
              if (userDoc.exists()) {
                const userData = userDoc.data() as User;
                setNotification({
                  chatId,
                  senderId,
                  text: currentLastMessage || 'New message',
                  senderName: userData.displayName || 'Someone',
                  senderPhoto: userData.photoURL || '',
                });

                // Auto hide after 5 seconds
                setTimeout(() => {
                  setNotification(null);
                }, 5000);
              }
            }
          } else if (!isUnread) {
            // Update the last notified message even if read, so we're ready for the next one
            notifiedChatsCache[chatId] = currentLastMessage;
          }
        }
      });
    });

    return () => unsubscribe();
  }, []);

  return (
    <AnimatePresence>
      {notification && (
        <motion.div
          initial={{ opacity: 0, y: -100, x: '-50%', scale: 0.9 }}
          animate={{ opacity: 1, y: 16, x: '-50%', scale: 1 }}
          exit={{ opacity: 0, y: -100, x: '-50%', scale: 0.9 }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="fixed top-0 left-1/2 z-[100] w-[92%] max-w-sm bg-white/80 backdrop-blur-xl rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] border border-white/50 p-2 flex items-center gap-3 cursor-pointer ring-1 ring-black/5"
          onClick={() => {
            onNavigate('messages');
            setNotification(null);
          }}
        >
          <div className="relative">
            <UserAvatar 
              userId={notification.senderId} 
              size={48} 
              className="rounded-2xl shadow-sm"
              fallbackPhoto={notification.senderPhoto} 
              fallbackName={notification.senderName} 
            />
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-indigo-500 rounded-full border-2 border-white flex items-center justify-center">
              <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
            </div>
          </div>
          <div className="flex-1 min-w-0 py-1">
            <div className="flex items-center gap-1.5 mb-0.5">
              <h4 className="text-[14px] font-bold text-zinc-900 truncate tracking-tight">
                {notification.senderName}
              </h4>
              <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest bg-indigo-50 px-1.5 py-0.5 rounded-md">
                New
              </span>
            </div>
            <p className="text-[13px] text-zinc-500 truncate leading-tight">
              {notification.text}
            </p>
          </div>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              setNotification(null);
            }}
            className="p-2 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100/50 rounded-2xl transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
