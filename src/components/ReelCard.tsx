import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { doc, getDoc, setDoc, deleteDoc, updateDoc, serverTimestamp, increment, collection, addDoc, query, where, onSnapshot, orderBy, limit, writeBatch } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Reel, User, Comment } from '../types';
import { Heart, MessageCircle, Send, MoreVertical, Music, UserPlus, Volume2, VolumeX, Play, Pause, Bookmark, X, Trash2, ShieldAlert, Share2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '../utils';
import UserAvatar from './UserAvatar';
import ShareModal from './ShareModal';
import ConfirmationModal from './ConfirmationModal';
import { handleFirestoreError, OperationType } from '../utils/firestore';
import { deleteFromCloudinary } from '../utils/media';

import { useAudio } from '../contexts/AudioContext';

interface ReelCardProps {
  reel: Reel;
  isActive: boolean;
  onNavigate?: (tab: any, initialType?: any) => void;
  onDelete?: (reelId: string) => void;
  isModal?: boolean;
}

export default function ReelCard({ reel, isActive, onNavigate, onDelete, isModal = false }: ReelCardProps) {
  const { isMuted, setIsMuted } = useAudio();
  const [isLiked, setIsLiked] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isFollowing, setIsFollowing] = useState<boolean | null>(null);
  const [showComments, setShowComments] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  
  const handleToggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMuted(!isMuted);
  };

  const [isPlaying, setIsPlaying] = useState(true);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showHeartAnimation, setShowHeartAnimation] = useState(false);
  const [burstHearts, setBurstHearts] = useState<{ id: number; x: number; y: number; rotation: number; scale: number }[]>([]);
  const [commentLikes, setCommentLikes] = useState<Record<string, boolean>>({});
  const [replyingTo, setReplyingTo] = useState<{ id: string; username: string } | null>(null);
  const [commentToDelete, setCommentToDelete] = useState<string | null>(null);
  const [isDeletingComment, setIsDeletingComment] = useState(false);
  const [isFollowClicked, setIsFollowClicked] = useState(false);
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastTap = useRef<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [loading, setLoading] = useState(false);
  const [hasVideoError, setHasVideoError] = useState(false);

  const toggleExpandComment = (commentId: string) => {
    setExpandedComments(prev => {
      const next = new Set(prev);
      if (next.has(commentId)) {
        next.delete(commentId);
      } else {
        next.add(commentId);
      }
      return next;
    });
  };

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
  }, [isMuted]);

  useEffect(() => {
    if (!auth.currentUser || !showComments) return;

    // Check which comments are liked
    const fetchCommentLikes = async () => {
      const likes: Record<string, boolean> = {};
      for (const comment of comments) {
        const likeRef = doc(db, 'reelCommentLikes', `${comment.id}_${auth.currentUser?.uid}`);
        const snap = await getDoc(likeRef);
        likes[comment.id] = snap.exists();
      }
      setCommentLikes(likes);
    };

    fetchCommentLikes();
  }, [showComments, comments]);

  useEffect(() => {
    if (!auth.currentUser) return;

    // Check if liked
    const likeRef = doc(db, 'reelLikes', `${reel.id}_${auth.currentUser.uid}`);
    getDoc(likeRef).then(doc => setIsLiked(doc.exists()));

    // Check if following
    const followRef = doc(db, 'follows', `${auth.currentUser.uid}_${reel.authorId}`);
    getDoc(followRef).then(doc => setIsFollowing(doc.exists()));

    // Check if saved
    const saveRef = doc(db, 'savedPosts', `${auth.currentUser.uid}_${reel.id}`);
    getDoc(saveRef).then(doc => setIsSaved(doc.exists()));
  }, [reel.id, reel.authorId]);

  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video && !audio && hasVideoError) {} // Just to avoid empty blocks if neither exists

    let isMounted = true;

    const playMedia = async () => {
      if (!isActive || !isPlaying) {
        if (video) video.pause();
        if (audio) audio.pause();
        return;
      }

      const promises = [];
      if (video && !hasVideoError) {
        video.muted = isMuted;
        promises.push(video.play().catch(e => {
          if (isMounted && e.name === 'NotSupportedError') {
            setHasVideoError(true);
          } else if (isMounted && e.name !== 'AbortError') {
            console.error('Video play interrupted:', e);
          }
        }));
      }

      if (audio) {
        audio.muted = isMuted;
        promises.push(audio.play().catch(() => {}));
      }

      await Promise.all(promises);
    };

    playMedia();

    return () => {
      isMounted = false;
      if (video) video.pause();
      if (audio) audio.pause();
    };
  }, [isActive, isPlaying, isMuted, hasVideoError]);

  useEffect(() => {
    if (showComments) {
      const q = query(
        collection(db, 'reelComments'),
        where('reelId', '==', reel.id),
        orderBy('createdAt', 'desc'),
        limit(20)
      );
      const unsubscribe = onSnapshot(q, (snapshot) => {
        setComments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Comment)));
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, `reelComments/${reel.id}`);
      });
      return () => unsubscribe();
    }
  }, [showComments, reel.id]);

  useEffect(() => {
    if (showComments && auth.currentUser) {
      const q = query(
        collection(db, 'reelCommentLikes'),
        where('reelId', '==', reel.id),
        where('userId', '==', auth.currentUser.uid)
      );
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const likesMap: Record<string, boolean> = {};
        snapshot.docs.forEach(doc => {
          likesMap[doc.data().commentId] = true;
        });
        setCommentLikes(likesMap);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, `reelCommentLikes/${reel.id}`);
      });
      return () => unsubscribe();
    } else {
      setCommentLikes({});
    }
  }, [showComments, reel.id, auth.currentUser]);

  const handleLike = async () => {
    if (!auth.currentUser) return;
    const likeRef = doc(db, 'reelLikes', `${reel.id}_${auth.currentUser.uid}`);
    const reelRef = doc(db, 'reels', reel.id);
    const batch = writeBatch(db);
    
    try {
      if (isLiked) {
        batch.delete(likeRef);
        batch.update(reelRef, { likesCount: increment(-1) });
        await batch.commit();
        setIsLiked(false);
      } else {
        batch.set(likeRef, {
          reelId: reel.id,
          userId: auth.currentUser.uid,
          createdAt: serverTimestamp()
        });
        batch.update(reelRef, { likesCount: increment(1) });
        await batch.commit();
        setIsLiked(true);

        // Add notification
        if (reel.authorId !== auth.currentUser.uid) {
          await addDoc(collection(db, 'notifications'), {
            userId: reel.authorId,
            type: 'reel_like',
            senderId: auth.currentUser.uid,
            senderName: auth.currentUser.displayName || 'Someone',
            senderPhoto: auth.currentUser.photoURL || '',
            reelId: reel.id,
            read: false,
            createdAt: serverTimestamp()
          });
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `reels/${reel.id}/likes`);
    }
  };

  const handleFollow = async () => {
    if (!auth.currentUser || isFollowing) return;
    setIsFollowClicked(true);
    const followRef = doc(db, 'follows', `${auth.currentUser.uid}_${reel.authorId}`);
    const currentUserRef = doc(db, 'users', auth.currentUser.uid);
    const authorRef = doc(db, 'users', reel.authorId);
    const batch = writeBatch(db);
    
    try {
      batch.set(followRef, {
        followerId: auth.currentUser.uid,
        followingId: reel.authorId,
        createdAt: serverTimestamp()
      });
      
      batch.update(currentUserRef, { followingCount: increment(1) });
      batch.update(authorRef, { followersCount: increment(1) });
      
      await batch.commit();
      setIsFollowing(true);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `follows/${reel.authorId}`);
    }
  };

  const handleSave = async () => {
    if (!auth.currentUser) return;
    const saveRef = doc(db, 'savedPosts', `${auth.currentUser.uid}_${reel.id}`);
    
    try {
      if (isSaved) {
        await deleteDoc(saveRef);
        setIsSaved(false);
      } else {
        await setDoc(saveRef, {
          userId: auth.currentUser.uid,
          postId: reel.id, // Using postId field for compatibility
          isReel: true,
          createdAt: serverTimestamp()
        });
        setIsSaved(true);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `savedPosts/${reel.id}`);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || !newComment.trim()) return;

    setLoading(true);
    try {
      const commentRef = doc(collection(db, 'reelComments'));
      const reelRef = doc(db, 'reels', reel.id);
      const batch = writeBatch(db);

      const commentData = {
        reelId: reel.id,
        authorId: auth.currentUser.uid,
        authorName: auth.currentUser.displayName || 'Anonymous',
        authorPhoto: auth.currentUser.photoURL || '',
        text: newComment.trim(),
        likesCount: 0,
        createdAt: serverTimestamp(),
        replyToId: replyingTo ? replyingTo.id : null
      };

      batch.set(commentRef, commentData);
      batch.update(reelRef, { commentsCount: increment(1) });
      
      await batch.commit();

      // Add notification
      if (reel.authorId !== auth.currentUser.uid && !replyingTo) {
        await addDoc(collection(db, 'notifications'), {
          userId: reel.authorId,
          type: 'reel_comment',
          senderId: auth.currentUser.uid,
          senderName: auth.currentUser.displayName || 'Someone',
          senderPhoto: auth.currentUser.photoURL || '',
          reelId: reel.id,
          contentPreview: newComment.trim().substring(0, 50),
          read: false,
          createdAt: serverTimestamp()
        });
      }

      setNewComment('');
      setReplyingTo(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'reelComments');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteComment = async () => {
    if (!commentToDelete || !auth.currentUser || isDeletingComment) return;
    
    setIsDeletingComment(true);
    try {
      const batch = writeBatch(db);
      
      // Delete comment
      batch.delete(doc(db, 'reelComments', commentToDelete));
      
      // Update reel comment count
      const reelRef = doc(db, 'reels', reel.id);
      batch.update(reelRef, { commentsCount: increment(-1) });
      
      await batch.commit();
      setCommentToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `reelComments/${commentToDelete}`);
    } finally {
      setIsDeletingComment(false);
    }
  };

  const handleDelete = async () => {
    if (!auth.currentUser || isDeleting) return;
    if (window.confirm('Are you sure you want to delete this reel?')) {
      setIsDeleting(true);
      try {
        await deleteDoc(doc(db, 'reels', reel.id));
        if (reel.videoUrl) {
          await deleteFromCloudinary(reel.videoUrl);
        }
        if (onDelete) {
          onDelete(reel.id);
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `reels/${reel.id}`);
      } finally {
        setIsDeleting(false);
        setShowMoreMenu(false);
      }
    }
  };

  const handleDoubleTap = (e: React.MouseEvent) => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;
    if (now - lastTap.current < DOUBLE_TAP_DELAY) {
      if (!isLiked) {
        handleLike();
      }
      setShowHeartAnimation(true);
      setTimeout(() => setShowHeartAnimation(false), 1000);
    }
    lastTap.current = now;
  };

  const handleCommentLike = async (commentId: string) => {
    if (!auth.currentUser) return;
    const isCurrentlyLiked = commentLikes[commentId];
    const likeRef = doc(db, 'reelCommentLikes', `${commentId}_${auth.currentUser.uid}`);
    const commentRef = doc(db, 'reelComments', commentId);
    const batch = writeBatch(db);
    
    try {
      if (isCurrentlyLiked) {
        batch.delete(likeRef);
        batch.update(commentRef, { likesCount: increment(-1) });
        await batch.commit();
        setCommentLikes(prev => ({ ...prev, [commentId]: false }));
      } else {
        batch.set(likeRef, {
          commentId,
          reelId: reel.id,
          userId: auth.currentUser.uid,
          createdAt: serverTimestamp()
        });
        batch.update(commentRef, { likesCount: increment(1) });
        await batch.commit();
        setCommentLikes(prev => ({ ...prev, [commentId]: true }));
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `reelComments/${commentId}/likes`);
    }
  };

  return (
    <div className="relative w-full h-full snap-start overflow-hidden bg-black flex items-center justify-center group">
      {/* Audio Player for Music */}
      {reel.music && (
        <audio
          ref={audioRef}
          src={reel.music.url}
          loop
          muted={isMuted}
        />
      )}

      {/* Video/Image Player */}
      {(reel.mediaType === 'image' || hasVideoError) ? (
        <img
          src={reel.videoUrl}
          className="w-full h-full object-contain"
          alt={reel.caption}
          onClick={(e) => {
            handleDoubleTap(e);
            setIsPlaying(!isPlaying);
          }}
        />
      ) : (
        <video
          ref={videoRef}
          src={reel.videoUrl}
          className="w-full h-full object-contain"
          loop
          muted={isMuted}
          playsInline
          onError={() => setHasVideoError(true)}
          onClick={(e) => {
            handleDoubleTap(e);
            setIsPlaying(!isPlaying);
          }}
        />
      )}

      {/* Overlay Controls */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60 pointer-events-none" />

      {/* Double Tap Heart Animation */}
      <AnimatePresence>
        {showHeartAnimation && (
          <motion.div
            initial={{ opacity: 0, scale: 0, rotate: -20 }}
            animate={{ 
              opacity: [0, 1, 1, 0], 
              scale: [0, 1.5, 1.2, 1.5],
              rotate: [-20, 0, 0, 20]
            }}
            transition={{ duration: 0.8, times: [0, 0.2, 0.8, 1] }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none z-30"
          >
            <Heart className="w-32 h-32 text-white fill-white drop-shadow-[0_0_30px_rgba(255,255,255,0.5)]" />
          </motion.div>
        )}
        
        {burstHearts.map(heart => (
          <motion.div
            key={heart.id}
            initial={{ opacity: 1, scale: 0, x: "-50%", y: "-50%" }}
            animate={{ 
              opacity: 0, 
              scale: heart.scale, 
              x: `calc(-50% + ${heart.x}px)`, 
              y: `calc(-50% + ${heart.y}px)`,
              rotate: heart.rotation
            }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="absolute left-1/2 top-1/2 pointer-events-none z-30"
          >
            <Heart className="w-8 h-8 text-white fill-white" />
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Play/Pause Indicator */}
      <AnimatePresence>
        {!isPlaying && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
          >
            <div className="w-24 h-24 bg-black/30 backdrop-blur-md rounded-full flex items-center justify-center border border-white/20">
              <Play className="w-12 h-12 text-white fill-white ml-1.5" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Header */}
      <div className={cn("absolute left-0 right-0 p-5 flex items-center justify-between z-20 pointer-events-none", isModal ? "top-12" : "top-0")}>
        <h2 className="text-white font-serif italic font-black text-2xl tracking-tight drop-shadow-lg pointer-events-auto">Reels</h2>
        <div className="flex items-center gap-3 pointer-events-auto">
          <button
            onClick={handleToggleMute}
            className="p-2 bg-black/20 hover:bg-black/40 backdrop-blur-md rounded-full text-white transition-all border border-white/10"
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <div className="relative">
            <motion.button 
              whileTap={{ scale: 0.8 }}
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              className="p-2 bg-black/20 hover:bg-black/40 backdrop-blur-md rounded-full text-white transition-all border border-white/10"
            >
              <MoreVertical className="w-4 h-4" />
            </motion.button>

            <AnimatePresence>
              {showMoreMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: -20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: -20 }}
                  className="absolute right-0 top-full mt-2 w-52 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl rounded-2xl shadow-2xl overflow-hidden z-50 border border-zinc-200 dark:border-zinc-800"
                >
                  <button
                    onClick={() => {
                      handleSave();
                      setShowMoreMenu(false);
                    }}
                    className="w-full px-5 py-4 text-left text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center gap-3 font-bold transition-colors"
                  >
                    <Bookmark className={cn("w-5 h-5", isSaved && "fill-current text-yellow-500")} />
                    {isSaved ? 'Saved' : 'Save'}
                  </button>
                  {reel.authorId === auth.currentUser?.uid ? (
                    <button
                      onClick={handleDelete}
                      disabled={isDeleting}
                      className="w-full px-5 py-4 text-left text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-3 font-bold transition-colors"
                    >
                      <Trash2 className="w-5 h-5" />
                      {isDeleting ? 'Deleting...' : 'Delete Reel'}
                    </button>
                  ) : (
                    <button
                      className="w-full px-5 py-4 text-left text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center gap-3 font-bold transition-colors"
                    >
                      <ShieldAlert className="w-5 h-5" />
                      Report
                    </button>
                  )}
                  <button
                    onClick={() => setShowMoreMenu(false)}
                    className="w-full px-5 py-4 text-left text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center gap-3 font-bold transition-colors border-t border-zinc-100 dark:border-zinc-800"
                  >
                    <X className="w-5 h-5" />
                    Cancel
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Right Side Actions */}
      <div className={cn("absolute right-3 flex flex-col items-center gap-4 z-20", isModal ? "bottom-6" : "bottom-[112px]")}>
        <div className="flex flex-col items-center">
          <motion.button
            whileTap={{ scale: 0.8 }}
            onClick={handleLike}
            className={cn(
              "p-2.5 rounded-full backdrop-blur-md transition-all shadow-2xl border border-white/10",
              isLiked ? "bg-red-500/90 text-white border-red-400" : "bg-black/30 text-white hover:bg-black/50"
            )}
          >
            <Heart className={cn("w-5 h-5", isLiked && "fill-white")} />
          </motion.button>
          <span className="text-white text-[10px] font-black mt-1 drop-shadow-md">{reel.likesCount || 0}</span>
        </div>

        <div className="flex flex-col items-center">
          <motion.button
            whileTap={{ scale: 0.8 }}
            onClick={(e) => {
              e.stopPropagation();
              setShowComments(true);
            }}
            className="p-2.5 bg-black/30 hover:bg-black/50 backdrop-blur-md rounded-full text-white transition-all shadow-2xl border border-white/10"
          >
            <MessageCircle className="w-5 h-5" />
          </motion.button>
          <span className="text-white text-[10px] font-black mt-1 drop-shadow-md">{reel.commentsCount || 0}</span>
        </div>

        <motion.button
          whileTap={{ scale: 0.8 }}
          onClick={() => setIsShareModalOpen(true)}
          className="p-2.5 bg-black/30 hover:bg-black/50 backdrop-blur-md rounded-full text-white transition-all shadow-2xl border border-white/10"
        >
          <Send className="w-5 h-5 -rotate-12" />
        </motion.button>

        {/* Music Disk Animation */}
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
          className="w-10 h-10 rounded-full border-4 border-zinc-800 bg-zinc-900 flex items-center justify-center overflow-hidden shadow-2xl mt-2"
        >
          <UserAvatar userId={reel.authorId} size={32} />
        </motion.div>
      </div>

      {/* Bottom Info */}
      <div className={cn("absolute left-4 right-20 z-20", isModal ? "bottom-6" : "bottom-[112px]")}>
        <div className="flex items-center gap-3">
          <div 
            className="relative cursor-pointer group"
            onClick={(e) => {
              e.stopPropagation();
              onNavigate?.('profile', reel.authorId);
            }}
          >
            <UserAvatar userId={reel.authorId} size={44} className="border-2 border-white/50 shadow-2xl ring-2 ring-black/20" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h4 
                className="text-white font-black text-base shadow-sm tracking-tight drop-shadow-md cursor-pointer hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigate?.('profile', reel.authorId);
                }}
              >
                {reel.authorName}
              </h4>
              <AnimatePresence>
                {isFollowing === false && reel.authorId !== auth.currentUser?.uid && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8, width: 0 }}
                    animate={{ opacity: 1, scale: 1, width: 'auto' }}
                    exit={{ opacity: 0, scale: 0.5, width: 0, padding: 0, margin: 0 }}
                    transition={{ 
                      duration: isFollowClicked ? 0.3 : 0, 
                      ease: "easeInOut" 
                    }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.9, rotate: -5 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleFollow();
                    }}
                    className="px-3 py-1 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white text-[10px] font-black uppercase tracking-widest rounded-full border border-white/20 transition-all shadow-[0_0_15px_rgba(99,102,241,0.5)] whitespace-nowrap overflow-hidden"
                  >
                    Follow
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
            
            <div className="flex items-center gap-2.5 bg-black/30 backdrop-blur-xl rounded-full px-2 py-1 w-fit border border-white/10 shadow-2xl mt-1">
              <Music className="w-3 h-3 text-white animate-pulse" />
              <div className="overflow-hidden whitespace-nowrap max-w-[120px]">
                <motion.div
                  animate={{ x: [0, -100, 0] }}
                  transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                  className="text-white text-[9px] font-black uppercase tracking-widest"
                >
                  {reel.music ? `${reel.music.title} • ${reel.music.artist}` : `${reel.authorName} • Original Audio`}
                </motion.div>
              </div>
            </div>
          </div>
        </div>

        {reel.caption && (
          <p className="text-white text-sm font-medium mt-3 line-clamp-2 shadow-sm leading-relaxed drop-shadow-md max-w-md">
            {reel.caption}
          </p>
        )}
      </div>

      {/* Share Modal */}
      <ShareModal 
        isOpen={isShareModalOpen} 
        onClose={() => setIsShareModalOpen(false)} 
        post={reel as any} // Reel is compatible enough for sharing
      />

      {/* Comments Sidebar/Overlay */}
      {createPortal(
        <AnimatePresence>
          {showComments && (
            <div className="fixed inset-0 z-[100] flex items-end justify-center">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowComments(false)}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              />
              <motion.div
                key="reel-comments"
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-t-[2.5rem] flex flex-col shadow-2xl h-[80dvh] max-h-[800px] overflow-hidden"
              >
                <div className="p-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                  <h3 className="font-outfit font-black text-zinc-900 dark:text-zinc-50 tracking-tight text-lg">Comments</h3>
                  <button 
                    onClick={() => setShowComments(false)}
                    className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-full text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-6 no-scrollbar">
                  {comments.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center py-12">
                      <div className="w-16 h-16 bg-zinc-50 dark:bg-zinc-800 rounded-3xl flex items-center justify-center mb-4">
                        <MessageCircle className="w-8 h-8 text-zinc-300" />
                      </div>
                      <p className="text-zinc-500 font-bold">No comments yet</p>
                      <p className="text-zinc-400 text-xs mt-1">Start the conversation!</p>
                    </div>
                  ) : (
                    comments.filter(c => !c.replyToId).map((comment) => (
                      <div key={comment.id} className="flex flex-col gap-3">
                        <div className="flex gap-3 group/comment">
                          <UserAvatar userId={comment.authorId} size={36} className="ring-2 ring-zinc-100 dark:ring-zinc-800" />
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-black text-zinc-900 dark:text-zinc-50 text-sm">{comment.authorName}</span>
                                <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-tighter">
                                  {comment.createdAt && formatDistanceToNow(comment.createdAt.toDate())} ago
                                </span>
                              </div>
                              <div className="flex flex-col items-center">
                                <button 
                                  onClick={() => handleCommentLike(comment.id)}
                                  className={cn(
                                    "transition-all active:scale-75",
                                    commentLikes[comment.id] ? "text-red-500" : "text-zinc-400 hover:text-zinc-600"
                                  )}
                                >
                                  <Heart className={cn("w-4 h-4", commentLikes[comment.id] && "fill-current")} />
                                </button>
                                <span className="text-[10px] text-zinc-400 font-bold">{comment.likesCount || 0}</span>
                              </div>
                            </div>
                            <p className="text-zinc-700 dark:text-zinc-300 text-sm leading-relaxed pr-8">
                              {expandedComments.has(comment.id) || comment.text.length <= 100 
                                ? comment.text 
                                : `${comment.text.substring(0, 100)}...`}
                              {comment.text.length > 100 && (
                                <button
                                  onClick={() => toggleExpandComment(comment.id)}
                                  className="ml-1 text-zinc-500 font-bold hover:text-zinc-700 text-[11px]"
                                >
                                  {expandedComments.has(comment.id) ? 'See less' : 'See more'}
                                </button>
                              )}
                            </p>
                            <div className="flex items-center gap-4 mt-2">
                              <button 
                                onClick={() => {
                                  setReplyingTo({ id: comment.id, username: comment.authorName });
                                  setNewComment(`@${comment.authorName} `);
                                  setTimeout(() => inputRef.current?.focus(), 0);
                                }}
                                className="text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-zinc-600"
                              >
                                Reply
                              </button>
                              {comment.authorId === auth.currentUser?.uid && (
                                <button
                                  onClick={() => setCommentToDelete(comment.id)}
                                  className="text-[10px] font-black uppercase tracking-widest text-red-400 hover:text-red-600"
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        {/* Replies */}
                        {comments.filter(c => c.replyToId === comment.id).length > 0 && (
                          <div className="ml-12 space-y-4 mt-2">
                            {comments.filter(c => c.replyToId === comment.id).reverse().map(reply => (
                              <div key={reply.id} className="flex gap-3 group/reply">
                                <UserAvatar userId={reply.authorId} size={28} className="ring-2 ring-zinc-100 dark:ring-zinc-800" />
                                <div className="flex-1">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="font-black text-zinc-900 dark:text-zinc-50 text-xs">{reply.authorName}</span>
                                      <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-tighter">
                                        {reply.createdAt && formatDistanceToNow(reply.createdAt.toDate())} ago
                                      </span>
                                    </div>
                                    <div className="flex flex-col items-center">
                                      <button 
                                        onClick={() => handleCommentLike(reply.id)}
                                        className={cn(
                                          "transition-all active:scale-75",
                                          commentLikes[reply.id] ? "text-red-500" : "text-zinc-400 hover:text-zinc-600"
                                        )}
                                      >
                                        <Heart className={cn("w-3 h-3", commentLikes[reply.id] && "fill-current")} />
                                      </button>
                                      <span className="text-[9px] text-zinc-400 font-bold">{reply.likesCount || 0}</span>
                                    </div>
                                  </div>
                                  <p className="text-zinc-700 dark:text-zinc-300 text-xs leading-relaxed pr-8">
                                    {expandedComments.has(reply.id) || reply.text.length <= 80 
                                      ? reply.text 
                                      : `${reply.text.substring(0, 80)}...`}
                                    {reply.text.length > 80 && (
                                      <button
                                        onClick={() => toggleExpandComment(reply.id)}
                                        className="ml-1 text-zinc-500 font-bold hover:text-zinc-700 text-[10px]"
                                      >
                                        {expandedComments.has(reply.id) ? 'See less' : 'See more'}
                                      </button>
                                    )}
                                  </p>
                                  <div className="flex items-center gap-4 mt-1">
                                    <button 
                                      onClick={() => {
                                        setReplyingTo({ id: comment.id, username: reply.authorName });
                                        setNewComment(`@${reply.authorName} `);
                                        setTimeout(() => inputRef.current?.focus(), 0);
                                      }}
                                      className="text-[9px] font-black uppercase tracking-widest text-zinc-400 hover:text-zinc-600"
                                    >
                                      Reply
                                    </button>
                                    {reply.authorId === auth.currentUser?.uid && (
                                      <button
                                        onClick={() => setCommentToDelete(reply.id)}
                                        className="text-[9px] font-black uppercase tracking-widest text-red-400 hover:text-red-600"
                                      >
                                        Delete
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                <form onSubmit={handleAddComment} className="p-5 border-t border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 pb-10 flex flex-col gap-2">
                  {replyingTo && (
                    <div className="flex items-center justify-between px-2 text-xs text-zinc-500">
                      <span>Replying to <span className="font-bold">@{replyingTo.username}</span></span>
                      <button 
                        type="button" 
                        onClick={() => {
                          setReplyingTo(null);
                          setNewComment('');
                        }}
                        className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  <div className="flex items-center gap-3 bg-zinc-50 dark:bg-zinc-800 rounded-2xl px-4 py-3 border-none">
                    <input
                      ref={inputRef}
                      type="text"
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Add a comment..."
                      className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 outline-none"
                    />
                    <button
                      type="submit"
                      disabled={!newComment.trim() || loading}
                      className="text-indigo-600 dark:text-indigo-400 font-black text-sm disabled:opacity-50"
                    >
                      Post
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Comment Delete Confirmation Modal */}
      {createPortal(
        <ConfirmationModal
          isOpen={!!commentToDelete}
          onClose={() => setCommentToDelete(null)}
          onConfirm={handleDeleteComment}
          title="Delete Comment"
          message="Are you sure you want to delete this comment? This action cannot be undone."
          confirmText="Delete"
          isDanger={true}
        />,
        document.body
      )}
    </div>
  );
}
