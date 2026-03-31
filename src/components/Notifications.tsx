import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { handleFirestoreError, OperationType } from '../utils/firestore';
import { Notification } from '../types';
import { formatDistanceToNow, isToday, isYesterday, isThisWeek } from 'date-fns';
import { Bell, Heart, MessageCircle, UserPlus, ArrowLeft, MoreHorizontal, Check, Trash2, X } from 'lucide-react';
import { getOptimizedImageUrl } from '../utils/cloudinary';
import { motion, AnimatePresence } from 'motion/react';
import { useBlocks } from '../services/blockService';
import Profile from './Profile';
import UserAvatar from './UserAvatar';

export default function Notifications({ onBack }: { onBack?: () => void }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const { blockedIds, blockedByIds } = useBlocks(auth.currentUser?.uid);

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedNotifications, setSelectedNotifications] = useState<string[]>([]);
  const [showMenu, setShowMenu] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', auth.currentUser.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedNotifications = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Notification[];
      setNotifications(fetchedNotifications);
      setLoading(false);

      // Mark as read
      fetchedNotifications.forEach(notification => {
        if (!notification.read) {
          updateDoc(doc(db, 'notifications', notification.id), { read: true }).catch(err => {
            handleFirestoreError(err, OperationType.UPDATE, `notifications/${notification.id}`);
          });
        }
      });
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'notifications');
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const filteredNotifications = notifications.filter(notification => 
    !blockedIds.includes(notification.senderId) && 
    !blockedByIds.includes(notification.senderId)
  );

  const groupedNotifications = useMemo(() => {
    const groups: { [key: string]: Notification[] } = {
      'Today': [],
      'Yesterday': [],
      'This Week': [],
      'Earlier': []
    };

    filteredNotifications.forEach(n => {
      if (!n.createdAt) {
        groups['Today'].push(n);
        return;
      }
      const date = n.createdAt.toDate();
      if (isToday(date)) groups['Today'].push(n);
      else if (isYesterday(date)) groups['Yesterday'].push(n);
      else if (isThisWeek(date)) groups['This Week'].push(n);
      else groups['Earlier'].push(n);
    });

    return Object.entries(groups).filter(([_, items]) => items.length > 0);
  }, [filteredNotifications]);

  const toggleSelectNotification = (id: string) => {
    setSelectedNotifications(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleDeleteSelected = async () => {
    if (selectedNotifications.length === 0 || !auth.currentUser) return;
    
    setIsDeleting(true);
    try {
      const batch = writeBatch(db);
      selectedNotifications.forEach(id => {
        batch.delete(doc(db, 'notifications', id));
      });
      await batch.commit();
      setSelectedNotifications([]);
      setIsSelectMode(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'notifications');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSelectAll = () => {
    if (selectedNotifications.length === filteredNotifications.length) {
      setSelectedNotifications([]);
    } else {
      setSelectedNotifications(filteredNotifications.map(n => n.id));
    }
  };

  if (selectedUserId) {
    return (
      <Profile 
        userId={selectedUserId} 
        onBack={() => setSelectedUserId(null)} 
      />
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-white">
        <div className="w-8 h-8 border-3 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-white min-h-screen pb-24">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white/80 backdrop-blur-xl border-b border-zinc-100/50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isSelectMode ? (
            <button 
              onClick={() => {
                setIsSelectMode(false);
                setSelectedNotifications([]);
              }}
              className="p-2 -ml-2 text-zinc-500 hover:bg-zinc-100/80 rounded-2xl transition-all active:scale-95"
            >
              <X className="w-5 h-5" />
            </button>
          ) : onBack && (
            <button 
              onClick={onBack}
              className="p-2 -ml-2 text-zinc-500 hover:bg-zinc-100/80 rounded-2xl transition-all active:scale-95"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">
            {isSelectMode ? `${selectedNotifications.length} Selected` : 'Activity'}
          </h1>
        </div>
        
        <div className="relative">
          <button 
            onClick={() => setShowMenu(!showMenu)}
            className="p-2 text-zinc-400 hover:bg-zinc-100/80 rounded-2xl transition-all"
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>

          <AnimatePresence>
            {showMenu && (
              <>
                <div 
                  className="fixed inset-0 z-30" 
                  onClick={() => setShowMenu(false)} 
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                  className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-xl border border-zinc-100 py-2 z-40 overflow-hidden"
                >
                  <button
                    onClick={() => {
                      setIsSelectMode(true);
                      setShowMenu(false);
                    }}
                    className="w-full px-4 py-2.5 text-left text-sm font-semibold text-zinc-700 hover:bg-zinc-50 flex items-center gap-3"
                  >
                    <Check className="w-4 h-4" />
                    Select Notifications
                  </button>
                  {isSelectMode && (
                    <button
                      onClick={() => {
                        handleSelectAll();
                        setShowMenu(false);
                      }}
                      className="w-full px-4 py-2.5 text-left text-sm font-semibold text-zinc-700 hover:bg-zinc-50 flex items-center gap-3"
                    >
                      <Bell className="w-4 h-4" />
                      {selectedNotifications.length === filteredNotifications.length ? 'Deselect All' : 'Select All'}
                    </button>
                  )}
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>

      {filteredNotifications.length === 0 ? (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center h-[60vh] px-12 text-center"
        >
          <div className="w-20 h-20 bg-zinc-50 rounded-3xl flex items-center justify-center mb-6">
            <Bell className="w-10 h-10 text-zinc-300" />
          </div>
          <h2 className="text-xl font-bold text-zinc-900 mb-2">No activity yet</h2>
          <p className="text-zinc-500 text-sm leading-relaxed">
            When people like your posts or follow you, you'll see the updates here.
          </p>
        </motion.div>
      ) : (
        <div className="px-4 py-4 space-y-8">
          {groupedNotifications.map(([title, items], gIdx) => (
            <div key={`group-${title}-${gIdx}`} className="space-y-4">
              <h3 className="px-2 text-sm font-bold text-zinc-400 uppercase tracking-widest">{title}</h3>
              <div className="space-y-1">
                {items.map((notification, nIdx) => (
                  <motion.div 
                    key={`notification-${notification.id}-${nIdx}`} 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    onClick={() => {
                      if (isSelectMode) {
                        toggleSelectNotification(notification.id);
                      } else {
                        setSelectedUserId(notification.senderId);
                      }
                    }}
                    className={`group relative p-3 flex items-center gap-4 rounded-2xl transition-all hover:bg-zinc-50 cursor-pointer ${!notification.read ? 'bg-indigo-50/30' : ''} ${selectedNotifications.includes(notification.id) ? 'bg-indigo-50/50 ring-1 ring-indigo-200' : ''}`}
                  >
                    {isSelectMode && (
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all shrink-0 ${selectedNotifications.includes(notification.id) ? 'bg-indigo-600 border-indigo-600' : 'border-zinc-300'}`}>
                        {selectedNotifications.includes(notification.id) && <Check className="w-3 h-3 text-white" />}
                      </div>
                    )}
                    <div className="relative shrink-0">
                      <UserAvatar 
                        userId={notification.senderId} 
                        size={48} 
                        className="ring-2 ring-white shadow-sm rounded-2xl" 
                        fallbackPhoto={notification.senderPhoto} 
                        fallbackName={notification.senderName} 
                      />
                      <div className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-xl flex items-center justify-center shadow-md ring-2 ring-white
                        ${notification.type === 'like' ? 'bg-red-500' : ''}
                        ${notification.type === 'comment' ? 'bg-blue-500' : ''}
                        ${notification.type === 'follow' ? 'bg-indigo-600' : ''}
                        ${notification.type === 'message' ? 'bg-green-500' : ''}
                      `}>
                        {notification.type === 'like' && <Heart className="w-3 h-3 text-white fill-white" />}
                        {notification.type === 'comment' && <MessageCircle className="w-3 h-3 text-white fill-white" />}
                        {notification.type === 'follow' && <UserPlus className="w-3 h-3 text-white" />}
                        {notification.type === 'message' && <MessageCircle className="w-3 h-3 text-white" />}
                      </div>
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] text-zinc-900 leading-tight">
                        <span className="font-bold hover:underline cursor-pointer">{notification.senderName}</span>{' '}
                        <span className="text-zinc-600">
                          {notification.type === 'like' && (notification.storyId ? 'liked your story.' : 'liked your post.')}
                          {notification.type === 'comment' && 'commented on your post.'}
                          {notification.type === 'follow' && 'started following you.'}
                          {notification.type === 'message' && 'replied to your story.'}
                        </span>
                      </p>
                      <p className="text-xs font-medium text-zinc-400 mt-1">
                        {notification.createdAt ? formatDistanceToNow(notification.createdAt.toDate(), { addSuffix: true }) : 'Just now'}
                      </p>
                    </div>

                    {!notification.read && (
                      <div className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                    )}
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {isSelectMode && selectedNotifications.length > 0 && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-full max-w-xs">
          <motion.button
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            onClick={handleDeleteSelected}
            disabled={isDeleting}
            className="w-full bg-red-500 text-white font-bold py-4 rounded-2xl shadow-2xl shadow-red-200 flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50"
          >
            {isDeleting ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Trash2 className="w-5 h-5" />
                Delete {selectedNotifications.length} Notifications
              </>
            )}
          </motion.button>
        </div>
      )}
    </div>
  );
}
