import React, { useState, useEffect, useRef } from 'react';
import { Highlight } from '../types';
import { X, Edit2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getOptimizedImageUrl } from '../utils/cloudinary';

interface HighlightViewerModalProps {
  highlight: Highlight;
  onClose: () => void;
  onEdit?: () => void;
  isOwnProfile?: boolean;
}

export default function HighlightViewerModal({ highlight, onClose, onEdit, isOwnProfile }: HighlightViewerModalProps) {
  const mediaUrls = highlight.mediaUrls && highlight.mediaUrls.length > 0 
    ? highlight.mediaUrls 
    : [highlight.imageUrl]; // Fallback to cover image for old highlights

  const [currentIndex, setCurrentIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const holdTimer = useRef<number>(0);
  const pointerDownTime = useRef<number>(0);
  const accumulatedTime = useRef<number>(0);
  const lastFrameTime = useRef<number>(0);

  const currentMedia = mediaUrls[currentIndex];
  const isVideo = currentMedia.includes('/video/');

  useEffect(() => {
    accumulatedTime.current = 0;
    setProgress(0);
  }, [currentIndex]);

  useEffect(() => {
    if (isPaused) return;

    let animationFrame: number;
    lastFrameTime.current = Date.now();
    const duration = 5000; // 5 seconds for images

    const animate = () => {
      if (isVideo && videoRef.current) {
        const currentProgress = (videoRef.current.currentTime / videoRef.current.duration) * 100;
        setProgress(currentProgress || 0);
        
        if (currentProgress >= 100) {
           handleNext();
           return;
        }
        animationFrame = requestAnimationFrame(animate);
      } else {
        const now = Date.now();
        const delta = now - lastFrameTime.current;
        lastFrameTime.current = now;
        accumulatedTime.current += delta;
        
        const currentProgress = (accumulatedTime.current / duration) * 100;
        
        if (currentProgress >= 100) {
          handleNext();
        } else {
          setProgress(currentProgress);
          animationFrame = requestAnimationFrame(animate);
        }
      }
    };

    animationFrame = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animationFrame);
  }, [currentIndex, isPaused, isVideo]);

  const handleNext = () => {
    if (currentIndex < mediaUrls.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setProgress(0);
    } else {
      onClose();
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      setProgress(0);
    } else {
      setProgress(0);
    }
  };

  const handlePointerDown = () => {
    pointerDownTime.current = Date.now();
    holdTimer.current = window.setTimeout(() => {
      setIsPaused(true);
      if (videoRef.current) videoRef.current.pause();
    }, 200);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    const duration = Date.now() - pointerDownTime.current;
    
    setIsPaused(false);
    if (videoRef.current) videoRef.current.play();
    
    if (duration < 200) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const x = e.clientX - rect.left;
      
      if (x > rect.width / 2) {
        handleNext();
      } else {
        handlePrev();
      }
    }
  };

  const handlePointerLeave = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    setIsPaused(false);
    if (videoRef.current) videoRef.current.play();
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="fixed inset-0 z-50 bg-black flex flex-col"
    >
      {/* Progress Bars */}
        <div className="absolute top-0 left-0 right-0 p-4 flex gap-1 z-20 bg-gradient-to-b from-black/50 to-transparent">
          {mediaUrls.map((_, idx) => (
            <div key={idx} className="h-1 flex-1 bg-white/30 rounded-full overflow-hidden backdrop-blur-sm">
              <div 
                className="h-full bg-white transition-all duration-100 ease-linear"
                style={{ 
                  width: `${idx === currentIndex ? progress : idx < currentIndex ? 100 : 0}%` 
                }}
              />
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="absolute top-4 left-0 right-0 p-4 pt-8 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="text-white font-bold text-lg drop-shadow-md">
              {highlight.label}
            </div>
            {isOwnProfile && onEdit && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                className="p-1.5 bg-black/30 hover:bg-black/50 rounded-full text-white backdrop-blur-sm transition-colors z-50 relative"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            )}
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-white/80 hover:text-white transition-colors z-50 relative"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Media */}
        <div 
          className="flex-1 flex items-center justify-center relative touch-none"
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
        >
          {isVideo ? (
            <video
              ref={videoRef}
              src={currentMedia}
              autoPlay
              playsInline
              onEnded={handleNext}
              className="max-w-full max-h-full object-contain pointer-events-none"
            />
          ) : (
            <img 
              src={getOptimizedImageUrl(currentMedia, 1080)} 
              alt="Highlight" 
              className="max-w-full max-h-full object-contain pointer-events-none"
            />
          )}
        </div>
      </motion.div>
  );
}
