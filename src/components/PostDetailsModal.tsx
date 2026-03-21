import React, { useState, useEffect } from 'react';
import { X, Send } from 'lucide-react';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, doc, writeBatch, increment } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { handleFirestoreError, OperationType } from '../utils/firestore';
import { Post, Comment } from '../types';
import PostCard from './PostCard';
import { formatDistanceToNow } from 'date-fns';
import { motion } from 'motion/react';

interface PostDetailsModalProps {
  post: Post;
  onClose: () => void;
  onUserClick?: (userId: string) => void;
}

export default function PostDetailsModal({ post, onClose, onUserClick }: PostDetailsModalProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: "spring", duration: 0.5, bounce: 0 }}
        className="relative w-full max-w-4xl bg-white rounded-2xl shadow-xl overflow-hidden max-h-[90vh] flex flex-col md:flex-row"
      >
        
        {/* Left side: Post Image (hidden on small screens, shown on md+) */}
        <div className="hidden md:flex md:w-3/5 bg-black items-center justify-center">
          <img 
            src={post.imageUrl} 
            alt="Post content" 
            className="max-w-full max-h-full object-contain"
            referrerPolicy="no-referrer"
          />
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
                onClick={() => {
                  onUserClick?.(post.authorId);
                  onClose();
                }}
                className="font-semibold text-sm text-zinc-900 hover:underline"
              >
                {post.authorName}
              </button>
            </div>
            <button 
              onClick={onClose}
              className="p-1 text-zinc-500 hover:text-zinc-900 transition-colors rounded-full hover:bg-zinc-100"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          
          {/* Mobile Image (only visible on small screens) */}
          <div className="md:hidden w-full aspect-square bg-black flex items-center justify-center">
             <img 
              src={post.imageUrl} 
              alt="Post content" 
              className="max-w-full max-h-full object-contain"
              referrerPolicy="no-referrer"
            />
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
                  className="w-8 h-8 rounded-full bg-zinc-200 overflow-hidden shrink-0 hover:opacity-80 transition-opacity"
                >
                  {post.authorPhoto ? (
                    <img src={post.authorPhoto} alt={post.authorName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-500 font-medium text-sm">
                      {post.authorName.charAt(0).toUpperCase()}
                    </div>
                  )}
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
                  <span className="text-sm text-zinc-800">{post.caption}</span>
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
                  className="w-8 h-8 rounded-full bg-zinc-200 overflow-hidden shrink-0 hover:opacity-80 transition-opacity"
                >
                  {comment.authorPhoto ? (
                    <img src={comment.authorPhoto} alt={comment.authorName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-500 font-medium text-sm">
                      {comment.authorName.charAt(0).toUpperCase()}
                    </div>
                  )}
                </button>
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
                  <div className="text-xs text-zinc-500 mt-1">
                    {comment.createdAt?.toDate ? formatDistanceToNow(comment.createdAt.toDate(), { addSuffix: true }) : 'Just now'}
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
                className="flex-1 bg-transparent border-none focus:ring-0 text-sm placeholder:text-zinc-500"
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
