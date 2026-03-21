import { useState, useEffect } from 'react';
import { Heart, MessageCircle, Send, Bookmark, Share2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { doc, getDoc, setDoc, deleteDoc, writeBatch, increment, serverTimestamp, collection } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { handleFirestoreError, OperationType } from '../utils/firestore';
import { Post } from '../types';
import { cn } from '../utils';

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

  useEffect(() => {
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
    };
    checkInteractions();
  }, [post.id]);

  const handleLike = async () => {
    if (!auth.currentUser || isLiking) return;
    setIsLiking(true);

    const likeId = `${post.id}_${auth.currentUser.uid}`;
    const likeRef = doc(db, 'likes', likeId);
    const postRef = doc(db, 'posts', post.id);
    const batch = writeBatch(db);

    try {
      if (isLiked) {
        // Unlike
        batch.delete(likeRef);
        batch.update(postRef, {
          likesCount: increment(-1),
        });
        await batch.commit();
        setIsLiked(false);
        setLikeCount((prev) => Math.max(0, prev - 1));
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
        setIsLiked(true);
        setLikeCount((prev) => prev + 1);
      }
      onLikeToggle?.();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `posts/${post.id}/likes`);
    } finally {
      setIsLiking(false);
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

  const handleShare = async () => {
    const url = `${window.location.origin}/post/${post.id}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Post by ${post.authorName}`,
          text: post.caption,
          url: url,
        });
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error('Error sharing:', err);
        }
      }
    } else {
      try {
        await navigator.clipboard.writeText(url);
        alert('Link copied to clipboard!');
      } catch (err) {
        console.error('Error copying to clipboard:', err);
      }
    }
  };

  const formattedDate = post.createdAt?.toDate 
    ? formatDistanceToNow(post.createdAt.toDate(), { addSuffix: true }) 
    : 'Just now';

  return (
    <div className="bg-white border-b border-zinc-200 sm:border sm:rounded-xl sm:mb-6 overflow-hidden">
      {/* Header */}
      <div className="flex items-center p-3 gap-3">
        <button 
          onClick={() => onUserClick?.(post.authorId)}
          className="w-8 h-8 rounded-full bg-zinc-200 overflow-hidden hover:opacity-80 transition-opacity"
        >
          {post.authorPhoto ? (
            <img src={post.authorPhoto} alt={post.authorName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-500 font-medium text-sm">
              {post.authorName.charAt(0).toUpperCase()}
            </div>
          )}
        </button>
        <button 
          onClick={() => onUserClick?.(post.authorId)}
          className="font-semibold text-sm text-zinc-900 hover:underline"
        >
          {post.authorName}
        </button>
      </div>

      {/* Image */}
      <div className="w-full aspect-square bg-zinc-100 relative">
        <img 
          src={post.imageUrl} 
          alt="Post content" 
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
          loading="lazy"
        />
      </div>

      {/* Actions */}
      <div className="p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-4">
            <button 
              onClick={handleLike}
              disabled={isLiking}
              className="text-zinc-900 hover:opacity-70 transition-opacity"
            >
              <Heart className={cn('w-6 h-6', isLiked && 'fill-red-500 text-red-500')} />
            </button>
            <button 
              onClick={onCommentClick}
              className="text-zinc-900 hover:opacity-70 transition-opacity"
            >
              <MessageCircle className="w-6 h-6" />
            </button>
            <button 
              onClick={handleShare}
              className="text-zinc-900 hover:opacity-70 transition-opacity"
            >
              <Share2 className="w-6 h-6" />
            </button>
          </div>
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="text-zinc-900 hover:opacity-70 transition-opacity"
          >
            <Bookmark className={cn('w-6 h-6', isSaved && 'fill-zinc-900')} />
          </button>
        </div>

        <div className="font-semibold text-sm text-zinc-900 mb-1">
          {likeCount} {likeCount === 1 ? 'like' : 'likes'}
        </div>

        <div className="text-sm text-zinc-900">
          <button 
            onClick={() => onUserClick?.(post.authorId)}
            className="font-semibold mr-2 hover:underline"
          >
            {post.authorName}
          </button>
          <span>{post.caption}</span>
        </div>

        <div className="text-xs text-zinc-500 mt-2 uppercase tracking-wide">
          {formattedDate}
        </div>
      </div>
    </div>
  );
}
