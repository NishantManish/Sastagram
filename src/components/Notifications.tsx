import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { handleFirestoreError, OperationType } from '../utils/firestore';
import { Notification } from '../types';
import { formatDistanceToNow } from 'date-fns';
import { Bell, Heart, MessageCircle, UserPlus } from 'lucide-react';
import { getOptimizedImageUrl } from '../utils/cloudinary';

import { useBlocks } from '../services/blockService';

export default function Notifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const { blockedIds, blockedByIds } = useBlocks(auth.currentUser?.uid);

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

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto pb-20 bg-white min-h-screen">
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-zinc-200 px-4 py-3">
        <h1 className="text-xl font-bold text-zinc-900">Notifications</h1>
      </div>

      {filteredNotifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[60vh] text-zinc-500">
          <Bell className="w-12 h-12 mb-4 text-zinc-300" />
          <p className="text-lg font-medium text-zinc-900">No notifications yet</p>
          <p className="text-sm">When someone interacts with you, you'll see it here.</p>
        </div>
      ) : (
        <div className="divide-y divide-zinc-100">
          {filteredNotifications.map((notification) => (
            <div key={notification.id} className={`p-4 flex items-start gap-3 ${!notification.read ? 'bg-indigo-50/50' : ''}`}>
              <div className="relative">
                <div className="w-10 h-10 rounded-full bg-zinc-200 overflow-hidden shrink-0">
                  {notification.senderPhoto ? (
                    <img 
                      src={getOptimizedImageUrl(notification.senderPhoto, 80, 80)} 
                      alt={notification.senderName} 
                      className="w-full h-full object-cover" 
                      referrerPolicy="no-referrer" 
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-500 font-medium">
                      {notification.senderName.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-white flex items-center justify-center shadow-sm">
                  {notification.type === 'like' && <Heart className="w-3 h-3 text-red-500 fill-red-500" />}
                  {notification.type === 'comment' && <MessageCircle className="w-3 h-3 text-blue-500 fill-blue-500" />}
                  {notification.type === 'follow' && <UserPlus className="w-3 h-3 text-indigo-500" />}
                </div>
              </div>
              
              <div className="flex-1 min-w-0">
                <p className="text-sm text-zinc-900">
                  <span className="font-semibold">{notification.senderName}</span>{' '}
                  {notification.type === 'like' && 'liked your post.'}
                  {notification.type === 'comment' && 'commented on your post.'}
                  {notification.type === 'follow' && 'started following you.'}
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {notification.createdAt ? formatDistanceToNow(notification.createdAt.toDate(), { addSuffix: true }) : 'Just now'}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
