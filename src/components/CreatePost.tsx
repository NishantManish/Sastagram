import React, { useState, FormEvent, useRef } from 'react';
import { addDoc, collection, serverTimestamp, Timestamp, writeBatch, doc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { handleFirestoreError, OperationType, parseFirestoreError } from '../utils/firestore';
import { deleteFromCloudinary } from '../utils/media';
import { ImagePlus, Loader2, Upload, Camera, Layout, X, Video, ChevronLeft, ChevronRight, GripVertical, Maximize, RectangleHorizontal, RectangleVertical, Clapperboard } from 'lucide-react';
import { motion, AnimatePresence, Reorder, useDragControls } from 'motion/react';
import ZoomableMedia from './ZoomableMedia';
import Cropper, { Area, Point } from 'react-easy-crop';
import getCroppedImg from '../utils/cropImage';

interface CreatePostProps {
  onSuccess: () => void;
  onBack?: () => void;
  initialType?: UploadType;
}

type UploadType = 'post' | 'story' | 'reel';

interface MediaFile {
  file: File;
  preview: string;
  type: 'image' | 'video';
  crop: Point;
  zoom: number;
  croppedAreaPixels: Area | null;
  naturalAspectRatio: number;
}

const getMediaDimensions = (preview: string, type: 'image' | 'video'): Promise<number> => {
  return new Promise((resolve) => {
    if (type === 'image') {
      const img = new Image();
      img.onload = () => resolve(img.width / img.height);
      img.onerror = () => resolve(1);
      img.src = preview;
    } else {
      const vid = document.createElement('video');
      vid.onloadedmetadata = () => resolve(vid.videoWidth / vid.videoHeight);
      vid.onerror = () => resolve(1);
      vid.src = preview;
    }
  });
};

export default function CreatePost({ onSuccess, onBack, initialType = 'post' }: CreatePostProps) {
  const [uploadType, setUploadType] = useState<UploadType>(initialType);
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [selectedMediaIndex, setSelectedMediaIndex] = useState(0);
  const [caption, setCaption] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aspectRatioMode, setAspectRatioMode] = useState<'square' | 'portrait' | 'landscape' | 'original'>('original');
  const fileInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (initialType) {
      setUploadType(initialType);
    }
  }, [initialType]);

  const handleMediaChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files) as File[];
      const validFiles: MediaFile[] = [];
      
      for (const file of newFiles) {
        const isVideo = file.type.startsWith('video/');
        
        if (isVideo && file.size > 50 * 1024 * 1024) {
          setError('Video is too large. Max size is 50MB.');
          continue;
        } else if (!isVideo && file.size > 5 * 1024 * 1024) {
          setError('Image is too large. Max size is 5MB.');
          continue;
        }

        const preview = URL.createObjectURL(file);
        const type = isVideo ? 'video' : 'image';
        const naturalAspectRatio = await getMediaDimensions(preview, type);

        validFiles.push({
          file,
          preview,
          type,
          crop: { x: 0, y: 0 },
          zoom: 1,
          croppedAreaPixels: null,
          naturalAspectRatio
        });
      }

      if (uploadType === 'story' && validFiles.length > 1) {
        setMediaFiles([validFiles[0]]);
        setError('Only one media file is allowed for stories.');
      } else if (uploadType === 'reel' && validFiles.length > 1) {
        setMediaFiles([validFiles[0]]);
        setError('Only one video is allowed for reels.');
      } else if (uploadType === 'reel' && validFiles[0].type !== 'video') {
        setError('Please select a video for your reel.');
        if (fileInputRef.current) fileInputRef.current.value = '';
      } else {
        setMediaFiles(prev => [...prev, ...validFiles].slice(0, 10)); // Max 10 files
        setError(null);
      }
    }
  };

  const removeMedia = (index: number) => {
    setMediaFiles(prev => {
      const next = prev.filter((_, i) => i !== index);
      if (selectedMediaIndex >= next.length) {
        setSelectedMediaIndex(Math.max(0, next.length - 1));
      }
      return next;
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) {
      setError('You must be logged in to upload.');
      return;
    }
    if (mediaFiles.length === 0) {
      setError('Please select an image or video');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const uploadedUrls: { url: string, type: 'image' | 'video' }[] = [];

      for (const media of mediaFiles) {
        let fileToUpload = media.file;
        
        if (media.type === 'image' && media.croppedAreaPixels) {
          try {
            const croppedBlob = await getCroppedImg(media.preview, media.croppedAreaPixels);
            if (croppedBlob) {
              fileToUpload = new File([croppedBlob], media.file.name, { type: 'image/jpeg' });
            }
          } catch (e) {
            console.error('Failed to crop image before upload', e);
          }
        }

        const formData = new FormData();
        formData.append('file', fileToUpload);
        formData.append('upload_preset', (import.meta as any).env.VITE_CLOUDINARY_UPLOAD_PRESET);
        
        const resourceType = media.type === 'video' ? 'video' : 'image';
        const response = await fetch(
          `https://api.cloudinary.com/v1_1/${(import.meta as any).env.VITE_CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`,
          { method: 'POST', body: formData }
        );
        
        if (!response.ok) {
          throw new Error(`Failed to upload ${media.type} to Cloudinary`);
        }
        
        const data = await response.json();
        uploadedUrls.push({ url: data.secure_url, type: media.type });
      }

      if (uploadType === 'post') {
        try {
          const tags = caption.match(/#(\w+)/g)?.map(t => t.slice(1).toLowerCase()) || [];
          const mentions = caption.match(/@(\w+)/g)?.map(m => m.slice(1).toLowerCase()) || [];

          await addDoc(collection(db, 'posts'), {
            authorId: auth.currentUser.uid,
            authorName: auth.currentUser.displayName || 'Anonymous',
            authorPhoto: auth.currentUser.photoURL || '',
            imageUrl: uploadedUrls[0].type === 'image' ? uploadedUrls[0].url : '',
            videoUrl: uploadedUrls[0].type === 'video' ? uploadedUrls[0].url : '',
            mediaType: uploadedUrls[0].type,
            mediaUrls: uploadedUrls,
            caption: caption.trim(),
            tags,
            mentions,
            likesCount: 0,
            commentsCount: 0,
            createdAt: serverTimestamp(),
          });
        } catch (err) {
          for (const media of uploadedUrls) {
            await deleteFromCloudinary(media.url).catch(console.error);
          }
          handleFirestoreError(err, OperationType.CREATE, 'posts');
          throw err;
        }
      } else if (uploadType === 'reel') {
        try {
          await addDoc(collection(db, 'reels'), {
            authorId: auth.currentUser.uid,
            authorName: auth.currentUser.displayName || 'Anonymous',
            authorPhoto: auth.currentUser.photoURL || '',
            videoUrl: uploadedUrls[0].url,
            caption: caption.trim(),
            likesCount: 0,
            commentsCount: 0,
            viewsCount: 0,
            createdAt: serverTimestamp(),
          });
        } catch (err) {
          for (const media of uploadedUrls) {
            await deleteFromCloudinary(media.url).catch(console.error);
          }
          handleFirestoreError(err, OperationType.CREATE, 'reels');
          throw err;
        }
      } else {
        try {
          const expiresAt = new Date();
          expiresAt.setHours(expiresAt.getHours() + 24);

          const batch = writeBatch(db);
          for (const media of uploadedUrls) {
            const storyRef = doc(collection(db, 'stories'));
            batch.set(storyRef, {
              authorId: auth.currentUser.uid,
              authorName: auth.currentUser.displayName || 'Anonymous',
              authorPhoto: auth.currentUser.photoURL || '',
              imageUrl: media.type === 'image' ? media.url : '',
              videoUrl: media.type === 'video' ? media.url : '',
              mediaType: media.type,
              createdAt: serverTimestamp(),
              expiresAt: Timestamp.fromDate(expiresAt),
            });
          }
          await batch.commit();
        } catch (err) {
          for (const media of uploadedUrls) {
            await deleteFromCloudinary(media.url).catch(console.error);
          }
          handleFirestoreError(err, OperationType.CREATE, 'stories');
          throw err;
        }
      }
      
      setMediaFiles([]);
      setCaption('');
      onSuccess();
    } catch (err: any) {
      console.error(`Error creating ${uploadType}:`, err);
      setError(parseFirestoreError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleTabSwitch = (type: UploadType) => {
    setUploadType(type);
    setMediaFiles([]);
    setCaption('');
    setError(null);
    setAspectRatioMode('original');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const updateMediaState = (index: number, updates: Partial<MediaFile>) => {
    setMediaFiles(prev => {
      const newFiles = [...prev];
      newFiles[index] = { ...newFiles[index], ...updates };
      return newFiles;
    });
  };

  const cycleAspectRatio = () => {
    setAspectRatioMode(prev => {
      if (prev === 'original') return 'square';
      if (prev === 'square') return 'portrait';
      if (prev === 'portrait') return 'landscape';
      return 'original';
    });
  };

  const getAspectRatioIcon = () => {
    if (aspectRatioMode === 'original') return <ImagePlus className="w-4 h-4" />;
    if (aspectRatioMode === 'square') return <Maximize className="w-4 h-4" />;
    if (aspectRatioMode === 'portrait') return <RectangleVertical className="w-4 h-4" />;
    return <RectangleHorizontal className="w-4 h-4" />;
  };

  const getCurrentAspect = () => {
    if (uploadType === 'story') return 9/16;
    if (uploadType === 'reel') return 9/16;
    switch (aspectRatioMode) {
      case 'square': return 1;
      case 'portrait': return 4/5;
      case 'landscape': return 16/9;
      case 'original': 
        // Bound the original aspect ratio to prevent extreme layouts (like Instagram does)
        return mediaFiles.length > 0 ? Math.max(0.8, Math.min(1.91, mediaFiles[0].naturalAspectRatio)) : 1;
    }
  };

  const currentAspect = getCurrentAspect();

  return (
    <div className="max-w-md mx-auto p-4 pt-6 pb-24">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          {onBack && (
            <button 
              onClick={onBack}
              className="p-2 -ml-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-all active:scale-90"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">Create new</h2>
        </div>
        <div className="flex bg-zinc-100/80 dark:bg-zinc-800 p-1 rounded-2xl backdrop-blur-sm">
          <button
            onClick={() => handleTabSwitch('post')}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
              uploadType === 'post' ? 'bg-white dark:bg-zinc-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
          >
            <Layout className="w-4 h-4" />
            Post
          </button>
          <button
            onClick={() => handleTabSwitch('story')}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
              uploadType === 'story' ? 'bg-white dark:bg-zinc-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
          >
            <Camera className="w-4 h-4" />
            Story
          </button>
          <button
            onClick={() => handleTabSwitch('reel')}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
              uploadType === 'reel' ? 'bg-white dark:bg-zinc-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
          >
            <Clapperboard className="w-4 h-4" />
            Reel
          </button>
        </div>
      </div>
      
      {error && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 mb-6 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm font-medium rounded-2xl border border-red-100 dark:border-red-900/30"
        >
          {error}
        </motion.div>
      )}

      <AnimatePresence mode="wait">
        <motion.form 
          key="form"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onSubmit={handleSubmit} 
          className="space-y-6"
        >
          <div>
            <input
              type="file"
              accept="image/*,video/*"
              multiple={uploadType === 'post'}
              onChange={handleMediaChange}
              ref={fileInputRef}
              className="hidden"
            />
            
            {mediaFiles.length > 0 ? (
              <div className="space-y-6">
                <div className={`relative w-full ${uploadType === 'story' ? 'aspect-[9/16]' : ''} bg-zinc-100 dark:bg-zinc-800 rounded-3xl overflow-hidden border border-zinc-200/50 dark:border-zinc-700 shadow-sm group`} style={{ aspectRatio: currentAspect, maxHeight: '70vh' }}>
                  {mediaFiles[selectedMediaIndex]?.type === 'video' ? (
                    <ZoomableMedia className="w-full h-full">
                      <video 
                        key={mediaFiles[selectedMediaIndex].preview}
                        src={mediaFiles[selectedMediaIndex].preview} 
                        controls
                        className="w-full h-full block object-contain"
                      />
                    </ZoomableMedia>
                  ) : (
                    <div className="w-full h-full relative">
                      <Cropper
                        image={mediaFiles[selectedMediaIndex]?.preview}
                        crop={mediaFiles[selectedMediaIndex]?.crop || { x: 0, y: 0 }}
                        zoom={mediaFiles[selectedMediaIndex]?.zoom || 1}
                        aspect={currentAspect}
                        onCropChange={(crop) => updateMediaState(selectedMediaIndex, { crop })}
                        onCropComplete={(_croppedArea, croppedAreaPixels) => updateMediaState(selectedMediaIndex, { croppedAreaPixels })}
                        onZoomChange={(zoom) => updateMediaState(selectedMediaIndex, { zoom })}
                        showGrid={true}
                        classes={{
                          containerClassName: 'w-full h-full',
                        }}
                      />
                    </div>
                  )}
                  <div className="absolute top-4 right-4 z-10 flex gap-2">
                    {uploadType === 'post' && mediaFiles[selectedMediaIndex]?.type === 'image' && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          cycleAspectRatio();
                        }}
                        className="p-2 bg-black/50 hover:bg-black/70 text-white rounded-full backdrop-blur-md transition-all flex items-center justify-center gap-1.5 px-3"
                        title="Change Aspect Ratio"
                      >
                        {getAspectRatioIcon()}
                        <span className="text-[10px] font-bold uppercase tracking-wider">
                          {aspectRatioMode}
                        </span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => removeMedia(selectedMediaIndex)}
                      className="p-2 bg-black/50 hover:bg-black/70 text-white rounded-full backdrop-blur-md transition-all"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  {uploadType === 'post' && selectedMediaIndex === 0 && (
                    <div className="absolute bottom-4 left-4 z-10 bg-black/40 backdrop-blur-md px-3 py-1 rounded-full text-white text-xs font-bold pointer-events-none">
                      Cover Image
                    </div>
                  )}
                </div>

                {uploadType === 'post' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-sm font-bold text-zinc-500 dark:text-zinc-400">Rearrange media (Hold to drag)</span>
                      <span className="text-xs text-zinc-400">{mediaFiles.length}/10</span>
                    </div>
                    
                    <Reorder.Group 
                      axis="x" 
                      values={mediaFiles} 
                      onReorder={setMediaFiles}
                      className="flex gap-3 overflow-x-auto pb-4 pt-1 px-1 custom-scrollbar"
                    >
                      {mediaFiles.map((media, index) => (
                        <MediaItem 
                          key={media.preview}
                          media={media}
                          index={index}
                          isSelected={selectedMediaIndex === index}
                          onSelect={() => setSelectedMediaIndex(index)}
                          onRemove={() => removeMedia(index)}
                        />
                      ))}
                      
                      {mediaFiles.length < 10 && (
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="flex-shrink-0 w-24 h-24 rounded-2xl border-2 border-dashed border-zinc-200 dark:border-zinc-700 flex flex-col items-center justify-center hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:border-indigo-300 transition-all group"
                        >
                          <Upload className="w-5 h-5 text-zinc-400 group-hover:text-indigo-500 transition-colors" />
                          <span className="text-[10px] font-bold text-zinc-400 mt-1 group-hover:text-indigo-500">Add</span>
                        </button>
                      )}
                    </Reorder.Group>
                  </div>
                )}
              </div>
            ) : (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className={`w-full ${uploadType === 'story' ? 'aspect-[9/16]' : 'aspect-square'} bg-zinc-50/50 dark:bg-zinc-800/50 border-2 border-dashed border-zinc-200 dark:border-zinc-700 rounded-3xl flex flex-col items-center justify-center cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:border-indigo-300 dark:hover:border-indigo-500 transition-all group`}
              >
                <div className="w-16 h-16 bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-zinc-100 dark:border-zinc-800 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform group-hover:shadow-md">
                  <ImagePlus className="w-8 h-8 text-indigo-500 dark:text-indigo-400" />
                </div>
                <p className="text-zinc-900 dark:text-zinc-50 font-bold text-lg">Select media</p>
                <p className="text-zinc-400 dark:text-zinc-500 text-sm mt-1 font-medium">PNG, JPG up to 5MB, Video up to 50MB</p>
                {uploadType === 'post' && <p className="text-zinc-400 dark:text-zinc-500 text-xs mt-1">Select multiple files to create a carousel</p>}
              </div>
            )}
          </div>

          {uploadType === 'post' && (
            <div className="bg-white dark:bg-zinc-900 p-2 rounded-3xl border border-zinc-100 dark:border-zinc-800 shadow-sm transition-all">
              <textarea
                id="caption"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Write a caption..."
                rows={3}
                className="block w-full p-3 bg-transparent border-none focus:ring-0 outline-none focus:outline-none text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 resize-none"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading || mediaFiles.length === 0}
            className="w-full py-4 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl shadow-lg shadow-indigo-200 dark:shadow-indigo-900/20 transition-all disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2 active:scale-[0.98]"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {uploadType === 'post' ? 'Sharing post...' : uploadType === 'reel' ? 'Sharing reel...' : 'Uploading story...'}
              </>
            ) : (
              uploadType === 'post' ? 'Share Post' : uploadType === 'reel' ? 'Share Reel' : 'Upload Story'
            )}
          </button>
        </motion.form>
      </AnimatePresence>
    </div>
  );
}

interface MediaItemProps {
  key?: React.Key;
  media: MediaFile;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}

function MediaItem({ media, index, isSelected, onSelect, onRemove }: MediaItemProps) {
  const controls = useDragControls();
  const timerRef = useRef<any>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handlePointerDown = (event: React.PointerEvent) => {
    // Prevent default to avoid system menus on long press
    timerRef.current = setTimeout(() => {
      setIsDragging(true);
      controls.start(event);
    }, 400); // Slightly shorter delay for better responsiveness
  };

  const handlePointerUp = (event: React.PointerEvent) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      
      // If we haven't started dragging yet, it's a tap
      if (!isDragging) {
        onSelect();
      }
    }
    setIsDragging(false);
  };

  return (
    <Reorder.Item
      value={media}
      dragListener={false}
      dragControls={controls}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ 
        opacity: 1, 
        scale: 1,
        y: isDragging ? -12 : 0,
        zIndex: isDragging ? 50 : 1
      }}
      whileDrag={{ 
        scale: 1.1, 
        y: -15,
        boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)",
        zIndex: 100
      }}
      className={`relative flex-shrink-0 w-24 h-24 rounded-2xl overflow-hidden border-2 transition-all duration-200 ${
        isSelected ? 'border-indigo-600 dark:border-indigo-400 scale-105 shadow-md' : 'border-transparent'
      }`}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        setIsDragging(false);
      }}
    >
      <div className="w-full h-full relative group/item">
        {media.type === 'video' ? (
          <video src={media.preview} className="w-full h-full object-cover pointer-events-none" />
        ) : (
          <img src={media.preview} alt={`Thumb ${index}`} className="w-full h-full object-cover pointer-events-none" />
        )}
        
        <div className="absolute inset-0 bg-black/10 group-hover/item:bg-black/30 transition-colors flex items-center justify-center">
          <GripVertical className="w-5 h-5 text-white/70 opacity-0 group-hover/item:opacity-100 transition-opacity" />
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="absolute top-1 right-1 p-1 bg-black/50 hover:bg-red-500 text-white rounded-full backdrop-blur-md transition-all opacity-0 group-hover/item:opacity-100"
        >
          <X className="w-3 h-3" />
        </button>

        <div className={`absolute top-1 left-1 text-[10px] text-white px-1.5 py-0.5 rounded-md font-bold ${
          index === 0 ? 'bg-indigo-600' : 'bg-black/40'
        }`}>
          {index + 1}
        </div>
      </div>
    </Reorder.Item>
  );
}
