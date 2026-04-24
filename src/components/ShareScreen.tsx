import React, { useState } from 'react';
import { ChevronLeft, MapPin, Users, Music, Settings, ChevronRight, Share2, Globe, Lock, Users2, Pencil, Play, Pause, Volume2, VolumeX } from 'lucide-react';
import { motion } from 'motion/react';
import { MediaItem } from './MediaSelector';

import { EditorState } from './MediaEditor';
import { getFontClass, getBgColor, getTextShadow, getWebkitTextStroke } from './TextEditor';

interface ShareScreenProps {
  images: string[];
  mediaItems: MediaItem[];
  editorStates: EditorState[];
  postType: 'post' | 'story' | 'reel';
  onBack: () => void;
  onShare: (caption: string, visibility: string) => void;
  showToast: (msg: string) => void;
}

export default function ShareScreen({ images, mediaItems, editorStates, postType, onBack, onShare, showToast }: ShareScreenProps) {
  const [caption, setCaption] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'friends' | 'private'>('public');
  const [currentPreviewIndex, setCurrentPreviewIndex] = useState(0);

  return (
    <div className="flex-1 flex flex-col bg-zinc-950 h-screen overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/50 backdrop-blur-xl bg-zinc-950/80 sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-zinc-800 rounded-full transition-colors">
            <ChevronLeft size={24} />
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight capitalize">{postType}</h1>
            <button 
              onClick={onBack} 
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-bold transition-all border border-zinc-700/50 hover:border-zinc-600"
            >
              <Pencil size={12} />
              Edit
            </button>
          </div>
        </div>
        <button 
          onClick={() => onShare(caption, visibility)} 
          className="px-8 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-full font-bold shadow-lg shadow-blue-600/20 transition-all flex items-center gap-2"
        >
          Upload
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-24">
        <div className="max-w-md mx-auto flex flex-col gap-6">
          {/* Top: Preview & Caption */}
          <div className="space-y-6">
            <div className="relative w-full max-h-[60vh] flex items-center justify-center bg-zinc-900 rounded-[2rem] overflow-hidden shadow-2xl ring-1 ring-white/10 group">
              <MediaPreview 
                item={mediaItems[currentPreviewIndex]} 
                state={editorStates[currentPreviewIndex]} 
              />
              
              {images.length > 1 && (
                <>
                  <button 
                    onClick={() => setCurrentPreviewIndex(prev => Math.max(0, prev - 1))}
                    className="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-black/50 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <button 
                    onClick={() => setCurrentPreviewIndex(prev => Math.min(images.length - 1, prev + 1))}
                    className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-black/50 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <ChevronRight size={20} />
                  </button>
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1">
                    {images.map((_, i) => (
                      <div key={i} className={`w-1.5 h-1.5 rounded-full ${i === currentPreviewIndex ? 'bg-white' : 'bg-white/30'}`} />
                    ))}
                  </div>
                </>
              )}
            </div>
            
            <div className="space-y-4">
              <label className="text-sm font-black tracking-widest uppercase text-zinc-500">Caption</label>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="What's on your mind? #Sastagram"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-white outline-none focus:ring-2 focus:ring-blue-500 transition-all resize-none h-40 text-lg"
              />
            </div>
          </div>

          {/* Bottom section: Settings */}
          <div className="space-y-6">
            <div className="space-y-4">
              <label className="text-sm font-black tracking-widest uppercase text-zinc-500">Visibility</label>
              <div className="grid grid-cols-3 gap-3">
                <VisibilityTab active={visibility === 'public'} icon={<Globe size={18} />} label="Public" onClick={() => setVisibility('public')} />
                <VisibilityTab active={visibility === 'friends'} icon={<Users2 size={18} />} label="Friends" onClick={() => setVisibility('friends')} />
                <VisibilityTab active={visibility === 'private'} icon={<Lock size={18} />} label="Private" onClick={() => setVisibility('private')} />
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-sm font-black tracking-widest uppercase text-zinc-500">Tagging & Location</label>
              <div className="bg-zinc-900 border border-zinc-800 rounded-[2rem] overflow-hidden">
                <OptionRow icon={<Users size={20} />} label="Tag People" onClick={() => showToast('Tagging...')} />
                <OptionRow icon={<MapPin size={20} />} label="Add Location" onClick={() => showToast('Locating...')} />
                <OptionRow icon={<Music size={20} />} label="Add Music" border={false} onClick={() => showToast('Music...')} />
              </div>
            </div>

            <button onClick={() => showToast('Advanced settings...')} className="w-full py-4 text-zinc-500 hover:text-white transition-colors flex items-center justify-center gap-2 font-bold uppercase tracking-widest text-xs">
              <Settings size={16} />
              Advanced Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function VisibilityTab({ active, icon, label, onClick }: { active: boolean, icon: React.ReactNode, label: string, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all ${active ? 'bg-blue-600/10 border-blue-500 text-blue-400' : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-700'}`}
    >
      {icon}
      <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
    </button>
  );
}

function OptionRow({ icon, label, onClick, border = true }: { icon: React.ReactNode, label: string, onClick: () => void, border?: boolean }) {
  return (
    <button 
      onClick={onClick} 
      className={`flex items-center justify-between p-6 w-full active:bg-zinc-800 transition-colors ${border ? 'border-b border-zinc-800' : ''}`}
    >
      <div className="flex items-center gap-4 text-white">
        <div className="text-zinc-500">{icon}</div>
        <span className="font-bold">{label}</span>
      </div>
      <ChevronRight size={18} className="text-zinc-700" />
    </button>
  );
}

function MediaPreview({ item, state }: { item: MediaItem, state: EditorState }) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [aspectRatio, setAspectRatio] = React.useState(1);
  const [containerWidth, setContainerWidth] = React.useState(1);
  const [isPlaying, setIsPlaying] = React.useState(true);
  const [isMuted, setIsMuted] = React.useState(state.muted || false);

  React.useEffect(() => {
    const observer = new ResizeObserver(entries => {
      if (entries[0]) {
        setContainerWidth(entries[0].contentRect.width);
      }
    });
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    if (videoRef.current && item.type === 'video') {
      videoRef.current.playbackRate = state.speed || 1;
      videoRef.current.muted = isMuted;
    }
  }, [state.speed, isMuted, item.type]);

  const handleTimeUpdate = () => {
    if (videoRef.current && state.trim && item.type === 'video') {
      const duration = videoRef.current.duration;
      if (!duration) return;
      const startTime = (state.trim.start / 100) * duration;
      const endTime = (state.trim.end / 100) * duration;
      
      if (videoRef.current.currentTime < startTime || videoRef.current.currentTime > endTime) {
        videoRef.current.currentTime = startTime;
      }
    }
  };

  const togglePlay = () => {
    if (videoRef.current && item.type === 'video') {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMuted(!isMuted);
  };

  const currentAspectRatio = (state.crop.width / state.crop.height) * aspectRatio;
  const displayAspectRatio = (state.baseRotation === 90 || state.baseRotation === 270) ? 1 / currentAspectRatio : currentAspectRatio;
  const svgWidth = containerWidth;
  const scaleFactor = svgWidth > 1 ? svgWidth / (state.previewWidth || 400) : 1;

  return (
    <div 
      className={`w-full h-full max-h-[60vh] flex items-center justify-center overflow-hidden relative bg-black rounded-[2rem] ${item.type === 'video' ? 'group/video cursor-pointer' : ''}`}
      onClick={item.type === 'video' ? togglePlay : undefined}
    >
      <div 
        ref={containerRef}
        className="relative overflow-hidden"
        style={{ 
          aspectRatio: displayAspectRatio,
          width: 'auto',
          height: 'auto',
          maxHeight: '100%',
          maxWidth: '100%',
          objectFit: 'contain'
        }}
      >
        {/* Invisible media to force size and aspect ratio */}
        {item.type === 'video' ? (
          <video src={item.url} className="max-w-full max-h-full opacity-0 pointer-events-none" style={{ maxHeight: '60vh', aspectRatio: displayAspectRatio }} />
        ) : (
          <img src={item.url} className="max-w-full max-h-full opacity-0 pointer-events-none" style={{ maxHeight: '60vh', aspectRatio: displayAspectRatio }} />
        )}

        <div 
          className="absolute inset-0 w-full h-full transition-all duration-300"
          style={{
            transform: `rotate(${state.baseRotation}deg) scaleX(${state.baseFlipH ? -1 : 1})`,
            width: (state.baseRotation === 90 || state.baseRotation === 270) ? `calc(100% * ${currentAspectRatio})` : '100%',
            height: (state.baseRotation === 90 || state.baseRotation === 270) ? `calc(100% / ${currentAspectRatio})` : '100%',
            left: '50%',
            top: '50%',
            translate: '-50% -50%',
          }}
        >
          <div 
            className="absolute"
            style={{
              width: `${100 / (state.crop.width / 100)}%`,
              height: `${100 / (state.crop.height / 100)}%`,
              left: `${-state.crop.x / (state.crop.width / 100)}%`,
              top: `${-state.crop.y / (state.crop.height / 100)}%`,
            }}
          >
            {item.type === 'video' ? (
              <video 
                ref={videoRef}
                src={item.url} 
                className="w-full h-full object-cover pointer-events-none select-none" 
                autoPlay 
                loop 
                muted={isMuted}
                playsInline
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={(e) => {
                  const video = e.currentTarget;
                  const ratio = video.videoWidth / video.videoHeight;
                  if (ratio && isFinite(ratio)) {
                    setAspectRatio(ratio);
                  }
                  const duration = video.duration;
                  if (duration && state.trim) {
                    video.currentTime = (state.trim.start / 100) * duration;
                  }
                }}
                style={{ filter: state.filter }}
              />
            ) : (
              <img 
                src={item.url} 
                className="w-full h-full object-cover pointer-events-none select-none" 
                onLoad={(e) => {
                  const img = e.currentTarget;
                  const ratio = img.naturalWidth / img.naturalHeight;
                  if (ratio && isFinite(ratio)) {
                    setAspectRatio(ratio);
                  }
                }}
                style={{ filter: state.filter }}
              />
            )}
          </div>

          {/* Elements Layer Moved Inside */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none z-40">
            {state.elements?.map(el => (
              <div
                key={el.id}
                className="absolute"
                style={{
                  left: `calc(50% + ${el.x}%)`,
                  top: `calc(50% + ${el.y}%)`,
                }}
              >
                <div style={{
                  transform: `translate(-50%, -50%) rotate(${el.rotation}deg) scale(${el.scale * scaleFactor})`,
                  width: el.width ? `${(el.width / 100) * (state.previewWidth || 400)}px` : 'max-content',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {el.type === 'text' && el.style ? (
                    <div 
                      className={`font-bold whitespace-pre-wrap select-none ${getFontClass(el.style.font)}`}
                      style={{
                        color: el.style.color,
                        fontSize: `${el.style.fontSize}px`,
                        textAlign: el.style.alignment,
                        backgroundColor: getBgColor(el.style),
                        padding: el.style.background !== 'none' ? '8px 16px' : '0',
                        borderRadius: el.style.background !== 'none' ? '12px' : '0',
                        textShadow: getTextShadow(el.style),
                        WebkitTextStroke: getWebkitTextStroke(el.style),
                        lineHeight: 1.2,
                        width: '100%'
                      }}
                    >
                      {el.content}
                    </div>
                  ) : (
                    <div className="text-7xl drop-shadow-2xl select-none pointer-events-none" style={{ color: 'white' }}>
                      {el.content}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Controls Overlay */}
      {item.type === 'video' && (
        <>
          <div className="absolute inset-0 bg-black/0 group-hover/video:bg-black/10 transition-all pointer-events-none" />
          
          {/* Play/Pause indicator */}
          {!isPlaying && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-50">
               <div className="w-16 h-16 bg-black/50 rounded-full flex items-center justify-center backdrop-blur-sm text-white">
                  <Play size={32} className="ml-1" fill="currentColor" />
               </div>
            </div>
          )}

          {/* Mute button */}
          <button 
            onClick={toggleMute}
            className="absolute bottom-4 right-4 w-10 h-10 bg-black/50 rounded-full flex items-center justify-center backdrop-blur-sm text-white hover:bg-black/70 transition-colors opacity-0 group-hover/video:opacity-100 z-50"
          >
            {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </button>
        </>
      )}
    </div>
  );
}

