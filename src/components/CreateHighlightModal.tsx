import React, { useState, useRef, useCallback } from 'react';
import { X, Upload, Loader2, Crop as CropIcon, ImagePlus } from 'lucide-react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { handleFirestoreError, OperationType } from '../utils/firestore';
import { deleteFromCloudinary } from '../utils/media';
import { motion, AnimatePresence } from 'motion/react';
import Cropper from 'react-easy-crop';
import getCroppedImg from '../utils/cropImage';

interface CreateHighlightModalProps {
  onClose: () => void;
}

export default function CreateHighlightModal({ onClose }: CreateHighlightModalProps) {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [label, setLabel] = useState('');
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaPreviews, setMediaPreviews] = useState<{url: string, type: string}[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);

  // Cropping states
  const [isCropping, setIsCropping] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 5 * 1024 * 1024) {
        setError('Cover file is too large. Max size is 5MB.');
        return;
      }
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
      setIsCropping(true);
      setError(null);
    }
  };

  const handleMediaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      const validFiles = files.filter((file: File) => file.size <= 50 * 1024 * 1024); // 50MB max for media
      
      if (validFiles.length !== files.length) {
        setError('Some files were too large. Max size is 50MB per file.');
      }

      setMediaFiles(prev => [...prev, ...validFiles]);
      
      const newPreviews = validFiles.map((file: File) => ({
        url: URL.createObjectURL(file),
        type: file.type.startsWith('video/') ? 'video' : 'image'
      }));
      setMediaPreviews(prev => [...prev, ...newPreviews]);
    }
  };

  const removeMedia = (index: number) => {
    setMediaFiles(prev => prev.filter((_, i) => i !== index));
    setMediaPreviews(prev => prev.filter((_, i) => i !== index));
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

  const uploadToCloudinary = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', (import.meta as any).env.VITE_CLOUDINARY_UPLOAD_PRESET);
    formData.append('tags', `user_${auth.currentUser?.uid},highlight`);
    
    const resourceType = file.type.startsWith('video/') ? 'video' : 'image';
    
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${(import.meta as any).env.VITE_CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`,
      { method: 'POST', body: formData }
    );
    
    if (!response.ok) throw new Error('Failed to upload media');
    const data = await response.json();
    return data.secure_url;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    if (!imageFile) {
      setError('Please select an image for the highlight cover.');
      return;
    }
    if (!label.trim()) {
      setError('Please provide a label for the highlight.');
      return;
    }
    if (mediaFiles.length === 0) {
      setError('Please add at least one image or video to the highlight.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Upload cover
      const coverUrl = await uploadToCloudinary(imageFile);
      
      // Upload all media
      let mediaUrls: string[] = [];
      try {
        mediaUrls = await Promise.all(mediaFiles.map(file => uploadToCloudinary(file)));
      } catch (uploadErr) {
        // Cleanup cover if media upload fails
        await deleteFromCloudinary(coverUrl).catch(console.error);
        throw uploadErr;
      }

      // Create highlight document
      try {
        await addDoc(collection(db, 'highlights'), {
          userId: auth.currentUser.uid,
          label: label.trim(),
          imageUrl: coverUrl,
          mediaUrls: mediaUrls,
          createdAt: serverTimestamp()
        });
      } catch (dbErr) {
        // Cleanup all uploaded media if DB save fails
        await deleteFromCloudinary(coverUrl).catch(console.error);
        await Promise.all(mediaUrls.map(url => deleteFromCloudinary(url).catch(console.error)));
        throw dbErr;
      }

      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'highlights');
      setError('Failed to create highlight. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (isCropping && imagePreview) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col">
        <div className="flex justify-between items-center p-4 text-white z-10 bg-gradient-to-b from-black/50 to-transparent">
          <button onClick={handleCancelCrop} className="p-2">
            <X className="w-6 h-6" />
          </button>
          <span className="font-bold">Crop Cover</span>
          <button onClick={handleCropSave} className="p-2 text-indigo-400 font-bold">
            Done
          </button>
        </div>
        <div className="flex-1 relative">
          <Cropper
            image={imagePreview}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>
      </div>
    );
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl my-auto"
        >
          <div className="flex justify-between items-center p-4 border-b border-zinc-100">
            <h2 className="text-lg font-black text-zinc-900 tracking-tight">New Highlight</h2>
            <button onClick={onClose} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
              <X className="w-5 h-5 text-zinc-500" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {error && (
              <div className="p-3 bg-red-50 text-red-600 text-sm font-bold rounded-xl border border-red-100">
                {error}
              </div>
            )}

            <div className="flex flex-col items-center gap-4">
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="w-24 h-24 rounded-full border-2 border-dashed border-zinc-300 flex items-center justify-center cursor-pointer hover:border-indigo-500 hover:bg-indigo-50 transition-all overflow-hidden relative group"
              >
                {imagePreview ? (
                  <>
                    <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <CropIcon className="w-6 h-6 text-white" />
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center text-zinc-400 group-hover:text-indigo-500">
                    <Upload className="w-6 h-6 mb-1" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Cover</span>
                  </div>
                )}
              </div>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageChange}
                accept="image/*"
                className="hidden"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-widest font-black text-zinc-400 ml-1">Highlight Name</label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Travel, Food"
                maxLength={15}
                className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all font-medium"
                required
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center px-1">
                <label className="text-[10px] uppercase tracking-widest font-black text-zinc-400">Media ({mediaFiles.length})</label>
                <button
                  type="button"
                  onClick={() => mediaInputRef.current?.click()}
                  className="text-[10px] uppercase tracking-widest font-black text-indigo-600 hover:text-indigo-700"
                >
                  + Add More
                </button>
              </div>
              
              <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                {mediaPreviews.map((media, idx) => (
                  <div key={`${media.url}-${idx}`} className="relative w-16 h-16 flex-shrink-0 rounded-xl overflow-hidden border border-zinc-200 group">
                    {media.type === 'video' ? (
                      <video src={media.url} className="w-full h-full object-cover" />
                    ) : (
                      <img src={media.url} className="w-full h-full object-cover" />
                    )}
                    <button
                      type="button"
                      onClick={() => removeMedia(idx)}
                      className="absolute top-1 right-1 bg-black/50 p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => mediaInputRef.current?.click()}
                  className="w-16 h-16 flex-shrink-0 rounded-xl border-2 border-dashed border-zinc-300 flex items-center justify-center hover:border-indigo-500 hover:bg-indigo-50 transition-colors text-zinc-400 hover:text-indigo-500"
                >
                  <ImagePlus className="w-5 h-5" />
                </button>
              </div>
              <input
                type="file"
                ref={mediaInputRef}
                onChange={handleMediaChange}
                accept="image/*,video/*"
                multiple
                className="hidden"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-zinc-900 text-white font-black uppercase tracking-widest text-xs rounded-xl hover:bg-zinc-800 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Highlight'}
            </button>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
