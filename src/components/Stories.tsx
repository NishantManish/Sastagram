import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc, Timestamp, updateDoc, arrayUnion, increment, getDocs, setDoc, writeBatch } from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import { db, auth, storage } from '../firebase';
import { handleFirestoreError, OperationType } from '../utils/firestore';
import { Story } from '../types';
import { Plus, X, Trash2, Send, Eye, Heart } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { useBlocks } from '../services/blockService';
import { getOptimizedImageUrl } from '../utils/cloudinary';
import { deleteFromCloudinary } from '../utils/media';
import UserAvatar from './UserAvatar';
import { getDoc } from 'firebase/firestore';
import { cn } from '../utils';

function ViewerItem({ userId, isLiked }: { userId: string, isLiked?: boolean }) {
  const [name, setName] = useState('User');
  
  useEffect(() => {
    getDoc(doc(db, 'users', userId)).then(snap => {
      if (snap.exists()) {
        setName(snap.data().displayName || 'User');
      }
    });
  }, [userId]);

  return (
    <div className="flex items-center justify-between w-full">
      <div className="flex items-center gap-3">
        <UserAvatar userId={userId} size={40} />
        <span className="font-medium text-zinc-900">{name}</span>
      </div>
      {isLiked && <Heart className="w-5 h-5 text-red-500 fill-red-500" />}
    </div>
  );
}

