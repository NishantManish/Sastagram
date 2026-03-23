import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc, Timestamp, updateDoc, arrayUnion, increment } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, auth, storage } from '../firebase';
import { handleFirestoreError, OperationType } from '../utils/firestore';
import { Story } from '../types';
import { Plus, X, Trash2, Send, Eye } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { useBlocks } from '../services/blockService';
import { getOptimizedImageUrl } from '../utils/cloudinary';
import UserAvatar from './UserAvatar';
import { getDoc } from 'firebase/firestore';

function ViewerItem({ userId }: { userId: string }) {
  const [name, setName] = useState('User');
  
  useEffect(() => {
    getDoc(doc(db, 'users', userId)).then(snap => {
      if (snap.exists()) {
        setName(snap.data().displayName || 'User');
      }
    });
  }, [userId]);

  return (
    <div className="flex items-center gap-3">
      <UserAvatar userId={userId} size={40} />
      <span className="font-medium text-zinc-900">{name}</span>
    </div>
  );
}

export default function Stories() {
  const [groupedStories, setGroupedStories] = useState<Record<string, Story[]>>({});
  const [activeUserStories, setActiveUserStories] = useState<Story[] | null>(null);
  const [currentStoryIndex, setCurrentStoryIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const { blockedIds, blockedByIds } = useBlocks(auth.currentUser?.uid);

  useEffect(() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const q = query(
      collection(db, 'stories'),
      where('createdAt', '>=', yesterday),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedStories = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      })) as Story[];
      
      const now = new Date();
      const validStories = fetchedStories.filter(story => {
        if (story.expiresAt && story.expiresAt.toDate() < now) {
          // Only the author should delete their own expired stories to avoid permission errors
          if (auth.currentUser && story.authorId === auth.currentUser.uid) {
            deleteDoc(doc(db, 'stories', story.id)).catch((err) => {
              handleFirestoreError(err, OperationType.DELETE, `stories/${story.id}`);
            });
            if (story.imageUrl) {
              const imageRef = ref(storage, story.imageUrl);
              deleteObject(imageRef).catch(console.error);
            }
          }
          return false;
        }
        return true;
      });

      const grouped = validStories.reduce((acc, story) => {
        if (!acc[story.authorId]) acc[story.authorId] = [];
        acc[story.authorId].push(story);
        return acc;
      }, {} as Record<string, Story[]>);
      
      Object.keys(grouped).forEach(key => {
        grouped[key].sort((a, b) => (a.createdAt?.toMillis() || 0) - (b.createdAt?.toMillis() || 0));
      });

      setGroupedStories(grouped);
    }, (error) => {
      if (error.message.includes('permission')) {
        console.warn('Permission denied on stories query. This is expected if blocked users are in the results.');
      } else {
        handleFirestoreError(error, OperationType.LIST, 'stories');
      }
    });

    return () => unsubscribe();
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreviewFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleUpload = async () => {
    if (!previewFile || !auth.currentUser) return;

    setIsUploading(true);
    try {
      const storageRef = ref(storage, `stories/${auth.currentUser.uid}/${Date.now()}_${previewFile.name}`);
      const snapshot = await uploadBytes(storageRef, previewFile);
      const downloadURL = await getDownloadURL(snapshot.ref);
      
      const expiresAtDate = new Date();
      expiresAtDate.setHours(expiresAtDate.getHours() + 24);

      await addDoc(collection(db, 'stories'), {
        authorId: auth.currentUser.uid,
        authorName: auth.currentUser.displayName || 'Anonymous',
        authorPhoto: auth.currentUser.photoURL || '',
        imageUrl: downloadURL,
        createdAt: serverTimestamp(),
        expiresAt: Timestamp.fromDate(expiresAtDate)
      });
      
      setPreviewFile(null);
      setPreviewUrl(null);
      setIsUploading(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'stories');
      setIsUploading(false);
    }
  };

  const holdTimer = useRef<number | null>(null);

  const handleNextStory = () => {
    if (!activeUserStories) return;
    if (currentStoryIndex < activeUserStories.length - 1) {
      setCurrentStoryIndex(prev => prev + 1);
      setProgress(0);
    } else {
      setActiveUserStories(null);
      setCurrentStoryIndex(0);
      setProgress(0);
    }
  };

  const handlePrevStory = () => {
    if (currentStoryIndex > 0) {
      setCurrentStoryIndex(prev => prev - 1);
      setProgress(0);
    }
  };

  useEffect(() => {
    if (!activeUserStories || isPaused) return;

    const STORY_DURATION = 5000; // 5 seconds
    const intervalTime = 50; // Update every 50ms
    const step = (intervalTime / STORY_DURATION) * 100;

    const timer = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          handleNextStory();
          return 0;
        }
        return prev + step;
      });
    }, intervalTime);

    return () => clearInterval(timer);
  }, [activeUserStories, isPaused, currentStoryIndex]);

  const handlePointerDown = () => {
    holdTimer.current = Date.now();
    setIsPaused(true);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const duration = Date.now() - (holdTimer.current || 0);
    setIsPaused(false);
    
    // If it was a quick tap (less than 200ms), handle navigation
    if (duration < 200) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const x = e.clientX - rect.left;
      
      if (x > rect.width / 2) {
        handleNextStory();
      } else {
        handlePrevStory();
      }
    }
  };

  const handleDeleteStory = async (storyId: string, imageUrl: string) => {
    try {
      await deleteDoc(doc(db, 'stories', storyId));
      try {
        const imageRef = ref(storage, imageUrl);
        await deleteObject(imageRef);
      } catch (storageError) {
        console.error('Error deleting story image from storage:', storageError);
      }
      handleNextStory();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `stories/${storyId}`);
    }
  };

  const activeStory = activeUserStories ? activeUserStories[currentStoryIndex] : null;

  useEffect(() => {
    if (activeStory && auth.currentUser && activeStory.authorId !== auth.currentUser.uid) {
      const hasViewed = activeStory.viewers?.includes(auth.currentUser.uid);
      if (!hasViewed) {
        const storyRef = doc(db, 'stories', activeStory.id);
        updateDoc(storyRef, {
          viewers: arrayUnion(auth.currentUser.uid),
          viewsCount: increment(1)
        }).catch(err => {
          console.error('Failed to update story views:', err);
        });
      }
    }
  }, [activeStory]);

  return (
    <div className="bg-white border-b border-zinc-100 py-4 px-4 overflow-x-auto no-scrollbar">
      <div className="flex gap-4 items-center">
        {/* Add Story Button */}
        <div className="flex flex-col items-center gap-1.5 shrink-0 group">
          <div className="relative w-16 h-16 rounded-full p-[2px] bg-zinc-200 group-hover:bg-gradient-to-tr group-hover:from-indigo-600 group-hover:to-purple-600 transition-all duration-300">
            <div className="w-full h-full rounded-full bg-white p-[2px]">
              <div className="w-full h-full rounded-full bg-zinc-100 overflow-hidden relative">
                <UserAvatar 
                  userId={auth.currentUser?.uid || ''} 
                  className="w-full h-full"
                />
                <label className="absolute inset-0 bg-black/10 flex items-center justify-center cursor-pointer hover:bg-black/20 transition-colors">
                  <Plus className="w-5 h-5 text-white" />
                  <input 
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    onChange={handleFileSelect}
                  />
                </label>
              </div>
            </div>
          </div>
          <span className="text-[11px] text-zinc-500 font-medium">Your Story</span>
        </div>

        {/* Stories List */}
        {Object.values(groupedStories)
          .filter(userStories => {
            const authorId = userStories[0].authorId;
            return !blockedIds.includes(authorId) && !blockedByIds.includes(authorId);
          })
          .map(userStories => {
            const firstStory = userStories[0];
          return (
            <div 
              key={firstStory.authorId} 
              className="flex flex-col items-center gap-1.5 shrink-0 cursor-pointer group"
              onClick={() => {
                setActiveUserStories(userStories);
                setCurrentStoryIndex(0);
              }}
            >
              <div className="relative w-16 h-16 rounded-full p-[2px] bg-gradient-to-tr from-indigo-600 to-purple-600 active:scale-95 transition-transform">
                <div className="w-full h-full rounded-full bg-white p-[2px]">
                  <div className="w-full h-full rounded-full bg-zinc-100 overflow-hidden">
                    <UserAvatar 
                      userId={firstStory.authorId} 
                      className="w-full h-full"
                    />
                  </div>
                </div>
              </div>
              <span className="text-[11px] text-zinc-500 font-medium truncate w-16 text-center">
                {firstStory.authorName.split(' ')[0]}
              </span>
            </div>
          );
        })}
      </div>

      {/* Preview Modal */}
      <AnimatePresence>
        {previewUrl && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed inset-0 z-[100] bg-black flex flex-col"
          >
            <div className="absolute top-4 left-0 right-0 p-4 flex items-center justify-between z-10">
              <button 
                onClick={() => {
                  setPreviewFile(null);
                  setPreviewUrl(null);
                }}
                className="p-2 text-white bg-black/50 rounded-full hover:bg-black/70 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="flex-1 flex items-center justify-center bg-zinc-900">
              <img src={previewUrl} alt="Preview" className="max-w-full max-h-full object-contain" />
            </div>
            <div className="p-4 bg-black flex justify-end">
              <button
                onClick={handleUpload}
                disabled={isUploading}
                className="py-3 px-6 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-full flex items-center gap-2 disabled:opacity-70"
              >
                {isUploading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    Share Story <Send className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Story Viewer Modal */}
      <AnimatePresence>
        {activeStory && activeUserStories && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black flex flex-col"
          >
            {/* Progress Bars */}
            <div className="absolute top-0 left-0 right-0 p-2 flex gap-1 z-20 pt-safe">
              {activeUserStories.map((s, idx) => (
                <div key={s.id} className="h-1 bg-white/30 rounded-full flex-1 overflow-hidden">
                  {idx === currentStoryIndex ? (
                    <div 
                      className="h-full bg-white transition-all duration-75 ease-linear"
                      style={{ width: `${progress}%` }}
                    />
                  ) : idx < currentStoryIndex ? (
                    <div className="h-full w-full bg-white" />
                  ) : (
                    <div className="h-full w-0 bg-white" />
                  )}
                </div>
              ))}
            </div>

            {/* Header */}
            <div className="absolute top-4 left-0 right-0 p-4 pt-8 flex items-center justify-between z-10 bg-gradient-to-b from-black/50 to-transparent">
              <div className="flex items-center gap-2">
                <UserAvatar 
                  userId={activeStory.authorId} 
                  size={32}
                />
                <div>
                  <div className="text-white font-medium text-sm drop-shadow-md">{activeStory.authorName}</div>
                  <div className="text-white/80 text-xs drop-shadow-md">
                    {activeStory.createdAt ? formatDistanceToNow(activeStory.createdAt.toDate(), { addSuffix: true }) : 'Just now'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {activeStory.authorId === auth.currentUser?.uid && (
                  <button 
                    onClick={() => handleDeleteStory(activeStory.id, activeStory.imageUrl)}
                    className="p-2 text-white/80 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-6 h-6" />
                  </button>
                )}
                <button 
                  onClick={() => {
                    setActiveUserStories(null);
                    setCurrentStoryIndex(0);
                  }}
                  className="p-2 text-white/80 hover:text-white transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Image and Navigation */}
            <div 
              className="flex-1 flex items-center justify-center relative touch-none"
              onPointerDown={handlePointerDown}
              onPointerUp={handlePointerUp}
            >
              <img 
                src={getOptimizedImageUrl(activeStory.imageUrl, 1080)} 
                alt="Story" 
                className="max-w-full max-h-full object-contain pointer-events-none"
              />
            </div>

            {/* Viewers Button (Only for author) */}
            {activeStory.authorId === auth.currentUser?.uid && (
              <div className="absolute bottom-4 left-0 right-0 flex justify-center z-20">
                <button
                  onClick={() => {
                    setIsPaused(true);
                    setShowViewers(true);
                  }}
                  className="flex items-center gap-2 bg-black/50 hover:bg-black/70 text-white px-4 py-2 rounded-full backdrop-blur-md transition-colors"
                >
                  <Eye className="w-5 h-5" />
                  <span className="font-medium">{activeStory.viewsCount || 0} Views</span>
                </button>
              </div>
            )}

            {/* Viewers Modal */}
            <AnimatePresence>
              {showViewers && (
                <motion.div
                  initial={{ opacity: 0, y: '100%' }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: '100%' }}
                  transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                  className="absolute inset-x-0 bottom-0 top-1/3 bg-white rounded-t-3xl z-30 flex flex-col overflow-hidden shadow-2xl"
                >
                  <div className="p-4 border-b border-zinc-100 flex items-center justify-between bg-white sticky top-0 z-10">
                    <h3 className="font-bold text-lg">Viewers</h3>
                    <button 
                      onClick={() => {
                        setShowViewers(false);
                        setIsPaused(false);
                      }}
                      className="p-2 bg-zinc-100 rounded-full hover:bg-zinc-200 transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4">
                    {(!activeStory.viewers || activeStory.viewers.length === 0) ? (
                      <div className="flex flex-col items-center justify-center h-full text-zinc-500">
                        <Eye className="w-12 h-12 mb-2 opacity-20" />
                        <p>No views yet</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {activeStory.viewers.map(viewerId => (
                          <div key={viewerId}>
                            <ViewerItem userId={viewerId} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
