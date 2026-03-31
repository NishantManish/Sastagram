import React, { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { handleFirestoreError, OperationType, parseFirestoreError } from '../utils/firestore';
import { Post } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle } from 'lucide-react';

interface EditPostModalProps {
  post: Post;
  isOpen: boolean;
  onClose: () => void;
}

export default function EditPostModal({ post, isOpen, onClose }: EditPostModalProps) {
  const [caption, setCaption] = useState(post.caption);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setCaption(post.caption);
      setError(null);
    }
  }, [isOpen, post.caption]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || auth.currentUser.uid !== post.authorId) return;

    setIsSubmitting(true);
    setError(null);
    try {
      // Extract tags and mentions
      const tags = caption.match(/#[a-zA-Z0-9_]+/g)?.map(tag => tag.slice(1).toLowerCase()) || [];
      const mentions = caption.match(/@[a-zA-Z0-9_.]+/g)?.map(mention => mention.slice(1).toLowerCase()) || [];

      await updateDoc(doc(db, 'posts', post.id), {
        caption,
        tags,
        mentions
      });

      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `posts/${post.id}`);
      setError(parseFirestoreError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />
        
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        >
          <div className="flex items-center justify-between p-4 border-b border-zinc-100">
            <h2 className="text-lg font-bold text-zinc-900">Edit Post</h2>
            <button
              onClick={onClose}
              className="p-2 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-4 overflow-y-auto">
            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 rounded-xl flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                <p className="text-xs text-red-700 dark:text-red-400 font-medium leading-relaxed">
                  {error}
                </p>
              </div>
            )}
            <div className="mb-4">
              <label htmlFor="caption" className="block text-sm font-medium text-zinc-700 mb-2">
                Caption
              </label>
              <textarea
                id="caption"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                className="w-full p-3 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none h-32 text-sm"
                placeholder="Write a caption... Use # for tags and @ for mentions"
                maxLength={2200}
              />
              <div className="flex justify-end mt-1">
                <span className="text-xs text-zinc-400">
                  {caption.length}/2200
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-zinc-100">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 text-sm font-medium text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-xl transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || caption === post.caption}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
