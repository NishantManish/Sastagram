import React, { useState, useEffect } from 'react';
import { X, Send, Trash2, Heart, Edit2 } from 'lucide-react';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, doc, writeBatch, increment, getDocs, updateDoc, limit } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { handleFirestoreError, OperationType } from '../utils/firestore';
import { Post, Comment } from '../types';
import PostCard from './PostCard';
import { formatDistanceToNow } from 'date-fns';
import { motion } from 'motion/react';
import { getOptimizedImageUrl } from '../utils/cloudinary';
import { deleteFromCloudinary } from '../utils/media';
import UserAvatar from './UserAvatar';
import ConfirmationModal from './ConfirmationModal';
import EditPostModal from './EditPostModal';

interface PostDetailsModalProps {
  post: Post;
  onClose: () => void;
  onUserClick?: (userId: string) => void;
  onTagClick?: (tag: string) => void;
}

export default function PostDetailsModal({ post, onClose, onUserClick, onTagClick }: PostDetailsModalProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [likedComments, setLikedComments] = useState<Set<string>>(new Set());
  const [processingLikes, setProcessingLikes] = useState<Set<string>>(new Set());
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

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
      if (post.imageUrl) {
        await deleteFromCloudinary(post.imageUrl);
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
    
    setProcessingLikes(prev => new Set(prev).add(commentId));
    const isLiked = likedComments.has(commentId);
    const likeId = `${commentId}_${auth.currentUser.uid}`;
    
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
        // Optimistically update UI
        setLikedComments(prev => {
          const next = new Set(prev);
          next.delete(commentId);
          return next;
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
        // Optimistically update UI
        setLikedComments(prev => new Set(prev).add(commentId));
      }

      await batch.commit();
    } catch (error) {
      // Revert optimistic update on error
      if (isLiked) {
        setLikedComments(prev => new Set(prev).add(commentId));
      } else {
        setLikedComments(prev => {
          const next = new Set(prev);
          next.delete(commentId);
          return next;
        });
      }
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
        createdAt: serverTimestamp()
      });

      if (post.authorId !== auth.currentUser.uid) {
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
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `posts/${post.id}/comments`);
    } finally {
      setIsSubmitting(false);
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
            key={i}
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
            key={i}
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
      return <span key={i}>{part}</span>;
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
        <div className="hidden md:flex md:w-3/5 bg-black items-center justify-center">
          {post.imageUrl?.match(/\.(mp4|webm|ogg|mov)$/i) || post.imageUrl?.includes('/video/upload/') ? (
            <video 
              src={post.imageUrl} 
              controls 
              playsInline
              className="max-w-full max-h-full object-contain"
            />
          ) : (
            <img 
              src={getOptimizedImageUrl(post.imageUrl, 1200)} 
              alt="Post content" 
              className="max-w-full max-h-full object-contain"
              referrerPolicy="no-referrer"
            />
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
          
          {/* Mobile Image/Video (only visible on small screens) */}
          <div className="md:hidden w-full aspect-square bg-black flex items-center justify-center">
            {post.imageUrl?.match(/\.(mp4|webm|ogg|mov)$/i) || post.imageUrl?.includes('/video/upload/') ? (
              <video 
                src={post.imageUrl} 
                controls 
                playsInline
                className="max-w-full max-h-full object-contain"
              />
            ) : (
              <img 
                src={getOptimizedImageUrl(post.imageUrl, 800)} 
                alt="Post content" 
                className="max-w-full max-h-full object-contain"
                referrerPolicy="no-referrer"
              />
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
            {comments.map((comment) => (
              <div key={comment.id} className="flex gap-3">
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
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <button 
                        onClick={() => {
                          onUserClick?.(comment.authorId);
                          onClose();
                        }}
                        className="font-semibold text-sm text-zinc-900 mr-2 hover:underline"
                      >
                        {comment.authorName}
                      </button>
                      <span className="text-sm text-zinc-800">{comment.text}</span>
                    </div>
                    <button 
                      onClick={() => handleLikeComment(comment.id)}
                      disabled={processingLikes.has(comment.id)}
                      className={`transition-colors p-1 ${likedComments.has(comment.id) ? 'text-red-500' : 'text-zinc-400 hover:text-red-500'} ${processingLikes.has(comment.id) ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <Heart className={`w-4 h-4 ${likedComments.has(comment.id) ? 'fill-current' : ''}`} />
                    </button>
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
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Comment Input */}
          <div className="p-4 border-t border-zinc-200">
            <form onSubmit={handleSubmitComment} className="flex items-center gap-2">
              <input
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
