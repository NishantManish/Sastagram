import React, { useState, useRef, useEffect } from 'react';
import { Volume2, VolumeX, Play } from 'lucide-react';

interface PostVideoProps {
  url: string;
  isActive: boolean;
  isMuted: boolean;
  onMuteToggle: (e?: React.MouseEvent) => void;
  className?: string;
  useNativeControls?: boolean;
}

export default function PostVideo({ 
  url, 
  isActive, 
  isMuted, 
  onMuteToggle, 
  className,
  useNativeControls = false
}: PostVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isActive) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
            } else {
              video.pause();
              setIsPlaying(false);
            }
          });
        },
        { threshold: 0.6 }
      );
      observer.observe(video);
      return () => observer.unobserve(video);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, [isActive]);

  return (
    <div className={`relative w-full h-full flex items-center justify-center bg-black group ${className}`}>
      <video 
        ref={videoRef}
        src={url} 
        playsInline
        loop
        muted={isMuted}
        controls={useNativeControls}
        onClick={(e) => {
          if (useNativeControls) return;
          if (videoRef.current && videoRef.current.paused) {
            videoRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
          } else {
            onMuteToggle(e);
          }
        }}
        className="w-full h-auto max-h-full object-contain block"
      />
      
      {!useNativeControls && (
        <>
          <div className="absolute bottom-4 right-4 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onMuteToggle(e);
              }}
              className="p-2 bg-black/50 hover:bg-black/70 text-white rounded-full backdrop-blur-sm transition-all"
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </div>
          
          {!isPlaying && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-16 h-16 bg-black/40 rounded-full flex items-center justify-center backdrop-blur-sm">
                <Play className="w-8 h-8 text-white fill-white ml-1" />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
