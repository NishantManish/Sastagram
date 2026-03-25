import React, { useState, FormEvent, useRef, useCallback } from 'react';
import { doc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { handleFirestoreError, OperationType } from '../utils/firestore';
import { User } from '../types';
import { Loader2, X, Camera, Upload, Check, Scissors } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getOptimizedImageUrl } from '../utils/cloudinary';
import { deleteFromCloudinary } from '../utils/media';
import Cropper, { Area, Point } from 'react-easy-crop';
import getCroppedImg from '../utils/cropImage';

interface EditProfileModalProps {
  userProfile: User;
  onClose: () => void;
}

export default function EditProfileModal({ userProfile, onClose }: EditProfileModalProps) {
  const [displayName, setDisplayName] = useState(userProfile.displayName || '');
  const [username, setUsername] = useState(userProfile.username || '');
  const [bio, setBio] = useState(userProfile.bio || '');
  const [photoURL, setPhotoURL] = useState(userProfile.photoURL || '');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>(userProfile.photoURL || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cropping state
  const [isCropping, setIsCropping] = useState(false);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [tempImageSrc, setTempImageSrc] = useState<string | null>(null);

  const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 5 * 1024 * 1024) { // Increased limit for cropping
        setError('Image is too large. Max size is 5MB.');
        return;
      }
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        setTempImageSrc(reader.result as string);
        setIsCropping(true);
      });
      reader.readAsDataURL(file);
      setError(null);
    }
  };

  const confirmCrop = async () => {
    if (!tempImageSrc || !croppedAreaPixels) return;

    try {
      const croppedImageBlob = await getCroppedImg(tempImageSrc, croppedAreaPixels);
      if (croppedImageBlob) {
        const file = new File([croppedImageBlob], 'profile-photo.jpg', { type: 'image/jpeg' });
        setImageFile(file);
        setImagePreview(URL.createObjectURL(croppedImageBlob));
        setIsCropping(false);
        setTempImageSrc(null);
      }
    } catch (e) {
      console.error(e);
      setError('Failed to crop image');
    }
  };

  const checkUsernameUnique = async (usernameToCheck: string) => {
    if (usernameToCheck === userProfile.username) return true;
    const q = query(collection(db, 'users'), where('username', '==', usernameToCheck.toLowerCase()));
    const snapshot = await getDocs(q);
    return snapshot.empty;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;

    setLoading(true);
    setError(null);

    if (username.length < 3) {
      setError('Username must be at least 3 characters long.');
      setLoading(false);
      return;
    }

    const isUnique = await checkUsernameUnique(username);
    if (!isUnique) {
      setError('Username is already taken. Please choose another one.');
      setLoading(false);
      return;
    }

    try {
      let finalPhotoURL = photoURL;

      if (imageFile) {
        const formData = new FormData();
        formData.append('file', imageFile);
        formData.append('upload_preset', (import.meta as any).env.VITE_CLOUDINARY_UPLOAD_PRESET);
        formData.append('tags', `user_${auth.currentUser.uid},profile_photo`);
        
        const response = await fetch(
          `https://api.cloudinary.com/v1_1/${(import.meta as any).env.VITE_CLOUDINARY_CLOUD_NAME}/upload`,
          { method: 'POST', body: formData }
        );
        
        if (!response.ok) {
          throw new Error('Failed to upload profile picture');
        }
        
        const data = await response.json();
        finalPhotoURL = data.secure_url;

        // Delete old photo from Cloudinary if it exists
        if (userProfile.photoURL && userProfile.photoURL !== finalPhotoURL) {
          await deleteFromCloudinary(userProfile.photoURL);
        }
      }

      const userRef = doc(db, 'users', auth.currentUser.uid);
      await updateDoc(userRef, {
        displayName: displayName.trim(),
        username: username.toLowerCase(),
        bio: bio.trim(),
        photoURL: finalPhotoURL,
      });
      onClose();
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${auth.currentUser?.uid}`);
      setError(err.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: "spring", duration: 0.5, bounce: 0 }}
        className="relative w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden"
      >
        <div className="flex items-center justify-between p-4 border-b border-zinc-200">
          <h3 className="font-semibold text-zinc-900">Edit Profile</h3>
          <button 
            onClick={onClose}
            className="p-1 text-zinc-500 hover:text-zinc-900 transition-colors rounded-full hover:bg-zinc-100"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <div className="relative">
          <form onSubmit={handleSubmit} className="p-4 space-y-4 max-h-[80vh] overflow-y-auto">
            {error && (
              <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">
                {error}
              </div>
            )}

            <div className="flex flex-col items-center gap-4 mb-4">
              <div className="relative w-24 h-24 rounded-full bg-zinc-100 border border-zinc-200 overflow-hidden group">
                {imagePreview ? (
                  <img 
                    src={getOptimizedImageUrl(imagePreview, 192, 192)} 
                    alt="Profile" 
                    className="w-full h-full object-cover" 
                    referrerPolicy="no-referrer" 
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-400">
                    <Camera className="w-8 h-8" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white"
                >
                  <Upload className="w-5 h-5" />
                </button>
              </div>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageChange}
                accept="image/*"
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
              >
                Change Profile Photo
              </button>
            </div>

            <div>
              <label htmlFor="displayName" className="block text-sm font-medium text-zinc-700 mb-1">
                Display Name
              </label>
              <input
                type="text"
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="block w-full p-3 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors bg-zinc-50"
                required
                maxLength={50}
              />
            </div>

            <div>
              <label htmlFor="username" className="block text-sm font-medium text-zinc-700 mb-1">
                Username
              </label>
              <input
                type="text"
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value.replace(/\s+/g, '').toLowerCase())}
                className="block w-full p-3 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors bg-zinc-50"
                required
                minLength={3}
                maxLength={30}
              />
            </div>

            <div>
              <label htmlFor="bio" className="block text-sm font-medium text-zinc-700 mb-1">
                Bio
              </label>
              <textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                className="block w-full p-3 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors bg-zinc-50 resize-none"
                maxLength={150}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="flex-1 py-2.5 px-4 bg-zinc-100 hover:bg-zinc-200 text-zinc-900 font-medium rounded-xl transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !displayName.trim()}
                className="flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Save'}
              </button>
            </div>
          </form>

          {/* Cropper Overlay */}
          <AnimatePresence>
            {isCropping && tempImageSrc && (
              <motion.div
                initial={{ opacity: 0, x: '100%' }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: '100%' }}
                className="absolute inset-0 bg-white z-10 flex flex-col"
              >
                <div className="flex items-center justify-between p-4 border-b border-zinc-200">
                  <div className="flex items-center gap-2">
                    <Scissors className="w-5 h-5 text-indigo-600" />
                    <h3 className="font-semibold text-zinc-900">Crop Photo</h3>
                  </div>
                  <button 
                    onClick={() => setIsCropping(false)}
                    className="p-1 text-zinc-500 hover:text-zinc-900 transition-colors rounded-full hover:bg-zinc-100"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
                
                <div className="flex-1 relative bg-zinc-900">
                  <Cropper
                    image={tempImageSrc}
                    crop={crop}
                    zoom={zoom}
                    aspect={1}
                    cropShape="round"
                    showGrid={false}
                    onCropChange={setCrop}
                    onCropComplete={onCropComplete}
                    onZoomChange={setZoom}
                  />
                </div>

                <div className="p-4 bg-white border-t border-zinc-200 space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Zoom</label>
                    <input
                      type="range"
                      value={zoom}
                      min={1}
                      max={3}
                      step={0.1}
                      aria-labelledby="Zoom"
                      onChange={(e) => setZoom(Number(e.target.value))}
                      className="w-full h-2 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setIsCropping(false)}
                      className="flex-1 py-2.5 px-4 bg-zinc-100 hover:bg-zinc-200 text-zinc-900 font-medium rounded-xl transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={confirmCrop}
                      className="flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
                    >
                      <Check className="w-5 h-5" />
                      Done
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
