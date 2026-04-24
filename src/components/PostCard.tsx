import React, { useState, useEffect, useRef } from 'react';
import { Heart, MessageCircle, Send, Bookmark, Share2, Trash2, Edit2, Volume2, VolumeX, Play, Star } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { doc, getDoc, setDoc, deleteDoc, writeBatch, increment, serverTimestamp, collection, query, where, getDocs, onSnapshot, limit } from 'firebase/firestore';
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
import EditPostModal from './EditPostModal';
import ZoomableMedia from './ZoomableMedia';

interface PostCardProps {
  key?: string | number;
  post: Post;
  onLikeToggle?: () => void;
  onCommentClick?: (index?: number) => void;
  onUserClick?: (userId: string) => void;
  onTagClick?: (tag: string) => void;
  onSwipeNext?: () => void;
  onSwipePrev?: () => void;
  initialMediaIndex?: number;
}

export default function PostCard({ post, onLikeToggle, onCommentClick, onUserClick, onTagClick, onSwipeNext, onSwipePrev, initialMediaIndex = 0 }: PostCardProps) {
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
  const [showEditModal, setShowEditModal] = useState(false);
  const [isFollowing, setIsFollowing] = useState<boolean | null>(null);
  const [isFollowLoading, setIsFollowLoading] = useState(false);
  const [currentMediaIndex, setCurrentMediaIndex] = useState(initialMediaIndex);
  const [mediaAspectRatio, setMediaAspectRatio] = useState<number>(1);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);

  const mediaList = post.mediaUrls && post.mediaUrls.length > 0 
    ? post.mediaUrls 
    : [{ 
        url: post.videoUrl || post.imageUrl, 
        type: (post.mediaType === 'video' || post.videoUrl || (post.imageUrl && (post.imageUrl.match(/\.(mp4|webm|ogg|mov)$/i) || post.imageUrl.includes('/video/upload/')))) ? 'video' : 'image' 
      }];

  const currentMedia = mediaList[currentMediaIndex];

  const handleDragEnd = (e: any, { offset, velocity }: any) => {
    const swipe = offset.x;
    const swipeThreshold = 50;
    
    if (swipe < -swipeThreshold) {
      if (currentMediaIndex < mediaList.length - 1) {
        setCurrentMediaIndex(prev => prev + 1);
      } else if (onSwipeNext) {
        onSwipeNext();
      }
    } else if (swipe > swipeThreshold) {
      if (currentMediaIndex > 0) {
        setCurrentMediaIndex(prev => prev - 1);
      } else if (onSwipePrev) {
        onSwipePrev();
      }
    }
  };

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

  // Reset aspect ratio when media changes
  useEffect(() => {
    setMediaAspectRatio(1);
  }, [currentMediaIndex, post.id]);

  const onMediaLoad = (e: React.SyntheticEvent<HTMLImageElement | HTMLVideoElement>) => {
    const target = e.target as any;
    const width = target.naturalWidth || target.videoWidth;
    const height = target.naturalHeight || target.videoHeight;
    if (width && height) {
      setMediaAspectRatio(width / height);
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let isMounted = true;

    const observer = new IntersectionObserver(
      async (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            try {
              await video.play();
              if (isMounted) setIsPlaying(true);
            } catch (error) {
              if (isMounted && error instanceof Error && error.name !== 'AbortError') {
                console.error('Video play interrupted:', error);
              }
              if (isMounted) setIsPlaying(false);
            }
          } else {
            video.pause();
            if (isMounted) setIsPlaying(false);
          }
        }
      },
      { threshold: 0.6 }
    );

    observer.observe(video);

    return () => {
      isMounted = false;
      observer.unobserve(video);
      video.pause();
    };
  }, []);

  const toggleMute = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(videoRef.current.muted);
    }
  };

  const togglePlay = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
        setIsPlaying(false);
      } else {
        try {
          await videoRef.current.play();
          setIsPlaying(true);
        } catch (error) {
          if (error instanceof Error && error.name !== 'AbortError') {
            console.error('Video play interrupted:', error);
          }
          setIsPlaying(false);
        }
      }
    }
  };

  const handleFollow = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!auth.currentUser || isFollowLoading || isFollowing) return;
    
    setIsFollowLoading(true);

    if (post.id.startsWith('pexels-') || post.id.startsWith('unsplash-')) {
      // Optimistic follow for external posts without backend updates
      setIsFollowing(true);
      setIsFollowLoading(false);
      return;
    }

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
    
    const newIsLiked = !isLiked;
    
    // Optimistic UI update
    setIsLiked(newIsLiked);
    setLikeCount(prev => newIsLiked ? prev + 1 : Math.max(0, prev - 1));
    
    setIsLiking(true);

    if (post.id.startsWith('pexels-') || post.id.startsWith('unsplash-')) {
      const likeId = `${post.id}_${auth.currentUser.uid}`;
      const likeRef = doc(db, 'likes', likeId);
      try {
        if (!newIsLiked) {
          await deleteDoc(likeRef);
        } else {
          await setDoc(likeRef, {
            postId: post.id,
            userId: auth.currentUser.uid,
            createdAt: serverTimestamp(),
          });
        }
        onLikeToggle?.();
      } catch (err) {
        console.error("Error updating external like:", err);
        setIsLiked(!newIsLiked);
        setLikeCount(prev => !newIsLiked ? prev + 1 : Math.max(0, prev - 1));
      } finally {
        setIsLiking(false);
      }
      return;
    }

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
      }
      
      await batch.commit();
      onLikeToggle?.();
    } catch (err) {
      // Rollback on error
      setIsLiked(!newIsLiked);
      setLikeCount(prev => !newIsLiked ? prev + 1 : Math.max(0, prev - 1));
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
      const mediaToDelete = [];
      if (post.imageUrl) mediaToDelete.push(post.imageUrl);
      if (post.videoUrl) mediaToDelete.push(post.videoUrl);
      if (post.mediaUrls && post.mediaUrls.length > 0) {
        post.mediaUrls.forEach(m => mediaToDelete.push(m.url));
      }

      await Promise.all(mediaToDelete.map(url => deleteFromCloudinary(url)));
      
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

  const renderCaption = (text: string) => {
    if (!text) return null;
    
    // Split by spaces but preserve them
    const parts = text.split(/(\s+)/);
    
    return parts.map((part, i) => {
      if (part.startsWith('#')) {
        const tag = part.slice(1).replace(/[^\w]/g, '');
        return (
          <button
            key={`tag-${i}-${tag}`}
            onClick={(e) => {
              e.stopPropagation();
              onTagClick?.(tag);
            }}
            className="text-indigo-600 font-medium hover:underline"
          >
            {part}
          </button>
        );
      }
      
      if (part.startsWith('@')) {
        const username = part.slice(1).replace(/[^\w]/g, '');
        return (
          <button
            key={`mention-${i}-${username}`}
            onClick={async (e) => {
              e.stopPropagation();
              // Try to find user by username
              try {
                const q = query(collection(db, 'users'), where('username', '==', username), limit(1));
                const snap = await getDocs(q);
                if (!snap.empty) {
                  onUserClick?.(snap.docs[0].id);
                } else {
                  // If user not found, maybe just search for them
                  onTagClick?.(`@${username}`);
                }
              } catch (err) {
                console.error(err);
              }
            }}
            className="text-indigo-600 font-medium hover:underline"
          >
            {part}
          </button>
        );
      }
      
      return <span key={`text-${i}`}>{part}</span>;
    });
  };

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
            {post.audience === 'close_friends' && (
              <div className="bg-green-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-sm uppercase tracking-wider flex items-center gap-1 shadow-sm">
                <Star className="w-3 h-3 fill-white" />
              </div>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <AnimatePresence>
            {auth.currentUser?.uid !== post.authorId && isFollowing === false && (
              <motion.button 
                initial={{ opacity: 0, scale: 0.8, width: 0 }}
                animate={{ opacity: 1, scale: 1, width: 'auto' }}
                exit={{ opacity: 0, scale: 0.5, width: 0, padding: 0, margin: 0 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                onClick={handleFollow}
                disabled={isFollowLoading}
                className="px-4 py-1.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-[13px] font-bold rounded-full hover:from-indigo-600 hover:to-purple-600 transition-all disabled:opacity-50 active:scale-95 shadow-sm shadow-indigo-100 whitespace-nowrap overflow-hidden"
              >
                {isFollowLoading ? '...' : 'Follow'}
              </motion.button>
            )}
          </AnimatePresence>

          {auth.currentUser?.uid === post.authorId && (
            <div className="flex items-center gap-1">
              <button 
                onClick={() => setShowEditModal(true)}
                disabled={isDeleting}
                className="p-2 text-zinc-400 hover:text-indigo-500 hover:bg-indigo-50 rounded-full transition-all disabled:opacity-50 active:scale-90"
              >
                <Edit2 className="w-5 h-5" />
              </button>
              <button 
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isDeleting}
                className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all disabled:opacity-50 active:scale-90"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      </div>

      <EditPostModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        post={post}
      />

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
        currentMediaIndex={currentMediaIndex}
      />

      {/* Image/Video */}
      <div 
        className="w-full bg-zinc-50 dark:bg-zinc-900 relative cursor-pointer overflow-hidden group flex items-center justify-center"
        style={{ 
          aspectRatio: `${Math.max(4/5, Math.min(mediaAspectRatio, 1.91))}`,
          maxHeight: 'min(600px, 70vh)'
        }}
        onClick={handleDoubleTap}
      >
        <motion.div
          drag={(mediaList.length > 1 || onSwipeNext || onSwipePrev) ? "x" : false}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.2}
          onDragEnd={handleDragEnd}
          className="w-full h-full flex items-center justify-center relative touch-pan-y"
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={currentMediaIndex}
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              transition={{ duration: 0.2 }}
              className="w-full h-full flex items-center justify-center"
            >
              <ZoomableMedia className="w-full h-full">
                {currentMedia.type === 'video' ? (
                  <div className="relative w-full h-full flex items-center justify-center bg-black">
                    <video 
                      ref={videoRef}
                      src={currentMedia.url} 
                      playsInline
                      loop
                      muted={isMuted}
                      onLoadedMetadata={onMediaLoad}
                      onClick={(e) => {
                        // Don't stop propagation so double tap works
                        if (videoRef.current && videoRef.current.paused) {
                          videoRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
                        } else {
                          toggleMute();
                        }
                      }}
                      className="w-full h-full max-h-[min(500px,70vh)] object-contain block"
                    />
                    
                    {/* Custom Video Controls */}
                    <div className="absolute bottom-4 right-4 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleMute(e);
                        }}
                        className="p-2 bg-black/50 hover:bg-black/70 text-white rounded-full backdrop-blur-sm transition-all"
                      >
                        {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                      </button>
                    </div>
                    
                    {!isPlaying && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-16 h-16 bg-black/40 rounded-full flex items-center justify-center backdrop-blur-sm">
                          <Play className="w-8 h-8 text-white fill-white ml-1" />
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <img 
                    src={getOptimizedImageUrl(currentMedia.url, 800)} 
                    alt="Post content" 
                    onLoad={onMediaLoad}
                    className="w-full h-full max-h-[min(500px,70vh)] object-contain block"
                    referrerPolicy="no-referrer"
                    loading="lazy"
                  />
                )}
              </ZoomableMedia>
            </motion.div>
          </AnimatePresence>
        </motion.div>
        
        {/* Pagination Dots */}
        {mediaList.length > 1 && (
          <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-1.5 z-10 pointer-events-none">
            {mediaList.map((_, idx) => (
              <div 
                key={`${idx}-${post.id}`} 
                className={cn(
                  "w-1.5 h-1.5 rounded-full transition-all duration-300",
                  idx === currentMediaIndex 
                    ? "bg-white scale-125" 
                    : "bg-white/50"
                )}
              />
            ))}
          </div>
        )}
        
        <AnimatePresence>
          {showHeartAnimation && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1.2, opacity: 1 }}
              exit={{ scale: 1.5, opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none z-20"
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
              className="group relative p-1.5 -ml-1.5 text-zinc-900 hover:text-red-500 transition-all active:scale-90"
            >
              <div className="absolute inset-0 bg-red-50 rounded-full scale-0 group-hover:scale-100 transition-transform duration-200" />
              <Heart className={cn('relative w-[28px] h-[28px] transition-colors', isLiked && 'fill-red-500 text-red-500')} />
            </button>
            <button 
              onClick={() => onCommentClick?.(currentMediaIndex)}
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
          <span className="text-zinc-800 whitespace-pre-wrap">
            {renderCaption(post.caption)}
          </span>
        </div>

        <div className="text-[11px] text-zinc-400 font-bold uppercase tracking-widest mt-2.5">
          {formattedDate}
        </div>
      </div>
    </div>
  );
}
