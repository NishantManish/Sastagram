import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { handleFirestoreError, OperationType } from '../utils/firestore';
import { Notification } from '../types';
import { formatDistanceToNow, isToday, isYesterday, isThisWeek } from 'date-fns';
import { Bell, Heart, MessageCircle, UserPlus, ArrowLeft, MoreHorizontal } from 'lucide-react';
import { getOptimizedImageUrl } from '../utils/cloudinary';
import { motion, AnimatePresence } from 'motion/react';
import { useBlocks } from '../services/blockService';
import Profile from './Profile';

export default function Notifications({ onBack }: { onBack?: () => void }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const { blockedIds, blockedByIds } = useBlocks(auth.currentUser?.uid);

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

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
          {onBack && (
            <button 
              onClick={onBack}
              className="p-2 -ml-2 text-zinc-500 hover:bg-zinc-100/80 rounded-2xl transition-all active:scale-95"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Activity</h1>
        </div>
        <button className="p-2 text-zinc-400 hover:bg-zinc-100/80 rounded-2xl transition-all">
          <MoreHorizontal className="w-5 h-5" />
        </button>
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
          {groupedNotifications.map(([title, items]) => (
            <div key={title} className="space-y-4">
              <h3 className="px-2 text-sm font-bold text-zinc-400 uppercase tracking-widest">{title}</h3>
              <div className="space-y-1">
                {items.map((notification) => (
                  <motion.div 
                    key={notification.id} 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    onClick={() => setSelectedUserId(notification.senderId)}
                    className={`group relative p-3 flex items-center gap-4 rounded-2xl transition-all hover:bg-zinc-50 cursor-pointer ${!notification.read ? 'bg-indigo-50/30' : ''}`}
                  >
                    <div className="relative shrink-0">
                      <div className="w-12 h-12 rounded-2xl bg-zinc-100 overflow-hidden ring-2 ring-white shadow-sm">
                        {notification.senderPhoto ? (
                          <img 
                            src={getOptimizedImageUrl(notification.senderPhoto, 96, 96)} 
                            alt={notification.senderName} 
                            className="w-full h-full object-cover" 
                            referrerPolicy="no-referrer" 
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-400 font-bold text-lg">
                            {notification.senderName.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-xl flex items-center justify-center shadow-md ring-2 ring-white
                        ${notification.type === 'like' ? 'bg-red-500' : ''}
                        ${notification.type === 'comment' ? 'bg-blue-500' : ''}
                        ${notification.type === 'follow' ? 'bg-indigo-600' : ''}
                      `}>
                        {notification.type === 'like' && <Heart className="w-3 h-3 text-white fill-white" />}
                        {notification.type === 'comment' && <MessageCircle className="w-3 h-3 text-white fill-white" />}
                        {notification.type === 'follow' && <UserPlus className="w-3 h-3 text-white" />}
                      </div>
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] text-zinc-900 leading-tight">
                        <span className="font-bold hover:underline cursor-pointer">{notification.senderName}</span>{' '}
                        <span className="text-zinc-600">
                          {notification.type === 'like' && 'liked your post.'}
                          {notification.type === 'comment' && 'commented on your post.'}
                          {notification.type === 'follow' && 'started following you.'}
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
    </div>
  );
}
