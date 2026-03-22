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
  const [isFollowing, setIsFollowing] = useState(false);
  const [isFollowLoading, setIsFollowLoading] = useState(false);

  useEffect(() => {
    let unsubscribeFollow: (() => void) | undefined;

    const checkInteractions = async () => {
      if (!auth.currentUser) return;
      
      // Check like
      const likeId = `${post.id}_${auth.currentUser.uid}`;
      const likeRef = doc(db, 'likes', likeId);
      const likeSnap = await getDoc(likeRef);
      setIsLiked(likeSnap.exists());

      // Check save
      const saveId = `${auth.currentUser.uid}_${post.id}`;
      const saveRef = doc(db, 'savedPosts', saveId);
      const saveSnap = await getDoc(saveRef);
      setIsSaved(saveSnap.exists());

      // Check follow with real-time listener
      if (post.authorId !== auth.currentUser.uid) {
        const followId = `${auth.currentUser.uid}_${post.authorId}`;
        const followRef = doc(db, 'follows', followId);
        unsubscribeFollow = onSnapshot(followRef, (docSnap) => {
          setIsFollowing(docSnap.exists());
        });
      }
    };
    checkInteractions();

    return () => {
      if (unsubscribeFollow) unsubscribeFollow();
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
            {auth.currentUser?.uid !== post.authorId && !isFollowing && (
              <div className="flex items-center gap-2">
                <span className="text-zinc-300 text-[10px] font-bold">•</span>
                <button 
                  onClick={handleFollow}
                  disabled={isFollowLoading}
                  className="text-indigo-600 text-[14px] font-bold hover:text-indigo-700 transition-colors disabled:opacity-50 active:scale-95"
                >
                  {isFollowLoading ? '...' : 'Follow'}
                </button>
              </div>
            )}
          </div>
        </div>
        
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
        className="w-full aspect-square bg-zinc-100 relative cursor-pointer overflow-hidden"
        onClick={handleDoubleTap}
      >
        <img 
          src={getOptimizedImageUrl(post.imageUrl, 800)} 
          alt="Post content" 
          className="w-full h-full object-cover"
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
                className="w-24 h-24 drop-shadow-2xl fill-white text-white" 
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Actions */}
      <div className="px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-5">
            <button 
              onClick={handleLike}
              disabled={isLiking}
              className="text-zinc-900 hover:text-zinc-500 transition-all active:scale-90"
            >
              <Heart className={cn('w-[26px] h-[26px]', isLiked && 'fill-red-500 text-red-500')} />
            </button>
            <button 
              onClick={onCommentClick}
              className="text-zinc-900 hover:text-zinc-500 transition-all active:scale-90"
            >
              <MessageCircle className="w-[26px] h-[26px]" />
            </button>
            <button 
              onClick={handleShare}
              className="text-zinc-900 hover:text-zinc-500 transition-all active:scale-90"
            >
              <Send className="w-[26px] h-[26px]" />
            </button>
          </div>
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="text-zinc-900 hover:text-zinc-500 transition-all active:scale-90"
          >
            <Bookmark className={cn('w-[26px] h-[26px]', isSaved && 'fill-zinc-900')} />
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
