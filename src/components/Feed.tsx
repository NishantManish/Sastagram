import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { handleFirestoreError, OperationType } from '../utils/firestore';
import { Post } from '../types';
import PostCard from './PostCard';
import PostDetailsModal from './PostDetailsModal';
import Profile from './Profile';
import Stories from './Stories';
import { Camera, RefreshCw, Loader2 } from 'lucide-react';
import { motion, AnimatePresence, useScroll, useSpring, useTransform } from 'motion/react';
import { useBlocks } from '../services/blockService';

export interface FeedRef {
  scrollToTop: () => void;
}

const Feed = forwardRef<FeedRef, { 
  onNavigate?: (tab: any) => void, 
  onTagClick?: (tag: string) => void,
  initialPostId?: string | null,
  initialSlideIndex?: number
}>(({ onNavigate, onTagClick, initialPostId, initialSlideIndex = 0 }, ref) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [selectedPost, setSelectedPost] = useState<{ post: Post, index: number } | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [limitCount, setLimitCount] = useState(20);
  const { blockedIds, blockedByIds } = useBlocks(auth.currentUser?.uid);
  const startY = useRef(0);
  const isDragging = useRef(false);
  const observerTarget = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    scrollToTop: () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }));

  useEffect(() => {
    if (initialPostId) {
      const fetchInitialPost = async () => {
        try {
          const { doc, getDoc } = await import('firebase/firestore');
          const postDoc = await getDoc(doc(db, 'posts', initialPostId));
          if (postDoc.exists()) {
            const postData = { id: postDoc.id, ...postDoc.data() } as Post;
            setSelectedPost({ post: postData, index: initialSlideIndex });
          }
        } catch (err) {
          console.error("Error fetching initial post:", err);
        }
      };
      fetchInitialPost();
    }
  }, [initialPostId]);

  useEffect(() => {
    const q = query(
      collection(db, 'posts'),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newPosts = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Post[];
      setPosts(newPosts);
      setLoading(false);
    }, (error) => {
      // If we get a permission error, it might be because some posts in the results are blocked.
      // In a real app, we'd need to filter the query, but for now we'll just log it.
      if (error.message.includes('permission')) {
        console.warn('Permission denied on feed query. This is expected if blocked users are in the results.');
      } else {
        handleFirestoreError(error, OperationType.LIST, 'posts');
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [limitCount]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && !loading) {
          setLimitCount(prev => prev + 20);
        }
      },
      { threshold: 0.1 }
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => {
      if (observerTarget.current) {
        observer.unobserve(observerTarget.current);
      }
    };
  }, [observerTarget.current, loading]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY === 0) {
      startY.current = e.touches[0].clientY;
      isDragging.current = true;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current) return;
    
    const currentY = e.touches[0].clientY;
    const distance = currentY - startY.current;
    
    if (distance > 0 && window.scrollY === 0) {
      // Add resistance
      const resisted = Math.min(distance * 0.4, 100);
      setPullDistance(resisted);
      if (e.cancelable) {
        e.preventDefault();
      }
    }
  };

  const handleTouchEnd = async () => {
    if (!isDragging.current) return;
    isDragging.current = false;
    
    if (pullDistance > 60) {
      setRefreshing(true);
      setPullDistance(60); // Hold at refresh position
      
      // Simulate network request delay since onSnapshot handles real-time updates
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setRefreshing(false);
    }
    
    setPullDistance(0);
  };

  const filteredPosts = posts.filter(post => 
    !blockedIds.includes(post.authorId) && 
    !blockedByIds.includes(post.authorId)
  );

  if (loading) {
    return (
      <div className="max-w-md mx-auto pb-24 relative min-h-screen">
        <div className="mt-2">
          {[1, 2, 3].map((i) => (
            <div key={`feed-skeleton-${i}`} className="bg-white dark:bg-zinc-950 border-b border-zinc-100 dark:border-zinc-800 sm:border sm:rounded-xl sm:mb-4 overflow-hidden animate-pulse">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-zinc-200 dark:bg-zinc-800 rounded-full" />
                  <div className="w-24 h-4 bg-zinc-200 dark:bg-zinc-800 rounded-md" />
                </div>
                <div className="w-16 h-8 bg-zinc-200 dark:bg-zinc-800 rounded-full" />
              </div>
              
              {/* Image */}
              <div className="w-full aspect-square bg-zinc-200 dark:bg-zinc-800" />
              
              {/* Actions */}
              <div className="px-4 py-3">
                <div className="flex items-center gap-4 mb-3">
                  <div className="w-7 h-7 bg-zinc-200 dark:bg-zinc-800 rounded-full" />
                  <div className="w-7 h-7 bg-zinc-200 dark:bg-zinc-800 rounded-full" />
                  <div className="w-7 h-7 bg-zinc-200 dark:bg-zinc-800 rounded-full" />
                </div>
                <div className="w-20 h-4 bg-zinc-200 dark:bg-zinc-800 rounded-md mb-2" />
                <div className="w-3/4 h-4 bg-zinc-200 dark:bg-zinc-800 rounded-md mb-1" />
                <div className="w-1/2 h-4 bg-zinc-200 dark:bg-zinc-800 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (selectedUserId) {
    return <Profile userId={selectedUserId} onBack={() => setSelectedUserId(null)} onNavigate={onNavigate} onTagClick={onTagClick} />;
  }

  return (
    <div 
      className="max-w-md mx-auto pb-24 relative min-h-screen"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Redesigned Pull to Refresh */}
      <div className="absolute top-0 left-0 right-0 pointer-events-none z-50 overflow-hidden h-40">
        <motion.div 
          className="flex flex-col items-center justify-center w-full h-full"
          animate={{ 
            y: refreshing ? 0 : pullDistance - 80,
            opacity: refreshing ? 1 : Math.min(pullDistance / 60, 1)
          }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
        >
          <div className="bg-white/90 backdrop-blur-xl p-2.5 rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.12)] border border-white/50 ring-1 ring-black/5">
            <motion.div
              animate={{ 
                rotate: refreshing ? 360 : pullDistance * 3,
                scale: refreshing ? 1 : Math.min(pullDistance / 40, 1)
              }}
              transition={refreshing ? { repeat: Infinity, duration: 0.8, ease: "linear" } : { type: "spring", bounce: 0 }}
            >
              {refreshing ? (
                <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
              ) : (
                <RefreshCw className="w-6 h-6 text-indigo-600" />
              )}
            </motion.div>
          </div>
          {!refreshing && pullDistance > 20 && (
            <motion.span 
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest mt-2"
            >
              {pullDistance > 60 ? "Release to refresh" : "Pull to refresh"}
            </motion.span>
          )}
        </motion.div>
      </div>

      <motion.div
        animate={{ y: refreshing ? 60 : pullDistance }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
      >
        <Stories onNavigate={onNavigate} />
        
        <div className="mt-2">
          {filteredPosts.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-[50vh] text-zinc-500 text-center px-12"
            >
              <Camera className="w-12 h-12 text-zinc-200 mb-4" />
              <h3 className="text-lg font-semibold text-zinc-900">No posts yet</h3>
              <p className="text-sm">Follow some creators to see their posts here.</p>
            </motion.div>
          ) : (
            <AnimatePresence mode="popLayout">
              {filteredPosts.map((post, index) => (
                <motion.div
                  key={`${post.id}-${index}`}
                  id={`post-${post.id}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <PostCard 
                    post={post} 
                    onCommentClick={(index) => setSelectedPost({ post, index: index || 0 })}
                    onUserClick={setSelectedUserId}
                    onTagClick={onTagClick}
                    initialMediaIndex={post.id === initialPostId ? initialSlideIndex : 0}
                    onSwipeNext={() => {
                      if (index < filteredPosts.length - 1) {
                        const nextPost = document.getElementById(`post-${filteredPosts[index + 1].id}`);
                        if (nextPost) {
                          nextPost.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                      }
                    }}
                    onSwipePrev={() => {
                      if (index > 0) {
                        const prevPost = document.getElementById(`post-${filteredPosts[index - 1].id}`);
                        if (prevPost) {
                          prevPost.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                      }
                    }}
                  />
                </motion.div>
              ))}
              <div ref={observerTarget} className="h-10 w-full" />
            </AnimatePresence>
          )}
        </div>
      </motion.div>

      <AnimatePresence>
        {selectedPost && (
          <PostDetailsModal 
            post={selectedPost.post} 
            onClose={() => setSelectedPost(null)} 
            onUserClick={setSelectedUserId}
            onTagClick={onTagClick}
            initialMediaIndex={selectedPost.index}
          />
        )}
      </AnimatePresence>
    </div>
  );
});

export default Feed;
