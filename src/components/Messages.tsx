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
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'chats');
      setLoading(false);
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
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `chats/${selectedChat.id}/messages`);
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

  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (selectedChat && auth.currentUser) {
        setDoc(doc(db, 'chats', selectedChat.id), {
          typingStatus: {
            [auth.currentUser.uid]: false
          }
        }, { merge: true }).catch(console.error);
      }
    };
  }, [selectedChat]);

  const handleTyping = () => {
    if (!selectedChat || !auth.currentUser) return;

    // Set typing to true
    setDoc(doc(db, 'chats', selectedChat.id), {
      typingStatus: {
        [auth.currentUser.uid]: true
      }
    }, { merge: true }).catch(console.error);

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set timeout to set typing to false after 2 seconds
    typingTimeoutRef.current = setTimeout(() => {
      if (auth.currentUser && selectedChat) {
        setDoc(doc(db, 'chats', selectedChat.id), {
          typingStatus: {
            [auth.currentUser.uid]: false
          }
        }, { merge: true }).catch(console.error);
      }
    }, 2000);
  };

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
        },
        typingStatus: {
          [auth.currentUser.uid]: false
        }
      }, { merge: true });

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
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
    const currentChat = chats.find(c => c.id === selectedChat.id) || selectedChat;
    const otherUser = getOtherUser(currentChat);
    const isBlocked = otherUser ? (blockedIds.includes(otherUser.uid) || blockedByIds.includes(otherUser.uid)) : false;
    
    return (
      <div className="max-w-md mx-auto bg-white min-h-screen flex flex-col">
        <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b border-zinc-100 px-4 py-3 flex items-center gap-3 shadow-sm">
          <button onClick={() => setSelectedChat(null)} className="p-2 -ml-2 text-zinc-500 hover:bg-zinc-100 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => otherUser && setSelectedUserId(otherUser.uid)}
              className="w-9 h-9 rounded-full bg-zinc-200 overflow-hidden shrink-0 hover:opacity-80 transition-opacity border border-zinc-200"
            >
              {otherUser?.photoURL ? (
                <img 
                  src={getOptimizedImageUrl(otherUser.photoURL, 64, 64)} 
                  alt={otherUser.displayName || ''} 
                  loading="lazy"
                  decoding="async"
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

        <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-24 bg-zinc-50/50">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-8 opacity-60">
              <div className="w-16 h-16 bg-zinc-100 rounded-2xl flex items-center justify-center mb-4">
                <MessageSquare className="w-8 h-8 text-zinc-400" />
              </div>
              <p className="text-zinc-500 text-sm font-medium">No messages yet. Say hello!</p>
            </div>
          ) : (
            messages.map((msg, index) => {
              const isMine = msg.senderId === auth.currentUser?.uid;
              const isLastMessage = index === messages.length - 1;
              const otherUserId = currentChat.participants.find(id => id !== auth.currentUser?.uid);
              const isRead = isLastMessage && isMine && otherUserId && currentChat.readStatus?.[otherUserId];

              const showTime = index === 0 || 
                (msg.createdAt && messages[index - 1]?.createdAt && 
                 msg.createdAt.toMillis() - messages[index - 1].createdAt.toMillis() > 5 * 60 * 1000);

              return (
                <motion.div 
                  key={msg.id} 
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                  className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                >
                  {showTime && msg.createdAt && (
                    <span className="text-[10px] font-medium text-zinc-400 mb-2 px-2 uppercase tracking-wider">
                      {formatDistanceToNow(msg.createdAt.toDate(), { addSuffix: true })}
                    </span>
                  )}
                  <div 
                    className={`max-w-[75%] px-4 py-2.5 rounded-2xl shadow-sm ${
                      isMine 
                        ? 'bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-br-sm' 
                        : 'bg-white border border-zinc-100 text-zinc-900 rounded-bl-sm'
                    }`}
                  >
                    {msg.attachmentUrl && (
                      <img 
                        src={getOptimizedImageUrl(msg.attachmentUrl, 400)} 
                        alt="Attachment" 
                        loading="lazy"
                        decoding="async"
                        className="rounded-xl mb-2 max-w-full border border-black/5" 
                        referrerPolicy="no-referrer" 
                      />
                    )}
                    {msg.text && <p className="text-[15px] leading-relaxed">{msg.text}</p>}
                  </div>
                  {isRead && (
                    <span className="text-[10px] font-medium text-zinc-400 mt-1 mr-1">Read</span>
                  )}
                </motion.div>
              );
            })
          )}
          {Object.entries(currentChat.typingStatus || {}).map(([userId, isTyping]) => {
            if (isTyping && userId !== auth.currentUser?.uid) {
              return (
                <motion.div
                  key={`typing-${userId}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="flex justify-start mb-4"
                >
                  <div className="bg-white border border-zinc-100 text-zinc-500 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm flex items-center gap-1">
                    <motion.div
                      animate={{ y: [0, -5, 0] }}
                      transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
                      className="w-1.5 h-1.5 bg-zinc-400 rounded-full"
                    />
                    <motion.div
                      animate={{ y: [0, -5, 0] }}
                      transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
                      className="w-1.5 h-1.5 bg-zinc-400 rounded-full"
                    />
                    <motion.div
                      animate={{ y: [0, -5, 0] }}
                      transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }}
                      className="w-1.5 h-1.5 bg-zinc-400 rounded-full"
                    />
                  </div>
                </motion.div>
              );
            }
            return null;
          })}
          <div ref={messagesEndRef} />
        </div>

        <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t border-zinc-200 p-3 max-w-md mx-auto pb-safe shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.05)]">
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
                  onChange={(e) => {
                    setNewMessage(e.target.value);
                    handleTyping();
                  }}
                  placeholder="Message..."
                  className="flex-1 bg-zinc-100/80 border border-zinc-200/50 rounded-full px-4 py-2.5 text-[15px] focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none transition-all"
                />
                <motion.button 
                  whileTap={{ scale: 0.9 }}
                  type="submit"
                  disabled={(!newMessage.trim() && !attachment)}
                  className="p-2.5 bg-indigo-600 text-white rounded-full disabled:opacity-50 disabled:cursor-not-allowed hover:bg-indigo-700 transition-colors shadow-sm"
                >
                  <Send className="w-4 h-4 ml-0.5" />
                </motion.button>
              </form>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto pb-20 bg-white min-h-screen">
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b border-zinc-100 px-4 py-3 flex items-center gap-3 shadow-sm">
        {onBack && (
          <button onClick={onBack} className="p-2 -ml-2 text-zinc-500 hover:bg-zinc-100 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <h1 className="text-xl font-bold text-zinc-900 tracking-tight">Messages</h1>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-40">
          <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      ) : filteredChats.length === 0 ? (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center h-[70vh] px-8 text-center"
        >
          <div className="relative mb-8">
            <div className="w-24 h-24 bg-indigo-50 rounded-[32px] flex items-center justify-center border border-indigo-100/50 shadow-sm rotate-3">
              <MessageSquare className="w-10 h-10 text-indigo-500" />
            </div>
            <div className="absolute -bottom-2 -right-2 w-12 h-12 bg-purple-50 rounded-2xl flex items-center justify-center border border-purple-100/50 shadow-sm -rotate-6">
              <Send className="w-5 h-5 text-purple-500" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-zinc-900 mb-3 tracking-tight">Your inbox is waiting</h2>
          <p className="text-zinc-500 text-[15px] leading-relaxed max-w-[260px]">
            Connect with friends and start a conversation. Your messages will appear here.
          </p>
          <button 
            onClick={() => onNavigate?.('search')}
            className="mt-8 px-8 py-3 bg-indigo-600 text-white font-bold rounded-2xl shadow-lg shadow-indigo-200 hover:bg-indigo-700 active:scale-95 transition-all text-sm"
          >
            Find someone to chat
          </button>
        </motion.div>
      ) : (
        <div className="divide-y divide-zinc-100/50 px-2">
          {filteredChats.map((chat, index) => {
            const otherUser = getOtherUser(chat);
            if (!otherUser) return null;
            
            const isUnread = auth.currentUser && chat.readStatus?.[auth.currentUser.uid] === false;

            return (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: index * 0.05 }}
                key={chat.id} 
                onClick={() => !chatToDelete && setSelectedChat(chat)}
                onTouchStart={() => handleTouchStart(chat)}
                onTouchEnd={handleTouchEnd}
                onMouseDown={() => handleTouchStart(chat)}
                onMouseUp={handleTouchEnd}
                onMouseLeave={handleTouchEnd}
                className={`p-3 my-1 rounded-2xl flex items-center gap-3 cursor-pointer hover:bg-zinc-50 transition-all relative active:scale-[0.98] ${isUnread ? 'bg-indigo-50/40' : ''}`}
              >
                <div className="w-14 h-14 rounded-full bg-zinc-200 overflow-hidden shrink-0 relative border border-zinc-200 shadow-sm">
                  {otherUser.photoURL ? (
                    <img 
                      src={getOptimizedImageUrl(otherUser.photoURL, 96, 96)} 
                      alt={otherUser.displayName || ''} 
                      loading="lazy"
                      decoding="async"
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
                  <div className="flex justify-between items-baseline mb-0.5">
                    <h3 className={`truncate text-[15px] ${isUnread ? 'font-bold text-zinc-900' : 'font-semibold text-zinc-800'}`}>{otherUser.displayName}</h3>
                    {chat.updatedAt && (
                      <span className={`text-[11px] shrink-0 ml-2 ${isUnread ? 'text-indigo-600 font-bold' : 'text-zinc-400 font-medium'}`}>
                        {formatDistanceToNow(chat.updatedAt.toDate(), { addSuffix: false }).replace('about ', '')}
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between items-center">
                    <p className={`text-[14px] truncate pr-4 ${isUnread ? 'font-semibold text-zinc-900' : 'text-zinc-500'}`}>
                      {chat.lastMessage || 'Started a chat'}
                    </p>
                    {isUnread && (
                      <div className="w-2.5 h-2.5 bg-indigo-600 rounded-full shrink-0 shadow-sm" />
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {chatToDelete && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="bg-white rounded-[24px] w-full max-w-xs overflow-hidden shadow-2xl border border-zinc-100"
            >
              <div className="p-6 text-center">
                <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100/50 shadow-sm">
                  <Trash2 className="w-7 h-7" />
                </div>
                <h3 className="text-[19px] font-bold text-zinc-900 mb-2 tracking-tight">Delete Chat?</h3>
                <p className="text-zinc-500 text-[15px] mb-6 leading-relaxed">
                  Are you sure you want to delete this conversation? This action cannot be undone.
                </p>
                <div className="flex flex-col gap-2.5">
                  <button
                    onClick={handleDeleteChat}
                    disabled={isDeleting}
                    className="w-full py-3.5 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 shadow-sm"
                  >
                    {isDeleting ? 'Deleting...' : 'Delete'}
                  </button>
                  <button
                    onClick={() => setChatToDelete(null)}
                    disabled={isDeleting}
                    className="w-full py-3.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-900 font-semibold rounded-xl transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
