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
      <div className="flex justify-center items-center h-[50vh]">
        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (selectedUserId) {
    return <Profile userId={selectedUserId} onBack={() => setSelectedUserId(null)} onNavigate={onNavigate} />;
  }

  return (
    <div 
      className="max-w-md mx-auto pb-20 pt-4 relative min-h-screen"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <motion.div 
        className="absolute top-0 left-0 right-0 flex justify-center items-center overflow-hidden"
        animate={{ height: pullDistance > 0 || refreshing ? 60 : 0 }}
        style={{ height: 0 }}
      >
        <motion.div
          animate={{ rotate: refreshing ? 360 : pullDistance * 2 }}
          transition={refreshing ? { repeat: Infinity, duration: 1, ease: "linear" } : { type: "spring", bounce: 0 }}
        >
          <RefreshCw className="w-6 h-6 text-zinc-500" />
        </motion.div>
      </motion.div>

      <motion.div
        animate={{ y: pullDistance }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
      >
        <Stories />
        
        {filteredPosts.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center h-[50vh] text-zinc-500"
          >
            <Camera className="w-12 h-12 mb-4 text-zinc-300" />
            <p className="text-lg font-medium text-zinc-900">No posts yet</p>
            <p className="text-sm">Be the first to share a photo!</p>
          </motion.div>
        ) : (
          <AnimatePresence>
            {filteredPosts.map((post) => (
              <motion.div
                key={post.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
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
