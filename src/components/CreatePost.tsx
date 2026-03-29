import React, { useState, FormEvent, useRef } from 'react';
import { addDoc, collection, serverTimestamp, Timestamp, writeBatch, doc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { handleFirestoreError, OperationType } from '../utils/firestore';
import { deleteFromCloudinary } from '../utils/media';
import { ImagePlus, Loader2, Upload, Camera, Layout, X, Video, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ZoomableMedia from './ZoomableMedia';

interface CreatePostProps {
  onSuccess: () => void;
}

type UploadType = 'post' | 'story';

export default function CreatePost({ onSuccess }: CreatePostProps) {
  const [uploadType, setUploadType] = useState<UploadType>('post');
  const [mediaFiles, setMediaFiles] = useState<{ file: File, preview: string, type: 'image' | 'video' }[]>([]);
  const [caption, setCaption] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleMediaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files) as File[];
      const validFiles: { file: File, preview: string, type: 'image' | 'video' }[] = [];
      
      for (const file of newFiles) {
        const isVideo = file.type.startsWith('video/');
        
        if (isVideo && file.size > 50 * 1024 * 1024) {
          setError('Video is too large. Max size is 50MB.');
          continue;
        } else if (!isVideo && file.size > 5 * 1024 * 1024) {
          setError('Image is too large. Max size is 5MB.');
          continue;
        }

        validFiles.push({
          file,
          preview: URL.createObjectURL(file),
          type: isVideo ? 'video' : 'image'
        });
      }

      if (uploadType === 'story' && validFiles.length > 1) {
        setMediaFiles([validFiles[0]]);
        setError('Only one media file is allowed for stories.');
      } else {
        setMediaFiles(prev => [...prev, ...validFiles].slice(0, 10)); // Max 10 files
        setError(null);
      }
    }
  };

  const removeMedia = (index: number) => {
    setMediaFiles(prev => prev.filter((_, i) => i !== index));
  };

  const reorderMedia = (index: number, direction: 'left' | 'right') => {
    setMediaFiles(prev => {
      const newFiles = [...prev];
      const targetIndex = direction === 'left' ? index - 1 : index + 1;
      if (targetIndex >= 0 && targetIndex < newFiles.length) {
        [newFiles[index], newFiles[targetIndex]] = [newFiles[targetIndex], newFiles[index]];
      }
      return newFiles;
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
        const formData = new FormData();
        formData.append('file', media.file);
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
      setError(err.message || `Failed to create ${uploadType}. Please try again.`);
    } finally {
      setLoading(false);
    }
  };

  const handleTabSwitch = (type: UploadType) => {
    setUploadType(type);
    setMediaFiles([]);
    setCaption('');
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="max-w-md mx-auto p-4 pt-6 pb-24">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">Create new</h2>
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
              <div className="space-y-4">
                <div className={`relative w-full ${uploadType === 'story' ? 'aspect-[9/16]' : 'min-h-[300px] max-h-[min(500px,70vh)] overflow-y-auto custom-scrollbar'} bg-zinc-100 dark:bg-zinc-800 rounded-3xl overflow-hidden border border-zinc-200/50 dark:border-zinc-700 shadow-sm group`}>
                  <ZoomableMedia className="w-full h-full">
                    {mediaFiles[0].type === 'video' ? (
                      <video 
                        src={mediaFiles[0].preview} 
                        controls
                        className="w-full h-auto block object-contain"
                      />
                    ) : (
                      <img 
                        src={mediaFiles[0].preview} 
                        alt="Preview" 
                        className="w-full h-auto block object-contain"
                      />
                    )}
                  </ZoomableMedia>
                  <div className="absolute top-4 right-4 flex gap-2 z-10">
                    {mediaFiles.length > 1 && (
                      <button
                        type="button"
                        onClick={() => reorderMedia(0, 'right')}
                        className="p-2 bg-black/50 hover:bg-black/70 text-white rounded-full backdrop-blur-md transition-all"
                        title="Move right"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => removeMedia(0)}
                      className="p-2 bg-black/50 hover:bg-black/70 text-white rounded-full backdrop-blur-md transition-all"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {uploadType === 'post' && mediaFiles.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                    {mediaFiles.slice(1).map((media, index) => {
                      const realIndex = index + 1;
                      return (
                        <div key={realIndex} className="relative flex-shrink-0 w-24 h-24 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700 group/thumb">
                          {media.type === 'video' ? (
                            <video src={media.preview} className="w-full h-full object-cover" />
                          ) : (
                            <img src={media.preview} alt={`Preview ${realIndex}`} className="w-full h-full object-cover" />
                          )}
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => reorderMedia(realIndex, 'left')}
                              className="p-1 bg-white/20 hover:bg-white/40 text-white rounded-full backdrop-blur-md transition-all"
                            >
                              <ChevronLeft className="w-4 h-4" />
                            </button>
                            {realIndex < mediaFiles.length - 1 && (
                              <button
                                type="button"
                                onClick={() => reorderMedia(realIndex, 'right')}
                                className="p-1 bg-white/20 hover:bg-white/40 text-white rounded-full backdrop-blur-md transition-all"
                              >
                                <ChevronRight className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => removeMedia(realIndex)}
                              className="p-1 bg-red-500/50 hover:bg-red-500/70 text-white rounded-full backdrop-blur-md transition-all"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {mediaFiles.length < 10 && (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex-shrink-0 w-24 h-24 rounded-xl border-2 border-dashed border-zinc-300 dark:border-zinc-600 flex items-center justify-center hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                      >
                        <Upload className="w-6 h-6 text-zinc-400" />
                      </button>
                    )}
                  </div>
                )}
                
                {uploadType === 'post' && mediaFiles.length === 1 && (
                  <button 
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full bg-white/90 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 px-4 py-3 rounded-xl font-bold shadow-sm border border-zinc-200 dark:border-zinc-700 flex items-center justify-center gap-2 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-all"
                  >
                    <ImagePlus className="w-5 h-5" />
                    Add more media
                  </button>
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
                {uploadType === 'post' ? 'Sharing post...' : 'Uploading story...'}
              </>
            ) : (
              uploadType === 'post' ? 'Share Post' : 'Upload Story'
            )}
          </button>
        </motion.form>
      </AnimatePresence>
    </div>
  );
}
