import React, { useState, useEffect, useRef } from 'react';
import { Highlight } from '../types';
import { X, Edit2, Eye } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getOptimizedImageUrl } from '../utils/cloudinary';
import { db, auth } from '../firebase';
import { doc, updateDoc, arrayUnion, increment, getDoc } from 'firebase/firestore';
import UserAvatar from './UserAvatar';

function ViewerItem({ userId }: { userId: string }) {
  const [name, setName] = useState('User');
  
  useEffect(() => {
    getDoc(doc(db, 'users', userId)).then(snap => {
      if (snap.exists()) {
        setName(snap.data().displayName || 'User');
      }
    });
  }, [userId]);

  return (
    <div className="flex items-center gap-3">
      <UserAvatar userId={userId} size={40} />
      <span className="font-medium text-zinc-900">{name}</span>
    </div>
  );
}

interface HighlightViewerModalProps {
  highlight: Highlight;
  onClose: () => void;
  onEdit?: () => void;
  isOwnProfile?: boolean;
  isAdminView?: boolean;
}

export default function HighlightViewerModal({ highlight, onClose, onEdit, isOwnProfile, isAdminView }: HighlightViewerModalProps) {
  const mediaUrls = highlight.mediaUrls && highlight.mediaUrls.length > 0 
    ? highlight.mediaUrls 
    : [highlight.imageUrl]; // Fallback to cover image for old highlights

  const [currentIndex, setCurrentIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const holdTimer = useRef<number>(0);
  const pointerDownTime = useRef<number>(0);
  const accumulatedTime = useRef<number>(0);
  const lastFrameTime = useRef<number>(0);

  const currentMedia = mediaUrls[currentIndex];
  const isVideo = currentMedia.includes('/video/') || currentMedia.match(/\.(mp4|webm|ogg|mov)$/i);

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

  useEffect(() => {
    if (highlight && auth.currentUser && highlight.userId !== auth.currentUser.uid && !isAdminView) {
      const hasViewed = highlight.viewers?.includes(auth.currentUser.uid);
      if (!hasViewed) {
        const highlightRef = doc(db, 'highlights', highlight.id);
        updateDoc(highlightRef, {
          viewers: arrayUnion(auth.currentUser.uid),
          viewsCount: increment(1)
        }).catch(err => {
          console.error('Failed to update highlight views:', err);
        });
      }
    }
  }, [highlight, isAdminView]);

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
            <div key={`${highlight.id}-${idx}`} className="h-1 flex-1 bg-white/30 rounded-full overflow-hidden backdrop-blur-sm">
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

        {/* Viewers Button (Only for author) */}
        {isOwnProfile && (
          <div className="absolute bottom-4 left-0 right-0 flex justify-center z-20">
            <button
              onClick={() => {
                setIsPaused(true);
                setShowViewers(true);
              }}
              className="flex items-center gap-2 bg-black/50 hover:bg-black/70 text-white px-4 py-2 rounded-full backdrop-blur-md transition-colors"
            >
              <Eye className="w-5 h-5" />
              <span className="font-medium">{highlight.viewsCount || 0} Views</span>
            </button>
          </div>
        )}

        {/* Viewers Modal */}
        <AnimatePresence>
          {showViewers && (
            <motion.div
              key="viewers-modal"
              initial={{ opacity: 0, y: '100%' }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="absolute inset-x-0 bottom-0 top-1/3 bg-white rounded-t-3xl z-30 flex flex-col overflow-hidden shadow-2xl"
            >
              <div className="p-4 border-b border-zinc-100 flex items-center justify-between bg-white sticky top-0 z-10">
                <h3 className="font-bold text-lg">Viewers</h3>
                <button 
                  onClick={() => {
                    setShowViewers(false);
                    setIsPaused(false);
                  }}
                  className="p-2 bg-zinc-100 rounded-full hover:bg-zinc-200 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {(!highlight.viewers || highlight.viewers.length === 0) ? (
                  <div className="flex flex-col items-center justify-center h-full text-zinc-500">
                    <Eye className="w-12 h-12 mb-2 opacity-20" />
                    <p>No views yet</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {Array.from(new Set(highlight.viewers || [])).map((viewerId, idx) => (
                      <div key={`viewer-${viewerId}-${idx}`}>
                        <ViewerItem userId={viewerId} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
  );
}
