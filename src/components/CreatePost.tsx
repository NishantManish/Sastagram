import React, { useState, FormEvent, useRef, useCallback } from 'react';
import { addDoc, collection, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { handleFirestoreError, OperationType } from '../utils/firestore';
import { deleteFromCloudinary } from '../utils/media';
import { ImagePlus, Loader2, Upload, Camera, Layout, X, Crop as CropIcon } from 'lucide-react';
import Cropper from 'react-easy-crop';
import getCroppedImg from '../utils/cropImage';
import { motion, AnimatePresence } from 'motion/react';

interface CreatePostProps {
  onSuccess: () => void;
}

type UploadType = 'post' | 'story';

export default function CreatePost({ onSuccess }: CreatePostProps) {
  const [uploadType, setUploadType] = useState<UploadType>('post');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [caption, setCaption] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cropping states
  const [isCropping, setIsCropping] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 5 * 1024 * 1024) {
        setError('File is too large. Max size is 5MB.');
        return;
      }
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
      setIsCropping(true); // Start cropping immediately
      setError(null);
    }
  };

  const onCropComplete = useCallback((croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleCropSave = async () => {
    try {
      if (!imagePreview || !croppedAreaPixels) return;
      const croppedImage = await getCroppedImg(imagePreview, croppedAreaPixels, 0);
      if (croppedImage) {
        setImageFile(croppedImage);
        setImagePreview(URL.createObjectURL(croppedImage));
        setIsCropping(false);
      }
    } catch (e) {
      console.error(e);
      setError('Failed to crop image');
    }
  };

  const handleCancelCrop = () => {
    setIsCropping(false);
    setImageFile(null);
    setImagePreview('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) {
      setError('You must be logged in to upload.');
      return;
    }
    if (!imageFile) {
      setError('Please select an image');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Upload image to Cloudinary
      const formData = new FormData();
      formData.append('file', imageFile);
      formData.append('upload_preset', (import.meta as any).env.VITE_CLOUDINARY_UPLOAD_PRESET);
      
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${(import.meta as any).env.VITE_CLOUDINARY_CLOUD_NAME}/upload`,
        { method: 'POST', body: formData }
      );
      
      if (!response.ok) {
        throw new Error('Failed to upload image to Cloudinary');
      }
      
      const data = await response.json();
      const downloadURL = data.secure_url;

      if (uploadType === 'post') {
        try {
          const tags = caption.match(/#(\w+)/g)?.map(t => t.slice(1).toLowerCase()) || [];
          const mentions = caption.match(/@(\w+)/g)?.map(m => m.slice(1).toLowerCase()) || [];

          await addDoc(collection(db, 'posts'), {
            authorId: auth.currentUser.uid,
            authorName: auth.currentUser.displayName || 'Anonymous',
            authorPhoto: auth.currentUser.photoURL || '',
            imageUrl: downloadURL,
            caption: caption.trim(),
            tags,
            mentions,
            likesCount: 0,
            commentsCount: 0,
            createdAt: serverTimestamp(),
          });
        } catch (err) {
          await deleteFromCloudinary(downloadURL).catch(console.error);
          handleFirestoreError(err, OperationType.CREATE, 'posts');
          throw err;
        }
      } else {
        try {
          const expiresAt = new Date();
          expiresAt.setHours(expiresAt.getHours() + 24);

          await addDoc(collection(db, 'stories'), {
            authorId: auth.currentUser.uid,
            authorName: auth.currentUser.displayName || 'Anonymous',
            authorPhoto: auth.currentUser.photoURL || '',
            imageUrl: downloadURL,
            createdAt: serverTimestamp(),
            expiresAt: Timestamp.fromDate(expiresAt),
          });
        } catch (err) {
          await deleteFromCloudinary(downloadURL).catch(console.error);
          handleFirestoreError(err, OperationType.CREATE, 'stories');
          throw err;
        }
      }
      
      setImageFile(null);
      setImagePreview('');
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
    setImageFile(null);
    setImagePreview('');
    setCaption('');
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="max-w-md mx-auto p-4 pt-6 pb-24">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-2xl font-bold text-zinc-900 tracking-tight">Create new</h2>
        <div className="flex bg-zinc-100/80 p-1 rounded-2xl backdrop-blur-sm">
          <button
            onClick={() => handleTabSwitch('post')}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
              uploadType === 'post' ? 'bg-white text-indigo-600 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            <Layout className="w-4 h-4" />
            Post
          </button>
          <button
            onClick={() => handleTabSwitch('story')}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
              uploadType === 'story' ? 'bg-white text-indigo-600 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
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
          className="p-4 mb-6 bg-red-50 text-red-600 text-sm font-medium rounded-2xl border border-red-100"
        >
          {error}
        </motion.div>
      )}

      <AnimatePresence mode="wait">
        {isCropping ? (
          <motion.div 
            key="cropper"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-50 bg-black flex flex-col"
          >
            <div className="flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent absolute top-0 left-0 right-0 z-10">
              <button onClick={handleCancelCrop} className="p-2 text-white/80 hover:text-white bg-black/20 rounded-full backdrop-blur-md">
                <X className="w-6 h-6" />
              </button>
              <h3 className="text-white font-bold">Crop Image</h3>
              <button onClick={handleCropSave} className="px-4 py-2 bg-white text-black font-bold rounded-full text-sm hover:bg-zinc-200 transition-colors">
                Done
              </button>
            </div>
            <div className="relative flex-1">
              <Cropper
                image={imagePreview}
                crop={crop}
                zoom={zoom}
                aspect={uploadType === 'story' ? 9 / 16 : 1}
                onCropChange={setCrop}
                onCropComplete={onCropComplete}
                onZoomChange={setZoom}
                objectFit="contain"
              />
            </div>
            <div className="p-8 bg-gradient-to-t from-black/80 to-transparent absolute bottom-0 left-0 right-0 z-10">
              <input
                type="range"
                value={zoom}
                min={1}
                max={3}
                step={0.1}
                aria-labelledby="Zoom"
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-full accent-white"
              />
            </div>
          </motion.div>
        ) : (
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
                accept="image/*"
                onChange={handleImageChange}
                ref={fileInputRef}
                className="hidden"
              />
              
              {imagePreview ? (
                <div className={`relative w-full ${uploadType === 'story' ? 'aspect-[9/16]' : 'min-h-[300px] max-h-[500px] overflow-y-auto custom-scrollbar'} bg-zinc-100 rounded-3xl overflow-hidden border border-zinc-200/50 shadow-sm group`}>
                  <img 
                    src={imagePreview} 
                    alt="Preview" 
                    className="w-full h-auto block"
                  />
                  <button
                    type="button"
                    onClick={() => handleTabSwitch(uploadType)}
                    className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full backdrop-blur-md transition-all z-10"
                  >
                    <X className="w-5 h-5" />
                  </button>
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 backdrop-blur-sm pointer-events-none group-hover:pointer-events-auto">
                    <button 
                      type="button"
                      onClick={() => setIsCropping(true)}
                      className="bg-white/90 text-zinc-900 px-4 py-2.5 rounded-xl font-bold shadow-lg flex items-center gap-2 hover:bg-white hover:scale-105 transition-all active:scale-95"
                    >
                      <CropIcon className="w-4 h-4" />
                      Crop
                    </button>
                    <button 
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="bg-white/90 text-zinc-900 px-4 py-2.5 rounded-xl font-bold shadow-lg flex items-center gap-2 hover:bg-white hover:scale-105 transition-all active:scale-95"
                    >
                      <Upload className="w-4 h-4" />
                      Change
                    </button>
                  </div>
                </div>
              ) : (
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className={`w-full ${uploadType === 'story' ? 'aspect-[9/16]' : 'aspect-square'} bg-zinc-50/50 border-2 border-dashed border-zinc-200 rounded-3xl flex flex-col items-center justify-center cursor-pointer hover:bg-zinc-50 hover:border-indigo-300 transition-all group`}
                >
                  <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-zinc-100 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform group-hover:shadow-md">
                    <ImagePlus className="w-8 h-8 text-indigo-500" />
                  </div>
                  <p className="text-zinc-900 font-bold text-lg">Select an image</p>
                  <p className="text-zinc-400 text-sm mt-1 font-medium">PNG, JPG up to 5MB</p>
                </div>
              )}
            </div>

            {uploadType === 'post' && (
              <div className="bg-white p-2 rounded-3xl border border-zinc-100 shadow-sm transition-all">
                <textarea
                  id="caption"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Write a caption..."
                  rows={3}
                  className="block w-full p-3 bg-transparent border-none focus:ring-0 outline-none focus:outline-none text-zinc-900 placeholder:text-zinc-400 resize-none"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !imageFile}
              className="w-full py-4 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl shadow-lg shadow-indigo-200 transition-all disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2 active:scale-[0.98]"
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
        )}
      </AnimatePresence>
    </div>
  );
}
