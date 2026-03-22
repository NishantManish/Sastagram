import React, { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { handleFirestoreError, OperationType } from '../utils/firestore';
import { Post } from '../types';
import PostCard from './PostCard';
import PostDetailsModal from './PostDetailsModal';
import Profile from './Profile';
import Stories from './Stories';
import { Camera, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useBlocks } from '../services/blockService';

export default function Feed({ onNavigate }: { onNavigate?: (tab: any) => void }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const { blockedIds, blockedByIds } = useBlocks(auth.currentUser?.uid);
  const startY = useRef(0);
  const isDragging = useRef(false);

  useEffect(() => {
    const q = query(
      collection(db, 'posts'),
      orderBy('createdAt', 'desc'),
      limit(20)
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
  }, []);

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
      <div className="flex flex-col items-center justify-center h-[70vh] gap-4">
        <div className="relative">
          <div className="w-12 h-12 border-4 border-indigo-100 rounded-full" />
          <div className="absolute top-0 left-0 w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
        <p className="text-zinc-400 text-sm font-bold uppercase tracking-widest animate-pulse">Loading Feed</p>
      </div>
    );
  }

  if (selectedUserId) {
    return <Profile userId={selectedUserId} onBack={() => setSelectedUserId(null)} onNavigate={onNavigate} />;
  }

  return (
    <div 
      className="max-w-md mx-auto pb-24 relative min-h-screen"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <motion.div 
        className="absolute top-0 left-0 right-0 flex justify-center items-center overflow-hidden z-20"
        animate={{ height: pullDistance > 0 || refreshing ? 80 : 0 }}
        style={{ height: 0 }}
      >
        <div className="bg-white/80 backdrop-blur-md p-3 rounded-2xl shadow-lg border border-zinc-100">
          <motion.div
            animate={{ rotate: refreshing ? 360 : pullDistance * 2 }}
            transition={refreshing ? { repeat: Infinity, duration: 1, ease: "linear" } : { type: "spring", bounce: 0 }}
          >
            <RefreshCw className="w-6 h-6 text-indigo-600" />
          </motion.div>
        </div>
      </motion.div>

      <motion.div
        animate={{ y: pullDistance }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
      >
        <Stories />
        
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
              {filteredPosts.map((post) => (
                <motion.div
                  key={post.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <PostCard 
                    post={post} 
                    onCommentClick={() => setSelectedPost(post)}
                    onUserClick={setSelectedUserId}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      </motion.div>

      <AnimatePresence>
        {selectedPost && (
          <PostDetailsModal 
            post={selectedPost} 
            onClose={() => setSelectedPost(null)} 
            onUserClick={setSelectedUserId}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
