import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronLeft, Music, Smile, Sparkles, Trash2, ChevronRight, MoreHorizontal, RotateCcw, Maximize2, Type, Layers, Wand2, X, Undo, Redo, RotateCw, Trash, ArrowUpToLine, ArrowUp, ArrowDown, ArrowDownToLine, Search, Sliders, Crop, FlipHorizontal, Pencil, Eraser, Scissors, Palette, Volume2, VolumeX, Gauge } from 'lucide-react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'motion/react';
import { useGesture } from '@use-gesture/react';
import TextEditor, { TextStyle, getFontClass, getBgColor, getTextShadow, getWebkitTextStroke } from './TextEditor';
import { MediaItem } from './MediaSelector';

export type EditorElement = {
  id: string;
  type: 'text' | 'sticker';
  content: string;
  style?: TextStyle;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  width?: number;
};

export type EditorState = {
  elements: EditorElement[];
  filter: string;
  baseRotation: number;
  baseFlipH: boolean;
  crop: {
    x: number;
    y: number;
    width: number;
    height: number;
    aspectRatio: string;
  };
  trim: { start: number; end: number };
  speed: number;
  muted: boolean;
  previewWidth?: number;
  music?: {
    url: string;
    artist: string;
    title: string;
    artwork: string;
  };
};

interface MediaEditorProps {
  mediaItems: MediaItem[];
  postType: 'post' | 'story' | 'reel';
  onNext: (images: string[], states: EditorState[]) => void;
  onBack: () => void;
  showToast: (msg: string) => void;
}

const STICKER_DATA = [
  { emoji: '🔥', keywords: ['fire', 'hot', 'lit', 'flame'] },
  { emoji: '❤️', keywords: ['heart', 'love', 'like'] },
  { emoji: '😂', keywords: ['laugh', 'cry', 'funny', 'haha', 'lol'] },
  { emoji: '✨', keywords: ['sparkle', 'magic', 'stars', 'shiny'] },
  { emoji: '🎉', keywords: ['party', 'celebrate', 'tada', 'yay'] },
  { emoji: '👍', keywords: ['thumbs', 'up', 'good', 'yes', 'approve'] },
  { emoji: '👀', keywords: ['eyes', 'look', 'see', 'watch'] },
  { emoji: '💯', keywords: ['100', 'hundred', 'perfect', 'score'] },
  { emoji: '🙌', keywords: ['hands', 'praise', 'yay', 'celebrate'] },
  { emoji: '🚀', keywords: ['rocket', 'launch', 'space', 'moon'] },
  { emoji: '🥺', keywords: ['plead', 'puppy', 'eyes', 'sad', 'cute'] },
  { emoji: '😎', keywords: ['cool', 'glasses', 'sunglasses', 'smile'] },
  { emoji: '🌈', keywords: ['rainbow', 'colors', 'pride', 'weather'] },
  { emoji: '🍕', keywords: ['pizza', 'food', 'slice', 'eat'] },
  { emoji: '🥑', keywords: ['avocado', 'food', 'healthy', 'green'] },
  { emoji: '🎮', keywords: ['game', 'controller', 'play', 'videogame'] }
];

const FILTERS = [
  { name: 'Normal', value: 'none' },
  { name: 'Vintage', value: 'sepia(0.5) contrast(1.2) saturate(1.5)' },
  { name: 'B&W', value: 'grayscale(100%)' },
  { name: 'Sepia', value: 'sepia(100%)' },
  { name: 'Warm', value: 'sepia(0.3) saturate(1.5) hue-rotate(-10deg)' },
  { name: 'Cool', value: 'saturate(1.2) hue-rotate(10deg) contrast(1.1)' },
  { name: 'Contrast', value: 'contrast(1.5)' },
  { name: 'Blur', value: 'blur(2px)' },
  { name: 'Fade', value: 'opacity(0.8) contrast(0.8) saturate(0.8)' },
  { name: 'Vibrant', value: 'saturate(2) contrast(1.1)' },
  { name: 'Noir', value: 'grayscale(100%) contrast(1.5) brightness(0.8)' },
  { name: 'Retro', value: 'sepia(0.4) hue-rotate(-30deg) saturate(1.2) contrast(1.1)' },
  { name: 'Dream', value: 'blur(1px) saturate(1.5) brightness(1.1)' },
];

