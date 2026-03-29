import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { getOptimizedImageUrl } from '../utils/cloudinary';

interface UserAvatarProps {
  userId: string;
  size?: number;
  className?: string;
  fallbackPhoto?: string;
  fallbackName?: string;
  shape?: 'circle' | 'squircle';
}

export default function UserAvatar({ userId, size, className = '', fallbackPhoto, fallbackName, shape = 'circle' }: UserAvatarProps) {
  const [photoURL, setPhotoURL] = useState<string | null>(fallbackPhoto || null);
  const [displayName, setDisplayName] = useState<string | null>(fallbackName || null);

  useEffect(() => {
    if (!userId) return;

    const unsubscribe = onSnapshot(doc(db, 'users', userId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setPhotoURL(data.photoURL || null);
        setDisplayName(data.displayName || null);
      }
    });

    return () => unsubscribe();
  }, [userId]);

  const avatarSize = size || 40;
  const optimizedUrl = photoURL ? getOptimizedImageUrl(photoURL, avatarSize * 2, avatarSize * 2) : null;

  const shapeClass = shape === 'squircle' ? 'rounded-[32%]' : 'rounded-full';

  return (
    <div 
      className={`${shapeClass} bg-zinc-200 dark:bg-zinc-800 overflow-hidden shrink-0 flex items-center justify-center ${className}`}
      style={size ? { width: size, height: size } : {}}
    >
      {optimizedUrl ? (
        <img 
          src={optimizedUrl} 
          alt={displayName || 'User'} 
          className="w-full h-full object-cover" 
          referrerPolicy="no-referrer" 
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-zinc-500 font-medium" style={{ fontSize: avatarSize * 0.4 }}>
          {displayName ? displayName.charAt(0).toUpperCase() : '?'}
        </div>
      )}
    </div>
  );
}