export default function Stories({ onNavigate }: { onNavigate?: (tab: string, initialType?: 'post' | 'story') => void }) {
  const [groupedStories, setGroupedStories] = useState<Record<string, Story[]>>({});
  const [activeUserStories, setActiveUserStories] = useState<Story[] | null>(null);
  const [currentStoryIndex, setCurrentStoryIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const [storyToDelete, setStoryToDelete] = useState<{ id: string, imageUrl?: string, videoUrl?: string } | null>(null);
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [isLiking, setIsLiking] = useState(false);
  const [showHeartAnimation, setShowHeartAnimation] = useState(false);
  
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
            if (story.imageUrl && (story.imageUrl.includes('firebasestorage.googleapis.com') || story.imageUrl.startsWith('gs://'))) {
              const imageRef = ref(storage, story.imageUrl);
              deleteObject(imageRef).catch(console.error);
            } else if (story.imageUrl && story.imageUrl.includes('cloudinary.com')) {
              deleteFromCloudinary(story.imageUrl).catch(console.error);
            }
            if (story.videoUrl && story.videoUrl.includes('cloudinary.com')) {
              deleteFromCloudinary(story.videoUrl).catch(console.error);
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

  const holdTimer = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoDuration, setVideoDuration] = useState<number>(5000);

  const handleNextStory = () => {
    if (!activeUserStories) return;
    if (currentStoryIndex < activeUserStories.length - 1) {
      setCurrentStoryIndex(prev => prev + 1);
      setProgress(0);
      setVideoDuration(5000);
    } else {
      setActiveUserStories(null);
      setCurrentStoryIndex(0);
      setProgress(0);
      setVideoDuration(5000);
    }
  };

  const handlePrevStory = () => {
    if (currentStoryIndex > 0) {
      setCurrentStoryIndex(prev => prev - 1);
      setProgress(0);
      setVideoDuration(5000);
    }
  };

  const activeStory = activeUserStories ? activeUserStories[currentStoryIndex] : null;

  useEffect(() => {
    if (!activeUserStories || isPaused) return;

    let storyDuration = 5000; // Default 5 seconds
    
    if (activeStory && (activeStory.mediaType === 'video' || activeStory.videoUrl)) {
      storyDuration = videoDuration;
    }

    const intervalTime = 50; // Update every 50ms
    const step = (intervalTime / storyDuration) * 100;

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
  }, [activeUserStories, isPaused, currentStoryIndex, activeStory, videoDuration]);

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

  const handleDeleteStory = (storyId: string, imageUrl?: string, videoUrl?: string) => {
    setIsPaused(true);
    setStoryToDelete({ id: storyId, imageUrl, videoUrl });
  };

  const confirmDeleteStory = async () => {
    if (!storyToDelete) return;
    try {
      await deleteDoc(doc(db, 'stories', storyToDelete.id));
      try {
        if (storyToDelete.imageUrl && (storyToDelete.imageUrl.includes('firebasestorage.googleapis.com') || storyToDelete.imageUrl.startsWith('gs://'))) {
          const imageRef = ref(storage, storyToDelete.imageUrl);
          await deleteObject(imageRef);
        } else if (storyToDelete.imageUrl && storyToDelete.imageUrl.includes('cloudinary.com')) {
          await deleteFromCloudinary(storyToDelete.imageUrl);
        }
        if (storyToDelete.videoUrl && storyToDelete.videoUrl.includes('cloudinary.com')) {
          await deleteFromCloudinary(storyToDelete.videoUrl);
        }
      } catch (storageError) {
        console.error('Error deleting story image from storage:', storageError);
      }
      setStoryToDelete(null);
      setIsPaused(false);
      handleNextStory();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `stories/${storyToDelete.id}`);
    }
  };

  const cancelDeleteStory = () => {
    setStoryToDelete(null);
    setIsPaused(false);
  };

  const handleToggleLike = async () => {
    if (!activeStory || !auth.currentUser || isLiking) return;

    const isLiked = activeStory.likedBy?.includes(auth.currentUser.uid);
    const userId = auth.currentUser.uid;

    // Optimistic UI update
    const updatedStory = {
      ...activeStory,
      likedBy: isLiked 
        ? (activeStory.likedBy || []).filter(id => id !== userId)
        : [...(activeStory.likedBy || []), userId],
      likesCount: (activeStory.likesCount || 0) + (isLiked ? -1 : 1)
    };

    // Update local state for immediate feedback
    if (activeUserStories) {
      const newStories = [...activeUserStories];
      newStories[currentStoryIndex] = updatedStory;
      setActiveUserStories(newStories);
    }

    setIsLiking(true);
    const storyRef = doc(db, 'stories', activeStory.id);
    const likeId = `${activeStory.id}_${userId}`;
    const likeRef = doc(db, 'storyLikes', likeId);
    const batch = writeBatch(db);

    try {
      if (isLiked) {
        // Unlike
        batch.delete(likeRef);
        batch.update(storyRef, {
          likedBy: updatedStory.likedBy,
          likesCount: increment(-1)
        });
      } else {
        // Like
        batch.set(likeRef, {
          storyId: activeStory.id,
          userId: userId,
          createdAt: serverTimestamp()
        });
        batch.update(storyRef, {
          likedBy: arrayUnion(userId),
          likesCount: increment(1)
        });

        // Send notification
        if (activeStory.authorId !== userId) {
          const notificationRef = doc(collection(db, 'notifications'));
          batch.set(notificationRef, {
            userId: activeStory.authorId,
            type: 'like',
            senderId: userId,
            senderName: auth.currentUser.displayName || 'Someone',
            senderPhoto: auth.currentUser.photoURL || '',
            postId: activeStory.id,
            storyId: activeStory.id,
            read: false,
            createdAt: serverTimestamp()
          });
        }

        setShowHeartAnimation(true);
        setTimeout(() => setShowHeartAnimation(false), 1000);
      }
      await batch.commit();
    } catch (error) {
      // Rollback on error
      if (activeUserStories) {
        const rollbackStories = [...activeUserStories];
        rollbackStories[currentStoryIndex] = activeStory;
        setActiveUserStories(rollbackStories);
      }
      handleFirestoreError(error, OperationType.WRITE, 'story_like');
    } finally {
      setIsLiking(false);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !activeStory || !auth.currentUser || isSendingReply) return;

    setIsSendingReply(true);
    const batch = writeBatch(db);
    try {
      // Find or create chat
      const q = query(
        collection(db, 'chats'),
        where('participants', 'array-contains', auth.currentUser.uid)
      );
      const snap = await getDocs(q);
      
      // Look for a 1:1 chat with the author
      let chat = snap.docs.find(doc => {
        const data = doc.data();
        return data.participants.length === 2 && data.participants.includes(activeStory.authorId);
      });
      
      let chatId: string;
      if (!chat) {
        const newChatRef = doc(collection(db, 'chats'));
        chatId = newChatRef.id;
        batch.set(newChatRef, {
          participants: [auth.currentUser.uid, activeStory.authorId],
          updatedAt: serverTimestamp(),
          lastMessage: replyText.trim(),
          lastMessageTime: serverTimestamp(),
          lastMessageSenderId: auth.currentUser.uid,
          readStatus: {
            [auth.currentUser.uid]: true,
            [activeStory.authorId]: false
          }
        });
      } else {
        chatId = chat.id;
        batch.update(doc(db, 'chats', chatId), {
          lastMessage: replyText.trim(),
          lastMessageTime: serverTimestamp(),
          lastMessageSenderId: auth.currentUser.uid,
          updatedAt: serverTimestamp(),
          [`readStatus.${activeStory.authorId}`]: false,
          [`readStatus.${auth.currentUser.uid}`]: true
        });
      }

      // Send message
      const newMessageRef = doc(collection(db, `chats/${chatId}/messages`));
      batch.set(newMessageRef, {
        chatId,
        senderId: auth.currentUser.uid,
        text: replyText.trim(),
        sharedStoryId: activeStory.id,
        sharedStoryPreviewUrl: activeStory.imageUrl || activeStory.videoUrl,
        sharedStoryMediaType: activeStory.mediaType,
        createdAt: serverTimestamp()
      });

      // Send notification
      const notificationRef = doc(collection(db, 'notifications'));
      batch.set(notificationRef, {
        userId: activeStory.authorId,
        type: 'message',
        senderId: auth.currentUser.uid,
        senderName: auth.currentUser.displayName || 'Someone',
        senderPhoto: auth.currentUser.photoURL || '',
        chatId: chatId,
        storyId: activeStory.id,
        read: false,
        createdAt: serverTimestamp()
      });

      await batch.commit();
      setReplyText('');
      setIsPaused(false);
    } catch (error) {
      console.error('Error in handleSendReply:', error);
      handleFirestoreError(error, OperationType.WRITE, 'chats/messages');
    } finally {
      setIsSendingReply(false);
    }
  };

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
          <div 
            className={cn(
              "relative w-16 h-16 rounded-full p-[2px] transition-all duration-300 cursor-pointer",
              groupedStories[auth.currentUser?.uid || ''] 
                ? "bg-gradient-to-tr from-indigo-600 to-purple-600 active:scale-95" 
                : "bg-zinc-200 group-hover:bg-zinc-300"
            )}
            onClick={() => {
              const myStories = groupedStories[auth.currentUser?.uid || ''];
              if (myStories) {
                setActiveUserStories(myStories);
                setCurrentStoryIndex(0);
              } else {
                onNavigate?.('create', 'story');
              }
            }}
          >
            <div className="w-full h-full rounded-full bg-white p-[2px]">
              <div className="w-full h-full rounded-full bg-zinc-100 overflow-hidden relative">
                <UserAvatar 
                  userId={auth.currentUser?.uid || ''} 
                  className="w-full h-full"
                />
              </div>
            </div>
            <div 
              className="absolute bottom-0 right-0 w-5 h-5 bg-indigo-600 rounded-full border-2 border-white flex items-center justify-center cursor-pointer hover:bg-indigo-700 transition-colors z-20"
              onClick={(e) => {
                e.stopPropagation();
                onNavigate?.('create', 'story');
              }}
            >
              <Plus className="w-3.5 h-3.5 text-white" />
            </div>
          </div>
          <span className="text-[11px] text-zinc-500 font-medium">Your Story</span>
        </div>

        {/* Stories List */}
        {Object.values(groupedStories)
          .filter(userStories => {
            const authorId = userStories[0].authorId;
            // Don't show current user's story here as it's shown in the "Add Story" slot
            return authorId !== auth.currentUser?.uid && !blockedIds.includes(authorId) && !blockedByIds.includes(authorId);
          })
          .map((userStories, uIdx) => {
            const firstStory = userStories[0];
          return (
            <div 
              key={`${firstStory.authorId}-${uIdx}`} 
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

      {/* Story Viewer Modal */}
      <AnimatePresence>
        {activeStory && activeUserStories && (
          <motion.div
            key="story-viewer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black flex flex-col"
          >
            {/* Progress Bars */}
            <div className="absolute top-0 left-0 right-0 p-2 flex gap-1 z-20 pt-safe">
              {activeUserStories.map((s, idx) => (
                <div key={`${s.id}-${idx}`} className="h-1 bg-white/30 rounded-full flex-1 overflow-hidden">
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
                    onClick={() => handleDeleteStory(activeStory.id, activeStory.imageUrl, activeStory.videoUrl)}
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

            {/* Image/Video and Navigation */}
            <div 
              className="flex-1 flex items-center justify-center relative touch-none"
              onPointerDown={handlePointerDown}
              onPointerUp={handlePointerUp}
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (!activeStory?.likedBy?.includes(auth.currentUser?.uid || '')) {
                  handleToggleLike();
                } else {
                  setShowHeartAnimation(true);
                  setTimeout(() => setShowHeartAnimation(false), 1000);
                }
              }}
            >
              {activeStory.mediaType === 'video' || activeStory.videoUrl || (activeStory.imageUrl && (activeStory.imageUrl.match(/\.(mp4|webm|ogg|mov)$/i) || activeStory.imageUrl.includes('/video/upload/'))) ? (
                <video 
                  ref={videoRef}
                  src={activeStory.videoUrl || activeStory.imageUrl} 
                  autoPlay
                  playsInline
                  onEnded={handleNextStory}
                  onLoadedMetadata={(e) => {
                    const video = e.target as HTMLVideoElement;
                    if (video.duration && !isNaN(video.duration)) {
                      setVideoDuration(video.duration * 1000);
                    }
                  }}
                  className="max-w-full max-h-full object-contain pointer-events-none"
                />
              ) : (
                <img 
                  src={getOptimizedImageUrl(activeStory.imageUrl, 1080)} 
                  alt="Story" 
                  className="max-w-full max-h-full object-contain pointer-events-none"
                />
              )}

              {/* Heart Animation */}
              <AnimatePresence>
                {showHeartAnimation && (
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1.5, opacity: 1 }}
                    exit={{ scale: 2, opacity: 0 }}
                    className="absolute z-50 pointer-events-none"
                  >
                    <Heart className="w-24 h-24 text-white fill-white drop-shadow-2xl" />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Reply Input */}
            {activeStory.authorId !== auth.currentUser?.uid && (
              <div className="absolute bottom-0 left-0 right-0 p-4 pb-8 bg-gradient-to-t from-black/80 via-black/40 to-transparent z-20">
                <form onSubmit={handleSendReply} className="flex items-center gap-3">
                  <div className="flex-1 relative">
                    <input
                      type="text"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onFocus={() => setIsPaused(true)}
                      onBlur={() => setIsPaused(false)}
                      placeholder="Send message..."
                      className="w-full bg-white/10 border border-white/30 rounded-full py-3 px-6 text-white text-sm placeholder:text-white/60 focus:outline-none focus:bg-white/20 focus:border-white/50 transition-all backdrop-blur-md"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleLike}
                    className="p-2 text-white active:scale-90 transition-all"
                  >
                    <Heart 
                      className={cn(
                        "w-7 h-7 transition-colors",
                        activeStory.likedBy?.includes(auth.currentUser?.uid || '') 
                          ? "fill-red-500 text-red-500" 
                          : "text-white"
                      )} 
                    />
                  </button>
                  <button
                    type="submit"
                    disabled={!replyText.trim() || isSendingReply}
                    className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-black active:scale-90 transition-all disabled:opacity-50 shadow-lg"
                  >
                    <Send className="w-6 h-6" />
                  </button>
                </form>
              </div>
            )}

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
                  key="viewers-modal"
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
                        {Array.from(new Set(activeStory.viewers || [])).map((viewerId, idx) => (
                          <div key={`${viewerId}-${idx}`}>
                            <ViewerItem userId={viewerId} isLiked={activeStory.likedBy?.includes(viewerId)} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Delete Confirmation Modal */}
            <AnimatePresence>
              {storyToDelete && (
                <motion.div
                  key="delete-modal"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
                >
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0, y: 10 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.9, opacity: 0, y: 10 }}
                    className="bg-white rounded-[28px] p-6 max-w-[280px] w-full shadow-2xl text-center"
                  >
                    <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Trash2 className="w-6 h-6 text-red-500" />
                    </div>
                    <h3 className="text-lg font-bold text-zinc-900 mb-1.5">Delete Story?</h3>
                    <p className="text-zinc-500 text-xs mb-6 leading-relaxed">
                      This will permanently remove your story. This action cannot be undone.
                    </p>
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={confirmDeleteStory}
                        className="w-full py-3 bg-red-500 hover:bg-red-600 text-white text-sm font-bold rounded-xl transition-all active:scale-[0.98] shadow-lg shadow-red-200"
                      >
                        Delete Story
                      </button>
                      <button
                        onClick={cancelDeleteStory}
                        className="w-full py-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-900 text-sm font-bold rounded-xl transition-all active:scale-[0.98]"
                      >
                        Cancel
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
