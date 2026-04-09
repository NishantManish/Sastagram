import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, Clapperboard } from 'lucide-react';
import PexelsReelCard, { PexelsVideoData } from './PexelsReelCard';

interface Interaction {
  videoId: number;
  query: string;
  action: 'liked' | 'skipped' | 'watched_full';
}

interface ReelsProps {
  onNavigate: (tab: any, initialType?: any) => void;
}

export default function Reels({ onNavigate }: ReelsProps) {
  const [reels, setReels] = useState<PexelsVideoData[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchingMore, setFetchingMore] = useState(false);
  const [activeReelId, setActiveReelId] = useState<number | null>(null);
  const [isGlobalMuted, setIsGlobalMuted] = useState(true);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const fetchMoreReels = useCallback(async () => {
    if (fetchingMore) return;
    setFetchingMore(true);
    try {
      const response = await fetch('/api/reels/next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interactions: interactions.slice(-10) }) // Send last 10 interactions for context
      });
      
      if (!response.ok) throw new Error('Failed to fetch reels');
      
      const data = await response.json();
      if (data.videos && data.videos.length > 0) {
        setReels(prev => {
          // Filter out duplicates
          const existingIds = new Set(prev.map(v => v.id));
          const newVideos = data.videos.filter((v: PexelsVideoData) => !existingIds.has(v.id));
          return [...prev, ...newVideos];
        });
      }
    } catch (error) {
      console.error("Error fetching reels:", error);
    } finally {
      setFetchingMore(false);
      setLoading(false);
    }
  }, [interactions, fetchingMore]);

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = entry.target.getAttribute('data-reel-id');
            if (id) setActiveReelId(parseInt(id, 10));
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

  // Initial fetch
  useEffect(() => {
    if (reels.length === 0) {
      fetchMoreReels();
    }
  }, []);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop <= clientHeight * 1.5) {
      fetchMoreReels();
    }
  };

  const handleInteraction = (videoId: number, query: string, action: 'liked' | 'skipped' | 'watched_full') => {
    setInteractions(prev => {
      // Avoid duplicate actions for the same video unless it's an upgrade
      const existing = prev.find(i => i.videoId === videoId);
      if (existing && existing.action === action) return prev;
      
      return [...prev, { videoId, query, action }];
    });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[80vh] gap-4 bg-black">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
        <p className="text-zinc-500 font-medium">Finding personalized videos...</p>
      </div>
    );
  }

  if (reels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[80vh] px-8 text-center bg-black">
        <div className="w-20 h-20 bg-zinc-900 rounded-3xl flex items-center justify-center mb-6">
          <Clapperboard className="w-10 h-10 text-indigo-600" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">No Reels Found</h3>
        <p className="text-zinc-500 mb-8 max-w-[240px]">
          We couldn't load any videos right now. Please try again later.
        </p>
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
          key={`${reel.id}-${index}`} 
          data-reel-id={reel.id}
          ref={(el) => {
            if (el && observerRef.current) {
              observerRef.current.observe(el);
            }
          }}
          className="h-full w-full snap-start"
        >
          <PexelsReelCard 
            video={reel} 
            isActive={activeReelId === reel.id}
            isGlobalMuted={isGlobalMuted}
            onToggleGlobalMute={setIsGlobalMuted}
            onInteraction={(action) => handleInteraction(reel.id, reel.query, action)}
          />
        </div>
      ))}
      
      {fetchingMore && reels.length > 0 && (
        <div className="w-full h-24 flex items-center justify-center snap-start shrink-0 bg-black">
          <Loader2 className="w-6 h-6 text-white animate-spin" />
        </div>
      )}
    </div>
  );
}
