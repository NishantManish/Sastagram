import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, orderBy, onSnapshot, doc, getDoc, setDoc, addDoc, serverTimestamp, getDocs, writeBatch, updateDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { handleFirestoreError, OperationType } from '../utils/firestore';
import { Chat, Message, User, Post } from '../types';
import { Send, ArrowLeft, MessageSquare, Paperclip, X, Trash2, ShieldAlert, Image as ImageIcon, Search, Pencil } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import Profile from './Profile';
import PostDetailsModal from './PostDetailsModal';
import { useBlocks } from '../services/blockService';
import { motion, AnimatePresence } from 'motion/react';
import { deleteDoc } from 'firebase/firestore';
import { getOptimizedImageUrl } from '../utils/cloudinary';
import { deleteFromCloudinary } from '../utils/media';

export default function Messages({ onBack, onNavigate, onTagClick }: { onBack?: () => void, onNavigate?: (tab: any) => void, onTagClick?: (tag: string) => void }) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [chatUsers, setChatUsers] = useState<Record<string, User>>({});
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [chatToDelete, setChatToDelete] = useState<Chat | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Edit state
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [heldMessage, setHeldMessage] = useState<Message | null>(null);
  const messageLongPressTimer = useRef<NodeJS.Timeout | null>(null);

  const { blockedIds, blockedByIds } = useBlocks(auth.currentUser?.uid);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', auth.currentUser.uid),
      orderBy('updatedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedChats = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Chat[];
      
      setChats(fetchedChats);
      if (fetchedChats.length === 0) {
        setLoading(false);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'chats');
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Fetch user details for chats
  useEffect(() => {
    const fetchUsers = async () => {
      if (chats.length === 0) return;

      const userIds = new Set<string>();
      chats.forEach(chat => {
        chat.participants.forEach(id => {
          if (id !== auth.currentUser?.uid) userIds.add(id);
        });
      });

      const missingIds = Array.from(userIds).filter(id => !chatUsers[id]);
      if (missingIds.length === 0) {
        setLoading(false);
        return;
      }

      try {
        const usersData: Record<string, User> = {};
        await Promise.all(missingIds.map(async (id) => {
          const userDoc = await getDoc(doc(db, 'users', id));
          if (userDoc.exists()) {
            usersData[id] = { uid: userDoc.id, ...userDoc.data() } as User;
          }
        }));
        
        if (Object.keys(usersData).length > 0) {
          setChatUsers(prev => ({ ...prev, ...usersData }));
        }
      } catch (error) {
        console.error('Error fetching chat users:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, [chats]);

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

  // Handle user search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const searchUsers = async () => {
      setIsSearching(true);
      try {
        const q = query(
          collection(db, 'users'),
          where('username', '>=', searchQuery.toLowerCase()),
          where('username', '<=', searchQuery.toLowerCase() + '\uf8ff')
        );
        const snapshot = await getDocs(q);
        const results = snapshot.docs
          .map(doc => ({ uid: doc.id, ...doc.data() } as User))
          .filter(u => u.uid !== auth.currentUser?.uid && !blockedIds.includes(u.uid) && !blockedByIds.includes(u.uid));
        setSearchResults(results);
      } catch (error) {
        console.error('Error searching users:', error);
      } finally {
        setIsSearching(false);
      }
    };

    const debounce = setTimeout(searchUsers, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery, blockedIds, blockedByIds]);

  const handleStartChat = async (user: User) => {
    if (!auth.currentUser) return;
    
    // Check if chat exists
    const existingChat = chats.find(c => c.participants.includes(user.uid));
    if (existingChat) {
      setSelectedChat(existingChat);
      setSearchQuery('');
      setSearchResults([]);
      return;
    }

    // Create new chat
    try {
      const newChatRef = await addDoc(collection(db, 'chats'), {
        participants: [auth.currentUser.uid, user.uid],
        updatedAt: serverTimestamp(),
        readStatus: {
          [auth.currentUser.uid]: true,
          [user.uid]: true
        }
      });
      
      const newChat: Chat = {
        id: newChatRef.id,
        participants: [auth.currentUser.uid, user.uid],
        updatedAt: new Date(),
        readStatus: {
          [auth.currentUser.uid]: true,
          [user.uid]: true
        }
      };
      
      setSelectedChat(newChat);
      setSearchQuery('');
      setSearchResults([]);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'chats');
    }
  };

  const handleMessageTouchStart = (msg: Message) => {
    if (msg.senderId !== auth.currentUser?.uid) return;
    messageLongPressTimer.current = setTimeout(() => {
      setHeldMessage(msg);
      if ('vibrate' in navigator) {
        navigator.vibrate(50);
      }
    }, 600);
  };

  const handleMessageTouchEnd = () => {
    if (messageLongPressTimer.current) {
      clearTimeout(messageLongPressTimer.current);
    }
  };

  const handleDeleteMessage = async (msg: Message) => {
    if (!selectedChat || !auth.currentUser || msg.senderId !== auth.currentUser.uid) return;
    try {
      const msgRef = doc(db, `chats/${selectedChat.id}/messages`, msg.id);
      await deleteDoc(msgRef);
      
      if (msg.attachmentUrl) {
        await deleteFromCloudinary(msg.attachmentUrl);
      }
      
      // Update last message if this was the last one
      if (messages[messages.length - 1]?.id === msg.id) {
        const lastMsg = messages[messages.length - 2];
        await updateDoc(doc(db, 'chats', selectedChat.id), {
          lastMessage: lastMsg ? (lastMsg.text || 'Attachment') : '',
          updatedAt: serverTimestamp()
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `chats/${selectedChat.id}/messages/${msg.id}`);
    } finally {
      setHeldMessage(null);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChat || !auth.currentUser) return;
    
    if (editingMessage) {
      if (!newMessage.trim() && !editingMessage.attachmentUrl && !editingMessage.sharedPostId) return;
    } else {
      if (!newMessage.trim() && !attachment) return;
    }

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

    if (editingMessage) {
      try {
        const msgRef = doc(db, `chats/${selectedChat.id}/messages`, editingMessage.id);
        await updateDoc(msgRef, {
          text: messageText,
          editedAt: serverTimestamp(),
          isEdited: true
        });
        setEditingMessage(null);
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `chats/${selectedChat.id}/messages/${editingMessage.id}`);
      }
      return;
    }

    try {
      const batch = writeBatch(db);

      const newMessageRef = doc(collection(db, `chats/${selectedChat.id}/messages`));
      batch.set(newMessageRef, {
        chatId: selectedChat.id,
        senderId: auth.currentUser.uid,
        text: messageText,
        attachmentUrl,
        createdAt: serverTimestamp()
      });

      const otherUserId = selectedChat.participants.find(id => id !== auth.currentUser?.uid);
      batch.set(doc(db, 'chats', selectedChat.id), {
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

      await batch.commit();

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

  const handlePostClick = async (postId: string) => {
    try {
      const postDoc = await getDoc(doc(db, 'posts', postId));
      if (postDoc.exists()) {
        setSelectedPost({ id: postDoc.id, ...postDoc.data() } as Post);
      } else {
        alert('This post is no longer available.');
      }
    } catch (error) {
      console.error('Error fetching post:', error);
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
      <div className="max-w-md mx-auto bg-white h-[100dvh] flex flex-col overflow-hidden">
        <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b border-zinc-100 px-4 py-3 flex items-center gap-3 shadow-sm shrink-0">
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

        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-zinc-50/50 relative">
          {heldMessage && (
            <div 
              className="fixed inset-0 z-10" 
              onClick={() => setHeldMessage(null)} 
            />
          )}
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

              const isEditable = isMine && msg.createdAt && (Date.now() - msg.createdAt.toMillis() < 60 * 60 * 1000);

              return (
                <motion.div 
                  key={msg.id} 
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                  className={`flex flex-col group ${isMine ? 'items-end' : 'items-start'}`}
                >
                  {showTime && msg.createdAt && (
                    <span className="text-[10px] font-medium text-zinc-400 mb-2 px-2 uppercase tracking-wider">
                      {formatDistanceToNow(msg.createdAt.toDate(), { addSuffix: true })}
                    </span>
                  )}
                  <div 
                    className={`flex items-center gap-2 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}
                    onMouseDown={() => handleMessageTouchStart(msg)}
                    onMouseUp={handleMessageTouchEnd}
                    onMouseLeave={handleMessageTouchEnd}
                    onTouchStart={() => handleMessageTouchStart(msg)}
                    onTouchEnd={handleMessageTouchEnd}
                  >
                    <div 
                      className={`max-w-[75%] px-4 py-2.5 rounded-2xl shadow-sm relative ${
                        isMine 
                          ? 'bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-br-sm' 
                          : 'bg-white border border-zinc-100 text-zinc-900 rounded-bl-sm'
                      }`}
                    >
                      <AnimatePresence>
                        {heldMessage?.id === msg.id && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 10 }}
                            className={`absolute z-20 bottom-full mb-2 flex flex-col items-stretch bg-white rounded-2xl shadow-xl border border-zinc-100 p-1.5 min-w-[140px] ${isMine ? 'right-0' : 'left-0'}`}
                          >
                            {isEditable && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingMessage(msg);
                                  setNewMessage(msg.text || '');
                                  setHeldMessage(null);
                                }}
                                className="flex items-center gap-3 px-4 py-2.5 text-zinc-700 hover:bg-zinc-50 rounded-xl transition-colors"
                              >
                                <Pencil className="w-4 h-4 text-indigo-500" />
                                <span className="text-sm font-medium">Edit</span>
                              </button>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm('Delete this message?')) {
                                  handleDeleteMessage(msg);
                                }
                              }}
                              className="flex items-center gap-3 px-4 py-2.5 text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                              <span className="text-sm font-medium">Delete</span>
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
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
                      {msg.sharedPostId && (
                        <div 
                          onClick={() => handlePostClick(msg.sharedPostId!)}
                          className={`mb-2 p-3 rounded-xl border cursor-pointer transition-colors flex items-center gap-3 ${
                            isMine ? 'bg-indigo-600/50 border-indigo-400 hover:bg-indigo-600/70' : 'bg-zinc-50 border-zinc-200 hover:bg-zinc-100'
                          }`}
                        >
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${isMine ? 'bg-indigo-500' : 'bg-zinc-200'}`}>
                            <ImageIcon className={`w-5 h-5 ${isMine ? 'text-white' : 'text-zinc-500'}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-semibold truncate ${isMine ? 'text-white' : 'text-zinc-900'}`}>Shared Post</p>
                            <p className={`text-xs truncate ${isMine ? 'text-indigo-200' : 'text-zinc-500'}`}>Tap to view</p>
                          </div>
                        </div>
                      )}
                      {msg.text && (
                        <div className="flex items-end gap-2">
                          <p className="text-[15px] leading-relaxed break-words">{msg.text}</p>
                          {msg.isEdited && <span className="text-[10px] opacity-70 mb-0.5 shrink-0">(edited)</span>}
                        </div>
                      )}
                    </div>
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

        <div className="bg-white/90 backdrop-blur-md border-t border-zinc-200 p-3 pb-safe shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.05)] shrink-0">
          {isBlocked ? (
            <div className="flex items-center justify-center gap-2 text-zinc-500 text-sm py-2">
              <ShieldAlert className="w-4 h-4" />
              <span>You cannot message this user.</span>
            </div>
          ) : (
            <>
              {editingMessage && (
                <div className="mb-2 flex items-center justify-between bg-indigo-50/50 border border-indigo-100/50 px-3 py-2 rounded-xl">
                  <div className="flex items-center gap-2 text-indigo-600">
                    <Pencil className="w-3.5 h-3.5" />
                    <span className="text-xs font-medium">Editing message</span>
                  </div>
                  <button 
                    onClick={() => {
                      setEditingMessage(null);
                      setNewMessage('');
                    }} 
                    className="p-1 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-100 rounded-full transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
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
                  disabled={!!editingMessage}
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
                  placeholder={editingMessage ? "Edit message..." : "Message..."}
                  className="flex-1 bg-zinc-100/80 border border-zinc-200/50 rounded-full px-4 py-2.5 text-[15px] focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none transition-all"
                />
                <motion.button 
                  whileTap={{ scale: 0.9 }}
                  type="submit"
                  disabled={editingMessage ? (!newMessage.trim() && !editingMessage.attachmentUrl && !editingMessage.sharedPostId) : (!newMessage.trim() && !attachment)}
                  className="p-2.5 bg-indigo-600 text-white rounded-full disabled:opacity-50 disabled:cursor-not-allowed hover:bg-indigo-700 transition-colors shadow-sm"
                >
                  <Send className="w-4 h-4 ml-0.5" />
                </motion.button>
              </form>
            </>
          )}
        </div>
        <AnimatePresence>
          {selectedPost && (
            <PostDetailsModal 
              post={selectedPost} 
              onClose={() => setSelectedPost(null)} 
              onUserClick={setSelectedUserId}
              onTagClick={onTagClick}
            />
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto bg-white h-[100dvh] flex flex-col overflow-hidden">
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b border-zinc-100 px-4 py-3 flex flex-col gap-3 shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          {onBack && (
            <button onClick={onBack} className="p-2 -ml-2 text-zinc-500 hover:bg-zinc-100 rounded-full transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <h1 className="text-xl font-bold text-zinc-900 tracking-tight">Messages</h1>
        </div>
        
        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Search users to chat..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-100 border-none rounded-xl pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:bg-white transition-all outline-none"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-zinc-200 rounded-full"
            >
              <X className="w-3 h-3 text-zinc-500" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-20">
        {searchQuery ? (
          <div className="px-2 py-2">
            {isSearching ? (
              <div className="flex justify-center p-4"><div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" /></div>
            ) : searchResults.length > 0 ? (
              searchResults.map(user => (
                <div 
                  key={user.uid}
                  onClick={() => handleStartChat(user)}
                  className="p-3 my-1 rounded-2xl flex items-center gap-3 cursor-pointer hover:bg-zinc-50 transition-all"
                >
                  <div className="w-12 h-12 rounded-full bg-zinc-200 overflow-hidden shrink-0">
                    {user.photoURL ? (
                      <img src={getOptimizedImageUrl(user.photoURL, 96, 96)} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-500 font-medium">{user.displayName?.charAt(0)}</div>
                    )}
                  </div>
                  <div>
                    <h3 className="font-semibold text-zinc-900">{user.displayName}</h3>
                    <p className="text-sm text-zinc-500">@{user.username}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-center text-zinc-500 p-4">No users found</p>
            )}
          </div>
        ) : loading ? (
          <div className="flex justify-center items-center h-40">
            <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          </div>
        ) : filteredChats.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center h-full px-8 text-center"
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
      </div>

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
      <AnimatePresence>
        {selectedPost && (
          <PostDetailsModal 
            post={selectedPost} 
            onClose={() => setSelectedPost(null)} 
            onUserClick={setSelectedUserId}
            onTagClick={onTagClick}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