export default function MediaEditor({ mediaItems, postType, onNext, onBack, showToast }: MediaEditorProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentMedia = mediaItems[currentIndex] || mediaItems[0] || { url: '', type: 'image' };
  const [mediaAspectRatios, setMediaAspectRatios] = useState<number[]>(mediaItems.map(() => 1));

  const defaultAspectRatio = postType === 'story' || postType === 'reel' ? '9:16' : 'original';

  // Initialize states for each media item
  const [mediaStates, setMediaStates] = useState<EditorState[]>(mediaItems.map(() => ({
    elements: [],
    filter: 'none',
    baseRotation: 0,
    baseFlipH: false,
    crop: { x: 0, y: 0, width: 100, height: 100, aspectRatio: defaultAspectRatio },
    trim: { start: 0, end: 100 },
    speed: 1,
    muted: false,
    music: undefined
  })));

  const [history, setHistory] = useState<EditorState[][]>(mediaItems.map(() => ([{ 
    elements: [], 
    filter: 'none',
    baseRotation: 0,
    baseFlipH: false,
    crop: { x: 0, y: 0, width: 100, height: 100, aspectRatio: defaultAspectRatio },
    trim: { start: 0, end: 100 },
    speed: 1,
    muted: false,
    music: undefined
  }])));
  const [historyIndices, setHistoryIndices] = useState<number[]>(mediaItems.map(() => 0));

  const currentState = mediaStates[currentIndex] || {
    elements: [],
    filter: 'none',
    baseRotation: 0,
    baseFlipH: false,
    crop: { x: 0, y: 0, width: 100, height: 100, aspectRatio: 'original' },
    baseline: false,
    trim: { start: 0, end: 100 },
    speed: 1,
    muted: false,
    music: undefined
  };
  const elements = currentState.elements;
  const currentFilter = currentState.filter;
  const baseRotation = currentState.baseRotation;
  const baseFlipH = currentState.baseFlipH;
  const crop = currentState.crop;
  const trim = currentState.trim;
  const speed = currentState.speed;
  const muted = currentState.muted;
  const currentMusic = currentState.music;

  const historyIndex = historyIndices[currentIndex] || 0;
  const currentHistory = history[currentIndex] || [currentState];

  const [isEditingText, setIsEditingText] = useState(false);
  const [isCropping, setIsCropping] = useState(false);
  const [isTrimming, setIsTrimming] = useState(false);

  const [editingElementId, setEditingElementId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [trashActive, setTrashActive] = useState(false);
  const [showCenterGuide, setShowCenterGuide] = useState(false);
  const [isStickerDrawerOpen, setIsStickerDrawerOpen] = useState(false);
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [isMusicLibraryOpen, setIsMusicLibraryOpen] = useState(false);
  const [musicSearch, setMusicSearch] = useState('');
  const [musicSearchResults, setMusicSearchResults] = useState<any[]>([]);
  const [isSearchingMusic, setIsSearchingMusic] = useState(false);
  const [stickerSearch, setStickerSearch] = useState('');
  const [activeElementId, setActiveElementId] = useState<string | null>(null);
  
  const closeAllTools = () => {
    setIsCropping(false);
    setIsTrimming(false);
    setIsStickerDrawerOpen(false);
    setIsFilterDrawerOpen(false);
    setIsMusicLibraryOpen(false);
    setIsEditingText(false);
    setActiveElementId(null);
  };

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Handle music search
  useEffect(() => {
    if (!isMusicLibraryOpen) return;

    const query = musicSearch.trim() || 'trending';
    setIsSearchingMusic(true);
    
    // Simulate API call to iTunes
    const searchMusic = async () => {
      try {
        const response = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&limit=25`);
        const data = await response.json();
        
        if (data && data.results) {
          const results = data.results.map((track: any) => ({
            id: track.trackId,
            title: track.trackName,
            artist: track.artistName,
            url: track.previewUrl,
            artwork: track.artworkUrl100
          })).filter((track: any) => track.url); // Ensure we have a preview URL
          
          setMusicSearchResults(results);
        }
      } catch (e) {
        console.error('Failed to search music', e);
      } finally {
        setIsSearchingMusic(false);
      }
    };
    
    const timeoutId = setTimeout(searchMusic, 500);
    return () => clearTimeout(timeoutId);
  }, [musicSearch, isMusicLibraryOpen]);

  // Audio preview reference
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);
  const [playingPreview, setPlayingPreview] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (audioPreviewRef.current) {
        audioPreviewRef.current.pause();
      }
    };
  }, []);

  const togglePreview = (url: string) => {
    if (!audioPreviewRef.current) {
      audioPreviewRef.current = new Audio();
    }
    
    if (playingPreview === url) {
      audioPreviewRef.current.pause();
      setPlayingPreview(null);
    } else {
      audioPreviewRef.current.src = url;
      audioPreviewRef.current.play();
      setPlayingPreview(url);
    }
  };

  const handleSelectMusic = (music: any) => {
    if (audioPreviewRef.current) {
      audioPreviewRef.current.pause();
    }
    setPlayingPreview(null);
    updateCurrentState({ music });
    setIsMusicLibraryOpen(false);
    showToast(`Added ${music.title}`);
  };

  const handleRemoveMusic = () => {
    updateCurrentState({ music: undefined });
    showToast('Removed music');
  };

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
      videoRef.current.muted = muted;
    }
  }, [speed, muted, currentIndex]);

  useEffect(() => {
    const updatePreviewWidth = () => {
      if (containerRef.current) {
        const width = containerRef.current.clientWidth;
        if (width > 0 && currentState.previewWidth !== width) {
          updateCurrentState({ previewWidth: width });
        }
      }
    };

    updatePreviewWidth();
    window.addEventListener('resize', updatePreviewWidth);
    return () => window.removeEventListener('resize', updatePreviewWidth);
  }, [currentIndex, currentState.previewWidth]);

  const handleTimeUpdate = () => {
    if (videoRef.current && currentMedia.type === 'video') {
      const duration = videoRef.current.duration;
      if (!duration) return;
      const startTime = (trim.start / 100) * duration;
      const endTime = (trim.end / 100) * duration;
      
      if (videoRef.current.currentTime < startTime || videoRef.current.currentTime > endTime) {
        videoRef.current.currentTime = startTime;
      }
    }
  };

  const updateCurrentState = (updates: Partial<EditorState>) => {
    setMediaStates(prev => {
      if (!prev[currentIndex]) return prev;
      const next = [...prev];
      next[currentIndex] = { ...next[currentIndex], ...updates };
      return next;
    });
  };

  const pushToHistory = (newState: EditorState) => {
    setHistory(prev => {
      if (!prev[currentIndex]) return prev;
      const next = [...prev];
      const itemHistory = next[currentIndex].slice(0, (historyIndices[currentIndex] ?? 0) + 1);
      itemHistory.push(JSON.parse(JSON.stringify(newState)));
      if (itemHistory.length > 30) itemHistory.shift();
      next[currentIndex] = itemHistory;
      
      setHistoryIndices(idxPrev => {
        const idxNext = [...idxPrev];
        idxNext[currentIndex] = itemHistory.length - 1;
        return idxNext;
      });
      return next;
    });
  };

  const undo = () => {
    if (historyIndex > 0) {
      const prevState = currentHistory[historyIndex - 1];
      updateCurrentState(prevState);
      setHistoryIndices(prev => {
        const next = [...prev];
        next[currentIndex] = historyIndex - 1;
        return next;
      });
      showToast('Undo');
    }
  };

  const redo = () => {
    if (historyIndex < currentHistory.length - 1) {
      const nextState = currentHistory[historyIndex + 1];
      updateCurrentState(nextState);
      setHistoryIndices(prev => {
        const next = [...prev];
        next[currentIndex] = historyIndex + 1;
        return next;
      });
      showToast('Redo');
    }
  };

  const handleRotateBase = () => {
    const newRotation = (baseRotation + 90) % 360;
    const newState = { ...currentState, baseRotation: newRotation };
    updateCurrentState({ baseRotation: newRotation });
    pushToHistory(newState);
    showToast('Rotated 90°');
  };

  const handleFlipBase = () => {
    const newFlip = !baseFlipH;
    const newState = { ...currentState, baseFlipH: newFlip };
    updateCurrentState({ baseFlipH: newFlip });
    pushToHistory(newState);
    showToast('Flipped Horizontally');
  };

  const handleApplyCrop = (newCrop: typeof crop) => {
    const newState = { ...currentState, crop: newCrop };
    updateCurrentState({ crop: newCrop });
    setIsCropping(false);
    pushToHistory(newState);
    showToast('Crop Applied');
  };

  const handleAddText = () => {
    setEditingElementId(null);
    setIsEditingText(true);
  };

  const handleTextDone = (text: string, style: TextStyle) => {
    setIsEditingText(false);
    if (!text.trim()) {
      if (editingElementId) {
        const newElements = elements.filter(e => e.id !== editingElementId);
        updateCurrentState({ elements: newElements });
        pushToHistory({ ...currentState, elements: newElements });
      }
      return;
    }

    if (editingElementId) {
      const newElements = elements.map(e => e.id === editingElementId ? { ...e, content: text, style } : e);
      updateCurrentState({ elements: newElements });
      pushToHistory({ ...currentState, elements: newElements });
    } else {
      const newEl: EditorElement = {
        id: Date.now().toString(),
        type: 'text',
        content: text,
        style,
        x: 0,
        y: 0,
        scale: 1,
        rotation: 0
      };
      const newElements = [...elements, newEl];
      updateCurrentState({ elements: newElements });
      pushToHistory({ ...currentState, elements: newElements });
      setActiveElementId(newEl.id);
    }
  };

  const handleAddSticker = (sticker: string) => {
    const newEl: EditorElement = {
      id: Date.now().toString(),
      type: 'sticker',
      content: sticker,
      x: 0,
      y: 0,
      scale: 2,
      rotation: 0
    };
    const newElements = [...elements, newEl];
    updateCurrentState({ elements: newElements });
    pushToHistory({ ...currentState, elements: newElements });
    setActiveElementId(newEl.id);
    setIsStickerDrawerOpen(false);
  };

  const handleDragStart = (id: string) => {
    setIsDragging(true);
    setActiveElementId(id);
  };

  const handleDrag = (e: any, info: any) => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const trashY = rect.height - 150;
      if (info.point.y > trashY) {
        setTrashActive(true);
      } else {
        setTrashActive(false);
      }

      const centerX = rect.left + rect.width / 2;
      if (Math.abs(info.point.x - centerX) < 15) {
        setShowCenterGuide(true);
      } else {
        setShowCenterGuide(false);
      }
    }
  };

  const handleDragEnd = (id: string, e: any, info: any) => {
    setIsDragging(false);
    setShowCenterGuide(false);
    if (trashActive) {
      const newElements = elements.filter(el => el.id !== id);
      updateCurrentState({ elements: newElements });
      pushToHistory({ ...currentState, elements: newElements });
      setTrashActive(false);
      setActiveElementId(null);
    } else {
      let dx = info.offset.x;
      let dy = info.offset.y;

      const rot = (baseRotation % 360 + 360) % 360;
      if (rot === 90) {
        dx = info.offset.y;
        dy = -info.offset.x;
      } else if (rot === 180) {
        dx = -info.offset.x;
        dy = -info.offset.y;
      } else if (rot === 270) {
        dx = -info.offset.y;
        dy = info.offset.x;
      }

      if (baseFlipH) {
        dx = -dx;
      }

      const rect = containerRef.current?.getBoundingClientRect();
      const width = rect?.width || 1;
      const height = rect?.height || 1;

      const dxPercent = (dx / width) * 100;
      const dyPercent = (dy / height) * 100;

      const newElements = elements.map(el => el.id === id ? { ...el, x: el.x + dxPercent, y: el.y + dyPercent } : el);
      updateCurrentState({ elements: newElements });
      pushToHistory({ ...currentState, elements: newElements });
    }
  };

  const updateElement = (id: string, updates: Partial<EditorElement>, final = true) => {
    const newElements = elements.map(el => el.id === id ? { ...el, ...updates } : el);
    updateCurrentState({ elements: newElements });
    if (final) pushToHistory({ ...currentState, elements: newElements });
  };

  const handleRotate = (id: string, e: React.PointerEvent) => {
    e.stopPropagation();
    const element = elements.find(el => el.id === id);
    if (!element || !containerRef.current) return;

    const rect = (e.currentTarget as HTMLElement).closest('.element-container')!.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX);
    const startRotation = element.rotation;
    let finalRotation = startRotation;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const currentAngle = Math.atan2(moveEvent.clientY - centerY, moveEvent.clientX - centerX);
      let angleDiff = (currentAngle - startAngle) * 180 / Math.PI;
      let newRotation = startRotation + angleDiff;

      const snapAngles = [0, 90, 180, 270, 360, -90, -180, -270, -360];
      for (const snapAngle of snapAngles) {
        if (Math.abs(newRotation - snapAngle) < 5) {
          newRotation = snapAngle;
          break;
        }
      }

      finalRotation = newRotation;
      updateElement(id, { rotation: newRotation }, false);
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      const finalElements = elements.map(el => el.id === id ? { ...el, rotation: finalRotation } : el);
      pushToHistory({ ...currentState, elements: finalElements });
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const handleScale = (id: string, e: React.PointerEvent) => {
    e.stopPropagation();
    const element = elements.find(el => el.id === id);
    if (!element || !containerRef.current) return;

    const rect = (e.currentTarget as HTMLElement).closest('.element-container')!.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const startDist = Math.hypot(e.clientX - centerX, e.clientY - centerY);
    const startScale = element.scale;
    let finalScale = startScale;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const currentDist = Math.hypot(moveEvent.clientY - centerY, moveEvent.clientX - centerX);
      const scaleRatio = currentDist / startDist;
      const newScale = Math.max(0.2, startScale * scaleRatio);
      finalScale = newScale;
      updateElement(id, { scale: newScale }, false);
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      const finalElements = elements.map(el => el.id === id ? { ...el, scale: finalScale } : el);
      pushToHistory({ ...currentState, elements: finalElements });
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const handleWidth = (id: string, e: React.PointerEvent) => {
    e.stopPropagation();
    const element = elements.find(el => el.id === id);
    if (!element || !containerRef.current) return;

    const rect = (e.currentTarget as HTMLElement).closest('.element-container')!.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();
    const containerWidth = containerRect.width || 1;
    const elementAngle = element.rotation * Math.PI / 180;
    
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidthPercent = element.width || ((rect.width / element.scale) / containerWidth) * 100;

    let finalWidthPercent = startWidthPercent;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      const localDx = dx * Math.cos(-elementAngle) - dy * Math.sin(-elementAngle);
      
      const dxPercent = ((localDx * 2) / element.scale) / containerWidth * 100;
      const newWidthPercent = Math.max(10, startWidthPercent + dxPercent);
      
      finalWidthPercent = newWidthPercent;
      updateElement(id, { width: newWidthPercent }, false);
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      const finalElements = elements.map(el => el.id === id ? { ...el, width: finalWidthPercent } : el);
      pushToHistory({ ...currentState, elements: finalElements });
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const handleDelete = (id: string, e: any) => {
    e.stopPropagation();
    const newElements = elements.filter(el => el.id !== id);
    updateCurrentState({ elements: newElements });
    pushToHistory({ ...currentState, elements: newElements });
    setActiveElementId(null);
  };

  const bringToFront = (id: string) => {
    const index = elements.findIndex(e => e.id === id);
    if (index < 0 || index === elements.length - 1) return;
    const newEls = [...elements];
    const [el] = newEls.splice(index, 1);
    newEls.push(el);
    updateCurrentState({ elements: newEls });
    pushToHistory({ ...currentState, elements: newEls });
  };

  const sendToBack = (id: string) => {
    const index = elements.findIndex(e => e.id === id);
    if (index <= 0) return;
    const newEls = [...elements];
    const [el] = newEls.splice(index, 1);
    newEls.unshift(el);
    updateCurrentState({ elements: newEls });
    pushToHistory({ ...currentState, elements: newEls });
  };

  const bringForward = (id: string) => {
    const index = elements.findIndex(e => e.id === id);
    if (index < 0 || index === elements.length - 1) return;
    const newEls = [...elements];
    const temp = newEls[index];
    newEls[index] = newEls[index + 1];
    newEls[index + 1] = temp;
    updateCurrentState({ elements: newEls });
    pushToHistory({ ...currentState, elements: newEls });
  };

  const sendBackward = (id: string) => {
    const index = elements.findIndex(e => e.id === id);
    if (index <= 0) return;
    const newEls = [...elements];
    const temp = newEls[index];
    newEls[index] = newEls[index - 1];
    newEls[index - 1] = temp;
    updateCurrentState({ elements: newEls });
    pushToHistory({ ...currentState, elements: newEls });
  };

  const bindElementGestures = (id: string) => {
    return useGesture(
      {
        onPinch: ({ offset: [d, a] }) => {
          updateElement(id, { scale: d, rotation: a }, false);
        },
      },
      {
        target: containerRef,
        eventOptions: { passive: false },
        pinch: {
          from: () => {
            const el = elements.find(e => e.id === id);
            return [el?.scale || 1, el?.rotation || 0];
          }
        }
      }
    );
  };

  const [processedImages, setProcessedImages] = useState<string[]>([]);

  const handleNextStep = async () => {
    const results: string[] = [];
    
    for (let i = 0; i < mediaItems.length; i++) {
      const item = mediaItems[i];
      const state = mediaStates[i];
      
      if (item.type === 'video') {
        results.push(item.url);
        continue;
      }

      const canvas = document.createElement('canvas');
      const img = new Image();
      if (!item.url.startsWith('blob:')) {
        img.crossOrigin = 'anonymous';
      }
      img.src = item.url;

      await new Promise((resolve) => {
        img.onload = () => {
          const ctx = canvas.getContext('2d', { alpha: false });
          if (!ctx) {
            results.push(item.url);
            resolve(null);
            return;
          }

          const cropW = Math.max(1, (state.crop.width / 100) * img.naturalWidth);
          const cropH = Math.max(1, (state.crop.height / 100) * img.naturalHeight);
          const cropX = Math.max(0, (state.crop.x / 100) * img.naturalWidth);
          const cropY = Math.max(0, (state.crop.y / 100) * img.naturalHeight);

          const isRotated = state.baseRotation === 90 || state.baseRotation === 270;
          
          // Cap canvas size to prevent crashes on very high-res or very long images
          // 2048 is a safer limit for mobile browsers than 3000
          const MAX_SIZE = 2048;
          let canvasW = isRotated ? cropH : cropW;
          let canvasH = isRotated ? cropW : cropH;
          
          // Ensure dimensions are at least 1
          canvasW = Math.max(1, canvasW);
          canvasH = Math.max(1, canvasH);
          
          let renderScale = 1;

          if (canvasW > MAX_SIZE || canvasH > MAX_SIZE) {
            renderScale = MAX_SIZE / Math.max(canvasW, canvasH);
            canvasW = Math.floor(canvasW * renderScale);
            canvasH = Math.floor(canvasH * renderScale);
          }

          canvas.width = canvasW;
          canvas.height = canvasH;

          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, canvasW, canvasH);
          
          ctx.save();
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          
          ctx.scale(renderScale, renderScale);
          ctx.translate(canvasW / renderScale / 2, canvasH / renderScale / 2);

          ctx.save(); // Save matrix before rotation/flip
          ctx.rotate((state.baseRotation * Math.PI) / 180);
          ctx.scale(state.baseFlipH ? -1 : 1, 1);

          if (state.filter !== 'none') {
            ctx.filter = state.filter;
          }

          ctx.drawImage(
            img,
            cropX, cropY, cropW, cropH,
            -cropW / 2, -cropH / 2, cropW, cropH
          );

          ctx.restore(); // Restore out of base rotation and scaling

          // Screen dimensions in context coordinate space
          const screenW = canvasW / renderScale;
          const screenH = canvasH / renderScale;

          // Draw Elements (Stickers and Text) - After restore so they are upright to screen
          const previewWidth = state.previewWidth || 400;

          const getCanvasFontFamily = (fontStr: string) => {
            switch (fontStr) {
              case 'Typewriter': return '"Special Elite", monospace';
              case 'Modern': return '"Righteous", sans-serif';
              case 'Neon': return '"Monoton", cursive'; 
              case 'Strong': return '"Playfair Display", serif';
              case 'Marker': return '"Permanent Marker", cursive';
              case 'Elegant': return '"Playfair Display", serif';
              case 'Tech': return '"Orbitron", monospace';
              case 'Comic': return '"Bangers", cursive';
              case 'Bangers': return '"Bangers", cursive';
              case 'Script': return '"Pacifico", cursive';
              case 'Lobster': return '"Lobster", cursive';
              case 'Pixel': return '"Press Start 2P", cursive';
              case 'Impact': return '"Anton", sans-serif';
              case 'Cursive': return '"Caveat", cursive';
              default: return '"Outfit", sans-serif';
            }
          };

          state.elements.forEach(el => {
            ctx.save();
            
            const finalCx = (el.x / 100) * screenW;
            const finalCy = (el.y / 100) * screenH;
            
            ctx.translate(finalCx, finalCy);
            ctx.rotate((el.rotation * Math.PI) / 180);
            
            // el.scale is relative. Scale context so 1 unit = 1 screen pixel
            const scaleFactor = screenW / previewWidth;
            ctx.scale(el.scale * scaleFactor, el.scale * scaleFactor);

            if (el.type === 'sticker') {
              ctx.font = '80px Arial, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillStyle = '#FFFFFF';
              ctx.fillText(el.content, 0, 0);
            } else if (el.type === 'text' && el.style) {
              const fontSize = el.style.font === 'Pixel' ? el.style.fontSize * 0.7 : el.style.fontSize;
              const isItalic = (el.style.font === 'Strong' || el.style.font === 'Marker') ? 'italic ' : '';
              const isBold = (el.style.font === 'Strong' || el.style.font === 'Elegant' || el.style.font === 'Neon' || el.style.font === 'Modern' || el.style.font === 'Tech' || el.style.font === 'Impact' || el.style.font === 'Pixel') ? 'normal ' : 'bold ';
              
              ctx.font = `${isItalic}${isBold}${fontSize}px ${getCanvasFontFamily(el.style.font)}`;
              ctx.textAlign = el.style.alignment as CanvasTextAlign;
              ctx.textBaseline = 'middle';
              
              const lines = el.content.split('\n');
              const lineHeight = fontSize * 1.2;
              // el.width is a percentage of the container width. Convert it to screen pixels.
              const elWidthPx = el.width ? (el.width / 100) * previewWidth : null;
              const maxWidth = elWidthPx ? elWidthPx : Math.max(...lines.map(l => ctx.measureText(l.toUpperCase() === l && el.style?.font === 'Modern' ? l.toUpperCase() : l).width)) + 20;
              const totalHeight = lines.length * lineHeight + 10;
              
              if (el.style.background !== 'none') {
                ctx.fillStyle = getBgColor(el.style);
                ctx.fillRect(-maxWidth / 2, -totalHeight / 2, maxWidth, totalHeight);
              }

              ctx.fillStyle = el.style.color;
              lines.forEach((line, index) => {
                const yOffset = (index - (lines.length - 1) / 2) * lineHeight;
                let xOffset = 0;
                if (el.style!.alignment === 'left') xOffset = -maxWidth / 2 + 10;
                else if (el.style!.alignment === 'right') xOffset = maxWidth / 2 - 10;
                
                let textToDraw = line;
                if (el.style!.font === 'Modern' || el.style!.font === 'Tech' || el.style!.font === 'Impact') textToDraw = textToDraw.toUpperCase();
                
                // Add text shadow / outline if necessary
                if (el.style!.font === 'Neon') {
                   ctx.shadowBlur = 10;
                   ctx.shadowColor = el.style!.color;
                } else if (el.style!.font === 'Impact') {
                   ctx.strokeStyle = 'black';
                   ctx.lineWidth = fontSize * 0.05;
                   ctx.strokeText(textToDraw, xOffset, yOffset);
                }

                ctx.fillText(textToDraw, xOffset, yOffset);
              });
            }
            ctx.restore();
          });

          results.push(canvas.toDataURL('image/jpeg', 0.9));
          resolve(null);
        };
        img.onerror = () => {
          results.push(item.url);
          resolve(null);
        };
      });
    }
    
    setProcessedImages(results);
    onNext(results, mediaStates);
  };

  return (
    <div className="flex-1 flex flex-col bg-zinc-950 h-screen overflow-hidden" ref={containerRef}>
      {/* Top Navigation */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/50 backdrop-blur-xl bg-zinc-950/80 z-50">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-zinc-800 rounded-full transition-colors">
            <X size={24} />
          </button>
          <div className="flex flex-col">
            <h1 className="text-lg font-bold">Editor</h1>
            <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">{currentIndex + 1} of {mediaItems.length}</span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {mediaItems.length > 1 && (
            <div className="flex items-center bg-zinc-900 rounded-full p-1 mr-4">
              <button 
                onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
                disabled={currentIndex === 0}
                className={`p-2 rounded-full transition-colors ${currentIndex === 0 ? 'text-zinc-600' : 'hover:bg-zinc-800 text-white'}`}
              >
                <ChevronLeft size={20} />
              </button>
              <button 
                onClick={() => setCurrentIndex(prev => Math.min(mediaItems.length - 1, prev + 1))}
                disabled={currentIndex === mediaItems.length - 1}
                className={`p-2 rounded-full transition-colors ${currentIndex === mediaItems.length - 1 ? 'text-zinc-600' : 'hover:bg-zinc-800 text-white'}`}
              >
                <ChevronRight size={20} />
              </button>
            </div>
          )}
          <div className="flex items-center bg-zinc-900 rounded-full p-1 mr-2">
            <button 
              onClick={undo} 
              disabled={historyIndex === 0}
              className={`p-2 rounded-full transition-colors ${historyIndex === 0 ? 'text-zinc-600' : 'hover:bg-zinc-800 text-white'}`}
            >
              <Undo size={20} />
            </button>
            <button 
              onClick={redo} 
              disabled={historyIndex === currentHistory.length - 1}
              className={`p-2 rounded-full transition-colors ${historyIndex === currentHistory.length - 1 ? 'text-zinc-600' : 'hover:bg-zinc-800 text-white'}`}
            >
              <Redo size={20} />
            </button>
          </div>
          <button onClick={() => showToast('Auto-enhance applied')} className="p-2 hover:bg-zinc-800 rounded-lg text-blue-400"><Wand2 size={20} /></button>
          
          {activeElementId ? (
            <div className="flex items-center gap-1 bg-zinc-900 rounded-lg p-1">
              <button onClick={() => bringToFront(activeElementId)} className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white" title="Bring to Front"><ArrowUpToLine size={18} /></button>
              <button onClick={() => bringForward(activeElementId)} className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white" title="Bring Forward"><ArrowUp size={18} /></button>
              <button onClick={() => sendBackward(activeElementId)} className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white" title="Send Backward"><ArrowDown size={18} /></button>
              <button onClick={() => sendToBack(activeElementId)} className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white" title="Send to Back"><ArrowDownToLine size={18} /></button>
            </div>
          ) : (
            <button onClick={() => showToast('Select an element to arrange layers')} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400"><Layers size={20} /></button>
          )}
        </div>
      </header>

      {/* Main Canvas Area */}
      <main 
        className="flex-1 bg-black relative flex flex-col items-center justify-center p-4 overflow-hidden"
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) {
            setActiveElementId(null);
          }
        }}
      >
        <div 
          className="relative w-full h-full flex items-center justify-center"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) {
              setActiveElementId(null);
            }
          }}
        >
          {(() => {
            const ar = mediaAspectRatios[currentIndex] || 1;
            const currentAspectRatio = Math.max(0.1, Math.min(10, (crop.width / crop.height) * ar));
            const displayAspectRatio = (baseRotation === 90 || baseRotation === 270) ? 1 / currentAspectRatio : currentAspectRatio;
            return (
              <div 
                className="relative bg-zinc-900 rounded-[2rem] overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.5)] ring-1 ring-white/10 flex items-center justify-center"
                style={{ 
                  aspectRatio: isFinite(displayAspectRatio) ? displayAspectRatio : 1,
                  maxWidth: '100%',
                  maxHeight: '100%',
                }}
                onPointerDown={(e) => {
                  if (e.target === e.currentTarget) {
                    setActiveElementId(null);
                  }
                }}
              >
                {/* Invisible image to force size and aspect ratio */}
                {currentMedia.type === 'video' ? (
                  <video src={currentMedia.url} className="w-auto h-auto max-w-full max-h-full opacity-0 pointer-events-none block" style={{ aspectRatio: displayAspectRatio }} />
                ) : (
                  <img src={currentMedia.url} className="w-auto h-auto max-w-full max-h-full opacity-0 pointer-events-none block" style={{ aspectRatio: displayAspectRatio }} />
                )}
                
                <div 
                  className="absolute inset-0 w-full h-full transition-all duration-300"
                  style={{
                    transform: `rotate(${baseRotation}deg) scaleX(${baseFlipH ? -1 : 1})`,
                    width: (baseRotation === 90 || baseRotation === 270) ? `calc(100% * ${currentAspectRatio})` : '100%',
                    height: (baseRotation === 90 || baseRotation === 270) ? `calc(100% / ${currentAspectRatio})` : '100%',
                    left: '50%',
                    top: '50%',
                    translate: '-50% -50%',
                  }}
                >
                  {/* Image Wrapper - Applies Crop */}
                  <div 
                    className="absolute"
                    style={{
                      width: `${100 / (crop.width / 100)}%`,
                      height: `${100 / (crop.height / 100)}%`,
                      left: `${-crop.x / (crop.width / 100)}%`,
                      top: `${-crop.y / (crop.height / 100)}%`,
                    }}
                  >
                    {currentMedia.type === 'video' ? (
                      <video 
                        ref={videoRef}
                        src={currentMedia.url} 
                        className="w-full h-full object-cover pointer-events-none select-none" 
                        autoPlay 
                        loop 
                        muted={muted}
                        playsInline
                        onTimeUpdate={handleTimeUpdate}
                        onLoadedMetadata={(e) => {
                          const video = e.currentTarget;
                          const ratio = video.videoWidth / video.videoHeight;
                          if (ratio && isFinite(ratio)) {
                            setMediaAspectRatios(prev => {
                              const next = [...prev];
                              next[currentIndex] = ratio;
                              return next;
                            });
                          }
                          // Set initial time based on trim
                          const duration = video.duration;
                          if (duration) {
                            video.currentTime = (trim.start / 100) * duration;
                          }
                        }}
                        style={{ filter: currentFilter }}
                      />
                    ) : (
                      <img 
                        src={currentMedia.url} 
                        alt="Media" 
                        className="w-full h-full object-cover pointer-events-none select-none" 
                        onLoad={(e) => {
                          const img = e.currentTarget;
                          const ratio = img.naturalWidth / img.naturalHeight;
                          if (ratio && isFinite(ratio)) {
                            setMediaAspectRatios(prev => {
                              const next = [...prev];
                              next[currentIndex] = ratio;
                              return next;
                            });
                          }
                        }}
                        style={{ filter: currentFilter }}
                      />
                    )}
                  </div>


                {/* Elements Layer */}
                <div 
                  className="absolute inset-0 overflow-hidden pointer-events-auto z-40"
                  onPointerDown={(e) => {
                    if (e.target === e.currentTarget) {
                      setActiveElementId(null);
                    }
                  }}
                >
                  {elements.map((el, index) => (
                    <EditorElementItem
                      key={el.id}
                      el={el}
                      isActive={activeElementId === el.id}
                      index={index}
                      isDragging={isDragging}
                      onDragStart={() => handleDragStart(el.id)}
                      onDrag={handleDrag}
                      onDragEnd={(e, info) => handleDragEnd(el.id, e, info)}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveElementId(el.id);
                      }}
                      onDoubleClick={() => {
                        if (el.type === 'text') {
                          setEditingElementId(el.id);
                          setIsEditingText(true);
                        }
                      }}
                      onUpdate={updateElement}
                      onDelete={handleDelete}
                      onRotate={handleRotate}
                      onScale={handleScale}
                      onWidth={handleWidth}
                      containerRef={containerRef}
                      baseRotation={baseRotation}
                      baseFlipH={baseFlipH}
                    />
                  ))}
                </div>
              </div>

              {/* Guides */}
              <AnimatePresence>
                {showCenterGuide && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute top-0 bottom-0 left-1/2 w-[2px] bg-blue-500/50 z-20 pointer-events-none shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                  />
                )}
              </AnimatePresence>
            </div>
            );
          })()}
        </div>

        {/* Thumbnail Bar */}
          {mediaItems.length > 1 && (
            <div className="mt-8 flex gap-3 p-2 bg-zinc-900/50 backdrop-blur-xl rounded-2xl border border-white/5 overflow-x-auto no-scrollbar max-w-full">
              {mediaItems.map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentIndex(idx)}
                  className={`relative w-16 h-20 rounded-xl overflow-hidden flex-shrink-0 transition-all ${currentIndex === idx ? 'ring-2 ring-blue-500 scale-110 z-10' : 'opacity-50 hover:opacity-100'}`}
                >
                  {item.type === 'video' ? (
                    <video src={item.url} className="w-full h-full object-cover" muted playsInline />
                  ) : (
                    <img src={item.url} className="w-full h-full object-cover" alt={`Thumb ${idx}`} />
                  )}
                  <div className="absolute top-1 right-1 bg-black/50 rounded-full w-4 h-4 flex items-center justify-center text-[8px] font-bold">
                    {idx + 1}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Trash Area */}
          <AnimatePresence>
            {isDragging && (
              <motion.div 
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 50 }}
                className="absolute bottom-12 left-1/2 -translate-x-1/2 z-50"
              >
                <div className={`flex flex-col items-center gap-2 transition-all duration-300 ${trashActive ? 'scale-125' : 'scale-100'}`}>
                  <div className={`w-20 h-20 rounded-full flex items-center justify-center shadow-2xl backdrop-blur-xl border-2 transition-colors ${trashActive ? 'bg-red-500 border-red-400' : 'bg-zinc-900/80 border-zinc-700'}`}>
                    <Trash2 size={32} className="text-white" />
                  </div>
                  <span className={`text-xs font-bold tracking-widest uppercase ${trashActive ? 'text-red-400' : 'text-zinc-500'}`}>
                    {trashActive ? 'Release to Delete' : 'Drag here to remove'}
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
      </main>

      {/* Bottom Tools & Actions */}
        <div className="flex flex-col bg-zinc-950 text-white z-40 border-t border-zinc-800">
          {isTrimming && currentMedia.type === 'video' && (
            <div className="px-8 py-6 flex flex-col gap-6 border-b border-zinc-800 bg-zinc-900/50">
              <div className="flex flex-col gap-4">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Trim Video</span>
                  <div className="flex gap-2">
                    <span className="text-[10px] font-bold text-blue-400">{trim.start}%</span>
                    <span className="text-[10px] font-bold text-zinc-600">-</span>
                    <span className="text-[10px] font-bold text-blue-400">{trim.end}%</span>
                  </div>
                </div>
                <div className="relative h-12 bg-zinc-800 rounded-xl overflow-hidden">
                  <div 
                    className="absolute inset-y-0 bg-blue-600/30 border-x-4 border-blue-500 z-10 pointer-events-none"
                    style={{ left: `${trim.start}%`, right: `${100 - trim.end}%` }}
                  />
                  <input 
                    type="range" 
                    min="0" 
                    max={trim.end - 1} 
                    value={trim.start} 
                    onChange={e => updateCurrentState({ trim: { ...trim, start: parseInt(e.target.value) } })}
                    className="absolute inset-0 opacity-0 z-20 cursor-pointer"
                  />
                  <input 
                    type="range" 
                    min={trim.start + 1} 
                    max="100" 
                    value={trim.end} 
                    onChange={e => updateCurrentState({ trim: { ...trim, end: parseInt(e.target.value) } })}
                    className="absolute inset-0 opacity-0 z-20 cursor-pointer"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-6">
                <div className="flex flex-col gap-2 flex-1">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                    <Gauge size={14} /> Speed ({speed}x)
                  </span>
                  <div className="flex gap-2">
                    {[0.5, 1, 1.5, 2].map(s => (
                      <button
                        key={s}
                        onClick={() => updateCurrentState({ speed: s })}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${speed === s ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
                      >
                        {s}x
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                    Audio
                  </span>
                  <button
                    onClick={() => updateCurrentState({ muted: !muted })}
                    className={`p-3 rounded-xl transition-colors ${muted ? 'bg-red-500/20 text-red-400' : 'bg-zinc-800 text-white hover:bg-zinc-700'}`}
                  >
                    {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                  </button>
                </div>
              </div>
            </div>
          )}

          <aside className="w-full flex flex-row items-center justify-start px-6 py-4 gap-4 overflow-x-auto no-scrollbar">
            <ToolButton icon={<Type size={24} />} label="Text" onClick={() => { closeAllTools(); handleAddText(); }} />
            <ToolButton icon={<Smile size={24} />} label="Stickers" active={isStickerDrawerOpen} onClick={() => { const wasOpen = isStickerDrawerOpen; closeAllTools(); setIsStickerDrawerOpen(!wasOpen); }} />
            <ToolButton icon={<Sparkles size={24} />} label="Filters" active={isFilterDrawerOpen} onClick={() => { const wasOpen = isFilterDrawerOpen; closeAllTools(); setIsFilterDrawerOpen(!wasOpen); }} />
            <ToolButton icon={<Crop size={24} />} label="Crop" active={isCropping} onClick={() => { closeAllTools(); setIsCropping(true); }} />
            {currentMedia.type === 'video' && (
              <ToolButton icon={<Scissors size={24} />} label="Video" active={isTrimming} onClick={() => { const wasTrimming = isTrimming; closeAllTools(); setIsTrimming(!wasTrimming); }} />
            )}
            <ToolButton icon={<RotateCw size={24} />} label="Rotate" onClick={() => { closeAllTools(); handleRotateBase(); }} />
            <ToolButton icon={<FlipHorizontal size={24} />} label="Flip" onClick={() => { closeAllTools(); handleFlipBase(); }} />
            <ToolButton icon={<Music size={24} />} label="Music" active={isMusicLibraryOpen || !!currentMusic} onClick={() => { closeAllTools(); setIsMusicLibraryOpen(true); }} />
          </aside>

          {/* Quick Actions Footer */}
          <footer className="p-4 border-t border-zinc-800/50 flex items-center justify-end gap-4">
            {postType === 'story' && (
              <>
                <button onClick={() => { showToast('Posted to Story!'); onBack(); }} className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-full text-sm font-bold transition-colors">Your Story</button>
                <button onClick={() => { showToast('Posted to Close Friends!'); onBack(); }} className="px-6 py-3 bg-green-600 hover:bg-green-500 rounded-full text-sm font-bold transition-colors">Close Friends</button>
              </>
            )}
            {postType === 'post' && (
              <button onClick={handleNextStep} className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-full font-bold shadow-lg shadow-blue-600/20 transition-all flex items-center gap-2">
                Review <ChevronRight size={18} />
              </button>
            )}
            {postType === 'reel' && (
              <button onClick={handleNextStep} className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-full font-bold shadow-lg shadow-blue-600/20 transition-all flex items-center gap-2">
                Review <ChevronRight size={18} />
              </button>
            )}
          </footer>
        </div>

      {/* Sticker Drawer */}
      <AnimatePresence>
        {isStickerDrawerOpen && (
          <motion.div 
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="absolute inset-x-0 bottom-0 h-3/4 bg-zinc-950 text-white rounded-t-[3rem] z-[100] flex flex-col shadow-[0_-20px_80px_rgba(0,0,0,0.5)] border-t border-zinc-800"
          >
            <div className="w-full flex justify-center p-4">
              <div className="w-16 h-1.5 bg-zinc-700 rounded-full" />
            </div>
            <div className="px-8 py-4 flex flex-col gap-4">
              <div className="flex justify-between items-center">
                <h3 className="text-2xl font-black tracking-tight">Stickers</h3>
                <button onClick={() => setIsStickerDrawerOpen(false)} className="p-2 bg-zinc-800 rounded-full"><X size={20} /></button>
              </div>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={20} />
                <input 
                  type="text" 
                  placeholder="Search stickers..." 
                  value={stickerSearch}
                  onChange={e => setStickerSearch(e.target.value)}
                  className="w-full bg-zinc-800 text-white rounded-2xl py-3 pl-12 pr-4 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-8 grid grid-cols-4 gap-6 content-start no-scrollbar">
              {stickerSearch && (
                <motion.button 
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleAddSticker(stickerSearch)}
                  className="col-span-4 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-bold shadow-lg flex items-center justify-center gap-2 text-xl"
                >
                  Add "{stickerSearch}"
                </motion.button>
              )}
              {STICKER_DATA.filter(s => 
                s.keywords.some(k => k.includes(stickerSearch.toLowerCase())) || 
                s.emoji.includes(stickerSearch)
              ).map(s => (
                <motion.button 
                  key={s.emoji} 
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => handleAddSticker(s.emoji)}
                  className="text-6xl flex items-center justify-center aspect-square bg-zinc-800/30 rounded-3xl hover:bg-zinc-800/60 transition-colors"
                >
                  {s.emoji}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filter Drawer */}
      <AnimatePresence>
        {isFilterDrawerOpen && (
          <motion.div 
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="absolute inset-x-0 bottom-0 h-1/2 bg-zinc-950 text-white rounded-t-[3rem] z-[100] flex flex-col shadow-[0_-20px_80px_rgba(0,0,0,0.5)] border-t border-zinc-800"
          >
            <div className="w-full flex justify-center p-4">
              <div className="w-16 h-1.5 bg-zinc-700 rounded-full" />
            </div>
            <div className="px-8 py-4 flex justify-between items-center">
              <h3 className="text-2xl font-black tracking-tight">Filters</h3>
              <button onClick={() => setIsFilterDrawerOpen(false)} className="p-2 bg-zinc-800 rounded-full"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-x-auto p-8 flex gap-6 items-center no-scrollbar">
              {FILTERS.map(filter => (
                <button
                  key={filter.name}
                  onClick={() => {
                    updateCurrentState({ filter: filter.value });
                    pushToHistory({ ...currentState, filter: filter.value });
                  }}
                  className="flex flex-col items-center gap-3 min-w-[100px] group"
                >
              <div className={`w-20 h-20 rounded-2xl overflow-hidden ring-2 transition-all ${currentFilter === filter.value ? 'ring-blue-500 ring-offset-4 ring-offset-zinc-900 scale-110' : 'ring-transparent hover:ring-zinc-500'}`}>
                {currentMedia.type === 'video' ? (
                  <video 
                    src={currentMedia.url} 
                    className="w-full h-full object-cover"
                    style={{ filter: filter.value }}
                    muted
                    playsInline
                  />
                ) : (
                  <img 
                    src={currentMedia.url} 
                    alt={filter.name} 
                    className="w-full h-full object-cover"
                    style={{ filter: filter.value }}
                  />
                )}
              </div>
                  <span className={`text-xs font-bold tracking-widest uppercase ${currentFilter === filter.value ? 'text-blue-400' : 'text-zinc-400 group-hover:text-white'}`}>
                    {filter.name}
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Crop Overlay */}
      <AnimatePresence>
        {isCropping && (
          <CropOverlay 
            media={currentMedia.url} 
            mediaType={currentMedia.type}
            initialCrop={crop}
            mediaAspectRatio={mediaAspectRatios[currentIndex] || 1}
            onApply={handleApplyCrop}
            onCancel={() => setIsCropping(false)}
          />
        )}
      </AnimatePresence>

      {/* Music Library Bottom Sheet */}
      <AnimatePresence>
        {isMusicLibraryOpen && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="absolute bottom-0 left-0 right-0 h-[70vh] bg-zinc-950/95 backdrop-blur-3xl rounded-t-3xl border-t border-zinc-800 flex flex-col z-50 shadow-2xl text-white"
          >
            <div className="absolute -top-12 left-0 right-0 flex justify-center">
              <button
                onClick={() => setIsMusicLibraryOpen(false)}
                className="bg-zinc-800 text-white p-2 rounded-full hover:bg-zinc-700 transition"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-4 border-b border-zinc-800 shrink-0">
              <div className="w-12 h-1.5 bg-zinc-800 rounded-full mx-auto mb-4" />
              <h3 className="text-lg font-bold text-white mb-4">Add Music</h3>
              
              <div className="relative">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Search music..."
                  value={musicSearch}
                  onChange={(e) => setMusicSearch(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-3 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-700 text-white placeholder-zinc-500"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 no-scrollbar">
              {currentMusic && (
                <div className="mb-4 p-4 border border-indigo-500/30 bg-indigo-500/10 rounded-2xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <img src={currentMusic.artwork} alt={currentMusic.title} className="w-12 h-12 rounded-lg" />
                    <div>
                      <h4 className="text-white font-bold text-sm">{currentMusic.title}</h4>
                      <p className="text-zinc-400 text-xs">{currentMusic.artist}</p>
                    </div>
                  </div>
                  <button onClick={handleRemoveMusic} className="bg-zinc-800 hover:bg-red-500 hover:text-white text-zinc-400 p-2 rounded-full transition-colors flex items-center justify-center">
                     <Trash2 size={16} />
                  </button>
                </div>
              )}

              {isSearchingMusic ? (
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                  <div className="w-8 h-8 border-2 border-zinc-700 border-t-white rounded-full animate-spin" />
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  {musicSearchResults.map((track) => (
                    <div key={track.id} className="flex items-center justify-between p-2 hover:bg-zinc-900 rounded-xl transition-colors group">
                      <div className="flex items-center gap-3 flex-1 min-w-0" onClick={() => handleSelectMusic(track)}>
                        <div className="relative w-12 h-12 rounded-lg shrink-0 overflow-hidden cursor-pointer" onClick={(e) => { e.stopPropagation(); togglePreview(track.url); }}>
                          <img src={track.artwork} alt={track.title} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            {playingPreview === track.url ? <VolumeX size={16} className="text-white" /> : <Music size={16} className="text-white" />}
                          </div>
                        </div>
                        <div className="min-w-0 flex-1 cursor-pointer">
                          <h4 className="text-white font-medium text-sm truncate">{track.title}</h4>
                          <p className="text-zinc-400 text-xs truncate">{track.artist}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleSelectMusic(track)}
                        className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold rounded-full transition-colors ml-2 shrink-0"
                      >
                        Add
                      </button>
                    </div>
                  ))}
                  {musicSearchResults.length === 0 && !isSearchingMusic && (
                    <p className="text-center text-zinc-500 py-12">No music found</p>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {currentMusic && !isMusicLibraryOpen && (
        <div className="absolute top-[80px] left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 flex items-center gap-2 z-[40] shadow-xl cursor-default">
          <Music size={14} className="text-white drop-shadow" />
           <span className="text-white text-xs font-bold drop-shadow flex truncate max-w-[150px]">
              {currentMusic.title}
           </span>
           <button onClick={handleRemoveMusic} className="ml-1 p-1 bg-white/10 hover:bg-white/20 rounded-full transition-colors focus:outline-none">
             <X size={12} className="text-white" />
           </button>
        </div>
      )}

      {/* Text Editor Overlay */}
      {isEditingText && (
        <TextEditor 
          initialText={editingElementId ? elements.find(e => e.id === editingElementId)?.content : ''}
          initialStyle={editingElementId ? elements.find(e => e.id === editingElementId)?.style : undefined}
          onDone={handleTextDone}
          onCancel={() => setIsEditingText(false)}
        />
      )}
    </div>
  );
}

function EditorElementItem({ 
  el, 
  isActive, 
  index,
  isDragging, 
  onDragStart, 
  onDrag, 
  onDragEnd, 
  onClick, 
  onDoubleClick, 
  onUpdate, 
  onDelete, 
  onRotate, 
  onScale, 
  onWidth,
  containerRef,
  baseRotation,
  baseFlipH
}: { 
  el: EditorElement, 
  isActive: boolean, 
  index: number,
  isDragging: boolean, 
  onDragStart: () => void, 
  onDrag: (e: any, info: any) => void, 
  onDragEnd: (e: any, info: any) => void, 
  onClick: (e: any) => void, 
  onDoubleClick: () => void, 
  onUpdate: (id: string, updates: Partial<EditorElement>, final?: boolean) => void,
  onDelete: (id: string, e: any) => void,
  onRotate: (id: string, e: any) => void,
  onScale: (id: string, e: any) => void,
  onWidth: (id: string, e: any) => void,
  containerRef: React.RefObject<HTMLDivElement | null>,
  baseRotation: number,
  baseFlipH: boolean,
  key?: any
}) {
  const x = useMotionValue(el.x);
  const y = useMotionValue(el.y);

  useEffect(() => {
    if (!isDragging) {
      x.set(el.x);
      y.set(el.y);
    }
  }, [el.x, el.y, isDragging]);

  const bind = useGesture(
    {
      onDrag: ({ active, movement: [mx, my], xy: [px, py], first, last }) => {
        if (first) onDragStart();
        
        let dx = mx;
        let dy = my;
        
        if (baseRotation === 90) {
          dx = my;
          dy = -mx;
        } else if (baseRotation === 180) {
          dx = -mx;
          dy = -my;
        } else if (baseRotation === 270) {
          dx = -my;
          dy = mx;
        }
        
        if (baseFlipH) {
          dx = -dx;
        }

        const rect = containerRef.current?.getBoundingClientRect();
        const width = rect?.width || 1;
        const height = rect?.height || 1;

        const dxPercent = (dx / width) * 100;
        const dyPercent = (dy / height) * 100;

        if (active) {
          x.set(el.x + dxPercent);
          y.set(el.y + dyPercent);
          onDrag(null, { point: { x: px, y: py }, offset: { x: dx, y: dy } });
        }
        if (last) {
          onDragEnd(null, { offset: { x: dx, y: dy } });
        }
      },
      onPinch: ({ offset: [s, a] }) => {
        onUpdate(el.id, { scale: s, rotation: a }, false);
      },
    },
    {
      drag: {
        filterTaps: true,
        from: () => [0, 0],
      },
      pinch: {
        from: () => [el.scale, el.rotation]
      }
    }
  );

  return (
    <motion.div
      {...(bind() as any)}
      drag={false}
      onDragStart={undefined}
      onDrag={undefined}
      onDragEnd={undefined}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ 
        scale: el.scale, 
        rotate: el.rotation,
        opacity: 1,
        zIndex: index + 10
      }}
      style={{ 
        left: useTransform(x, v => `calc(50% + ${v}%)`), 
        top: useTransform(y, v => `calc(50% + ${v}%)`), 
        x: '-50%',
        y: '-50%',
        touchAction: 'none' 
      }}
      className={`absolute cursor-grab active:cursor-grabbing group element-container pointer-events-auto ${isActive ? 'ring-2 ring-blue-500 ring-offset-4 ring-offset-transparent rounded-lg' : ''}`}
    >
      <div className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center">
        {el.type === 'text' && el.style ? (
        <div 
          className={`whitespace-pre-wrap select-none ${getFontClass(el.style.font)}`}
          style={{
            color: el.style.color,
            textAlign: el.style.alignment,
            fontSize: `${el.style.fontSize}px`,
            backgroundColor: getBgColor(el.style),
            padding: el.style.background !== 'none' ? '8px 16px' : '0',
            borderRadius: el.style.background !== 'none' ? '12px' : '0',
            textShadow: getTextShadow(el.style),
            WebkitTextStroke: getWebkitTextStroke(el.style),
            width: el.width ? `${el.width}%` : 'auto',
            minWidth: el.width ? `${el.width}%` : 'auto',
          }}
        >
          {el.content}
        </div>
      ) : (
        <div className="text-7xl drop-shadow-2xl select-none pointer-events-none">
          {el.content}
        </div>
      )}

      {isActive && !isDragging && (
        <>
          <button 
            onPointerDown={(e) => onDelete(el.id, e)}
            className="absolute -top-5 -left-5 w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center shadow-2xl hover:scale-110 active:scale-95 transition-transform z-[60] border-2 border-white"
          >
            <Trash size={14} />
          </button>

          <div 
            onPointerDown={(e) => onRotate(el.id, e)}
            className="absolute -top-8 left-1/2 -translate-x-1/2 w-8 h-8 bg-zinc-800 text-white rounded-full flex items-center justify-center shadow-2xl hover:scale-110 active:scale-95 transition-transform cursor-alias z-[60] border-2 border-blue-500"
          >
            <RotateCw size={14} />
          </div>

          <div 
            onPointerDown={(e) => onScale(el.id, e)}
            className="absolute -bottom-5 -right-5 w-8 h-8 bg-zinc-800 text-white rounded-full flex items-center justify-center shadow-2xl hover:scale-110 active:scale-95 transition-transform z-[60] border-2 border-blue-500 cursor-nwse-resize"
          >
            <Maximize2 size={14} className="rotate-45" />
          </div>

          {el.type === 'text' && (
            <div 
              onPointerDown={(e) => onWidth(el.id, e)}
              className="absolute top-1/2 -right-4 -translate-y-1/2 w-6 h-8 bg-zinc-800 text-white rounded-full flex items-center justify-center shadow-2xl hover:scale-110 active:scale-95 transition-transform z-[60] border-2 border-blue-500 cursor-ew-resize"
            >
              <div className="w-1 h-3 bg-white rounded-full" />
            </div>
          )}
        </>
      )}
      </div>
    </motion.div>
  );
}

function ToolButton({ icon, label, onClick, active = false }: { icon: React.ReactNode, label: string, onClick: () => void, active?: boolean }) {
  return (
    <button 
      onClick={onClick}
      className={`flex flex-col items-center gap-2 group min-w-[60px] transition-all ${active ? 'scale-110' : ''}`}
    >
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all shadow-lg ${active ? 'bg-blue-600 text-white shadow-blue-600/40' : 'bg-zinc-900 text-zinc-400 border border-zinc-800 group-hover:bg-zinc-800 group-hover:text-zinc-100'}`}>
        {icon}
      </div>
      <span className={`text-[10px] font-black tracking-widest uppercase transition-colors ${active ? 'text-blue-500' : 'text-zinc-500 group-hover:text-zinc-300'}`}>{label}</span>
    </button>
  );
}

interface CropOverlayProps {
  media: string;
  mediaType: 'image' | 'video';
  initialCrop: { x: number, y: number, width: number, height: number, aspectRatio: string };
  mediaAspectRatio: number;
  onApply: (crop: { x: number, y: number, width: number, height: number, aspectRatio: string }) => void;
  onCancel: () => void;
}

function CropOverlay({ media, mediaType, initialCrop, mediaAspectRatio, onApply, onCancel }: CropOverlayProps) {
  const [crop, setCrop] = useState(initialCrop);
  const containerRef = useRef<HTMLDivElement>(null);
  const ratios = [
    { label: 'Original', value: 'original' },
    { label: '1:1', value: '1:1', ratio: 1 },
    { label: '3:4', value: '3:4', ratio: 3/4 },
    { label: '4:5', value: '4:5', ratio: 4/5 },
    { label: '16:9', value: '16:9', ratio: 16/9 },
    { label: '9:16', value: '9:16', ratio: 9/16 },
  ];

  const handleRatioSelect = (r: any) => {
    if (r.value === 'original') {
      setCrop({ x: 0, y: 0, width: 100, height: 100, aspectRatio: 'original' });
    } else {
      const ratioOfPcts = r.ratio / mediaAspectRatio;
      let w = 80;
      let h = 80 / ratioOfPcts;
      if (h > 90) {
        h = 90;
        w = 90 * ratioOfPcts;
      }
      if (w > 90) {
        w = 90;
        h = 90 / ratioOfPcts;
      }
      setCrop({
        x: (100 - w) / 2,
        y: (100 - h) / 2,
        width: w,
        height: h,
        aspectRatio: r.value
      });
    }
  };

  const bind = useGesture(
    {
      onDrag: ({ delta: [dx, dy] }) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const dxPct = (dx / rect.width) * 100;
        const dyPct = (dy / rect.height) * 100;

        setCrop(prev => ({
          ...prev,
          x: Math.max(0, Math.min(100 - prev.width, prev.x + dxPct)),
          y: Math.max(0, Math.min(100 - prev.height, prev.y + dyPct))
        }));
      },
      onPinch: ({ delta: [ds] }) => {
        setCrop(prev => {
          const newW = Math.max(10, Math.min(100, prev.width * (1 + ds)));
          const targetRatio = ratios.find(r => r.value === prev.aspectRatio)?.ratio || (prev.width * mediaAspectRatio / prev.height);
          const newH = prev.aspectRatio === 'original' ? (newW / (prev.width / prev.height)) : (newW / (targetRatio / mediaAspectRatio));
          
          if (newH <= 100 && newW <= 100) {
            return {
              ...prev,
              width: newW,
              height: newH,
              x: Math.max(0, Math.min(100 - newW, prev.x - (newW - prev.width) / 2)),
              y: Math.max(0, Math.min(100 - newH, prev.y - (newH - prev.height) / 2))
            };
          }
          return prev;
        });
      }
    },
    { drag: { filterTaps: true } }
  );

  const handleResize = (corner: string, dx: number, dy: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dxPct = (dx / rect.width) * 100;
    const dyPct = (dy / rect.height) * 100;

    setCrop(prev => {
      let next = { ...prev };
      const currentRatio = (prev.width * mediaAspectRatio) / prev.height;
      const targetRatio = ratios.find(r => r.value === prev.aspectRatio)?.ratio || currentRatio;

      if (prev.aspectRatio === 'original') {
        if (corner.includes('right')) next.width = Math.max(10, Math.min(100 - prev.x, prev.width + dxPct));
        if (corner.includes('left')) {
          const newX = Math.max(0, Math.min(prev.x + prev.width - 10, prev.x + dxPct));
          next.width = prev.width + (prev.x - newX);
          next.x = newX;
        }
        if (corner.includes('bottom')) next.height = Math.max(10, Math.min(100 - prev.y, prev.height + dyPct));
        if (corner.includes('top')) {
          const newY = Math.max(0, Math.min(prev.y + prev.height - 10, prev.y + dyPct));
          next.height = prev.height + (prev.y - newY);
          next.y = newY;
        }
      } else {
        let change = Math.abs(dxPct) > Math.abs(dyPct) ? dxPct : dyPct;
        if (corner === 'top-left' || corner === 'top-right') change = -dyPct;
        
        const newW = Math.max(10, Math.min(100, prev.width + change));
        const newH = newW / (targetRatio / mediaAspectRatio);
        
        if (newH <= 100 && newW <= 100) {
          next.width = newW;
          next.height = newH;
          if (corner.includes('left')) next.x = Math.max(0, prev.x - (newW - prev.width));
          if (corner.includes('top')) next.y = Math.max(0, prev.y - (newH - prev.height));
          if (next.x + next.width > 100) next.x = 100 - next.width;
          if (next.y + next.height > 100) next.y = 100 - next.height;
        }
      }
      return next;
    });
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/95 z-[200] flex flex-col"
    >
      <header className="p-6 flex justify-between items-center border-b border-zinc-800/50">
        <button onClick={onCancel} className="text-zinc-400 font-bold">Cancel</button>
        <div className="flex flex-col items-center">
          <h3 className="text-lg font-bold">Crop & Resize</h3>
          <button 
            onClick={() => setCrop({ x: 0, y: 0, width: 100, height: 100, aspectRatio: 'original' })} 
            className="text-[10px] text-blue-500 font-bold uppercase tracking-widest"
          >
            Reset
          </button>
        </div>
        <button onClick={() => onApply(crop)} className="px-6 py-2 bg-blue-600 text-white rounded-full font-bold shadow-lg shadow-blue-600/20">Apply</button>
      </header>

      <div className="flex-1 relative flex items-center justify-center p-4 sm:p-8">
        <div 
          ref={containerRef}
          className="w-full relative bg-zinc-900 rounded-2xl overflow-hidden shadow-2xl mx-auto"
          style={{ 
            aspectRatio: mediaAspectRatio,
            maxHeight: '60vh',
            maxWidth: `min(32rem, calc(60vh * ${mediaAspectRatio}))`
          }}
        >
          {mediaType === 'video' ? (
            <video src={media} className="w-full h-full object-cover opacity-40" muted playsInline />
          ) : (
            <img src={media} className="w-full h-full object-cover opacity-40" alt="Crop Background" />
          )}
          
          {/* Crop Area */}
          <div 
            {...(bind() as any)}
            style={{
              position: 'absolute',
              left: `${crop.x}%`,
              top: `${crop.y}%`,
              width: `${crop.width}%`,
              height: `${crop.height}%`,
              touchAction: 'none'
            }}
            className="border-2 border-blue-500 shadow-[0_0_0_9999px_rgba(0,0,0,0.75)] z-10 cursor-move"
          >
            <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none">
              {[...Array(9)].map((_, i) => <div key={i} className="border border-white/30" />)}
            </div>

            {/* Corner Handles */}
            {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map(corner => (
              <div 
                key={corner}
                className={`absolute w-8 h-8 z-20 ${
                  corner === 'top-left' ? '-top-2 -left-2 border-t-4 border-l-4' :
                  corner === 'top-right' ? '-top-2 -right-2 border-t-4 border-r-4' :
                  corner === 'bottom-left' ? '-bottom-2 -left-2 border-b-4 border-l-4' :
                  '-bottom-2 -right-2 border-b-4 border-r-4'
                } border-blue-500 cursor-nwse-resize`}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  let lastX = e.clientX;
                  let lastY = e.clientY;
                  const onMove = (moveEvent: PointerEvent) => {
                    handleResize(corner, moveEvent.clientX - lastX, moveEvent.clientY - lastY);
                    lastX = moveEvent.clientX;
                    lastY = moveEvent.clientY;
                  };
                  const onUp = () => {
                    window.removeEventListener('pointermove', onMove);
                    window.removeEventListener('pointerup', onUp);
                  };
                  window.addEventListener('pointermove', onMove);
                  window.addEventListener('pointerup', onUp);
                }}
              />
            ))}

            {/* Edge Handles */}
            {['top', 'bottom', 'left', 'right'].map(edge => (
              <div 
                key={edge}
                className={`absolute z-20 ${
                  edge === 'top' ? 'top-0 left-1/2 -translate-x-1/2 w-12 h-2 cursor-ns-resize' :
                  edge === 'bottom' ? 'bottom-0 left-1/2 -translate-x-1/2 w-12 h-2 cursor-ns-resize' :
                  edge === 'left' ? 'left-0 top-1/2 -translate-y-1/2 w-2 h-12 cursor-ew-resize' :
                  'right-0 top-1/2 -translate-y-1/2 w-2 h-12 cursor-ew-resize'
                } bg-blue-500/50 rounded-full`}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  let lastX = e.clientX;
                  let lastY = e.clientY;
                  const onMove = (moveEvent: PointerEvent) => {
                    handleResize(edge, moveEvent.clientX - lastX, moveEvent.clientY - lastY);
                    lastX = moveEvent.clientX;
                    lastY = moveEvent.clientY;
                  };
                  const onUp = () => {
                    window.removeEventListener('pointermove', onMove);
                    window.removeEventListener('pointerup', onUp);
                  };
                  window.addEventListener('pointermove', onMove);
                  window.addEventListener('pointerup', onUp);
                }}
              />
            ))}
          </div>

          <div 
            className="absolute pointer-events-none overflow-hidden"
            style={{
              left: `${crop.x}%`,
              top: `${crop.y}%`,
              width: `${crop.width}%`,
              height: `${crop.height}%`,
            }}
          >
            <div 
              className="absolute"
              style={{
                left: `${-crop.x * (100 / crop.width)}%`,
                top: `${-crop.y * (100 / crop.height)}%`,
                width: `${100 * (100 / crop.width)}%`,
                height: `${100 * (100 / crop.height)}%`,
              }}
            >
              {mediaType === 'video' ? (
                <video src={media} className="w-full h-full object-cover" muted playsInline autoPlay loop />
              ) : (
                <img src={media} className="w-full h-full object-cover" alt="Crop Preview" />
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 bg-zinc-900/50 border-t border-zinc-800/50">
        <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
          {ratios.map(r => (
            <button
              key={r.value}
              onClick={() => handleRatioSelect(r)}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${crop.aspectRatio === r.value ? 'bg-blue-600 text-white scale-105' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
            >
              {r.label}
            </button>
          ))}
        </div>
        
        <div className="mt-6 flex items-center justify-center gap-4">
          <input 
            type="range" 
            min="10" 
            max="100" 
            value={crop.width} 
            onChange={(e) => {
              const newW = parseInt(e.target.value);
              const targetRatio = ratios.find(r => r.value === crop.aspectRatio)?.ratio || (crop.width * mediaAspectRatio / crop.height);
              const newH = crop.aspectRatio === 'original' ? (newW / (crop.width / crop.height)) : (newW / (targetRatio / mediaAspectRatio));
              
              if (newH <= 100 && newW <= 100) {
                setCrop(prev => ({
                  ...prev,
                  width: newW,
                  height: newH,
                  x: Math.min(prev.x, 100 - newW),
                  y: Math.min(prev.y, 100 - newH)
                }));
              }
            }}
            className="w-full max-w-xs accent-blue-500"
          />
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Zoom</span>
        </div>
      </div>
    </motion.div>
  );
}
