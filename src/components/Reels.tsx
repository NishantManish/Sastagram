import React, { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, onSnapshot, limit, getDocs, startAfter } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Reel } from '../types';
import { handleFirestoreError, OperationType } from '../utils/firestore';
import ReelCard from './ReelCard';
import { Loader2, Clapperboard, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ReelsProps {
  onNavigate: (tab: any, initialType?: any) => void;
}

export default function Reels({ onNavigate }: ReelsProps) {
  const [reels, setReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastVisible, setLastVisible] = useState<any>(null);
  const [hasMore, setHasMore] = useState(true);
  const [activeReelId, setActiveReelId] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveReelId(entry.target.getAttribute('data-reel-id'));
          }
        });
      },
      { threshold: 0.6 }
    );

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);

  useEffect(() => {
    const q = query(
      collection(db, 'reels'),
      orderBy('createdAt', 'desc'),
      limit(5)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedReels = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Reel[];
      
      setReels(fetchedReels);
      setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
      setHasMore(snapshot.docs.length === 5);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'reels');
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loadMore = async () => {
    if (!lastVisible || !hasMore) return;

    const q = query(
      collection(db, 'reels'),
      orderBy('createdAt', 'desc'),
      startAfter(lastVisible),
      limit(5)
    );

    const snapshot = await getDocs(q);
    const newReels = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Reel[];

    setReels(prev => [...prev, ...newReels]);
    setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
    setHasMore(snapshot.docs.length === 5);
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop <= clientHeight * 1.5) {
      loadMore();
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[80vh] gap-4">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
        <p className="text-zinc-500 font-medium">Loading Reels...</p>
      </div>
    );
  }

  if (reels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[80vh] px-8 text-center">
        <div className="w-20 h-20 bg-indigo-50 rounded-3xl flex items-center justify-center mb-6">
          <Clapperboard className="w-10 h-10 text-indigo-600" />
        </div>
        <h3 className="text-xl font-bold text-zinc-900 mb-2">No Reels yet</h3>
        <p className="text-zinc-500 mb-8 max-w-[240px]">
          Be the first one to share a short video with the community!
        </p>
        <button
          onClick={() => onNavigate('create')}
          className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white font-bold rounded-2xl shadow-lg shadow-indigo-200 active:scale-95 transition-all"
        >
          <Plus className="w-5 h-5" />
          Create Reel
        </button>
      </div>
    );
  }

  return (
    <div 
      ref={scrollContainerRef}
      onScroll={handleScroll}
      className="fixed inset-0 top-0 bottom-0 overflow-y-scroll snap-y snap-mandatory no-scrollbar bg-black"
    >
      {reels.map((reel, index) => (
        <div 
          key={reel.id} 
          data-reel-id={reel.id}
          ref={(el) => {
            if (el && observerRef.current) {
              observerRef.current.observe(el);
            }
          }}
          className="h-full w-full snap-start"
        >
          <ReelCard 
            reel={reel} 
            isActive={activeReelId === reel.id}
            onNavigate={onNavigate}
            onDelete={(reelId) => {
              setReels(prev => prev.filter(r => r.id !== reelId));
            }}
          />
        </div>
      ))}
    </div>
  );
}
