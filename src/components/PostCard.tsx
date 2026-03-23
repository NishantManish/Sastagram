import React, { useState, useEffect } from 'react';
import { Heart, MessageCircle, Send, Bookmark, Share2, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { doc, getDoc, setDoc, deleteDoc, writeBatch, increment, serverTimestamp, collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { handleFirestoreError, OperationType } from '../utils/firestore';
import { Post } from '../types';
import { cn } from '../utils';
import { getOptimizedImageUrl } from '../utils/cloudinary';
import { deleteFromCloudinary } from '../utils/media';
import { motion, AnimatePresence } from 'motion/react';
import UserAvatar from './UserAvatar';
import ConfirmationModal from './ConfirmationModal';
import ShareModal from './ShareModal';

interface PostCardProps {
  key?: string | number;
  post: Post;
  onLikeToggle?: () => void;
  onCommentClick?: () => void;
  onUserClick?: (userId: string) => void;
}

export default function PostCard({ post, onLikeToggle, onCommentClick, onUserClick }: PostCardProps) {
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(post.likesCount);
  const [isLiking, setIsLiking] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showHeartAnimation, setShowHeartAnimation] = useState(false);
  const [lastTap, setLastTap] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [isFollowing, setIsFollowing] = useState<boolean | null>(null);
  const [isFollowLoading, setIsFollowLoading] = useState(false);

  useEffect(() => {
    let mounted = true;

    const checkInteractions = async () => {
      if (!auth.currentUser) return;
      
      try {
        const likeId = `${post.id}_${auth.currentUser.uid}`;
        const saveId = `${auth.currentUser.uid}_${post.id}`;
        
        const promises: Promise<any>[] = [
          getDoc(doc(db, 'likes', likeId)),
          getDoc(doc(db, 'savedPosts', saveId))
        ];

        if (post.authorId !== auth.currentUser.uid) {
          const followId = `${auth.currentUser.uid}_${post.authorId}`;
          promises.push(getDoc(doc(db, 'follows', followId)));
        }

        const results = await Promise.allSettled(promises);
        
        if (mounted) {
          if (results[0].status === 'fulfilled') setIsLiked(results[0].value.exists());
          if (results[1].status === 'fulfilled') setIsSaved(results[1].value.exists());
          
          if (results.length > 2) {
            const followRes = results[2];
            if (followRes.status === 'fulfilled') {
              setIsFollowing(followRes.value.exists());
            } else {
              setIsFollowing(null); // Hide button on error
            }
          }
        }
      } catch (error) {
        console.error("Error fetching post interactions:", error);
        if (mounted && post.authorId !== auth.currentUser.uid) {
          setIsFollowing(null); // Hide button on error
        }
      }
    };
    
    checkInteractions();

    return () => {
      mounted = false;
    };
  }, [post.id, post.authorId, auth.currentUser?.uid]);

  const handleFollow = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!auth.currentUser || isFollowLoading || isFollowing) return;
    
    setIsFollowLoading(true);
    const followId = `${auth.currentUser.uid}_${post.authorId}`;
    const followRef = doc(db, 'follows', followId);
    const batch = writeBatch(db);

    try {
      batch.set(followRef, {
        followerId: auth.currentUser.uid,
        followingId: post.authorId,
        createdAt: serverTimestamp(),
      });

      batch.update(doc(db, 'users', auth.currentUser.uid), {
        followingCount: increment(1),
      });

      batch.update(doc(db, 'users', post.authorId), {
        followersCount: increment(1),
      });

      // Create notification for follow
      const notificationRef = doc(collection(db, 'notifications'));
      batch.set(notificationRef, {
        userId: post.authorId,
        type: 'follow',
        senderId: auth.currentUser.uid,
        senderName: auth.currentUser.displayName || 'Someone',
        senderPhoto: auth.currentUser.photoURL || '',
        read: false,
        createdAt: serverTimestamp()
      });

      await batch.commit();
      setIsFollowing(true);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `follows/${auth.currentUser.uid}_${post.authorId}`);
    } finally {
      setIsFollowLoading(false);
    }
  };

  const handleLike = async () => {
    if (!auth.currentUser || isLiking) return;
    setIsLiking(true);
    
    // Optimistic UI
    const newIsLiked = !isLiked;
    setIsLiked(newIsLiked);
    setLikeCount((prev) => newIsLiked ? prev + 1 : Math.max(0, prev - 1));

    const likeId = `${post.id}_${auth.currentUser.uid}`;
    const likeRef = doc(db, 'likes', likeId);
    const postRef = doc(db, 'posts', post.id);
    const batch = writeBatch(db);

    try {
      if (!newIsLiked) {
        // Unlike
        batch.delete(likeRef);
        batch.update(postRef, {
          likesCount: increment(-1),
        });
        await batch.commit();
      } else {
        // Like
        batch.set(likeRef, {
          postId: post.id,
          userId: auth.currentUser.uid,
          createdAt: serverTimestamp(),
        });
        batch.update(postRef, {
          likesCount: increment(1),
        });
        
        // Create notification for like
        if (post.authorId !== auth.currentUser.uid) {
          const notificationRef = doc(collection(db, 'notifications'));
          batch.set(notificationRef, {
            userId: post.authorId,
            type: 'like',
            senderId: auth.currentUser.uid,
            senderName: auth.currentUser.displayName || 'Someone',
            senderPhoto: auth.currentUser.photoURL || '',
            postId: post.id,
            read: false,
            createdAt: serverTimestamp()
          });
        }
        
        await batch.commit();
      }
      onLikeToggle?.();
    } catch (err) {
      // Rollback on error
      setIsLiked(!newIsLiked);
      setLikeCount((prev) => !newIsLiked ? prev + 1 : Math.max(0, prev - 1));
      handleFirestoreError(err, OperationType.WRITE, `posts/${post.id}/likes`);
    } finally {
      setIsLiking(false);
    }
  };

  const handleDoubleTap = () => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;
    if (now - lastTap < DOUBLE_TAP_DELAY) {
      if (!isLiked) {
        handleLike();
      }
      setShowHeartAnimation(true);
      setTimeout(() => setShowHeartAnimation(false), 1000);
    }
    setLastTap(now);
  };

  const handleDelete = async () => {
    if (!auth.currentUser || auth.currentUser.uid !== post.authorId || isDeleting) return;
    
    setIsDeleting(true);
    try {
      const batch = writeBatch(db);
      
      // Delete post
      batch.delete(doc(db, 'posts', post.id));
      
      // Delete notifications related to this post
      const notificationsQuery = query(
        collection(db, 'notifications'), 
        where('postId', '==', post.id),
        where('userId', '==', auth.currentUser.uid)
      );
      const notificationsSnap = await getDocs(notificationsQuery);
      notificationsSnap.forEach(doc => batch.delete(doc.ref));

      await batch.commit();

      // Delete from Cloudinary
      if (post.imageUrl) {
        await deleteFromCloudinary(post.imageUrl);
      }
      
      setShowDeleteConfirm(false);
      // The parent component (Feed) should handle the removal from UI via onSnapshot or a refresh
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `posts/${post.id}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSave = async () => {
    if (!auth.currentUser || isSaving) return;
    setIsSaving(true);

    const saveId = `${auth.currentUser.uid}_${post.id}`;
    const saveRef = doc(db, 'savedPosts', saveId);

    try {
      if (isSaved) {
        await deleteDoc(saveRef);
        setIsSaved(false);
      } else {
        await setDoc(saveRef, {
          userId: auth.currentUser.uid,
          postId: post.id,
          createdAt: serverTimestamp(),
        });
        setIsSaved(true);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `savedPosts/${auth.currentUser?.uid}_${post.id}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleShare = () => {
    setShowShareModal(true);
  };

  const formattedDate = post.createdAt?.toDate 
    ? formatDistanceToNow(post.createdAt.toDate(), { addSuffix: true }) 
    : 'Just now';

  return (
    <div className="bg-white border-b border-zinc-100 sm:border sm:rounded-xl sm:mb-4 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => onUserClick?.(post.authorId)}
            className="hover:opacity-90 transition-opacity active:scale-95"
          >
            <UserAvatar 
              userId={post.authorId} 
              size={36} 
              fallbackPhoto={post.authorPhoto} 
              fallbackName={post.authorName} 
            />
          </button>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => onUserClick?.(post.authorId)}
              className="font-bold text-[14px] text-zinc-900 hover:text-zinc-600 transition-colors"
            >
              {post.authorName}
            </button>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {auth.currentUser?.uid !== post.authorId && isFollowing === false && (
            <button 
              onClick={handleFollow}
              disabled={isFollowLoading}
              className="px-4 py-1.5 bg-indigo-600 text-white text-[13px] font-bold rounded-full hover:bg-indigo-700 transition-all disabled:opacity-50 active:scale-95 shadow-sm shadow-indigo-100"
            >
              {isFollowLoading ? '...' : 'Follow'}
            </button>
          )}

          {auth.currentUser?.uid === post.authorId && (
            <button 
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isDeleting}
              className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all disabled:opacity-50 active:scale-90"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      <ConfirmationModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        isLoading={isDeleting}
        title="Delete Post?"
        message="Are you sure you want to delete this post? This action cannot be undone."
        confirmText="Delete"
      />

      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        post={post}
      />

      {/* Image */}
      <div 
        className="w-full max-h-[500px] bg-zinc-50 relative cursor-pointer overflow-y-auto custom-scrollbar"
        onClick={handleDoubleTap}
      >
        <img 
          src={getOptimizedImageUrl(post.imageUrl, 800)} 
          alt="Post content" 
          className="w-full h-auto block"
          referrerPolicy="no-referrer"
          loading="lazy"
        />
        
        <AnimatePresence>
          {showHeartAnimation && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1.2, opacity: 1 }}
              exit={{ scale: 1.5, opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
            >
              <Heart 
                className="w-24 h-24 drop-shadow-2xl fill-red-500 text-red-500" 
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Actions */}
      <div className="px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-4">
            <button 
              onClick={handleLike}
              disabled={isLiking}
              className="group relative p-1.5 -ml-1.5 text-zinc-900 hover:text-red-500 transition-all active:scale-90"
            >
              <div className="absolute inset-0 bg-red-50 rounded-full scale-0 group-hover:scale-100 transition-transform duration-200" />
              <Heart className={cn('relative w-[28px] h-[28px] transition-colors', isLiked && 'fill-red-500 text-red-500')} />
            </button>
            <button 
              onClick={onCommentClick}
              className="group relative p-1.5 text-zinc-900 hover:text-indigo-500 transition-all active:scale-90"
            >
              <div className="absolute inset-0 bg-indigo-50 rounded-full scale-0 group-hover:scale-100 transition-transform duration-200" />
              <MessageCircle className="relative w-[28px] h-[28px] transition-colors" />
            </button>
            <button 
              onClick={handleShare}
              className="group relative p-1.5 text-zinc-900 hover:text-purple-500 transition-all active:scale-90"
            >
              <div className="absolute inset-0 bg-purple-50 rounded-full scale-0 group-hover:scale-100 transition-transform duration-200" />
              <Send className="relative w-[28px] h-[28px] transition-colors" />
            </button>
          </div>
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="group relative p-1.5 -mr-1.5 text-zinc-900 hover:text-zinc-600 transition-all active:scale-90"
          >
            <div className="absolute inset-0 bg-zinc-100 rounded-full scale-0 group-hover:scale-100 transition-transform duration-200" />
            <Bookmark className={cn('relative w-[28px] h-[28px] transition-colors', isSaved && 'fill-zinc-900')} />
          </button>
        </div>

        <div className="font-bold text-[14px] text-zinc-900 mb-1.5">
          {likeCount.toLocaleString()} {likeCount === 1 ? 'like' : 'likes'}
        </div>

        <div className="text-[14px] text-zinc-900 leading-relaxed">
          <button 
            onClick={() => onUserClick?.(post.authorId)}
            className="font-bold mr-2 hover:text-zinc-600 transition-colors"
          >
            {post.authorName}
          </button>
          <span className="text-zinc-800">{post.caption}</span>
        </div>

        <div className="text-[11px] text-zinc-400 font-bold uppercase tracking-widest mt-2.5">
          {formattedDate}
        </div>
      </div>
    </div>
  );
}
