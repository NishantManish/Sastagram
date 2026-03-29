import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Send, Link, PlusCircle } from 'lucide-react';
import { collection, query, where, getDocs, addDoc, serverTimestamp, doc, setDoc, Timestamp, writeBatch } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { User, Post } from '../types';
import UserAvatar from './UserAvatar';
import { handleFirestoreError, OperationType } from '../utils/firestore';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  post: Post;
  currentMediaIndex?: number;
}

export default function ShareModal({ isOpen, onClose, post, currentMediaIndex = 0 }: ShareModalProps) {
  const [followers, setFollowers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [sharingToStory, setSharingToStory] = useState(false);
  const [sharingToUser, setSharingToUser] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !auth.currentUser) return;

    const fetchData = async () => {
      try {
        // Fetch followers
        const followersQuery = query(
          collection(db, 'follows'),
          where('followingId', '==', auth.currentUser?.uid)
        );
        const followersSnap = await getDocs(followersQuery);
        const followerIds = followersSnap.docs.map(doc => doc.data().followerId);

        if (followerIds.length > 0) {
          const usersQuery = query(
            collection(db, 'users'),
            where('__name__', 'in', followerIds.slice(0, 10))
          );
          const usersSnap = await getDocs(usersQuery);
          const usersData = usersSnap.docs.map(doc => ({ uid: doc.id, ...doc.data() } as User));
          setFollowers(usersData);
        }
      } catch (err) {
        console.error('Error fetching share data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isOpen]);

  const handleShareToStory = async () => {
    if (!auth.currentUser || sharingToStory) return;
    setSharingToStory(true);
    
    try {
      const expiresAtDate = new Date();
      expiresAtDate.setHours(expiresAtDate.getHours() + 24);

      const currentMedia = post.mediaUrls && post.mediaUrls.length > currentMediaIndex 
        ? post.mediaUrls[currentMediaIndex] 
        : { url: post.imageUrl || post.videoUrl || '', type: post.mediaType || 'image' };

      await addDoc(collection(db, 'stories'), {
        authorId: auth.currentUser.uid,
        authorName: auth.currentUser.displayName || 'Anonymous',
        authorPhoto: auth.currentUser.photoURL || '',
        imageUrl: currentMedia.type === 'image' ? currentMedia.url : '',
        videoUrl: currentMedia.type === 'video' ? currentMedia.url : '',
        mediaType: currentMedia.type,
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

      const batch = writeBatch(db);

      if (!chatId) {
        const newChatRef = doc(collection(db, 'chats'));
        chatId = newChatRef.id;
        batch.set(newChatRef, {
          participants: [auth.currentUser.uid, user.uid],
          updatedAt: serverTimestamp(),
          lastMessage: 'Shared a post',
          readStatus: {
            [auth.currentUser.uid]: true,
            [user.uid]: false
          }
        });
      } else {
        batch.set(doc(db, 'chats', chatId), {
          updatedAt: serverTimestamp(),
          lastMessage: 'Shared a post',
          readStatus: {
            [auth.currentUser.uid]: true,
            [user.uid]: false
          }
        }, { merge: true });
      }

      // Send message with post link
      const newMessageRef = doc(collection(db, `chats/${chatId}/messages`));
      const currentMedia = post.mediaUrls && post.mediaUrls.length > currentMediaIndex 
        ? post.mediaUrls[currentMediaIndex] 
        : { url: post.imageUrl || post.videoUrl || '', type: post.mediaType || 'image' };

      batch.set(newMessageRef, {
        chatId: chatId,
        senderId: auth.currentUser.uid,
        text: '',
        sharedPostId: post.id,
        sharedPostSlideIndex: currentMediaIndex,
        sharedPostPreviewUrl: currentMedia.url,
        sharedPostMediaType: currentMedia.type,
        createdAt: serverTimestamp()
      });

      await batch.commit();

      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'chats/messages');
    } finally {
      setSharingToUser(null);
    }
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}/post/${post.id}${currentMediaIndex > 0 ? `?slide=${currentMediaIndex}` : ''}`;
    navigator.clipboard.writeText(url).then(() => {
      onClose();
    });
  };

  const handleNativeShare = async () => {
    const shareData = {
      title: `${post.authorName}'s post on Sastagram`,
      text: post.caption || 'Check out this post!',
      url: `${window.location.origin}/post/${post.id}${currentMediaIndex > 0 ? `?slide=${currentMediaIndex}` : ''}`,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        onClose();
      }
    } catch (err: any) {
      // Ignore AbortError or "canceled" messages which happen when user cancels the share
      if (err.name === 'AbortError' || (err.message && err.message.toLowerCase().includes('cancel'))) {
        return;
      }
      console.error('Error sharing post:', err);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center p-4 bg-black/60 backdrop-blur-sm"
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

                {navigator.share && (
                  <button 
                    onClick={handleNativeShare}
                    className="flex flex-col items-center gap-2 shrink-0"
                  >
                    <div className="w-14 h-14 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 border border-indigo-100">
                      <Send className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-medium text-zinc-700">Share via...</span>
                  </button>
                )}
              </div>

              <div className="mt-2">
                <h4 className="text-sm font-semibold text-zinc-900 mb-3 uppercase tracking-wider text-[10px]">Send to Followers</h4>
                {loading ? (
                  <div className="flex justify-center py-4">
                    <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                  </div>
                ) : followers.length === 0 ? (
                  <p className="text-sm text-zinc-500 text-center py-4">No followers yet to share with.</p>
                ) : (
                  <div className="space-y-3 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
                    {followers.map(user => (
                      <div key={user.uid} className="flex items-center justify-between group">
                        <div className="flex items-center gap-3">
                          <UserAvatar userId={user.uid} size={40} className="border border-zinc-100" />
                          <div className="flex flex-col">
                            <span className="font-bold text-zinc-900 text-sm">{user.displayName}</span>
                            <span className="text-[10px] text-zinc-400 font-medium">@{user.username || 'user'}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleShareToUser(user)}
                          disabled={sharingToUser === user.uid}
                          className="px-5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-full transition-all active:scale-95 disabled:opacity-50 shadow-sm shadow-indigo-200"
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
