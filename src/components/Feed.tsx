import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { collection, query, orderBy, limit, onSnapshot, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { handleFirestoreError, OperationType } from '../utils/firestore';
import { Post } from '../types';
import PostCard from './PostCard';
import PostDetailsModal from './PostDetailsModal';
import Profile from './Profile';
import Stories from './Stories';
import { Camera, RefreshCw, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useBlocks } from '../services/blockService';
import { cn } from '../utils';

export interface FeedRef {
  scrollToTop: () => void;
  resetView: () => void;
}

const Feed = forwardRef<FeedRef, { 
  onNavigate?: (tab: any) => void, 
  onTagClick?: (tag: string) => void,
  initialPostId?: string | null,
  initialSlideIndex?: number
}>(({ onNavigate, onTagClick, initialPostId, initialSlideIndex = 0 }, ref) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [rawPosts, setRawPosts] = useState<Post[]>([]);
  const [externalFeedPosts, setExternalFeedPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchingExternal, setFetchingExternal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [shuffleKey, setShuffleKey] = useState(0);
  const [pullDistance, setPullDistance] = useState(0);
  const [selectedPost, setSelectedPost] = useState<{ post: Post, index: number } | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [limitCount, setLimitCount] = useState(12); // Fetch more for shuffling
  const [interactions, setInteractions] = useState<{ query: string, action: 'liked' | 'skipped' | 'watched_full' }[]>([]);
  const { blockedIds, blockedByIds } = useBlocks(auth.currentUser?.uid);
  const startY = useRef(0);
  const isDragging = useRef(false);
  const observerTarget = useRef<HTMLDivElement>(null);

  // Load saved interactions on mount
  useEffect(() => {
    const loadInteractions = async () => {
      if (!auth.currentUser) return;
      try {
        const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          if (data.recentInteractions) {
            setInteractions(data.recentInteractions);
          }
        }
      } catch (err) {
        console.error("Error loading interactions:", err);
      }
    };
    loadInteractions();
  }, []);

  useImperativeHandle(ref, () => ({
    scrollToTop: () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    resetView: () => {
      setSelectedUserId(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }));

  useEffect(() => {
    if (initialPostId) {
      const fetchInitialPost = async () => {
        try {
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

  // Fetch Firebase Posts
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
      
      setRawPosts(newPosts);
      setLoading(false);
    }, (error) => {
      if (error.message.includes('permission')) {
        console.warn('Permission denied on feed query. This is expected if blocked users are in the results.');
      } else {
        handleFirestoreError(error, OperationType.LIST, 'posts');
      }
      setLoading(false);
    });
    
    return () => unsubscribe();
  }, [limitCount]);

  // Handle shuffling logic separately to avoid UI jumping on minor updates like likes
  useEffect(() => {
    if (rawPosts.length === 0) return;
    
    setPosts(prev => {
      const existingIds = new Set(prev.map(p => p.id));
      const newItems = rawPosts.filter(p => !existingIds.has(p.id));
      
      if (newItems.length > 0 || shuffleKey > 0) {
        // If we have new items or an explicit shuffle was requested
        // Mix new items with existing ones and shuffle the whole set
        return [...rawPosts].sort(() => 0.5 - Math.random());
      }
      
      // Otherwise keep current order to avoid jumping during likes/comments
      return prev.map(p => {
        const updatedRaw = rawPosts.find(rp => rp.id === p.id);
        return updatedRaw ? { ...p, ...updatedRaw } : p;
      });
    });
  }, [rawPosts, shuffleKey]);

  // Fetch Personalized External Posts
  useEffect(() => {
    const fetchExternal = async () => {
      if (fetchingExternal) return;
      setFetchingExternal(true);
      try {
        const [unsplashRes, reelsRes] = await Promise.all([
          fetch('/api/unsplash/next', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ interactions: interactions.slice(-10) })
          }),
          fetch('/api/reels/next', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ interactions: interactions.slice(-10) })
          })
        ]);

        let newExternalPosts: Post[] = [];

        if (unsplashRes.ok) {
          const data = await unsplashRes.json();
          if (data.images) {
            const mappedImages: Post[] = data.images.map((img: any) => ({
              id: `unsplash-${img.id}`,
              authorId: `unsplash-${img.user.id}`,
              authorName: img.user.name,
              authorPhoto: img.user.profile_image,
              imageUrl: img.url,
              mediaType: 'image',
              mediaUrls: [{ url: img.url, type: 'image' }],
              caption: img.description || `Recommended for you based on your activity: ${img.query}`,
              likesCount: img.likes || Math.floor(Math.random() * 1000) + 100,
              commentsCount: Math.floor(Math.random() * 100) + 10,
              createdAt: new Date(),
              isReel: false
            }));
            newExternalPosts = [...newExternalPosts, ...mappedImages];
          }
        }

        if (reelsRes.ok) {
          const data = await reelsRes.json();
          if (data.videos) {
            const mappedVideos: Post[] = data.videos.map((vid: any) => ({
              id: `pexels-${vid.id}`,
              authorId: `pexels-${vid.user.id}`,
              authorName: vid.user.name,
              authorPhoto: vid.user.profile_image,
              videoUrl: vid.videoUrl,
              mediaType: 'video',
              mediaUrls: [{ url: vid.videoUrl, type: 'video' }],
              caption: `Recommended reel for you: ${vid.query}`,
              likesCount: Math.floor(Math.random() * 10000) + 1000,
              commentsCount: Math.floor(Math.random() * 500) + 50,
              createdAt: new Date(),
              isReel: true
            }));
            newExternalPosts = [...newExternalPosts, ...mappedVideos];
          }
        }

        // Shuffle new posts
        newExternalPosts = newExternalPosts.sort(() => 0.5 - Math.random());

        setExternalFeedPosts(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const newP = newExternalPosts.filter(p => !existingIds.has(p.id));
          return [...prev, ...newP];
        });
      } catch (err) {
        console.error("Failed to fetch personalized external posts", err);
      } finally {
        setFetchingExternal(false);
      }
    };
    
    fetchExternal();
  }, [limitCount]); // Intentionally not dependent on 'interactions' to avoid re-fetching on every like

  const handleInteraction = async (post: Post, action: 'liked' | 'skipped' | 'watched_full') => {
    let queryText = post.caption || '';
    if (post.tags && post.tags.length > 0) {
      queryText += ' ' + post.tags.join(' ');
    }
    queryText = queryText.substring(0, 100);
    
    if (!queryText && post.isReel) queryText = post.authorName; // Fallback for video search
    
    setInteractions(prev => {
      const newInteractions = [...prev, { query: queryText, action }];
      const limited = newInteractions.slice(-20); // Keep last 20

      // Persist to user doc
      if (auth.currentUser) {
        const userRef = doc(db, 'users', auth.currentUser.uid);
        
        // Optimistically update firestore
        updateDoc(userRef, {
          recentInteractions: limited
        }).catch(err => console.error("Error persisting interaction:", err));
      }

      return limited;
    });
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && !loading && !fetchingExternal) {
          setLimitCount(prev => prev + 6);
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
  }, [observerTarget.current, loading, fetchingExternal]);

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
      const resisted = Math.min(distance * 0.6, 120);
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
      setPullDistance(0); // Reset distance immediately for refresh state
      setShuffleKey(prev => prev + 1);
      await new Promise(resolve => setTimeout(resolve, 1500));
      setRefreshing(false);
    } else {
      setPullDistance(0);
    }
    isDragging.current = false;
  };

  const filteredPosts = posts.filter(post => 
    !blockedIds.includes(post.authorId) && 
    !blockedByIds.includes(post.authorId)
  );

  // Interleave Firebase posts and External posts
  const combinedPosts: Post[] = [];
  let fbIndex = 0;
  let pxIndex = 0;
  
  while (fbIndex < filteredPosts.length || pxIndex < externalFeedPosts.length) {
    // Add 3 Firebase posts, then 1 External post
    for (let i = 0; i < 3 && fbIndex < filteredPosts.length; i++) {
      combinedPosts.push(filteredPosts[fbIndex++]);
    }
    if (pxIndex < externalFeedPosts.length) {
      combinedPosts.push(externalFeedPosts[pxIndex++]);
    }
  }

  if (loading) {
    return (
      <div className="max-w-md mx-auto pb-24 relative min-h-screen">
        <div className="mt-2">
          {[1, 2, 3].map((i) => (
            <div key={`feed-skeleton-${i}`} className="bg-white dark:bg-zinc-950 border-b border-zinc-100 dark:border-zinc-800 sm:border sm:rounded-xl sm:mb-4 overflow-hidden animate-pulse">
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-zinc-200 dark:bg-zinc-800 rounded-full" />
                  <div className="w-24 h-4 bg-zinc-200 dark:bg-zinc-800 rounded-md" />
                </div>
                <div className="w-16 h-8 bg-zinc-200 dark:bg-zinc-800 rounded-full" />
              </div>
              <div className="w-full aspect-square bg-zinc-200 dark:bg-zinc-800" />
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
      <div className="absolute top-0 left-0 right-0 pointer-events-none z-50 overflow-hidden h-40">
        <motion.div 
          className="flex flex-col items-center justify-center w-full h-full"
          animate={{ 
            y: refreshing ? 20 : pullDistance - 60,
            opacity: refreshing ? 1 : Math.min(pullDistance / 40, 1)
          }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
        >
          <div className="relative group">
            <div className="absolute inset-0 bg-gradient-to-tr from-orange-500 via-pink-500 to-indigo-600 rounded-full blur-md opacity-20 group-hover:opacity-40 transition-opacity" />
            <div className="bg-white dark:bg-zinc-900 p-2.5 rounded-full shadow-lg border border-white/20 relative">
              <motion.div
                animate={{ 
                  rotate: refreshing ? 360 : pullDistance * 4,
                  scale: refreshing ? 1.1 : Math.min(0.2 + (pullDistance / 50), 1),
                }}
                transition={refreshing ? { repeat: Infinity, duration: 1, ease: "linear" } : { type: "spring", bounce: 0.4 }}
              >
                {refreshing ? (
                  <div className="relative w-7 h-7 flex items-center justify-center">
                    <Loader2 className="w-7 h-7 text-transparent bg-clip-text bg-gradient-to-tr from-orange-500 via-pink-500 to-indigo-600 animate-spin" style={{ stroke: 'url(#gradient)' }} />
                    <svg width="0" height="0" className="absolute">
                      <defs>
                        <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#f97316" />
                          <stop offset="50%" stopColor="#ec4899" />
                          <stop offset="100%" stopColor="#4f46e5" />
                        </linearGradient>
                      </defs>
                    </svg>
                  </div>
                ) : (
                  <div className="w-7 h-7 rounded-full border-2 border-zinc-100 dark:border-zinc-800 flex items-center justify-center relative">
                    <motion.div 
                      className="absolute inset-0 rounded-full border-2 border-pink-500"
                      style={{ 
                        clipPath: `inset(0 0 0 0 round 999px)`,
                        strokeDasharray: 100,
                        strokeDashoffset: 100 - Math.min(pullDistance, 100)
                      }}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: pullDistance > 10 ? 1 : 0 }}
                    />
                    <RefreshCw className={cn(
                      "w-4 h-4 transition-colors",
                      pullDistance > 60 ? "text-pink-500" : "text-zinc-400"
                    )} />
                  </div>
                )}
              </motion.div>
            </div>
          </div>
          
          <AnimatePresence>
            {!refreshing && pullDistance > 30 && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.8, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8, y: -10 }}
                className="mt-3 px-3 py-1 bg-white/80 dark:bg-zinc-800/80 backdrop-blur-md rounded-full shadow-sm border border-white/20"
              >
                <span className="text-[9px] font-black bg-gradient-to-r from-orange-500 via-pink-500 to-indigo-600 bg-clip-text text-transparent uppercase tracking-[0.2em]">
                  {pullDistance > 60 ? "Release for more" : "Pull for new posts"}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      <motion.div
        animate={{ y: refreshing ? 60 : pullDistance }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
      >
        <Stories onNavigate={onNavigate} />
        
        <div className="mt-2">
          {combinedPosts.length === 0 ? (
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
              {combinedPosts.map((post, index) => (
                <motion.div
                  key={`${post.id}-${index}`}
                  id={`post-${post.id}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <PostCard 
                    post={post} 
                    onLikeToggle={() => handleInteraction(post, 'liked')}
                    onCommentClick={(index) => {
                      setSelectedPost({ post, index: index || 0 });
                      handleInteraction(post, 'watched_full');
                    }}
                    onUserClick={setSelectedUserId}
                    onTagClick={onTagClick}
                    initialMediaIndex={post.id === initialPostId ? initialSlideIndex : 0}
                    onSwipeNext={() => {
                      if (index < combinedPosts.length - 1) {
                        const nextPost = document.getElementById(`post-${combinedPosts[index + 1].id}`);
                        if (nextPost) {
                          nextPost.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                      }
                    }}
                    onSwipePrev={() => {
                      if (index > 0) {
                        const prevPost = document.getElementById(`post-${combinedPosts[index - 1].id}`);
                        if (prevPost) {
                          prevPost.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                      }
                    }}
                  />
                </motion.div>
              ))}
              <div ref={observerTarget} className="h-20 w-full flex items-center justify-center">
                {fetchingExternal && (
                  <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
                )}
              </div>
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
