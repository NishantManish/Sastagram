import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, orderBy, onSnapshot, doc, getDoc, setDoc, addDoc, serverTimestamp, getDocs, writeBatch, updateDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { handleFirestoreError, OperationType } from '../utils/firestore';
import { Chat, Message, User, Post, Reel } from '../types';
import { Send, ArrowLeft, Paperclip, X, Trash2, ShieldAlert, Image as ImageIcon, Search, Pencil, Phone, Video, Info, ArrowRight, ChevronLeft, MoreVertical, Edit2, Check, CheckCheck, Clock, Plus, FileText, UserPlus, Clapperboard, Heart } from 'lucide-react';
import { formatDistanceToNow, format, isSameDay } from 'date-fns';
import Profile from './Profile';
import PostDetailsModal from './PostDetailsModal';
import ReelDetailsModal from './ReelDetailsModal';
import { useBlocks } from '../services/blockService';
import { cacheService } from '../services/cacheService';
import { motion, AnimatePresence } from 'motion/react';
import { deleteDoc } from 'firebase/firestore';
import { getOptimizedImageUrl } from '../utils/cloudinary';
import { deleteFromCloudinary } from '../utils/media';

import ConfirmationModal from './ConfirmationModal';

export default function Messages({ onBack, onNavigate, onTagClick }: { onBack?: () => void, onNavigate?: (tab: any) => void, onTagClick?: (tag: string) => void }) {
  const cache = cacheService.getMessagesCache();
  const [chats, setChats] = useState<Chat[]>(cache.chats);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(cache.chats.length === 0);
  const [chatUsers, setChatUsers] = useState<Record<string, User>>(cache.chatUsers);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [selectedReel, setSelectedReel] = useState<Reel | null>(null);
  const [selectedPostSlide, setSelectedPostSlide] = useState(0);
  const [chatToDelete, setChatToDelete] = useState<Chat | null>(null);
  const [messageToDelete, setMessageToDelete] = useState<Message | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
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

    const fetchUserRole = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', auth.currentUser!.uid));
        if (userDoc.exists()) {
          setUserRole(userDoc.data().role || 'user');
        }
      } catch (error) {
        console.error('Error fetching user role:', error);
      }
    };

    fetchUserRole();

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
      cacheService.setMessagesCache({ chats: fetchedChats });
      if (fetchedChats.length === 0) {
        setLoading(false);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'chats');
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Fetch user details for chats and shared profiles
  useEffect(() => {
    const fetchUsers = async () => {
      const userIds = new Set<string>();
      
      // Participants
      chats.forEach(chat => {
        chat.participants.forEach(id => {
          if (id !== auth.currentUser?.uid) userIds.add(id);
        });
      });

      // Shared profiles in messages
      messages.forEach(msg => {
        if (msg.sharedProfileId) userIds.add(msg.sharedProfileId);
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
          setChatUsers(prev => {
            const next = { ...prev, ...usersData };
            cacheService.setMessagesCache({ chatUsers: next });
            return next;
          });
        }
      } catch (error) {
        console.error('Error fetching chat users:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, [chats, messages]);

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
      setMessages(fetchedMessages.filter(m => !m.deletedFor?.includes(auth.currentUser?.uid || '')));
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
      }, { merge: true }).catch(err => handleFirestoreError(err, OperationType.UPDATE, `chats/${currentChat.id}`));
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
        }, { merge: true }).catch(err => handleFirestoreError(err, OperationType.UPDATE, `chats/${selectedChat.id}`));
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
    }, { merge: true }).catch(err => handleFirestoreError(err, OperationType.UPDATE, `chats/${selectedChat.id}`));

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
        }, { merge: true }).catch(err => handleFirestoreError(err, OperationType.UPDATE, `chats/${selectedChat.id}`));
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

  const handleDeleteMessage = async (msg: Message, type: 'me' | 'everyone') => {
    if (!selectedChat || !auth.currentUser) return;
    setIsDeleting(true);
    try {
      const msgRef = doc(db, `chats/${selectedChat.id}/messages`, msg.id);
      
      if (type === 'everyone') {
        await deleteDoc(msgRef);
        
        if (msg.attachmentUrl) {
          await deleteFromCloudinary(msg.attachmentUrl);
        }
        
        // Update last message if this was the last one
        const currentMessages = [...messages];
        if (currentMessages[currentMessages.length - 1]?.id === msg.id) {
          const lastMsg = currentMessages[currentMessages.length - 2];
          let lastMessageText = '';
          if (lastMsg) {
            if (lastMsg.sharedPostId) lastMessageText = 'Shared a post';
            else if (lastMsg.sharedReelId) lastMessageText = 'Shared a reel';
            else if (lastMsg.attachmentUrl) lastMessageText = 'Attachment';
            else lastMessageText = lastMsg.text || '';
          }
          await updateDoc(doc(db, 'chats', selectedChat.id), {
            lastMessage: lastMessageText,
            updatedAt: serverTimestamp()
          });
        }
      } else {
        // Delete for me
        const newDeletedFor = [...(msg.deletedFor || []), auth.currentUser.uid];
        await updateDoc(msgRef, {
          deletedFor: newDeletedFor
        });
        
        // Update last message if this was the last one and we are deleting for ourselves
        // We might want to keep the lastMessage in the chat doc as is, because it's still the last message for the other person.
        // But for our own view, we might want to update it. However, the chat list usually just shows the last message from the chat doc.
        // For simplicity, we won't update the chat doc's lastMessage when deleting for 'me', 
        // as it would affect the other user's chat list too.
      }
      
      setMessageToDelete(null);
    } catch (error) {
      handleFirestoreError(error, type === 'everyone' ? OperationType.DELETE : OperationType.UPDATE, `chats/${selectedChat.id}/messages/${msg.id}`);
    } finally {
      setIsDeleting(false);
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
        lastMessage: messageText || (attachmentUrl ? 'Attachment' : 'Message'),
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
    if (!otherUserId) return null;
    const user = chatUsers[otherUserId];
    if (!user) return null;
    
    if (blockedByIds.includes(otherUserId)) {
      return {
        ...user,
        displayName: 'Sastagram User',
        username: 'sastagram_user',
        photoURL: null
      };
    }
    return user;
  };

  const filteredChats = chats;

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

  const handlePostClick = async (postId: string, slideIndex: number = 0) => {
    try {
      const postDoc = await getDoc(doc(db, 'posts', postId));
      if (postDoc.exists()) {
        setSelectedPostSlide(slideIndex);
        setSelectedPost({ id: postDoc.id, ...postDoc.data() } as Post);
      } else {
        alert('This post is no longer available.');
      }
    } catch (error: any) {
      if (error?.message?.includes('Missing or insufficient permissions') || error?.code === 'permission-denied') {
        alert('This post is private or you do not have permission to view it.');
      }
      console.error('Error fetching post:', error);
    }
  };

  const handleReelClick = async (reelId: string) => {
    try {
      const reelDoc = await getDoc(doc(db, 'reels', reelId));
      if (reelDoc.exists()) {
        setSelectedReel({ id: reelDoc.id, ...reelDoc.data() } as Reel);
      } else {
        alert('This reel is no longer available.');
      }
    } catch (error: any) {
      if (error?.message?.includes('Missing or insufficient permissions') || error?.code === 'permission-denied') {
        alert('This reel is private or you do not have permission to view it.');
      }
      console.error('Error fetching reel:', error);
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
      <div className="max-w-md mx-auto bg-white dark:bg-zinc-950 h-[100dvh] flex flex-col overflow-hidden fixed inset-0 z-50 transition-colors duration-300">
        {/* Chat Header */}
        <div className="sticky top-0 z-20 bg-white/70 dark:bg-zinc-950/70 backdrop-blur-2xl border-b border-zinc-100/50 dark:border-zinc-800/50 px-4 py-3 flex items-center justify-between shadow-sm shrink-0">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setSelectedChat(null)} 
              className="p-2.5 -ml-2 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100/80 dark:hover:bg-zinc-800/80 rounded-full transition-all active:scale-90"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div 
              className="flex items-center gap-3 cursor-pointer group"
              onClick={() => otherUser && setSelectedUserId(otherUser.uid)}
            >
              <div className="relative">
                <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden shrink-0 border border-zinc-200 dark:border-zinc-800 group-hover:ring-4 group-hover:ring-indigo-500/10 transition-all duration-300">
                  {otherUser?.photoURL ? (
                    <img 
                      src={getOptimizedImageUrl(otherUser.photoURL, 80, 80)} 
                      alt={otherUser.displayName || ''} 
                      className="w-full h-full object-cover" 
                      referrerPolicy="no-referrer" 
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-400 dark:text-zinc-500 font-bold text-base bg-gradient-to-br from-zinc-50 to-zinc-100 dark:from-zinc-900 dark:to-zinc-800">
                      {otherUser?.displayName?.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                {otherUser && (
                  <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white dark:border-zinc-950 shadow-sm ${
                    currentChat.typingStatus?.[otherUser.uid] ? 'bg-green-500 animate-pulse' : 'bg-zinc-300 dark:bg-zinc-600'
                  }`} />
                )}
              </div>
              <div className="flex flex-col">
                <span className="font-black text-zinc-900 dark:text-zinc-100 leading-tight group-hover:text-indigo-600 transition-colors text-[15px] tracking-tight">
                  {otherUser?.displayName}
                </span>
                <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">
                  {currentChat.typingStatus?.[otherUser?.uid || ''] ? 'typing...' : 'Active now'}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button className="p-2.5 text-zinc-400 dark:text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 rounded-full transition-all active:scale-90">
              <Phone className="w-5 h-5" />
            </button>
            <button className="p-2.5 text-zinc-400 dark:text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 rounded-full transition-all active:scale-90">
              <Video className="w-5 h-5" />
            </button>
            <button className="p-2.5 text-zinc-400 dark:text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 rounded-full transition-all active:scale-90">
              <Info className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-6 bg-zinc-50/50 dark:bg-zinc-950/50 relative scroll-smooth no-scrollbar">
          {heldMessage && (
            <div 
              className="fixed inset-0 z-40 bg-black/5 backdrop-blur-[2px]" 
              onClick={() => setHeldMessage(null)} 
            />
          )}
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <motion.div 
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-20 h-20 bg-white dark:bg-zinc-900 rounded-3xl shadow-lg flex items-center justify-center mb-6"
              >
                <Send className="w-10 h-10 text-indigo-500 -rotate-12" />
              </motion.div>
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-2">Start a conversation</h3>
              <p className="text-zinc-500 dark:text-zinc-400 text-sm max-w-[240px]">
                Send a message to {otherUser?.displayName} to start chatting.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {messages.map((msg, index) => {
                const isMine = msg.senderId === auth.currentUser?.uid;
                const isLastMessage = index === messages.length - 1;
                const otherUserId = currentChat.participants.find(id => id !== auth.currentUser?.uid);
                const isRead = isLastMessage && isMine && otherUserId && currentChat.readStatus?.[otherUserId];

                const previousMsg = index > 0 ? messages[index - 1] : null;
                const nextMsg = index < messages.length - 1 ? messages[index + 1] : null;

                const prevMinute = previousMsg?.createdAt ? Math.floor(previousMsg.createdAt.toMillis() / 60000) : null;
                const currMinute = msg.createdAt ? Math.floor(msg.createdAt.toMillis() / 60000) : null;
                const nextMinute = nextMsg?.createdAt ? Math.floor(nextMsg.createdAt.toMillis() / 60000) : null;

                const isSameUserAsPrevious = previousMsg && previousMsg.senderId === msg.senderId;
                const isSameMinuteAsPrevious = prevMinute === currMinute;
                const isSameGroupAsPrevious = isSameUserAsPrevious && isSameMinuteAsPrevious;
                const isSameGroupAsNext = nextMsg && nextMsg.senderId === msg.senderId && nextMinute === currMinute;

                let roundedStyle = 'rounded-[22px]';
                if (isMine) {
                  if (isSameGroupAsPrevious && isSameGroupAsNext) {
                    roundedStyle = 'rounded-l-[22px] rounded-r-[4px]';
                  } else if (isSameGroupAsPrevious && !isSameGroupAsNext) {
                    roundedStyle = 'rounded-l-[22px] rounded-tr-[4px] rounded-br-[22px]';
                  } else if (!isSameGroupAsPrevious && isSameGroupAsNext) {
                    roundedStyle = 'rounded-l-[22px] rounded-tr-[22px] rounded-br-[4px]';
                  }
                } else {
                  if (isSameGroupAsPrevious && isSameGroupAsNext) {
                    roundedStyle = 'rounded-r-[22px] rounded-l-[4px]';
                  } else if (isSameGroupAsPrevious && !isSameGroupAsNext) {
                    roundedStyle = 'rounded-r-[22px] rounded-tl-[4px] rounded-bl-[22px]';
                  } else if (!isSameGroupAsPrevious && isSameGroupAsNext) {
                    roundedStyle = 'rounded-r-[22px] rounded-tl-[22px] rounded-bl-[4px]';
                  }
                }

                const showAvatar = !isMine && (!isSameGroupAsNext);

                const showDate = index === 0 || 
                  (prevMinute !== null && currMinute !== null && 
                   (!isSameDay(msg.createdAt.toDate(), previousMsg!.createdAt.toDate()) || currMinute - prevMinute >= 60));

                const isEditable = isMine && msg.createdAt && (Date.now() - msg.createdAt.toMillis() < 60 * 60 * 1000);

                const handleDoubleTap = async () => {
                  if (!auth.currentUser) return;
                  const newLikes = msg.likes?.includes(auth.currentUser.uid)
                    ? msg.likes.filter(id => id !== auth.currentUser?.uid)
                    : [...(msg.likes || []), auth.currentUser.uid];
                    
                  try {
                    await updateDoc(doc(db, `chats/${selectedChat.id}/messages`, msg.id), {
                      likes: newLikes
                    });
                  } catch (error) {
                    console.error('Error liking message:', error);
                  }
                };

                return (
                  <div key={`${msg.id}-${index}`} className={`w-full flex ${isMine ? 'justify-end' : 'justify-start'} ${
                    isSameGroupAsPrevious ? 'mt-[0.7px]' : (isSameUserAsPrevious ? 'mt-[1.5px]' : 'mt-4')
                  }`}>
                    <div className="flex flex-col w-full">
                      {showDate && msg.createdAt && (
                        <div className="w-full flex justify-center my-6">
                          <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                            {isSameDay(msg.createdAt.toDate(), new Date()) 
                                ? format(msg.createdAt.toDate(), 'h:mm a')
                                : format(msg.createdAt.toDate(), 'MMM d, h:mm a')}
                          </span>
                        </div>
                      )}
                      
                      <div className={`flex w-full ${isMine ? 'justify-end' : 'justify-start'} relative group items-end gap-2`}>
                        {!isMine && (
                          <div className="w-7 h-7 flex-shrink-0 mb-1 z-10">
                            {showAvatar && otherUser?.photoURL ? (
                              <img src={getOptimizedImageUrl(otherUser.photoURL, 64, 64)} alt="" className="w-full h-full rounded-full object-cover border border-zinc-200 dark:border-zinc-800 shadow-sm transition-transform active:scale-95" />
                            ) : showAvatar ? (
                              <div className="w-full h-full rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-500 dark:text-zinc-400">
                                {otherUser?.displayName?.charAt(0).toUpperCase()}
                              </div>
                            ) : null}
                          </div>
                        )}
                        <motion.div 
                          drag="x"
                          dragConstraints={{ left: 0, right: 0 }}
                          dragElastic={0.4}
                          whileDrag="dragged"
                          onDragStart={handleMessageTouchEnd}
                          onDoubleClick={handleDoubleTap}
                          className={`flex flex-col max-w-[70%] relative ${heldMessage?.id === msg.id ? 'z-50' : 'z-20'}`}
                          onMouseDown={() => handleMessageTouchStart(msg)}
                          onMouseUp={handleMessageTouchEnd}
                          onMouseLeave={handleMessageTouchEnd}
                          onTouchStart={() => handleMessageTouchStart(msg)}
                          onTouchEnd={handleMessageTouchEnd}
                        >
                          <motion.div 
                            variants={{ dragged: { opacity: 1 } }}
                            className={`absolute top-1/2 -translate-y-1/2 flex items-center transition-opacity duration-200 opacity-0 group-hover:opacity-100 pointer-events-none ${
                              isMine ? 'left-full ml-2' : 'right-full mr-2'
                            }`}
                          >
                            <span className="text-[10px] font-medium text-zinc-400 whitespace-nowrap">
                              {msg.createdAt && format(msg.createdAt.toDate(), 'h:mm a')}
                            </span>
                          </motion.div>

                          <div className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                            {msg.isEdited && (
                              <span className={`text-[9px] font-medium text-zinc-400 mb-0.5 ${isMine ? 'mr-1' : 'ml-1'}`}>
                                Edited
                              </span>
                            )}

                            <div 
                              className={`px-4 py-2 relative flex flex-col transition-all duration-200 ${roundedStyle} ${
                                isMine 
                                  ? 'bg-[#3797F0] text-white shadow-sm shadow-blue-500/20' 
                                  : 'bg-[#EFEFEF] dark:bg-zinc-800 text-black dark:text-white border border-transparent dark:border-zinc-700/50'
                              } ${heldMessage?.id === msg.id ? 'brightness-90 scale-[1.02] shadow-sm' : ''} ${!msg.text && (msg.attachmentUrl || msg.sharedPostId || msg.sharedReelId || msg.sharedProfileId || msg.sharedStoryId) ? '!p-1 !bg-transparent border border-zinc-200 dark:border-zinc-800 shadow-sm' : ''}`}
                            >
                            <AnimatePresence>
                              {heldMessage?.id === msg.id && (
                                  <motion.div
                                    initial={{ opacity: 0, scale: 0.9, y: index === 0 ? 10 : -10 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.9, y: index === 0 ? 10 : -10 }}
                                    className={`absolute z-30 ${index === 0 ? 'top-full mt-3' : 'bottom-full mb-3'} flex flex-col items-stretch bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-100 dark:border-zinc-800 p-2 min-w-[160px] ${isMine ? 'right-0' : 'left-0'}`}
                                  >
                                  {isEditable && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleMessageTouchEnd();
                                        setEditingMessage(msg);
                                        setNewMessage(msg.text || '');
                                        setHeldMessage(null);
                                      }}
                                      className="flex items-center gap-3 px-4 py-3 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-xl transition-colors w-full text-left group/btn"
                                    >
                                      <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center group-hover/btn:bg-indigo-100 dark:group-hover/btn:bg-indigo-900/50 transition-colors">
                                        <Pencil className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                                      </div>
                                      <span className="text-sm font-bold">Edit</span>
                                    </button>
                                  )}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleMessageTouchEnd();
                                      setMessageToDelete(msg);
                                      setHeldMessage(null);
                                    }}
                                    className="flex items-center gap-3 px-4 py-3 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors w-full text-left group/btn"
                                  >
                                    <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-900/20 flex items-center justify-center group-hover/btn:bg-red-100 dark:group-hover/btn:bg-red-900/30 transition-colors">
                                      <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />
                                    </div>
                                    <span className="text-sm font-bold">Delete</span>
                                  </button>
                                </motion.div>
                              )}
                            </AnimatePresence>

                            {msg.attachmentUrl && (
                              <div className="relative group/img mb-2 overflow-hidden rounded-xl bg-black/5">
                                <img 
                                  src={getOptimizedImageUrl(msg.attachmentUrl, 600)} 
                                  alt="Attachment" 
                                  loading="lazy"
                                  className="w-full h-auto object-cover max-h-[300px] transition-transform group-hover/img:scale-105" 
                                  referrerPolicy="no-referrer" 
                                />
                                <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/10 transition-colors" />
                              </div>
                            )}

                            {msg.sharedPostId && (
                              <div 
                                onClick={() => handlePostClick(msg.sharedPostId!, msg.sharedPostSlideIndex || 0)}
                                className={`mb-2 p-2 rounded-xl border cursor-pointer transition-all hover:brightness-95 active:scale-[0.98] flex flex-col gap-2 ${
                                  isMine ? 'bg-white/10 dark:bg-white/5 border-white/20 dark:border-white/10' : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800'
                                }`}
                              >
                                {msg.sharedPostPreviewUrl ? (
                                  <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-black/10">
                                    {msg.sharedPostMediaType === 'video' ? (
                                      <video 
                                        src={msg.sharedPostPreviewUrl} 
                                        className="w-full h-full object-cover"
                                      />
                                    ) : (
                                      <img 
                                        src={getOptimizedImageUrl(msg.sharedPostPreviewUrl, 400)} 
                                        alt="Shared post" 
                                        className="w-full h-full object-cover"
                                        referrerPolicy="no-referrer"
                                      />
                                    )}
                                    <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                                      <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30">
                                        <ImageIcon className="w-5 h-5 text-white" />
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <div className={`w-full aspect-square rounded-lg flex items-center justify-center ${isMine ? 'bg-white/20' : 'bg-zinc-200'}`}>
                                    <ImageIcon className={`w-8 h-8 ${isMine ? 'text-white' : 'text-zinc-500'}`} />
                                  </div>
                                )}
                                <div className="px-1 py-1 flex items-center justify-between">
                                  <span className={`text-[11px] font-black uppercase tracking-widest ${isMine ? 'text-white' : 'text-zinc-900'}`}>View Post</span>
                                  <ArrowRight className={`w-3 h-3 ${isMine ? 'text-white' : 'text-zinc-400'}`} />
                                </div>
                              </div>
                            )}

                            {msg.sharedReelId && (
                              <div 
                                onClick={() => handleReelClick(msg.sharedReelId!)}
                                className={`mb-2 p-2 rounded-xl border cursor-pointer transition-all hover:brightness-95 active:scale-[0.98] flex flex-col gap-2 ${
                                  isMine ? 'bg-white/10 dark:bg-white/5 border-white/20 dark:border-white/10' : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800'
                                }`}
                              >
                                {msg.sharedPostPreviewUrl ? (
                                  <div className="relative aspect-[9/16] w-32 overflow-hidden rounded-lg bg-black/10 mx-auto">
                                    <video 
                                      src={msg.sharedPostPreviewUrl} 
                                      className="w-full h-full object-cover"
                                    />
                                    <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                                      <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30">
                                        <Clapperboard className="w-5 h-5 text-white" />
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <div className={`w-32 aspect-[9/16] rounded-lg flex items-center justify-center mx-auto ${isMine ? 'bg-white/20' : 'bg-zinc-200'}`}>
                                    <Clapperboard className={`w-8 h-8 ${isMine ? 'text-white' : 'text-zinc-500'}`} />
                                  </div>
                                )}
                                <div className="px-1 py-1 flex items-center justify-between">
                                  <span className={`text-[11px] font-black uppercase tracking-widest ${isMine ? 'text-white' : 'text-zinc-900'}`}>View Reel</span>
                                  <ArrowRight className={`w-3 h-3 ${isMine ? 'text-white' : 'text-zinc-400'}`} />
                                </div>
                              </div>
                            )}

                            {msg.sharedStoryId && (
                              <div 
                                className={`mb-2 p-2 rounded-xl border flex flex-col gap-2 ${
                                  isMine ? 'bg-white/10 dark:bg-white/5 border-white/20 dark:border-white/10' : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800'
                                }`}
                              >
                                {msg.sharedStoryPreviewUrl ? (
                                  <div className="relative aspect-[9/16] w-32 overflow-hidden rounded-lg bg-black/10 mx-auto">
                                    {msg.sharedStoryPreviewUrl.match(/\.(mp4|webm|ogg|mov)$/i) || msg.sharedStoryPreviewUrl.includes('/video/upload/') ? (
                                      <video 
                                        src={msg.sharedStoryPreviewUrl} 
                                        className="w-full h-full object-cover"
                                      />
                                    ) : (
                                      <img 
                                        src={getOptimizedImageUrl(msg.sharedStoryPreviewUrl, 400)} 
                                        alt="Shared story" 
                                        className="w-full h-full object-cover"
                                        referrerPolicy="no-referrer"
                                      />
                                    )}
                                  </div>
                                ) : (
                                  <div className={`w-32 aspect-[9/16] rounded-lg flex items-center justify-center mx-auto ${isMine ? 'bg-white/20' : 'bg-zinc-200'}`}>
                                    <ImageIcon className={`w-8 h-8 ${isMine ? 'text-white' : 'text-zinc-500'}`} />
                                  </div>
                                )}
                                <div className="px-1 text-center">
                                  <p className={`text-[10px] font-black uppercase tracking-widest ${isMine ? 'text-white/60' : 'text-zinc-400'}`}>Replied to story</p>
                                </div>
                              </div>
                            )}

                            {msg.sharedProfileId && (
                              <div 
                                onClick={() => setSelectedUserId(msg.sharedProfileId!)}
                                className={`mb-2 p-3 rounded-xl border cursor-pointer transition-all hover:brightness-95 active:scale-[0.98] flex flex-col gap-3 ${
                                  isMine ? 'bg-white/10 dark:bg-white/5 border-white/20 dark:border-white/10' : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800'
                                }`}
                              >
                                <div className="flex items-center gap-3">
                                  <div className="w-12 h-12 rounded-full bg-zinc-100 overflow-hidden shrink-0 border border-black/5">
                                    {chatUsers[msg.sharedProfileId]?.photoURL ? (
                                      <img 
                                        src={getOptimizedImageUrl(chatUsers[msg.sharedProfileId].photoURL, 96, 96)} 
                                        alt={chatUsers[msg.sharedProfileId].displayName || ''} 
                                        className="w-full h-full object-cover" 
                                        referrerPolicy="no-referrer" 
                                      />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center text-zinc-400 font-bold text-lg">
                                        {chatUsers[msg.sharedProfileId]?.displayName?.charAt(0).toUpperCase()}
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex flex-col min-w-0">
                                    <span className={`font-bold text-sm truncate ${isMine ? 'text-white' : 'text-zinc-900'}`}>
                                      {chatUsers[msg.sharedProfileId]?.displayName}
                                    </span>
                                    <span className={`text-[11px] font-medium truncate ${isMine ? 'text-white/60' : 'text-zinc-500'}`}>
                                      @{chatUsers[msg.sharedProfileId]?.username || 'user'}
                                    </span>
                                  </div>
                                </div>
                                <div className={`w-full py-2 rounded-lg text-center text-[10px] font-black uppercase tracking-widest ${
                                  isMine ? 'bg-white/20 text-white' : 'bg-zinc-200 text-zinc-600'
                                }`}>
                                  View Profile
                                </div>
                              </div>
                            )}

                            {msg.text && (
                              <p className="text-[15px] leading-relaxed break-words font-medium">{msg.text}</p>
                            )}

                            {msg.likes && msg.likes.length > 0 && (
                              <div className={`absolute -bottom-2 ${isMine ? '-left-2' : '-right-2'} bg-white dark:bg-zinc-900 shadow-sm border border-zinc-100 dark:border-zinc-800 rounded-full p-1 z-20`}>
                                <Heart className={`w-3.5 h-3.5 ${msg.likes.includes(auth.currentUser?.uid || '') ? 'text-red-500 fill-red-500' : 'text-zinc-400 dark:text-zinc-500'}`} />
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                      {isRead && (
                        <span className="text-[11px] font-semibold text-zinc-400 mt-1 mr-1">Seen</span>
                      )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
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
                  <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 text-zinc-400 dark:text-zinc-500 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm flex items-center gap-1.5">
                    <motion.div
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 0.8, repeat: Infinity, delay: 0 }}
                      className="w-1.5 h-1.5 bg-zinc-300 dark:bg-zinc-700 rounded-full"
                    />
                    <motion.div
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 0.8, repeat: Infinity, delay: 0.2 }}
                      className="w-1.5 h-1.5 bg-zinc-300 dark:bg-zinc-700 rounded-full"
                    />
                    <motion.div
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 0.8, repeat: Infinity, delay: 0.4 }}
                      className="w-1.5 h-1.5 bg-zinc-300 dark:bg-zinc-700 rounded-full"
                    />
                  </div>
                </motion.div>
              );
            }
            return null;
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="bg-white/80 dark:bg-zinc-950/80 backdrop-blur-2xl border-t border-zinc-100/50 dark:border-zinc-800/50 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(0,0,0,0.04)] shrink-0 transition-colors duration-300">
          {isBlocked ? (
            <div className="flex items-center justify-center gap-3 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl py-4 px-6">
              <ShieldAlert className="w-5 h-5 text-zinc-400 dark:text-zinc-500" />
              <span className="text-zinc-500 dark:text-zinc-400 text-[11px] font-black uppercase tracking-[0.2em]">Chat Disabled</span>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {editingMessage && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-between bg-indigo-50/80 dark:bg-indigo-950/50 backdrop-blur-md border border-indigo-100/50 dark:border-indigo-900/50 px-4 py-2.5 rounded-2xl"
                >
                  <div className="flex items-center gap-3 text-indigo-600 dark:text-indigo-400">
                    <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center">
                      <Pencil className="w-4 h-4" />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest">Editing message</span>
                  </div>
                  <button 
                    onClick={() => {
                      setEditingMessage(null);
                      setNewMessage('');
                    }} 
                    className="p-1.5 text-indigo-400 hover:text-indigo-600 dark:text-indigo-500 dark:hover:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900 rounded-full transition-all"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </motion.div>
              )}
              
              {attachment && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-3 bg-zinc-50/80 dark:bg-zinc-900/80 backdrop-blur-md border border-zinc-200/50 dark:border-zinc-800/50 p-2.5 rounded-2xl"
                >
                  <div className="w-10 h-10 rounded-xl bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center overflow-hidden">
                    {attachment.type.startsWith('image/') ? (
                      <ImageIcon className="w-5 h-5 text-zinc-500 dark:text-zinc-400" />
                    ) : (
                      <Video className="w-5 h-5 text-zinc-500 dark:text-zinc-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">{attachment.name}</p>
                    <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">{(attachment.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                  <button 
                    onClick={() => setAttachment(null)} 
                    className="p-2 text-zinc-400 hover:text-red-600 dark:text-zinc-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 rounded-full transition-all"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </motion.div>
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
                {!editingMessage && (
                  <button 
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-11 h-11 flex items-center justify-center text-zinc-400 dark:text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-2xl transition-all active:scale-90 shrink-0"
                  >
                    <Paperclip className="w-5 h-5" />
                  </button>
                )}
                <div className="flex-1 relative">
                  <textarea
                    rows={1}
                    value={newMessage}
                    onChange={(e) => {
                      setNewMessage(e.target.value);
                      handleTyping();
                      // Auto-resize
                      e.target.style.height = 'auto';
                      e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage(e as any);
                      }
                    }}
                    placeholder={editingMessage ? "Edit message..." : "Message..."}
                    className="w-full bg-zinc-100/80 dark:bg-zinc-900/80 border border-transparent dark:border-zinc-800 rounded-[22px] px-5 py-3 text-[15px] font-medium dark:text-zinc-100 focus:bg-white dark:focus:bg-zinc-800 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500/30 dark:focus:border-indigo-500/50 focus:outline-none transition-all resize-none max-h-[120px] placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                  />
                </div>
                <motion.button 
                  whileTap={{ scale: 0.9 }}
                  type="submit"
                  disabled={editingMessage ? (!newMessage.trim() && !editingMessage.attachmentUrl && !editingMessage.sharedPostId) : (!newMessage.trim() && !attachment)}
                  className={`w-11 h-11 flex items-center justify-center rounded-2xl transition-all shadow-lg active:scale-95 shrink-0 ${
                    (newMessage.trim() || attachment) 
                      ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-500/20 shadow-indigo-900/50' 
                      : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-300 dark:text-zinc-700 cursor-not-allowed shadow-none'
                  }`}
                >
                  <Send className={`w-5 h-5 ${newMessage.trim() || attachment ? 'translate-x-0.5 -translate-y-0.5' : ''}`} />
                </motion.button>
              </form>
            </div>
          )}
        </div>

        {/* Modals */}
        <AnimatePresence>
          {selectedPost && (
            <PostDetailsModal 
              post={selectedPost} 
              onClose={() => setSelectedPost(null)} 
              onUserClick={setSelectedUserId}
              onTagClick={onTagClick}
              initialMediaIndex={selectedPostSlide}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {messageToDelete && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-zinc-900/60 backdrop-blur-md"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="bg-white dark:bg-zinc-900 rounded-[32px] shadow-2xl w-full max-w-sm overflow-hidden border border-zinc-100 dark:border-zinc-800 transition-colors"
              >
                <div className="p-8 text-center">
                  <div className="w-16 h-16 bg-red-50 dark:bg-red-950/30 rounded-3xl flex items-center justify-center mx-auto mb-6">
                    <Trash2 className="w-8 h-8 text-red-500 dark:text-red-400" />
                  </div>
                  <h3 className="text-xl font-black text-zinc-900 dark:text-zinc-100 mb-3 uppercase tracking-tight">Delete Message?</h3>
                  <p className="text-zinc-500 dark:text-zinc-400 text-sm font-medium mb-8 leading-relaxed">
                    This action cannot be undone. How would you like to delete this message?
                  </p>
                  <div className="flex flex-col gap-3">
                    {(messageToDelete.senderId === auth.currentUser?.uid || userRole === 'admin') && 
                     (!messageToDelete.createdAt || Date.now() - messageToDelete.createdAt.toMillis() < 24 * 60 * 60 * 1000 || userRole === 'admin') && (
                      <button
                        onClick={() => handleDeleteMessage(messageToDelete, 'everyone')}
                        disabled={isDeleting}
                        className="w-full py-4 px-6 bg-red-600 text-white font-bold rounded-2xl hover:bg-red-700 transition-all active:scale-[0.98] disabled:opacity-50 shadow-lg shadow-red-500/20 shadow-red-900/50"
                      >
                        Delete for everyone
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteMessage(messageToDelete, 'me')}
                      disabled={isDeleting}
                      className="w-full py-4 px-6 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-bold rounded-2xl hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all active:scale-[0.98] disabled:opacity-50"
                    >
                      Delete for me
                    </button>
                    <button
                      onClick={() => setMessageToDelete(null)}
                      disabled={isDeleting}
                      className="w-full py-4 px-6 text-zinc-500 dark:text-zinc-400 font-bold hover:text-zinc-900 dark:hover:text-zinc-100 transition-all"
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

  return (
    <div className="max-w-md mx-auto bg-white dark:bg-zinc-950 h-[100dvh] flex flex-col overflow-hidden fixed inset-0 z-30 transition-colors duration-300">
      {/* List Header */}
      <div className="sticky top-0 z-20 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl px-4 pt-6 pb-4 shrink-0 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-black tracking-tighter text-zinc-900 dark:text-zinc-100">Messages</h1>
          </div>
          <button className="p-2.5 bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 rounded-2xl hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-all active:scale-90">
            <Search className="w-5 h-5" />
          </button>
        </div>

        <div className="relative group">
          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
            <Search className="w-4 h-4 text-zinc-400 dark:text-zinc-500 group-focus-within:text-indigo-500 transition-colors" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search people..."
            className="w-full bg-zinc-100 dark:bg-zinc-900 border-none rounded-[20px] py-3.5 pl-11 pr-4 text-sm dark:text-zinc-100 focus:ring-4 focus:ring-indigo-500/10 focus:bg-white dark:focus:bg-zinc-800 transition-all placeholder:text-zinc-400 dark:placeholder:text-zinc-500 font-bold outline-none"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-full transition-colors"
            >
              <X className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
            </button>
          )}
        </div>
      </div>

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto no-scrollbar pb-20 px-2 bg-white dark:bg-zinc-950 transition-colors">
        {isSearching ? (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <div className="w-8 h-8 border-4 border-indigo-600/20 border-t-indigo-600 rounded-full animate-spin" />
            <p className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Searching...</p>
          </div>
        ) : searchResults.length > 0 ? (
          <div className="px-4 py-2 space-y-1">
            <h2 className="px-2 text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] mb-3">Search Results</h2>
            {searchResults.map(user => (
              <button
                key={user.uid}
                onClick={() => handleStartChat(user)}
                className="w-full flex items-center gap-4 p-3 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20 rounded-2xl transition-all active:scale-[0.98] group"
              >
                <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-900 overflow-hidden border-2 border-white dark:border-zinc-800 shadow-sm group-hover:border-indigo-100 dark:group-hover:border-indigo-900 transition-colors">
                  {user.photoURL ? (
                    <img src={getOptimizedImageUrl(user.photoURL, 96, 96)} alt={user.displayName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-400 dark:text-zinc-500 font-bold text-lg">
                      {user.displayName?.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-start min-w-0">
                  <span className="font-bold text-zinc-900 dark:text-zinc-100 text-[15px] group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{user.displayName}</span>
                  <span className="text-xs text-zinc-400 dark:text-zinc-500 font-medium">@{user.username}</span>
                </div>
              </button>
            ))}
          </div>
        ) : searchQuery.trim() ? (
          <div className="flex flex-col items-center justify-center py-12 px-8 text-center">
            <div className="w-16 h-16 bg-zinc-50 dark:bg-zinc-900 rounded-3xl flex items-center justify-center mb-4">
              <Search className="w-8 h-8 text-zinc-200 dark:text-zinc-800" />
            </div>
            <p className="text-zinc-400 dark:text-zinc-500 text-sm font-medium">No users found matching "{searchQuery}"</p>
          </div>
        ) : loading ? (
          <div className="flex justify-center items-center h-40">
            <div className="w-8 h-8 border-4 border-indigo-200 dark:border-indigo-900/30 border-t-indigo-600 rounded-full animate-spin" />
          </div>
        ) : filteredChats.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center h-full px-8 text-center py-20"
          >
            <div className="relative mb-8">
              <div className="w-24 h-24 bg-indigo-50 dark:bg-zinc-900 rounded-[32px] flex items-center justify-center border border-indigo-100/50 dark:border-zinc-800 shadow-sm rotate-3">
                <Send className="w-10 h-10 text-indigo-500 -rotate-12" />
              </div>
              <div className="absolute -bottom-2 -right-2 w-12 h-12 bg-purple-50 dark:bg-zinc-800 rounded-2xl flex items-center justify-center border border-purple-100/50 dark:border-zinc-700 shadow-sm -rotate-6">
                <Send className="w-5 h-5 text-purple-500" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-3 tracking-tight">Your inbox is waiting</h2>
            <p className="text-zinc-500 dark:text-zinc-400 text-[15px] leading-relaxed max-w-[260px]">
              Connect with friends and start a conversation. Your messages will appear here.
            </p>
            <button 
              onClick={() => onNavigate?.('search')}
              className="mt-8 px-8 py-3 bg-indigo-600 text-white font-bold rounded-2xl shadow-lg shadow-indigo-200 dark:shadow-indigo-950/50 hover:bg-indigo-700 active:scale-95 transition-all text-sm"
            >
              Find someone to chat
            </button>
          </motion.div>
        ) : (
          <div className="px-2">
            {filteredChats.map((chat, index) => {
              const otherUser = getOtherUser(chat);
              if (!otherUser) return null;
              const isUnread = auth.currentUser && chat.readStatus?.[auth.currentUser.uid] === false;
              
              return (
                <motion.button
                  key={chat.id}
                  layout
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2, delay: index * 0.05 }}
                  onClick={() => !chatToDelete && setSelectedChat(chat)}
                  onMouseDown={() => handleTouchStart(chat)}
                  onMouseUp={handleTouchEnd}
                  onMouseLeave={handleTouchEnd}
                  onTouchStart={() => handleTouchStart(chat)}
                  onTouchEnd={handleTouchEnd}
                  className={`w-full flex items-center gap-4 p-4 rounded-[28px] transition-all active:scale-[0.97] group relative mb-2 ${
                    isUnread ? 'bg-indigo-50/50 dark:bg-indigo-950/20 shadow-sm shadow-indigo-100/20 dark:shadow-indigo-900/10' : 'hover:bg-zinc-50 dark:hover:bg-zinc-900'
                  }`}
                >
                  <div className="relative shrink-0">
                    <div className={`w-14 h-14 rounded-full bg-zinc-100 dark:bg-zinc-900 overflow-hidden border-2 transition-all duration-300 ${
                      isUnread ? 'border-indigo-500 shadow-lg shadow-indigo-200 dark:shadow-indigo-900/50' : 'border-white dark:border-zinc-950 shadow-sm'
                    }`}>
                      {otherUser?.photoURL ? (
                        <img 
                          src={getOptimizedImageUrl(otherUser.photoURL, 112, 112)} 
                          alt={otherUser.displayName || ''} 
                          className="w-full h-full object-cover" 
                          referrerPolicy="no-referrer" 
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-400 dark:text-zinc-500 font-black text-xl bg-gradient-to-br from-zinc-50 to-zinc-100 dark:from-zinc-900 dark:to-zinc-800">
                          {otherUser?.displayName?.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    {/* Mock Online Status */}
                    <div className="absolute bottom-0.5 right-0.5 w-4 h-4 bg-green-500 border-2 border-white dark:border-zinc-950 rounded-full shadow-sm" />
                  </div>
                  
                  <div className="flex-1 min-w-0 flex flex-col items-start">
                    <div className="w-full flex justify-between items-center mb-0.5">
                      <span className={`text-[15px] truncate transition-colors tracking-tight ${
                        isUnread ? 'font-black text-zinc-900 dark:text-zinc-100' : 'font-bold text-zinc-900 dark:text-zinc-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400'
                      }`}>
                        {otherUser?.displayName}
                      </span>
                      <span className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">
                        {chat.updatedAt?.toDate ? formatDistanceToNow(chat.updatedAt.toDate(), { addSuffix: false }).replace('about ', '') : 'now'}
                      </span>
                    </div>
                    <div className="w-full flex items-center justify-between gap-2">
                      <p className={`text-[13px] truncate tracking-tight ${
                        isUnread ? 'font-bold text-indigo-600 dark:text-indigo-400' : 'text-zinc-500 dark:text-zinc-400 font-medium'
                      }`}>
                        {chat.lastMessage || 'Start a conversation'}
                      </p>
                      {isUnread && (
                        <div className="w-2.5 h-2.5 bg-indigo-600 dark:bg-indigo-500 rounded-full shadow-lg shadow-indigo-200 dark:shadow-indigo-900 shrink-0 animate-pulse" />
                      )}
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}
      </div>

      {/* Modals */}
      <ConfirmationModal
        isOpen={!!chatToDelete}
        onClose={() => setChatToDelete(null)}
        onConfirm={handleDeleteChat}
        title="Delete Chat"
        message="Are you sure you want to delete this entire chat? This action cannot be undone."
        confirmText="Delete"
        isLoading={isDeleting}
      />

      <AnimatePresence>
        {selectedPost && (
          <PostDetailsModal 
            post={selectedPost} 
            onClose={() => setSelectedPost(null)} 
            onUserClick={setSelectedUserId}
            onTagClick={onTagClick}
            initialMediaIndex={selectedPostSlide}
          />
        )}

        {selectedReel && (
          <ReelDetailsModal
            reel={selectedReel}
            onClose={() => setSelectedReel(null)}
            onNavigate={onNavigate}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
