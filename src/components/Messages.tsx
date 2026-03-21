import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, orderBy, onSnapshot, doc, getDoc, setDoc, addDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { handleFirestoreError, OperationType } from '../utils/firestore';
import { Chat, Message, User } from '../types';
import { Send, ArrowLeft, MessageSquare, Paperclip, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import Profile from './Profile';

export default function Messages({ onBack }: { onBack?: () => void }) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [chatUsers, setChatUsers] = useState<Record<string, User>>({});
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
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

      await setDoc(doc(db, 'chats', selectedChat.id), {
        lastMessage: messageText || 'Attachment',
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `chats/${selectedChat.id}`);
    }
  };

  const getOtherUser = (chat: Chat) => {
    const otherUserId = chat.participants.find(id => id !== auth.currentUser?.uid);
    return otherUserId ? chatUsers[otherUserId] : null;
  };

  if (selectedUserId) {
    return <Profile userId={selectedUserId} onBack={() => setSelectedUserId(null)} />;
  }

  if (selectedChat) {
    const otherUser = getOtherUser(selectedChat);
    
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
                <img src={otherUser.photoURL} alt={otherUser.displayName || ''} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
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
                    <img src={msg.attachmentUrl} alt="Attachment" className="rounded-lg mb-2 max-w-full" referrerPolicy="no-referrer" />
                  )}
                  {msg.text && <p className="text-sm">{msg.text}</p>}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-zinc-200 p-4 max-w-md mx-auto pb-safe">
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
      ) : chats.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[60vh] text-zinc-500">
          <MessageSquare className="w-12 h-12 mb-4 text-zinc-300" />
          <p className="text-lg font-medium text-zinc-900">No messages yet</p>
          <p className="text-sm">Start a conversation with someone.</p>
        </div>
      ) : (
        <div className="divide-y divide-zinc-100">
          {chats.map((chat) => {
            const otherUser = getOtherUser(chat);
            if (!otherUser) return null;

            return (
              <div 
                key={chat.id} 
                onClick={() => setSelectedChat(chat)}
                className="p-4 flex items-center gap-3 cursor-pointer hover:bg-zinc-50 transition-colors"
              >
                <div className="w-12 h-12 rounded-full bg-zinc-200 overflow-hidden shrink-0">
                  {otherUser.photoURL ? (
                    <img src={otherUser.photoURL} alt={otherUser.displayName || ''} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-500 font-medium">
                      {otherUser.displayName?.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline">
                    <h3 className="font-semibold text-zinc-900 truncate">{otherUser.displayName}</h3>
                    {chat.updatedAt && (
                      <span className="text-xs text-zinc-400 shrink-0 ml-2">
                        {formatDistanceToNow(chat.updatedAt.toDate(), { addSuffix: false }).replace('about ', '')}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-zinc-500 truncate mt-0.5">
                    {chat.lastMessage || 'Started a chat'}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
