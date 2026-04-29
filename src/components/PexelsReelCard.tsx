import React, { useState, useEffect, useRef } from 'react';
import { Heart, MessageCircle, Send, MoreVertical, Music, Volume2, VolumeX, Play, Bookmark, X, Share2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../utils';

import { useAudio } from '../contexts/AudioContext';

export interface PexelsVideoData {
  id: number | string;
  url: string;
  image: string;
  user: string;
  duration: number;
  query: string;
  type?: 'pexels' | 'youtube';
}

interface PexelsReelCardProps {
  video: PexelsVideoData;
  isActive: boolean;
  onInteraction: (action: 'liked' | 'skipped' | 'watched_full') => void;
}

export default function PexelsReelCard({ video, isActive, onInteraction }: PexelsReelCardProps) {
  const { isMuted, setIsMuted } = useAudio();
  const [isLiked, setIsLiked] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  
  const handleToggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMuted(!isMuted);
  };
  const [showHeartAnimation, setShowHeartAnimation] = useState(false);
  const [hasVideoError, setHasVideoError] = useState(false);
  const [progress, setProgress] = useState(0);
  const [hasTrackedFullWatch, setHasTrackedFullWatch] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastTap = useRef<number>(0);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
  }, [isMuted]);

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;

    let isMounted = true;

    const playVideo = async () => {
      if (!isActive || !isPlaying) {
        vid.pause();
        return;
      }

      try {
        vid.muted = isMuted; // Ensure muted state is correct before playing
        await vid.play();
        setHasVideoError(false);
      } catch (error) {
        if (isMounted && error instanceof Error && error.name === 'NotSupportedError') {
          setHasVideoError(true);
        } else if (isMounted && error instanceof Error && error.name !== 'AbortError') {
          console.error('Video play interrupted:', error);
        }
      }
    };

    playVideo();

    if (!isActive) {
      // If it wasn't watched fully and wasn't liked, count as skipped if they barely watched it
      if (!hasTrackedFullWatch && !isLiked && progress < 20 && progress > 0) {
        onInteraction('skipped');
      }
    }

    return () => {
      isMounted = false;
      vid.pause();
    };
  }, [isActive, isPlaying, hasTrackedFullWatch, isLiked, progress, onInteraction]);

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

  const handleLike = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!isLiked) {
      setIsLiked(true);
      onInteraction('liked');
    } else {
      setIsLiked(false);
    }
  };

  const handleDoubleTap = (e: React.MouseEvent) => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;
    if (now - lastTap.current < DOUBLE_TAP_DELAY) {
      if (!isLiked) {
        handleLike();
      }
      setShowHeartAnimation(true);
      setTimeout(() => setShowHeartAnimation(false), 1000);
    }
    lastTap.current = now;
  };

  return (
    <div className="relative w-full h-full snap-start overflow-hidden bg-black flex items-center justify-center group">
      {/* Video/Image/YouTube Player */}
      {video.type === 'youtube' ? (
        <div 
          className="relative w-full h-full cursor-pointer overflow-hidden"
          onClick={(e) => handleDoubleTap(e)}
        >
          <iframe 
            src={video.url + (isMuted ? '&mute=1' : '&mute=0')}
            className="w-[150%] h-[150%] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            title="YouTube Shorts"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          ></iframe>
        </div>
      ) : !hasVideoError ? (
        <video
          ref={videoRef}
          src={video.url}
          poster={video.image}
          className="w-full h-full object-cover"
          loop
          muted={isMuted}
          playsInline
          onError={() => setHasVideoError(true)}
          onTimeUpdate={handleTimeUpdate}
          onClick={(e) => {
            handleDoubleTap(e);
            setIsPlaying(!isPlaying);
          }}
        />
      ) : (
        <img
          src={video.image || video.url}
          className="w-full h-full object-cover"
          alt={video.query}
          onClick={(e) => handleDoubleTap(e)}
        />
      )}

      {/* Overlay Controls */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60 pointer-events-none" />

      {/* Double Tap Heart Animation */}
      <AnimatePresence>
        {showHeartAnimation && (
          <motion.div
            initial={{ opacity: 0, scale: 0, rotate: -20 }}
            animate={{ 
              opacity: [0, 1, 1, 0], 
              scale: [0, 1.5, 1.2, 1.5],
              rotate: [-20, 0, 0, 20]
            }}
            transition={{ duration: 0.8, times: [0, 0.2, 0.8, 1] }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none z-30"
          >
            <Heart className="w-32 h-32 text-white fill-white drop-shadow-[0_0_30px_rgba(255,255,255,0.5)]" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Play/Pause Indicator */}
      <AnimatePresence>
        {!isPlaying && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
          >
            <div className="w-24 h-24 bg-black/30 backdrop-blur-md rounded-full flex items-center justify-center border border-white/20">
              <Play className="w-12 h-12 text-white fill-white ml-1.5" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Header */}
      <div className="absolute top-0 left-0 right-0 p-5 flex items-center justify-between z-20 pointer-events-none">
        <h2 className="text-white font-serif italic font-black text-2xl tracking-tight drop-shadow-lg pointer-events-auto">Reels</h2>
        <div className="flex items-center gap-3 pointer-events-auto">
          <button
            onClick={handleToggleMute}
            className="p-2 bg-black/20 hover:bg-black/40 backdrop-blur-md rounded-full text-white transition-all border border-white/10"
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <div className="relative">
            <motion.button 
              whileTap={{ scale: 0.8 }}
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              className="p-2 bg-black/20 hover:bg-black/40 backdrop-blur-md rounded-full text-white transition-all border border-white/10"
            >
              <MoreVertical className="w-4 h-4" />
            </motion.button>

            <AnimatePresence>
              {showMoreMenu && (
               <motion.div
                 initial={{ opacity: 0, scale: 0.9, y: -20 }}
                 animate={{ opacity: 1, scale: 1, y: 0 }}
                 exit={{ opacity: 0, scale: 0.9, y: -20 }}
                 className="absolute right-0 top-full mt-2 w-52 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl rounded-2xl shadow-2xl overflow-hidden z-50 border border-zinc-200 dark:border-zinc-800"
               >
                 <button
                   onClick={() => {
                     setIsSaved(!isSaved);
                     setShowMoreMenu(false);
                   }}
                   className="w-full px-5 py-4 text-left text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center gap-3 font-bold transition-colors"
                 >
                   <Bookmark className={cn("w-5 h-5", isSaved && "fill-current text-yellow-500")} />
                   {isSaved ? 'Saved' : 'Save'}
                 </button>
                 <button
                   onClick={() => setShowMoreMenu(false)}
                   className="w-full px-5 py-4 text-left text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center gap-3 font-bold transition-colors border-t border-zinc-100 dark:border-zinc-800"
                 >
                   <X className="w-5 h-5" />
                   Cancel
                 </button>
               </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Right Side Actions */}
      <div className="absolute right-3 bottom-[112px] flex flex-col items-center gap-4 z-20">
        <div className="flex flex-col items-center">
          <motion.button
            whileTap={{ scale: 0.8 }}
            onClick={handleLike}
            className={cn(
              "p-2.5 rounded-full backdrop-blur-md transition-all shadow-2xl border border-white/10",
              isLiked ? "bg-red-500/90 text-white border-red-400" : "bg-black/30 text-white hover:bg-black/50"
            )}
          >
            <Heart className={cn("w-5 h-5", isLiked && "fill-white")} />
          </motion.button>
          <span className="text-white text-[10px] font-black mt-1 drop-shadow-md">{isLiked ? '1' : '0'}</span>
        </div>

        <div className="flex flex-col items-center">
          <motion.button
            whileTap={{ scale: 0.8 }}
            className="p-2.5 bg-black/30 hover:bg-black/50 backdrop-blur-md rounded-full text-white transition-all shadow-2xl border border-white/10"
          >
            <MessageCircle className="w-5 h-5" />
          </motion.button>
          <span className="text-white text-[10px] font-black mt-1 drop-shadow-md">0</span>
        </div>

        <motion.button
          whileTap={{ scale: 0.8 }}
          className="p-2.5 bg-black/30 hover:bg-black/50 backdrop-blur-md rounded-full text-white transition-all shadow-2xl border border-white/10"
        >
          <Send className="w-5 h-5 -rotate-12" />
        </motion.button>

        {/* Music Disk Animation */}
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
          className="w-10 h-10 rounded-full border-4 border-zinc-800 bg-zinc-900 flex items-center justify-center overflow-hidden shadow-2xl mt-2"
        >
           <div className="w-full h-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center">
             <Music className="w-4 h-4 text-white" />
           </div>
        </motion.div>
      </div>

      {/* Bottom Info */}
      <div className="absolute left-4 right-20 bottom-[112px] z-20">
        <div className="flex items-center gap-3">
          <div className="relative cursor-pointer group">
            <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center border-2 border-white/50 shadow-2xl ring-2 ring-black/20">
              <span className="text-white font-bold text-lg">{video.user.charAt(0)}</span>
            </div>
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h4 className="text-white font-black text-base shadow-sm tracking-tight drop-shadow-md cursor-pointer hover:underline">
                {video.user}
              </h4>
            </div>
            
            <div className="flex items-center gap-2.5 bg-black/30 backdrop-blur-xl rounded-full px-2 py-1 w-fit border border-white/10 shadow-2xl mt-1">
              <Music className="w-3 h-3 text-white animate-pulse" />
              <div className="overflow-hidden whitespace-nowrap max-w-[120px]">
                <motion.div
                  animate={{ x: [0, -100, 0] }}
                  transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                  className="text-white text-[9px] font-black uppercase tracking-widest"
                >
                  {video.user} • Original Audio • {video.user}
                </motion.div>
              </div>
            </div>
          </div>
        </div>

        <p className="text-white text-sm font-medium mt-3 line-clamp-2 shadow-sm leading-relaxed drop-shadow-md max-w-md">
          Beautiful video about {video.query}. #pexels #{video.query.replace(/\s+/g, '')} #viral
        </p>
      </div>

      {/* Progress Bar */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20 z-30">
        <div 
          className="h-full bg-white transition-all duration-100 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
