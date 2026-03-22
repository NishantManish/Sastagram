import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Send, Link, PlusCircle } from 'lucide-react';
import { collection, query, where, getDocs, addDoc, serverTimestamp, doc, setDoc, Timestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { User, Post } from '../types';
import UserAvatar from './UserAvatar';
import { handleFirestoreError, OperationType } from '../utils/firestore';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  post: Post;
}

export default function ShareModal({ isOpen, onClose, post }: ShareModalProps) {
  const [following, setFollowing] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [sharingToStory, setSharingToStory] = useState(false);
  const [sharingToUser, setSharingToUser] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !auth.currentUser) return;

    const fetchFollowing = async () => {
      try {
        const followsQuery = query(
          collection(db, 'follows'),
          where('followerId', '==', auth.currentUser?.uid)
        );
        const followsSnap = await getDocs(followsQuery);
        
        const followingIds = followsSnap.docs.map(doc => doc.data().followingId);
        
        if (followingIds.length > 0) {
          const usersQuery = query(
            collection(db, 'users'),
            where('__name__', 'in', followingIds.slice(0, 10)) // Limit to 10 for simplicity
          );
          const usersSnap = await getDocs(usersQuery);
          const usersData = usersSnap.docs.map(doc => ({ uid: doc.id, ...doc.data() } as User));
          setFollowing(usersData);
        }
      } catch (err) {
        console.error('Error fetching following:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchFollowing();
  }, [isOpen]);

  const handleShareToStory = async () => {
    if (!auth.currentUser || sharingToStory) return;
    setSharingToStory(true);
    
    try {
      const expiresAtDate = new Date();
      expiresAtDate.setHours(expiresAtDate.getHours() + 24);

      await addDoc(collection(db, 'stories'), {
        authorId: auth.currentUser.uid,
        authorName: auth.currentUser.displayName || 'Anonymous',
        authorPhoto: auth.currentUser.photoURL || '',
        imageUrl: post.imageUrl,
        createdAt: serverTimestamp(),
        expiresAt: Timestamp.fromDate(expiresAtDate)
      });
      
      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'stories');
    } finally {
      setSharingToStory(false);
    }
  };

  const handleShareToUser = async (user: User) => {
    if (!auth.currentUser || sharingToUser) return;
    setSharingToUser(user.uid);

    try {
      // Find or create chat
      const chatsQuery = query(
        collection(db, 'chats'),
        where('participants', 'array-contains', auth.currentUser.uid)
      );
      const chatsSnap = await getDocs(chatsQuery);
      
      let chatId = null;
      for (const doc of chatsSnap.docs) {
        const data = doc.data();
        if (data.participants.includes(user.uid) && data.participants.length === 2) {
          chatId = doc.id;
          break;
        }
      }

      if (!chatId) {
        const newChatRef = await addDoc(collection(db, 'chats'), {
          participants: [auth.currentUser.uid, user.uid],
          updatedAt: serverTimestamp(),
          lastMessage: 'Shared a post',
          readStatus: {
            [auth.currentUser.uid]: true,
            [user.uid]: false
          }
        });
        chatId = newChatRef.id;
      }

      // Send message with post link
      const postUrl = `${window.location.origin}/post/${post.id}`;
      await addDoc(collection(db, `chats/${chatId}/messages`), {
        chatId: chatId,
        senderId: auth.currentUser.uid,
        text: `Check out this post: ${postUrl}`,
        createdAt: serverTimestamp()
      });

      await setDoc(doc(db, 'chats', chatId), {
        updatedAt: serverTimestamp(),
        lastMessage: 'Shared a post',
        readStatus: {
          [auth.currentUser.uid]: true,
          [user.uid]: false
        }
      }, { merge: true });

      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'chats/messages');
    } finally {
      setSharingToUser(null);
    }
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}/post/${post.id}`;
    navigator.clipboard.writeText(url).then(() => {
      alert('Link copied to clipboard!');
      onClose();
    });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4 bg-black/60 backdrop-blur-sm"
        >
          <motion.div 
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl"
          >
            <div className="p-4 border-b border-zinc-100 flex items-center justify-between">
              <h3 className="font-bold text-lg text-zinc-900">Share</h3>
              <button onClick={onClose} className="p-2 bg-zinc-100 rounded-full hover:bg-zinc-200 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4">
              <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
                <button 
                  onClick={handleShareToStory}
                  disabled={sharingToStory}
                  className="flex flex-col items-center gap-2 shrink-0 disabled:opacity-50"
                >
                  <div className="w-14 h-14 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 border border-indigo-100">
                    <PlusCircle className="w-6 h-6" />
                  </div>
                  <span className="text-xs font-medium text-zinc-700">Add to Story</span>
                </button>
                
                <button 
                  onClick={handleCopyLink}
                  className="flex flex-col items-center gap-2 shrink-0"
                >
                  <div className="w-14 h-14 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-700 border border-zinc-200">
                    <Link className="w-6 h-6" />
                  </div>
                  <span className="text-xs font-medium text-zinc-700">Copy Link</span>
                </button>
              </div>

              <div className="mt-2">
                <h4 className="text-sm font-semibold text-zinc-900 mb-3">Send to</h4>
                {loading ? (
                  <div className="flex justify-center py-4">
                    <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                  </div>
                ) : following.length === 0 ? (
                  <p className="text-sm text-zinc-500 text-center py-4">Follow people to share posts with them.</p>
                ) : (
                  <div className="space-y-3 max-h-60 overflow-y-auto">
                    {following.map(user => (
                      <div key={user.uid} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <UserAvatar userId={user.uid} size={40} />
                          <span className="font-medium text-zinc-900 text-sm">{user.displayName}</span>
                        </div>
                        <button
                          onClick={() => handleShareToUser(user)}
                          disabled={sharingToUser === user.uid}
                          className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-full transition-colors disabled:opacity-50"
                        >
                          {sharingToUser === user.uid ? 'Sending...' : 'Send'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
