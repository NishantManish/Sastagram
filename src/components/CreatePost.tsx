import React, { useState, FormEvent, useRef } from 'react';
import { addDoc, collection, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { handleFirestoreError, OperationType } from '../utils/firestore';
import { ImagePlus, Loader2, Upload, Camera, Layout } from 'lucide-react';

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

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      // Check file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setError('File is too large. Max size is 5MB.');
        return;
      }
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
      setError(null);
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
      console.log('Image uploaded successfully to Cloudinary:', downloadURL);

      if (uploadType === 'post') {
        // Create post
        try {
          await addDoc(collection(db, 'posts'), {
            authorId: auth.currentUser.uid,
            authorName: auth.currentUser.displayName || 'Anonymous',
            authorPhoto: auth.currentUser.photoURL || '',
            imageUrl: downloadURL,
            caption: caption.trim(),
            likesCount: 0,
            commentsCount: 0,
            createdAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, 'posts');
        }
      } else {
        // Create story
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
          handleFirestoreError(err, OperationType.CREATE, 'stories');
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

  return (
    <div className="max-w-md mx-auto p-4 pt-8 pb-24">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-zinc-900">Create new</h2>
        <div className="flex bg-zinc-100 p-1 rounded-xl">
          <button
            onClick={() => setUploadType('post')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
              uploadType === 'post' ? 'bg-white text-indigo-600 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            <Layout className="w-4 h-4" />
            Post
          </button>
          <button
            onClick={() => setUploadType('story')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
              uploadType === 'story' ? 'bg-white text-indigo-600 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            <Camera className="w-4 h-4" />
            Story
          </button>
        </div>
      </div>
      
      {error && (
        <div className="p-3 mb-6 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-2">
            Image
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            ref={fileInputRef}
            className="hidden"
          />
          
          {imagePreview ? (
            <div className={`relative w-full ${uploadType === 'story' ? 'aspect-[9/16]' : 'aspect-square'} bg-zinc-100 rounded-xl overflow-hidden border border-zinc-200 group`}>
              <img 
                src={imagePreview} 
                alt="Preview" 
                className="w-full h-full object-cover"
              />
              <div 
                className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="bg-white text-zinc-900 px-4 py-2 rounded-lg font-medium shadow-sm flex items-center gap-2">
                  <Upload className="w-4 h-4" />
                  Change Image
                </div>
              </div>
            </div>
          ) : (
            <div 
              onClick={() => fileInputRef.current?.click()}
              className={`w-full ${uploadType === 'story' ? 'aspect-[9/16]' : 'aspect-square'} bg-zinc-50 border-2 border-dashed border-zinc-300 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-zinc-100 transition-colors`}
            >
              <ImagePlus className="w-12 h-12 text-zinc-400 mb-4" />
              <p className="text-zinc-600 font-medium">Click to upload {uploadType}</p>
              <p className="text-zinc-400 text-sm mt-1">PNG, JPG up to 5MB</p>
            </div>
          )}
        </div>

        {uploadType === 'post' && (
          <div>
            <label htmlFor="caption" className="block text-sm font-medium text-zinc-700 mb-2">
              Caption
            </label>
            <textarea
              id="caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Write a caption..."
              rows={4}
              className="block w-full p-3 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors bg-zinc-50 resize-none"
            />
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !imageFile}
          className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
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
      </form>
    </div>
  );
}
