import React, { useRef, useEffect, useState } from 'react';
import { Heart, Share2, MessageCircle, MoreHorizontal, Play, Volume2, VolumeX } from 'lucide-react';
import { motion } from 'framer-motion';

export interface VideoData {
  id: number;
  url: string;
  image: string;
  user: string;
  duration: number;
  query: string;
}

interface ReelProps {
  video: VideoData;
  isActive: boolean;
  onInteraction: (action: 'liked' | 'skipped' | 'watched_full') => void;
}

export const Reel: React.FC<ReelProps> = ({ video, isActive, onInteraction }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isLiked, setIsLiked] = useState(false);
  const [progress, setProgress] = useState(0);
  const [hasTrackedFullWatch, setHasTrackedFullWatch] = useState(false);

  useEffect(() => {
    if (isActive) {
      videoRef.current?.play().catch(e => console.log("Autoplay prevented:", e));
      setIsPlaying(true);
    } else {
      videoRef.current?.pause();
      if (videoRef.current) {
        videoRef.current.currentTime = 0;
      }
      setIsPlaying(false);
      
      // If it wasn't watched fully and wasn't liked, count as skipped if they barely watched it
      if (!hasTrackedFullWatch && !isLiked && progress < 20 && progress > 0) {
        onInteraction('skipped');
      }
    }
  }, [isActive, hasTrackedFullWatch, isLiked, progress, onInteraction]);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const currentProgress = (videoRef.current.currentTime / videoRef.current.duration) * 100;
      setProgress(currentProgress);
      
      if (currentProgress > 80 && !hasTrackedFullWatch) {
        setHasTrackedFullWatch(true);
        onInteraction('watched_full');
      }
    }
  };

  const handleLike = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isLiked) {
      setIsLiked(true);
      onInteraction('liked');
    } else {
      setIsLiked(false);
    }
  };

  return (
    <div className="relative w-full h-full bg-black flex items-center justify-center snap-start shrink-0 overflow-hidden">
      {/* Video Element */}
      <video
        ref={videoRef}
        src={video.url}
        poster={video.image}
        className="w-full h-full object-cover"
        loop
        muted={isMuted}
        playsInline
        onTimeUpdate={handleTimeUpdate}
        onClick={togglePlay}
      />

      {/* Play/Pause Overlay */}
      {!isPlaying && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-black/40 p-4 rounded-full backdrop-blur-sm">
            <Play className="w-12 h-12 text-white fill-white" />
          </div>
        </div>
      )}

      {/* Top Controls */}
      <div className="absolute top-4 right-4 z-10">
        <button 
          onClick={(e) => { e.stopPropagation(); setIsMuted(!isMuted); }}
          className="p-2 bg-black/20 backdrop-blur-md rounded-full text-white hover:bg-black/40 transition-colors"
        >
          {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>
      </div>

      {/* Right Sidebar Controls */}
      <div className="absolute right-4 bottom-24 flex flex-col items-center gap-6 z-10">
        <button onClick={handleLike} className="flex flex-col items-center gap-1 group">
          <div className="p-3 bg-black/20 backdrop-blur-md rounded-full group-hover:bg-black/40 transition-colors">
            <Heart className={`w-7 h-7 ${isLiked ? 'text-red-500 fill-red-500' : 'text-white'}`} />
          </div>
          <span className="text-white text-xs font-medium drop-shadow-md">
            {isLiked ? '1' : 'Like'}
          </span>
        </button>
        
        <button className="flex flex-col items-center gap-1 group" onClick={(e) => e.stopPropagation()}>
          <div className="p-3 bg-black/20 backdrop-blur-md rounded-full group-hover:bg-black/40 transition-colors">
            <MessageCircle className="w-7 h-7 text-white" />
          </div>
          <span className="text-white text-xs font-medium drop-shadow-md">Comment</span>
        </button>

        <button className="flex flex-col items-center gap-1 group" onClick={(e) => e.stopPropagation()}>
          <div className="p-3 bg-black/20 backdrop-blur-md rounded-full group-hover:bg-black/40 transition-colors">
            <Share2 className="w-7 h-7 text-white" />
          </div>
          <span className="text-white text-xs font-medium drop-shadow-md">Share</span>
        </button>

        <button className="flex flex-col items-center gap-1 group" onClick={(e) => e.stopPropagation()}>
          <div className="p-3 bg-black/20 backdrop-blur-md rounded-full group-hover:bg-black/40 transition-colors">
            <MoreHorizontal className="w-7 h-7 text-white" />
          </div>
        </button>
      </div>

      {/* Bottom Info */}
      <div className="absolute bottom-0 left-0 right-0 p-4 pt-12 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none">
        <div className="flex items-end justify-between">
          <div className="flex-1 pr-16">
            <h3 className="text-white font-semibold text-lg drop-shadow-md">@{video.user.replace(/\s+/g, '').toLowerCase()}</h3>
            <p className="text-white/90 text-sm mt-2 line-clamp-2 drop-shadow-md">
              Beautiful video about {video.query}. #pexels #{video.query.replace(/\s+/g, '')} #viral
            </p>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
        <div 
          className="h-full bg-white transition-all duration-100 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};
