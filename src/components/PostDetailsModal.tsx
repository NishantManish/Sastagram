import React, { useState, useEffect } from 'react';
import { X, Send, Trash2, Heart, Edit2, MessageCircle, Bookmark } from 'lucide-react';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, doc, writeBatch, increment, getDocs, updateDoc, limit, getDoc, deleteDoc, setDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { handleFirestoreError, OperationType } from '../utils/firestore';
import { Post, Comment } from '../types';
import PostCard from './PostCard';
import { formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { getOptimizedImageUrl } from '../utils/cloudinary';
import { deleteFromCloudinary } from '../utils/media';
import UserAvatar from './UserAvatar';
import ConfirmationModal from './ConfirmationModal';
import EditPostModal from './EditPostModal';
import ZoomableMedia from './ZoomableMedia';
import ShareModal from './ShareModal';

interface PostDetailsModalProps {
  post: Post;
  onClose: () => void;
  onUserClick?: (userId: string) => void;
  onTagClick?: (tag: string) => void;
  onSwipeNext?: () => void;
  onSwipePrev?: () => void;
  initialMediaIndex?: number;
}

export default function PostDetailsModal({ post, onClose, onUserClick, onTagClick, onSwipeNext, onSwipePrev, initialMediaIndex = 0 }: PostDetailsModalProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [likedComments, setLikedComments] = useState<Set<string>>(new Set());
  const [processingLikes, setProcessingLikes] = useState<Set<string>>(new Set());
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(post.likesCount);
  const [isLiking, setIsLiking] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [commentToDelete, setCommentToDelete] = useState<string | null>(null);
  const [isDeletingComment, setIsDeletingComment] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{ id: string; username: string } | null>(null);

  useEffect(() => {
    if (!auth.currentUser) return;
    
    const checkInteractions = async () => {
      const likeId = `${post.id}_${auth.currentUser!.uid}`;
      const saveId = `${auth.currentUser!.uid}_${post.id}`;
      
      const [likeSnap, saveSnap] = await Promise.all([
        getDoc(doc(db, 'likes', likeId)),
        getDoc(doc(db, 'savedPosts', saveId))
      ]);
      
      setIsLiked(likeSnap.exists());
      setIsSaved(saveSnap.exists());
    };
    
    checkInteractions();
  }, [post.id]);

  const handleLike = async () => {
    if (!auth.currentUser || isLiking) return;
    
    const newIsLiked = !isLiked;
    
    // Optimistic UI update
    setIsLiked(newIsLiked);
    setLikeCount((prev) => newIsLiked ? prev + 1 : Math.max(0, prev - 1));
    
    setIsLiking(true);
    const likeId = `${post.id}_${auth.currentUser.uid}`;
    const likeRef = doc(db, 'likes', likeId);
    const postRef = doc(db, 'posts', post.id);
    const batch = writeBatch(db);

    try {
      if (!newIsLiked) {
        // Unlike
        batch.delete(likeRef);
        batch.update(postRef, { likesCount: increment(-1) });
      } else {
        // Like
        batch.set(likeRef, {
          postId: post.id,
          userId: auth.currentUser.uid,
          createdAt: serverTimestamp(),
        });
        batch.update(postRef, { likesCount: increment(1) });
        
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
    } catch (err) {
      // Rollback on error
      setIsLiked(!newIsLiked);
      setLikeCount((prev) => !newIsLiked ? prev + 1 : Math.max(0, prev - 1));
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

  const handleShare = () => {
    setShowShareModal(true);
  };
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [currentMediaIndex, setCurrentMediaIndex] = useState(initialMediaIndex);
  const [mediaAspectRatio, setMediaAspectRatio] = useState<number>(1);

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
    const q = query(
      collection(db, 'comments'),
      where('postId', '==', post.id),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedComments = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Comment[];
      setComments(fetchedComments);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `posts/${post.id}/comments`);
    });

    return () => unsubscribe();
  }, [post.id]);

  useEffect(() => {
    if (!auth.currentUser) {
      setLikedComments(new Set());
      return;
    }

    const q = query(
      collection(db, 'commentLikes'),
      where('postId', '==', post.id),
      where('userId', '==', auth.currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const likedIds = new Set(snapshot.docs.map(doc => doc.data().commentId));
      setLikedComments(likedIds);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'commentLikes');
    });

    return () => unsubscribe();
  }, [post.id, auth.currentUser]);

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
        post.mediaUrls.forEach(media => mediaToDelete.push(media.url));
      }
      
      if (mediaToDelete.length > 0) {
        await Promise.all(mediaToDelete.map(url => deleteFromCloudinary(url).catch(console.error)));
      }
      
      setShowDeleteConfirm(false);
      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `posts/${post.id}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleLikeComment = async (commentId: string) => {
    if (!auth.currentUser || processingLikes.has(commentId)) return;
    
    const isLiked = likedComments.has(commentId);
    const likeId = `${commentId}_${auth.currentUser.uid}`;
    
    // Optimistically update UI
    setLikedComments(prev => {
      const next = new Set(prev);
      if (isLiked) next.delete(commentId);
      else next.add(commentId);
      return next;
    });

    setComments(prev => prev.map(c => 
      c.id === commentId 
        ? { ...c, likesCount: (c.likesCount || 0) + (isLiked ? -1 : 1) }
        : c
    ));

    setProcessingLikes(prev => new Set(prev).add(commentId));
    
    try {
      const batch = writeBatch(db);
      const commentRef = doc(db, 'comments', commentId);
      const likeRef = doc(db, 'commentLikes', likeId);

      if (isLiked) {
        // Unlike
        batch.delete(likeRef);
        batch.update(commentRef, {
          likesCount: increment(-1)
        });
      } else {
        // Like
        batch.set(likeRef, {
          commentId,
          postId: post.id,
          userId: auth.currentUser.uid,
          createdAt: serverTimestamp()
        });
        batch.update(commentRef, {
          likesCount: increment(1)
        });
      }

      await batch.commit();
    } catch (error) {
      // Revert optimistic update on error
      setLikedComments(prev => {
        const next = new Set(prev);
        if (isLiked) next.add(commentId);
        else next.delete(commentId);
        return next;
      });

      setComments(prev => prev.map(c => 
        c.id === commentId 
          ? { ...c, likesCount: (c.likesCount || 0) + (isLiked ? 1 : -1) }
          : c
      ));
      
      handleFirestoreError(error, OperationType.WRITE, `comments/${commentId}/likes`);
    } finally {
      setProcessingLikes(prev => {
        const next = new Set(prev);
        next.delete(commentId);
        return next;
      });
    }
  };

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !auth.currentUser || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const batch = writeBatch(db);
      
      const commentRef = doc(collection(db, 'comments'));
      batch.set(commentRef, {
        postId: post.id,
        authorId: auth.currentUser.uid,
        authorName: auth.currentUser.displayName || 'Anonymous',
        authorPhoto: auth.currentUser.photoURL || '',
        text: newComment.trim(),
        createdAt: serverTimestamp(),
        replyToId: replyingTo ? replyingTo.id : null
      });

      if (post.authorId !== auth.currentUser.uid && !replyingTo) {
        const notificationRef = doc(collection(db, 'notifications'));
        batch.set(notificationRef, {
          userId: post.authorId,
          type: 'comment',
          senderId: auth.currentUser.uid,
          senderName: auth.currentUser.displayName || 'Anonymous',
          senderPhoto: auth.currentUser.photoURL || '',
          postId: post.id,
          read: false,
          createdAt: serverTimestamp()
        });
      }

      const postRef = doc(db, 'posts', post.id);
      batch.update(postRef, { commentsCount: increment(1) });

      await batch.commit();
      setNewComment('');
      setReplyingTo(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `posts/${post.id}/comments`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateComment = async (commentId: string) => {
    if (!editingText.trim() || !auth.currentUser) return;
    
    try {
      const commentRef = doc(db, 'comments', commentId);
      await updateDoc(commentRef, {
        text: editingText.trim(),
        updatedAt: serverTimestamp()
      });
      setEditingCommentId(null);
      setEditingText('');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `comments/${commentId}`);
    }
  };

  const handleDeleteComment = async () => {
    if (!commentToDelete || !auth.currentUser || isDeletingComment) return;
    
    setIsDeletingComment(true);
    try {
      const batch = writeBatch(db);
      
      // Delete comment
      batch.delete(doc(db, 'comments', commentToDelete));
      
      // Update post comment count
      const postRef = doc(db, 'posts', post.id);
      batch.update(postRef, { commentsCount: increment(-1) });
      
      await batch.commit();
      setCommentToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `comments/${commentToDelete}`);
    } finally {
      setIsDeletingComment(false);
    }
  };

  const renderCaption = (text: string) => {
    if (!text) return null;
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
              onClose();
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
              try {
                const q = query(collection(db, 'users'), where('username', '==', username), limit(1));
                const snap = await getDocs(q);
                if (!snap.empty) {
                  onUserClick?.(snap.docs[0].id);
                } else {
                  onTagClick?.(`@${username}`);
                  onClose();
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: "spring", duration: 0.5, bounce: 0 }}
        className="relative w-full max-w-4xl bg-white rounded-2xl shadow-xl overflow-hidden max-h-[90vh] flex flex-col md:flex-row"
      >
        
        {/* Left side: Post Image/Video (hidden on small screens, shown on md+) */}
        <div 
          className="hidden md:flex md:w-3/5 bg-black items-center justify-center relative overflow-hidden max-h-full"
          style={{ 
            aspectRatio: `${Math.max(4/5, Math.min(mediaAspectRatio, 1.91))}`,
          }}
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
                    <video 
                      src={currentMedia.url} 
                      controls 
                      playsInline
                      onLoadedMetadata={onMediaLoad}
                      className="max-w-full max-h-full object-contain"
                    />
                  ) : (
                    <img 
                      src={getOptimizedImageUrl(currentMedia.url, 1200)} 
                      alt="Post content" 
                      onLoad={onMediaLoad}
                      className="max-w-full max-h-full object-contain"
                      referrerPolicy="no-referrer"
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
                  key={`${post.id}-${idx}`} 
                  className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                    idx === currentMediaIndex 
                      ? "bg-white scale-125" 
                      : "bg-white/50"
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right side: Details & Comments */}
        <div className="flex flex-col w-full md:w-2/5 h-full max-h-[90vh]">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-zinc-200">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => {
                  onUserClick?.(post.authorId);
                  onClose();
                }}
                className="hover:opacity-80 transition-opacity"
              >
                <UserAvatar 
                  userId={post.authorId} 
                  size={32} 
                  fallbackPhoto={post.authorPhoto} 
                  fallbackName={post.authorName} 
                />
              </button>
              <button 
                onClick={() => {
                  onUserClick?.(post.authorId);
                  onClose();
                }}
                className="font-semibold text-sm text-zinc-900 hover:underline"
              >
                {post.authorName}
              </button>
            </div>
            <div className="flex items-center gap-2">
              {auth.currentUser?.uid === post.authorId && (
                <>
                  <button 
                    onClick={() => setShowEditModal(true)}
                    disabled={isDeleting}
                    className="p-2 text-zinc-400 hover:text-indigo-500 hover:bg-indigo-50 rounded-full transition-all disabled:opacity-50"
                  >
                    <Edit2 className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={isDeleting}
                    className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all disabled:opacity-50"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </>
              )}
              <button 
                onClick={onClose}
                className="p-1 text-zinc-500 hover:text-zinc-900 transition-colors rounded-full hover:bg-zinc-100"
              >
                <X className="w-6 h-6" />
              </button>
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

          <ConfirmationModal
            isOpen={!!commentToDelete}
            onClose={() => setCommentToDelete(null)}
            onConfirm={handleDeleteComment}
            isLoading={isDeletingComment}
            title="Delete Comment?"
            message="Are you sure you want to delete this comment? This action cannot be undone."
            confirmText="Delete"
          />

          <ShareModal
            isOpen={showShareModal}
            onClose={() => setShowShareModal(false)}
            post={post}
            currentMediaIndex={currentMediaIndex}
          />
          
          {/* Mobile Image/Video (only visible on small screens) */}
          <div 
            className="md:hidden w-full bg-black flex items-center justify-center relative overflow-hidden max-h-full"
            style={{ 
              aspectRatio: `${Math.max(4/5, Math.min(mediaAspectRatio, 1.91))}`,
            }}
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
                      <video 
                        src={currentMedia.url} 
                        controls 
                        playsInline
                        onLoadedMetadata={onMediaLoad}
                        className="max-w-full max-h-full object-contain"
                      />
                    ) : (
                      <img 
                        src={getOptimizedImageUrl(currentMedia.url, 800)} 
                        alt="Post content" 
                        onLoad={onMediaLoad}
                        className="max-w-full max-h-full object-contain"
                        referrerPolicy="no-referrer"
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
                    className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                      idx === currentMediaIndex 
                        ? "bg-white scale-125" 
                        : "bg-white/50"
                    }`}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Comments Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Caption as first comment */}
            {post.caption && (
              <div className="flex gap-3">
                <button 
                  onClick={() => {
                    onUserClick?.(post.authorId);
                    onClose();
                  }}
                  className="hover:opacity-80 transition-opacity"
                >
                  <UserAvatar 
                    userId={post.authorId} 
                    size={32} 
                    fallbackPhoto={post.authorPhoto} 
                    fallbackName={post.authorName} 
                  />
                </button>
                <div>
                  <button 
                    onClick={() => {
                      onUserClick?.(post.authorId);
                      onClose();
                    }}
                    className="font-semibold text-sm text-zinc-900 mr-2 hover:underline"
                  >
                    {post.authorName}
                  </button>
                  <span className="text-sm text-zinc-800 whitespace-pre-wrap">
                    {renderCaption(post.caption)}
                  </span>
                  <div className="text-xs text-zinc-500 mt-1">
                    {post.createdAt?.toDate ? formatDistanceToNow(post.createdAt.toDate(), { addSuffix: true }) : 'Just now'}
                  </div>
                </div>
              </div>
            )}

            {/* Actual Comments */}
            {comments.filter(c => !c.replyToId).map((comment, index) => (
              <div key={`${comment.id}-${index}`} className="flex flex-col gap-3">
                <div className="flex gap-3 group/comment">
                  <button 
                    onClick={() => {
                      onUserClick?.(comment.authorId);
                      onClose();
                    }}
                    className="hover:opacity-80 transition-opacity"
                  >
                    <UserAvatar 
                      userId={comment.authorId} 
                      size={32} 
                      fallbackPhoto={comment.authorPhoto} 
                      fallbackName={comment.authorName} 
                    />
                  </button>
                  <div className="flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <button 
                          onClick={() => {
                            onUserClick?.(comment.authorId);
                            onClose();
                          }}
                          className="font-semibold text-sm text-zinc-900 mr-2 hover:underline"
                        >
                          {comment.authorName}
                        </button>
                        {editingCommentId === comment.id ? (
                          <div className="mt-1 flex flex-col gap-2">
                            <textarea
                              autoFocus
                              value={editingText}
                              onChange={(e) => setEditingText(e.target.value)}
                              className="w-full p-2 text-sm border border-zinc-200 rounded-lg focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
                              rows={2}
                            />
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => setEditingCommentId(null)}
                                className="px-3 py-1 text-xs font-medium text-zinc-500 hover:text-zinc-700"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleUpdateComment(comment.id)}
                                className="px-3 py-1 text-xs font-medium bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          <span className="text-sm text-zinc-800">{comment.text}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {editingCommentId !== comment.id && (
                          <div className="flex items-center">
                            {auth.currentUser?.uid === comment.authorId && (
                              <button 
                                onClick={() => {
                                  setEditingCommentId(comment.id);
                                  setEditingText(comment.text);
                                }}
                                className="p-1 text-zinc-400 hover:text-indigo-500 transition-colors"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {(auth.currentUser?.uid === comment.authorId || auth.currentUser?.uid === post.authorId) && (
                              <button 
                                onClick={() => setCommentToDelete(comment.id)}
                                className="p-1 text-zinc-400 hover:text-red-500 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                        <button 
                          onClick={() => handleLikeComment(comment.id)}
                          disabled={processingLikes.has(comment.id)}
                          className={`transition-colors p-1 ${likedComments.has(comment.id) ? 'text-red-500' : 'text-zinc-400 hover:text-red-500'} ${processingLikes.has(comment.id) ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <Heart className={`w-4 h-4 ${likedComments.has(comment.id) ? 'fill-current' : ''}`} />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <div className="text-xs text-zinc-500">
                        {comment.createdAt?.toDate ? formatDistanceToNow(comment.createdAt.toDate(), { addSuffix: true }) : 'Just now'}
                      </div>
                      {comment.likesCount && comment.likesCount > 0 && (
                        <div className="text-xs font-semibold text-zinc-500">
                          {comment.likesCount} {comment.likesCount === 1 ? 'like' : 'likes'}
                        </div>
                      )}
                      <button 
                        onClick={() => {
                          setReplyingTo({ id: comment.id, username: comment.authorName });
                          setNewComment(`@${comment.authorName} `);
                          document.getElementById('comment-input')?.focus();
                        }}
                        className="text-xs font-semibold text-zinc-500 hover:text-zinc-700"
                      >
                        Reply
                      </button>
                    </div>
                  </div>
                </div>

                {/* Replies */}
                {comments.filter(c => c.replyToId === comment.id).length > 0 && (
                  <div className="ml-11 space-y-3 mt-1">
                    {comments.filter(c => c.replyToId === comment.id).reverse().map(reply => (
                      <div key={reply.id} className="flex gap-3 group/reply">
                        <button 
                          onClick={() => {
                            onUserClick?.(reply.authorId);
                            onClose();
                          }}
                          className="hover:opacity-80 transition-opacity"
                        >
                          <UserAvatar 
                            userId={reply.authorId} 
                            size={24} 
                            fallbackPhoto={reply.authorPhoto} 
                            fallbackName={reply.authorName} 
                          />
                        </button>
                        <div className="flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <button 
                                onClick={() => {
                                  onUserClick?.(reply.authorId);
                                  onClose();
                                }}
                                className="font-semibold text-xs text-zinc-900 mr-2 hover:underline"
                              >
                                {reply.authorName}
                              </button>
                              {editingCommentId === reply.id ? (
                                <div className="mt-1 flex flex-col gap-2">
                                  <textarea
                                    autoFocus
                                    value={editingText}
                                    onChange={(e) => setEditingText(e.target.value)}
                                    className="w-full p-2 text-xs border border-zinc-200 rounded-lg focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
                                    rows={2}
                                  />
                                  <div className="flex justify-end gap-2">
                                    <button
                                      onClick={() => setEditingCommentId(null)}
                                      className="px-3 py-1 text-[10px] font-medium text-zinc-500 hover:text-zinc-700"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      onClick={() => handleUpdateComment(reply.id)}
                                      className="px-3 py-1 text-[10px] font-medium bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                                    >
                                      Save
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <span className="text-xs text-zinc-800">{reply.text}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              {editingCommentId !== reply.id && (
                                <div className="flex items-center">
                                  {auth.currentUser?.uid === reply.authorId && (
                                    <button 
                                      onClick={() => {
                                        setEditingCommentId(reply.id);
                                        setEditingText(reply.text);
                                      }}
                                      className="p-1 text-zinc-400 hover:text-indigo-500 transition-colors"
                                    >
                                      <Edit2 className="w-3 h-3" />
                                    </button>
                                  )}
                                  {(auth.currentUser?.uid === reply.authorId || auth.currentUser?.uid === post.authorId) && (
                                    <button 
                                      onClick={() => setCommentToDelete(reply.id)}
                                      className="p-1 text-zinc-400 hover:text-red-500 transition-colors"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              )}
                              <button 
                                onClick={() => handleLikeComment(reply.id)}
                                disabled={processingLikes.has(reply.id)}
                                className={`transition-colors p-1 ${likedComments.has(reply.id) ? 'text-red-500' : 'text-zinc-400 hover:text-red-500'} ${processingLikes.has(reply.id) ? 'opacity-50 cursor-not-allowed' : ''}`}
                              >
                                <Heart className={`w-3 h-3 ${likedComments.has(reply.id) ? 'fill-current' : ''}`} />
                              </button>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 mt-1">
                            <div className="text-[10px] text-zinc-500">
                              {reply.createdAt?.toDate ? formatDistanceToNow(reply.createdAt.toDate(), { addSuffix: true }) : 'Just now'}
                            </div>
                            {reply.likesCount && reply.likesCount > 0 && (
                              <div className="text-[10px] font-semibold text-zinc-500">
                                {reply.likesCount} {reply.likesCount === 1 ? 'like' : 'likes'}
                              </div>
                            )}
                            <button 
                              onClick={() => {
                                setReplyingTo({ id: comment.id, username: reply.authorName });
                                setNewComment(`@${reply.authorName} `);
                                document.getElementById('comment-input')?.focus();
                              }}
                              className="text-[10px] font-semibold text-zinc-500 hover:text-zinc-700"
                            >
                              Reply
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="px-4 py-2 border-t border-zinc-100">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-4">
                <button 
                  onClick={handleLike}
                  disabled={isLiking}
                  className="p-1.5 -ml-1.5 text-zinc-900 hover:text-red-500 transition-all active:scale-90"
                >
                  <Heart className={`w-[26px] h-[26px] transition-colors ${isLiked ? 'fill-red-500 text-red-500' : ''}`} />
                </button>
                <button 
                  onClick={() => document.getElementById('comment-input')?.focus()}
                  className="p-1.5 text-zinc-900 hover:text-indigo-500 transition-all active:scale-90"
                >
                  <MessageCircle className="w-[26px] h-[26px] transition-colors" />
                </button>
                <button 
                  onClick={handleShare}
                  className="p-1.5 text-zinc-900 hover:text-purple-500 transition-all active:scale-90"
                >
                  <Send className="w-[26px] h-[26px] transition-colors" />
                </button>
              </div>
              <button 
                onClick={handleSave}
                disabled={isSaving}
                className="p-1.5 -mr-1.5 text-zinc-900 hover:text-zinc-600 transition-all active:scale-90"
              >
                <Bookmark className={`w-[26px] h-[26px] transition-colors ${isSaved ? 'fill-zinc-900' : ''}`} />
              </button>
            </div>
            <div className="font-bold text-sm text-zinc-900 mb-1">
              {likeCount.toLocaleString()} {likeCount === 1 ? 'like' : 'likes'}
            </div>
          </div>

          {/* Comment Input */}
          <div className="p-4 border-t border-zinc-200 flex flex-col gap-2">
            {replyingTo && (
              <div className="flex items-center justify-between px-2 text-xs text-zinc-500 bg-zinc-50 rounded-md py-1">
                <span>Replying to <span className="font-bold">@{replyingTo.username}</span></span>
                <button 
                  type="button" 
                  onClick={() => {
                    setReplyingTo(null);
                    setNewComment('');
                  }}
                  className="p-1 hover:bg-zinc-200 rounded-full"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
            <form onSubmit={handleSubmitComment} className="flex items-center gap-2">
              <input
                id="comment-input"
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Add a comment..."
                className="flex-1 bg-transparent border-transparent focus:border-transparent focus:ring-0 focus:outline-none outline-none text-sm placeholder:text-zinc-500"
                disabled={isSubmitting}
              />
              <button 
                type="submit"
                disabled={!newComment.trim() || isSubmitting}
                className="text-indigo-600 font-semibold text-sm disabled:opacity-50"
              >
                Post
              </button>
            </form>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
