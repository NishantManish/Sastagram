import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, orderBy, onSnapshot, doc, getDoc, setDoc, addDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { handleFirestoreError, OperationType } from '../utils/firestore';
import { Chat, Message, User } from '../types';
import { Send, ArrowLeft, MessageSquare, Paperclip, X, Trash2, ShieldAlert } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import Profile from './Profile';
import { useBlocks } from '../services/blockService';
import { motion, AnimatePresence } from 'motion/react';
import { deleteDoc } from 'firebase/firestore';
import { getOptimizedImageUrl } from '../utils/cloudinary';
import { deleteFromCloudinary } from '../utils/media';

export default function Messages({ onBack, onNavigate }: { onBack?: () => void, onNavigate?: (tab: any) => void }) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [chatUsers, setChatUsers] = useState<Record<string, User>>({});
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [chatToDelete, setChatToDelete] = useState<Chat | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  
  const { blockedIds, blockedByIds } = useBlocks(auth.currentUser?.uid);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', auth.currentUser.uid),
      orderBy('updatedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const fetchedChats = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Chat[];
      
      setChats(fetchedChats);
      setLoading(false);

      // Fetch user details for chats
      const userIds = new Set<string>();
      fetchedChats.forEach(chat => {
        chat.participants.forEach(id => {
          if (id !== auth.currentUser?.uid) userIds.add(id);
        });
      });

      const usersData: Record<string, User> = {};
      for (const id of Array.from(userIds)) {
        if (!chatUsers[id]) {
          const userDoc = await getDoc(doc(db, 'users', id));
          if (userDoc.exists()) {
            usersData[id] = { uid: userDoc.id, ...userDoc.data() } as User;
          }
        }
      }
      
      if (Object.keys(usersData).length > 0) {
        setChatUsers(prev => ({ ...prev, ...usersData }));
      }
    });

    return () => unsubscribe();
  }, []);

  // Handle messages subscription
  useEffect(() => {
    if (!selectedChat) return;

    const q = query(
      collection(db, `chats/${selectedChat.id}/messages`),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedMessages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Message[];
      setMessages(fetchedMessages);
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    });

    return () => unsubscribe();
  }, [selectedChat]);

  // Handle marking chat as read
  useEffect(() => {
    if (!selectedChat || !auth.currentUser) return;

    // Find the latest version of the selected chat from the chats array
    const currentChat = chats.find(c => c.id === selectedChat.id);
    
    // Mark chat as read if it's currently selected and unread
    if (currentChat && currentChat.readStatus?.[auth.currentUser.uid] === false) {
      setDoc(doc(db, 'chats', currentChat.id), {
        readStatus: {
          ...currentChat.readStatus,
          [auth.currentUser.uid]: true
        }
      }, { merge: true }).catch(console.error);
    }
  }, [selectedChat, chats]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!newMessage.trim() && !attachment) || !selectedChat || !auth.currentUser) return;

    let attachmentUrl = '';
    if (attachment) {
      const formData = new FormData();
      formData.append('file', attachment);
      formData.append('upload_preset', (import.meta as any).env.VITE_CLOUDINARY_UPLOAD_PRESET);
      
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${(import.meta as any).env.VITE_CLOUDINARY_CLOUD_NAME}/upload`,
        { method: 'POST', body: formData }
      );
      const data = await response.json();
      attachmentUrl = data.secure_url;
    }

    const messageText = newMessage.trim();
    setNewMessage('');
    setAttachment(null);

    try {
      await addDoc(collection(db, `chats/${selectedChat.id}/messages`), {
        chatId: selectedChat.id,
        senderId: auth.currentUser.uid,
        text: messageText,
        attachmentUrl,
        createdAt: serverTimestamp()
      });

      const otherUserId = selectedChat.participants.find(id => id !== auth.currentUser?.uid);
      await setDoc(doc(db, 'chats', selectedChat.id), {
        lastMessage: messageText || 'Attachment',
        updatedAt: serverTimestamp(),
        readStatus: {
          [auth.currentUser.uid]: true,
          ...(otherUserId ? { [otherUserId]: false } : {})
        }
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `chats/${selectedChat.id}`);
    }
  };

  const getOtherUser = (chat: Chat) => {
    const otherUserId = chat.participants.find(id => id !== auth.currentUser?.uid);
    return otherUserId ? chatUsers[otherUserId] : null;
  };

  const filteredChats = chats.filter(chat => {
    const otherUserId = chat.participants.find(id => id !== auth.currentUser?.uid);
    if (!otherUserId) return true;
    return !blockedIds.includes(otherUserId) && !blockedByIds.includes(otherUserId);
  });

  const handleDeleteChat = async () => {
    if (!chatToDelete || !auth.currentUser) return;
    setIsDeleting(true);
    try {
      // Delete all messages first
      const messagesRef = collection(db, `chats/${chatToDelete.id}/messages`);
      const messagesSnap = await getDocs(messagesRef);
      
      // Delete attachments from Cloudinary
      const attachmentDeletionPromises = messagesSnap.docs.map(m => {
        const data = m.data();
        if (data.attachmentUrl) {
          return deleteFromCloudinary(data.attachmentUrl);
        }
        return Promise.resolve(true);
      });
      await Promise.all(attachmentDeletionPromises);

      const deletePromises = messagesSnap.docs.map(m => deleteDoc(m.ref));
      await Promise.all(deletePromises);
      
      // Delete the chat document
      await deleteDoc(doc(db, 'chats', chatToDelete.id));
      setChatToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `chats/${chatToDelete.id}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleTouchStart = (chat: Chat) => {
    longPressTimer.current = setTimeout(() => {
      setChatToDelete(chat);
      // Vibrate if supported
      if ('vibrate' in navigator) {
        navigator.vibrate(50);
      }
    }, 600);
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }
  };

  if (selectedUserId) {
    return <Profile userId={selectedUserId} onBack={() => setSelectedUserId(null)} onNavigate={onNavigate} />;
  }

  if (selectedChat) {
    const otherUser = getOtherUser(selectedChat);
    const isBlocked = otherUser ? (blockedIds.includes(otherUser.uid) || blockedByIds.includes(otherUser.uid)) : false;
    
    return (
      <div className="max-w-md mx-auto bg-white min-h-screen flex flex-col">
        <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-zinc-200 px-4 py-3 flex items-center gap-3">
          <button onClick={() => setSelectedChat(null)} className="p-2 -ml-2 text-zinc-500 hover:bg-zinc-100 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => otherUser && setSelectedUserId(otherUser.uid)}
              className="w-8 h-8 rounded-full bg-zinc-200 overflow-hidden shrink-0 hover:opacity-80 transition-opacity"
            >
              {otherUser?.photoURL ? (
                <img 
                  src={getOptimizedImageUrl(otherUser.photoURL, 64, 64)} 
                  alt={otherUser.displayName || ''} 
                  className="w-full h-full object-cover" 
                  referrerPolicy="no-referrer" 
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-500 font-medium text-sm">
                  {otherUser?.displayName?.charAt(0).toUpperCase()}
                </div>
              )}
            </button>
            <button 
              onClick={() => otherUser && setSelectedUserId(otherUser.uid)}
              className="font-semibold text-zinc-900 hover:underline"
            >
              {otherUser?.displayName}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-20">
          {messages.map((msg, index) => {
            const isMine = msg.senderId === auth.currentUser?.uid;
            const showTime = index === 0 || 
              (msg.createdAt && messages[index - 1]?.createdAt && 
               msg.createdAt.toMillis() - messages[index - 1].createdAt.toMillis() > 5 * 60 * 1000);

            return (
              <div key={msg.id} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                {showTime && msg.createdAt && (
                  <span className="text-[10px] text-zinc-400 mb-2 px-2">
                    {formatDistanceToNow(msg.createdAt.toDate(), { addSuffix: true })}
                  </span>
                )}
                <div 
                  className={`max-w-[75%] px-4 py-2 rounded-2xl ${
                    isMine 
                      ? 'bg-indigo-600 text-white rounded-br-sm' 
                      : 'bg-zinc-100 text-zinc-900 rounded-bl-sm'
                  }`}
                >
                  {msg.attachmentUrl && (
                    <img 
                      src={getOptimizedImageUrl(msg.attachmentUrl, 600)} 
                      alt="Attachment" 
                      className="rounded-lg mb-2 max-w-full" 
                      referrerPolicy="no-referrer" 
                    />
                  )}
                  {msg.text && <p className="text-sm">{msg.text}</p>}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-zinc-200 p-4 max-w-md mx-auto pb-safe">
          {isBlocked ? (
            <div className="flex items-center justify-center gap-2 text-zinc-500 text-sm py-2">
              <ShieldAlert className="w-4 h-4" />
              <span>You cannot message this user.</span>
            </div>
          ) : (
            <>
              {attachment && (
                <div className="mb-2 flex items-center gap-2 bg-zinc-100 p-2 rounded-lg">
                  <span className="text-xs truncate flex-1">{attachment.name}</span>
                  <button onClick={() => setAttachment(null)} className="text-zinc-500 hover:text-zinc-900">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setAttachment(e.target.files[0]);
                    }
                  }}
                  className="hidden"
                  accept="image/*,video/*"
                />
                <button 
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 text-zinc-500 hover:text-zinc-900"
                >
                  <Paperclip className="w-5 h-5" />
                </button>
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Message..."
                  className="flex-1 bg-zinc-100 border-none rounded-full px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-shadow"
                />
                <button 
                  type="submit"
                  disabled={(!newMessage.trim() && !attachment)}
                  className="p-2 bg-indigo-600 text-white rounded-full disabled:opacity-50 disabled:cursor-not-allowed hover:bg-indigo-700 transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto pb-20 bg-white min-h-screen">
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-zinc-200 px-4 py-3 flex items-center gap-3">
        {onBack && (
          <button onClick={onBack} className="p-2 -ml-2 text-zinc-500 hover:bg-zinc-100 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <h1 className="text-xl font-bold text-zinc-900">Messages</h1>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-40">
          <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      ) : filteredChats.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[60vh] text-zinc-500">
          <MessageSquare className="w-12 h-12 mb-4 text-zinc-300" />
          <p className="text-lg font-medium text-zinc-900">No messages yet</p>
          <p className="text-sm">Start a conversation with someone.</p>
        </div>
      ) : (
        <div className="divide-y divide-zinc-100">
          {filteredChats.map((chat) => {
            const otherUser = getOtherUser(chat);
            if (!otherUser) return null;
            
            const isUnread = auth.currentUser && chat.readStatus?.[auth.currentUser.uid] === false;

            return (
              <div 
                key={chat.id} 
                onClick={() => !chatToDelete && setSelectedChat(chat)}
                onTouchStart={() => handleTouchStart(chat)}
                onTouchEnd={handleTouchEnd}
                onMouseDown={() => handleTouchStart(chat)}
                onMouseUp={handleTouchEnd}
                onMouseLeave={handleTouchEnd}
                className={`p-4 flex items-center gap-3 cursor-pointer hover:bg-zinc-50 transition-colors relative active:bg-zinc-100 ${isUnread ? 'bg-indigo-50/50' : ''}`}
              >
                <div className="w-12 h-12 rounded-full bg-zinc-200 overflow-hidden shrink-0 relative">
                  {otherUser.photoURL ? (
                    <img 
                      src={getOptimizedImageUrl(otherUser.photoURL, 96, 96)} 
                      alt={otherUser.displayName || ''} 
                      className="w-full h-full object-cover" 
                      referrerPolicy="no-referrer" 
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-500 font-medium">
                      {otherUser.displayName?.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline">
                    <h3 className={`truncate ${isUnread ? 'font-bold text-zinc-900' : 'font-semibold text-zinc-900'}`}>{otherUser.displayName}</h3>
                    {chat.updatedAt && (
                      <span className={`text-xs shrink-0 ml-2 ${isUnread ? 'text-indigo-600 font-medium' : 'text-zinc-400'}`}>
                        {formatDistanceToNow(chat.updatedAt.toDate(), { addSuffix: false }).replace('about ', '')}
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between items-center mt-0.5">
                    <p className={`text-sm truncate pr-4 ${isUnread ? 'font-medium text-zinc-900' : 'text-zinc-500'}`}>
                      {chat.lastMessage || 'Started a chat'}
                    </p>
                    {isUnread && (
                      <div className="w-2.5 h-2.5 bg-indigo-600 rounded-full shrink-0" />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {chatToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-2xl w-full max-w-xs overflow-hidden shadow-2xl"
            >
              <div className="p-6 text-center">
                <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Trash2 className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-bold text-zinc-900 mb-2">Delete Chat?</h3>
                <p className="text-zinc-500 text-sm mb-6">
                  Are you sure you want to delete this conversation? This action cannot be undone.
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={handleDeleteChat}
                    disabled={isDeleting}
                    className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-colors disabled:opacity-50"
                  >
                    {isDeleting ? 'Deleting...' : 'Delete'}
                  </button>
                  <button
                    onClick={() => setChatToDelete(null)}
                    disabled={isDeleting}
                    className="w-full py-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-900 font-bold rounded-xl transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
