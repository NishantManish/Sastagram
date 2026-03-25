import { useState, useEffect, useRef } from 'react';
import { collection, query, where, orderBy, onSnapshot, doc, getDoc, setDoc, deleteDoc, writeBatch, increment, serverTimestamp, getDocs, addDoc } from 'firebase/firestore';
import { signOut, deleteUser } from 'firebase/auth';
import { db, auth } from '../firebase';
import { handleFirestoreError, OperationType } from '../utils/firestore';
import { Post, User, Highlight, Story, Message } from '../types';
import { Menu, Grid3X3, Camera, Edit2, UserPlus, UserMinus, ArrowLeft, ShieldAlert, ShieldCheck, MoreVertical, LogOut, Trash2, Bookmark, Heart, Settings, Share2, MessageCircle, Plus } from 'lucide-react';
import PostDetailsModal from './PostDetailsModal';
import EditProfileModal from './EditProfileModal';
import FollowListModal from './FollowListModal';
import CreateHighlightModal from './CreateHighlightModal';
import EditHighlightModal from './EditHighlightModal';
import HighlightViewerModal from './HighlightViewerModal';
import { motion, AnimatePresence } from 'motion/react';
import { blockUser, unblockUser, useBlocks } from '../services/blockService';
import { deleteHighlight } from '../services/highlightService';
import { getOptimizedImageUrl } from '../utils/cloudinary';
import { deleteFromCloudinary } from '../utils/media';
import UserAvatar from './UserAvatar';
import ConfirmationModal from './ConfirmationModal';

interface ProfileProps {
  userId?: string;
  onBack?: () => void;
  onNavigate?: (tab: 'feed' | 'search' | 'create' | 'notifications' | 'profile' | 'messages') => void;
  onTagClick?: (tag: string) => void;
}

export default function Profile({ userId, onBack, onNavigate, onTagClick }: ProfileProps) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [savedPosts, setSavedPosts] = useState<Post[]>([]);
  const [taggedPosts, setTaggedPosts] = useState<Post[]>([]);
  const [userProfile, setUserProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState<boolean | null>(null);
  const [isFollowedBy, setIsFollowedBy] = useState(false);
  const [isFollowLoading, setIsFollowLoading] = useState(false);
  const [isMessagingLoading, setIsMessagingLoading] = useState(false);
  
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [followModalType, setFollowModalType] = useState<'followers' | 'following' | null>(null);
  const [viewedUserId, setViewedUserId] = useState<string | null>(null);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [postToDelete, setPostToDelete] = useState<Post | null>(null);
  const [isDeletingPost, setIsDeletingPost] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const [isBlocking, setIsBlocking] = useState(false);
  const [activeGridTab, setActiveGridTab] = useState<'posts' | 'saved' | 'tagged'>('posts');
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [isCreatingHighlight, setIsCreatingHighlight] = useState(false);
  const [editingHighlight, setEditingHighlight] = useState<Highlight | null>(null);
  const [viewingHighlight, setViewingHighlight] = useState<Highlight | null>(null);

  const [showDeleteAccountConfirm, setShowDeleteAccountConfirm] = useState(false);
  const [deleteAccountCountdown, setDeleteAccountCountdown] = useState(10);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (showDeleteAccountConfirm && deleteAccountCountdown > 0) {
      timer = setInterval(() => {
        setDeleteAccountCountdown(prev => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [showDeleteAccountConfirm, deleteAccountCountdown]);

  const handleDeleteAccount = async () => {
    if (!auth.currentUser) return;
    setIsDeletingAccount(true);
    try {
      const uid = auth.currentUser.uid;
      const batch = writeBatch(db);
      const mediaToDelete: string[] = [];

      // 1. User document & photo
      const userDoc = await getDoc(doc(db, 'users', uid));
      if (userDoc.exists()) {
        const userData = userDoc.data() as User;
        if (userData.photoURL) mediaToDelete.push(userData.photoURL);
        batch.delete(userDoc.ref);
      }

      // 2. Posts & media
      const postsRef = collection(db, 'posts');
      const postsSnap = await getDocs(query(postsRef, where('authorId', '==', uid)));
      postsSnap.docs.forEach(d => {
        const data = d.data() as Post;
        if (data.imageUrl) mediaToDelete.push(data.imageUrl);
        batch.delete(d.ref);
      });

      // 3. Highlights & media
      const highlightsRef = collection(db, 'highlights');
      const highlightsSnap = await getDocs(query(highlightsRef, where('userId', '==', uid)));
      highlightsSnap.docs.forEach(d => {
        const data = d.data() as Highlight;
        if (data.imageUrl) mediaToDelete.push(data.imageUrl);
        if (data.mediaUrls) mediaToDelete.push(...data.mediaUrls);
        batch.delete(d.ref);
      });

      // 4. Stories & media
      const storiesRef = collection(db, 'stories');
      const storiesSnap = await getDocs(query(storiesRef, where('authorId', '==', uid)));
      storiesSnap.docs.forEach(d => {
        const data = d.data() as Story;
        if (data.imageUrl) mediaToDelete.push(data.imageUrl);
        batch.delete(d.ref);
      });

      // 5. Messages & media
      const messagesRef = collection(db, 'messages');
      const messagesSnap = await getDocs(query(messagesRef, where('senderId', '==', uid)));
      messagesSnap.docs.forEach(d => {
        const data = d.data() as Message;
        if (data.attachmentUrl) mediaToDelete.push(data.attachmentUrl);
        batch.delete(d.ref);
      });

      // 6. Notifications
      const notificationsRef = collection(db, 'notifications');
      const notificationsSnap = await getDocs(query(notificationsRef, where('userId', '==', uid)));
      notificationsSnap.docs.forEach(d => batch.delete(d.ref));

      // 7. Likes
      const likesRef = collection(db, 'likes');
      const likesSnap = await getDocs(query(likesRef, where('userId', '==', uid)));
      likesSnap.docs.forEach(d => batch.delete(d.ref));

      // 8. Comments
      const commentsRef = collection(db, 'comments');
      const commentsSnap = await getDocs(query(commentsRef, where('authorId', '==', uid)));
      commentsSnap.docs.forEach(d => batch.delete(d.ref));

      // 9. Saved Posts
      const savedPostsRef = collection(db, 'savedPosts');
      const savedPostsSnap = await getDocs(query(savedPostsRef, where('userId', '==', uid)));
      savedPostsSnap.docs.forEach(d => batch.delete(d.ref));

      // 10. Follows
      const followsRef = collection(db, 'follows');
      const followerSnap = await getDocs(query(followsRef, where('followerId', '==', uid)));
      followerSnap.docs.forEach(d => batch.delete(d.ref));
      const followingSnap = await getDocs(query(followsRef, where('followingId', '==', uid)));
      followingSnap.docs.forEach(d => batch.delete(d.ref));

      // Delete all media from Cloudinary
      try {
        await Promise.all(mediaToDelete.map(url => deleteFromCloudinary(url)));
      } catch (err) {
        console.error('Error deleting media from Cloudinary:', err);
      }

      // Commit the batch
      await batch.commit();

      // 10. Delete auth user
      await deleteUser(auth.currentUser);
      
      // Redirect or refresh
      window.location.reload();
    } catch (error: any) {
      console.error('Error deleting account:', error);
      if (error.code === 'auth/requires-recent-login') {
        alert('This action requires a recent login. Please log out and log back in to delete your account.');
      } else {
        alert('Failed to delete account. Please try again.');
      }
      setIsDeletingAccount(false);
      setShowDeleteAccountConfirm(false);
    }
  };
  const [activeHighlightMenu, setActiveHighlightMenu] = useState<string | null>(null);
  const [highlightToDelete, setHighlightToDelete] = useState<Highlight | null>(null);
  const [isDeletingHighlight, setIsDeletingHighlight] = useState(false);

  const holdTimer = useRef<number>(0);
  const pointerDownTime = useRef<number>(0);

  const currentUser = auth.currentUser;
  const targetUserId = viewedUserId || userId || currentUser?.uid;
  const isOwnProfile = currentUser?.uid === targetUserId;

  const { blockedIds, blockedByIds } = useBlocks(currentUser?.uid);
  const isBlockedByMe = targetUserId ? blockedIds.includes(targetUserId) : false;
  const amIBlocked = targetUserId ? blockedByIds.includes(targetUserId) : false;

  useEffect(() => {
    if (!targetUserId) return;

    // Fetch user profile
    const userRef = doc(db, 'users', targetUserId);
    const unsubscribeUser = onSnapshot(userRef, (docSnap) => {
      if (docSnap.exists()) {
        setUserProfile({ uid: docSnap.id, ...docSnap.data() } as User);
      }
    });

    // Fetch user highlights
    const highlightsQ = query(
      collection(db, 'highlights'),
      where('userId', '==', targetUserId),
      orderBy('createdAt', 'asc')
    );
    const unsubscribeHighlights = onSnapshot(highlightsQ, (snapshot) => {
      const newHighlights = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Highlight[];
      setHighlights(newHighlights);
    }, (error) => {
      console.error('Error fetching highlights:', error);
    });

    // Fetch user posts
    const q = query(
      collection(db, 'posts'),
      where('authorId', '==', targetUserId),
      orderBy('createdAt', 'desc')
    );

    const unsubscribePosts = onSnapshot(q, (snapshot) => {
      const newPosts = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Post[];
      setPosts(newPosts);
      setLoading(false);
    }, (error) => {
      if (error.message.includes('permission')) {
        setPosts([]);
      }
      console.error('Error fetching user posts:', error);
      setLoading(false);
    });

    // Fetch tagged posts
    let unsubscribeTagged = () => {};
    if (userProfile?.username) {
      const taggedQ = query(
        collection(db, 'posts'),
        where('mentions', 'array-contains', userProfile.username.toLowerCase()),
        orderBy('createdAt', 'desc')
      );
      unsubscribeTagged = onSnapshot(taggedQ, (snapshot) => {
        const newTaggedPosts = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Post[];
        setTaggedPosts(newTaggedPosts);
      }, (error) => {
        console.error('Error fetching tagged posts:', error);
      });
    }

    // Fetch saved posts if own profile
    let unsubscribeSaved = () => {};
    if (isOwnProfile && currentUser) {
      const savedQ = query(
        collection(db, 'savedPosts'),
        where('userId', '==', currentUser.uid),
        orderBy('createdAt', 'desc')
      );

      unsubscribeSaved = onSnapshot(savedQ, async (snapshot) => {
        const savedDocs = snapshot.docs;
        const postPromises = savedDocs.map(async (saveDoc) => {
          const postRef = doc(db, 'posts', saveDoc.data().postId);
          const postSnap = await getDoc(postRef);
          if (postSnap.exists()) {
            return { id: postSnap.id, ...postSnap.data() } as Post;
          }
          return null;
        });
        const resolvedPosts = (await Promise.all(postPromises)).filter(p => p !== null) as Post[];
        setSavedPosts(resolvedPosts);
      });
    }

    return () => {
      unsubscribeUser();
      unsubscribeHighlights();
      unsubscribePosts();
      unsubscribeSaved();
      unsubscribeTagged();
    };
  }, [targetUserId, isOwnProfile, currentUser?.uid, userProfile?.username]);

  useEffect(() => {
    // Check follow status with real-time listeners
    if (!currentUser || isOwnProfile || !targetUserId) return;

    const followId = `${currentUser.uid}_${targetUserId}`;
    const followRef = doc(db, 'follows', followId);
    const unsubscribeFollow = onSnapshot(followRef, (docSnap) => {
      setIsFollowing(docSnap.exists());
    });

    const followedById = `${targetUserId}_${currentUser.uid}`;
    const followedByRef = doc(db, 'follows', followedById);
    const unsubscribeFollowedBy = onSnapshot(followedByRef, (docSnap) => {
      setIsFollowedBy(docSnap.exists());
    });

    return () => {
      unsubscribeFollow();
      unsubscribeFollowedBy();
    };
  }, [currentUser?.uid, targetUserId, isOwnProfile]);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const handleFollowToggle = async () => {
    if (!currentUser || !targetUserId || isFollowLoading) return;
    setIsFollowLoading(true);

    const followId = `${currentUser.uid}_${targetUserId}`;
    const followRef = doc(db, 'follows', followId);
    const currentUserRef = doc(db, 'users', currentUser.uid);
    const targetUserRef = doc(db, 'users', targetUserId);
    
    const batch = writeBatch(db);

    try {
      if (isFollowing) {
        // Unfollow
        batch.delete(followRef);
        batch.update(currentUserRef, { followingCount: increment(-1) });
        batch.update(targetUserRef, { followersCount: increment(-1) });
        await batch.commit();
        setIsFollowing(false);
      } else {
        // Follow
        batch.set(followRef, {
          followerId: currentUser.uid,
          followingId: targetUserId,
          createdAt: serverTimestamp(),
        });
        batch.update(currentUserRef, { followingCount: increment(1) });
        batch.update(targetUserRef, { followersCount: increment(1) });

        // Add notification
        const notificationRef = doc(collection(db, 'notifications'));
        batch.set(notificationRef, {
          userId: targetUserId,
          type: 'follow',
          senderId: currentUser.uid,
          senderName: currentUser.displayName || 'Anonymous',
          senderPhoto: currentUser.photoURL || '',
          read: false,
          createdAt: serverTimestamp()
        });

        await batch.commit();
        setIsFollowing(true);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `follows/${currentUser.uid}_${targetUserId}`);
    } finally {
      setIsFollowLoading(false);
    }
  };

  const handleShareProfile = async () => {
    const shareData = {
      title: `${userProfile?.displayName} on Social App`,
      text: `Check out ${userProfile?.displayName}'s profile!`,
      url: window.location.href,
    };

    try {
      if (navigator.share) {
        try {
          await navigator.share(shareData);
        } catch (shareErr: any) {
          // If the user canceled, don't do anything
          if (shareErr.name === 'AbortError') {
            return;
          }
          // For other errors (like iframe restrictions), fallback to clipboard
          throw shareErr;
        }
      } else {
        throw new Error('Share not supported');
      }
    } catch (err) {
      try {
        await navigator.clipboard.writeText(window.location.href);
        // We avoid alert() as per guidelines for iframes, 
        // the user will see the link is copied if they check their clipboard
        // or we could add a temporary "Copied" state to the UI.
      } catch (clipboardErr) {
        console.error('Error copying to clipboard:', clipboardErr);
      }
    } finally {
      setShowOptionsMenu(false);
      setShowProfileMenu(false);
    }
  };

  if (!targetUserId || !userProfile) return null;

  if (amIBlocked) {
    return (
      <div className="max-w-md mx-auto pb-20 bg-white min-h-screen">
        <div className="flex items-center p-4 border-b border-zinc-200">
          <button 
            onClick={() => viewedUserId ? setViewedUserId(null) : onBack?.()}
            className="p-2 -ml-2 text-zinc-500 hover:bg-zinc-100 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-semibold text-zinc-900 ml-2">Profile</h1>
        </div>
        <div className="flex flex-col items-center justify-center h-[60vh] px-8 text-center">
          <ShieldAlert className="w-16 h-16 text-zinc-300 mb-4" />
          <h2 className="text-xl font-bold text-zinc-900 mb-2">User not found</h2>
          <p className="text-zinc-500">The account you are looking for may have been deleted or you may have been blocked.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto pb-24 bg-white min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-2xl border-b border-zinc-100/50 px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {(viewedUserId || onBack) && (
            <button 
              onClick={() => viewedUserId ? setViewedUserId(null) : onBack?.()}
              className="p-2 -ml-2 text-zinc-900 hover:bg-zinc-50 rounded-full transition-all active:scale-90"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className="flex flex-col">
            <h1 className="text-base font-black text-zinc-900 tracking-tight leading-none">
              {userProfile.displayName || userProfile.username}
            </h1>
            {!isOwnProfile && (
              <div className="flex items-center gap-1.5 mt-1">
                <span className="w-1 h-1 bg-indigo-500 rounded-full"></span>
                <span className="text-[8px] uppercase tracking-[0.2em] text-zinc-400 font-black">
                  Creator
                </span>
              </div>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {isOwnProfile ? (
            <button 
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="p-2 text-zinc-900 hover:bg-zinc-50 rounded-xl transition-all active:scale-90 border border-zinc-100 shadow-sm"
            >
              <Settings className="w-4 h-4" />
            </button>
          ) : (
            <button 
              onClick={() => setShowOptionsMenu(!showOptionsMenu)}
              className="p-2 text-zinc-900 hover:bg-zinc-50 rounded-xl transition-all active:scale-90 border border-zinc-100 shadow-sm"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Dropdowns */}
        <AnimatePresence>
          {showOptionsMenu && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setShowOptionsMenu(false)} />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                className="absolute right-4 top-16 w-52 bg-white rounded-2xl shadow-2xl border border-zinc-100 z-30 overflow-hidden p-1.5"
              >
                <button
                  onClick={async () => {
                    setShowOptionsMenu(false);
                    if (isBlockedByMe) {
                      await unblockUser(targetUserId);
                    } else {
                      setShowBlockConfirm(true);
                    }
                  }}
                  className={`w-full px-3 py-2.5 text-left text-xs font-bold flex items-center gap-2.5 rounded-xl transition-colors ${
                    isBlockedByMe ? 'text-indigo-600 hover:bg-indigo-50' : 'text-red-500 hover:bg-red-50'
                  }`}
                >
                  {isBlockedByMe ? (
                    <>
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Unblock User
                    </>
                  ) : (
                    <>
                      <ShieldAlert className="w-3.5 h-3.5" />
                      Block User
                    </>
                  )}
                </button>
                <button 
                  onClick={handleShareProfile}
                  className="w-full px-3 py-2.5 text-left text-xs font-bold flex items-center gap-2.5 rounded-xl hover:bg-zinc-50 text-zinc-900"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  Share Profile
                </button>
              </motion.div>
            </>
          )}
          {showProfileMenu && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setShowProfileMenu(false)} />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                className="absolute right-4 top-16 w-52 bg-white rounded-2xl shadow-2xl border border-zinc-100 z-30 overflow-hidden p-1.5"
              >
                <button
                  onClick={() => {
                    setShowProfileMenu(false);
                    handleSignOut();
                  }}
                  className="w-full px-3 py-3 text-left text-xs font-bold flex items-center gap-2.5 rounded-xl hover:bg-red-50 transition-colors text-red-500"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Logout
                </button>
                <button 
                  onClick={handleShareProfile}
                  className="w-full px-3 py-3 text-left text-xs font-bold flex items-center gap-2.5 rounded-xl hover:bg-zinc-50 transition-colors text-zinc-900"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  Share Profile
                </button>
                <button
                  onClick={() => {
                    setShowProfileMenu(false);
                    setDeleteAccountCountdown(10);
                    setShowDeleteAccountConfirm(true);
                  }}
                  className="w-full px-3 py-3 text-left text-xs font-bold flex items-center gap-2.5 rounded-xl hover:bg-red-50 transition-colors text-red-600 border-t border-zinc-100 mt-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Account
                </button>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </header>

      <ConfirmationModal
        isOpen={showDeleteAccountConfirm}
        onClose={() => setShowDeleteAccountConfirm(false)}
        onConfirm={handleDeleteAccount}
        isLoading={isDeletingAccount}
        countdown={deleteAccountCountdown}
        title="Delete Account Permanently"
        message="Are you sure you want to delete your account? This action is permanent and will delete all your posts, highlights, and profile data. You cannot undo this."
        confirmText="Delete Account"
        isDanger={true}
      />

      {/* Profile Content */}
      <div className="px-4 pt-12 pb-4">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="relative mb-4">
            <div className="absolute -inset-1.5 bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 rounded-[2rem] blur-lg opacity-20 animate-pulse"></div>
            <div className="relative p-0.5 bg-white rounded-[2rem] shadow-lg">
              <UserAvatar 
                userId={targetUserId} 
                size={88} 
                className="rounded-[1.8rem] border-2 border-white object-cover"
                fallbackPhoto={userProfile.photoURL} 
                fallbackName={userProfile.displayName} 
              />
            </div>
          </div>
          
          <h2 className="text-xl font-black text-zinc-900 tracking-tight mb-0.5">
            {userProfile.displayName}
          </h2>
          {userProfile.username && (
            <p className="text-indigo-600 font-black text-[11px] tracking-widest mb-3">
              @{userProfile.username.toUpperCase()}
            </p>
          )}
          
          {userProfile.bio && (
            <p className="text-zinc-500 text-xs leading-relaxed font-medium max-w-[240px] mb-6 whitespace-pre-wrap">
              {userProfile.bio}
            </p>
          )}

          <div className="flex items-center gap-8 mb-6">
            <div className="flex flex-col items-center">
              <span className="text-base font-black text-zinc-900 leading-none">{posts.length}</span>
              <span className="text-[8px] uppercase tracking-[0.15em] text-zinc-400 font-black mt-1.5">Posts</span>
            </div>
            <button 
              onClick={() => !isBlockedByMe && setFollowModalType('followers')}
              className={`flex flex-col items-center transition-all active:scale-95 ${isBlockedByMe ? 'opacity-30' : ''}`}
            >
              <span className="text-base font-black text-zinc-900 leading-none">{isBlockedByMe ? '-' : (userProfile.followersCount || 0)}</span>
              <span className="text-[8px] uppercase tracking-[0.15em] text-zinc-400 font-black mt-1.5">Followers</span>
            </button>
            <button 
              onClick={() => !isBlockedByMe && setFollowModalType('following')}
              className={`flex flex-col items-center transition-all active:scale-95 ${isBlockedByMe ? 'opacity-30' : ''}`}
            >
              <span className="text-base font-black text-zinc-900 leading-none">{isBlockedByMe ? '-' : (userProfile.followingCount || 0)}</span>
              <span className="text-[8px] uppercase tracking-[0.15em] text-zinc-400 font-black mt-1.5">Following</span>
            </button>
          </div>

          <div className="flex gap-2 w-full">
            {isOwnProfile ? (
              <button 
                onClick={() => setIsEditingProfile(true)}
                className="flex-1 h-11 bg-zinc-900 hover:bg-zinc-800 text-white font-black rounded-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 text-xs shadow-xl shadow-zinc-100"
              >
                <Edit2 className="w-3.5 h-3.5" />
                Edit Profile
              </button>
            ) : (
              <>
                {isFollowing === false && !isBlockedByMe && (
                  <button 
                    onClick={handleFollowToggle}
                    disabled={isFollowLoading}
                    className="flex-1 h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 text-xs shadow-xl shadow-indigo-50 disabled:opacity-70"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    {isFollowedBy ? 'Follow Back' : 'Follow'}
                  </button>
                )}
                {isFollowing === true && !isBlockedByMe && (
                  <button 
                    onClick={handleFollowToggle}
                    disabled={isFollowLoading}
                    className="flex-1 h-11 bg-zinc-100 hover:bg-zinc-200 text-zinc-900 font-black rounded-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 text-xs disabled:opacity-70"
                  >
                    <UserMinus className="w-3.5 h-3.5" />
                    Following
                  </button>
                )}
                {!isBlockedByMe && (
                  <button 
                    onClick={async () => {
                      if (!currentUser || !targetUserId || isMessagingLoading) return;
                      setIsMessagingLoading(true);
                      try {
                        const chatsRef = collection(db, 'chats');
                        const q = query(chatsRef, where('participants', 'array-contains', currentUser.uid));
                        const snapshot = await getDocs(q);
                        
                        let existingChatId = null;
                        snapshot.forEach(doc => {
                          const data = doc.data();
                          if (data.participants.includes(targetUserId)) {
                            existingChatId = doc.id;
                          }
                        });

                        if (!existingChatId) {
                          await addDoc(collection(db, 'chats'), {
                            participants: [currentUser.uid, targetUserId],
                            updatedAt: serverTimestamp()
                          });
                        }
                        
                        if (onNavigate) {
                          onNavigate('messages');
                        }
                      } catch (err) {
                        handleFirestoreError(err, OperationType.CREATE, 'chats');
                      } finally {
                        setIsMessagingLoading(false);
                      }
                    }}
                    disabled={isMessagingLoading}
                    className="flex-1 h-11 bg-zinc-100 hover:bg-zinc-200 text-zinc-900 font-black rounded-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 text-xs disabled:opacity-50"
                  >
                    {isMessagingLoading ? 'Loading...' : 'Message'}
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Highlights Section */}
        {!isBlockedByMe && (
          <div className="mb-6 overflow-x-auto no-scrollbar flex gap-4 px-2 relative">
            {highlights.map((highlight) => (
              <div 
                key={highlight.id} 
                className="flex flex-col items-center gap-2 flex-shrink-0 group cursor-pointer relative"
                onClick={() => setViewingHighlight(highlight)}
              >
                <div className="w-14 h-14 rounded-[1.5rem] bg-gradient-to-tr from-zinc-200 to-zinc-300 p-0.5 transition-transform duration-300 group-hover:scale-105">
                  <div className="w-full h-full rounded-[1.4rem] bg-white p-0.5">
                    <img 
                      src={getOptimizedImageUrl(highlight.imageUrl, 150)} 
                      alt={highlight.label}
                      className="w-full h-full rounded-[1.2rem] object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                </div>
                <span className="text-[8px] font-black uppercase tracking-widest text-zinc-400">{highlight.label}</span>
              </div>
            ))}
            {isOwnProfile && (
              <div 
                onClick={() => setIsCreatingHighlight(true)}
                className="flex flex-col items-center gap-2 flex-shrink-0 group cursor-pointer"
              >
                <div className="w-14 h-14 rounded-[1.5rem] border-2 border-dashed border-zinc-200 flex items-center justify-center transition-all group-hover:border-indigo-400 group-hover:bg-indigo-50">
                  <Plus className="w-5 h-5 text-zinc-300 group-hover:text-indigo-400" />
                </div>
                <span className="text-[8px] font-black uppercase tracking-widest text-zinc-400">New</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Grid Tabs */}
      <div className="flex border-t border-zinc-100 sticky top-16 bg-white/90 backdrop-blur-xl z-20">
        <button 
          onClick={() => setActiveGridTab('posts')}
          className={`flex-1 py-3.5 flex flex-col items-center gap-1.5 transition-all ${activeGridTab === 'posts' ? 'text-zinc-900' : 'text-zinc-300 hover:text-zinc-400'}`}
        >
          <Grid3X3 className="w-4 h-4" />
          <span className={`text-[7px] uppercase tracking-[0.2em] font-black transition-opacity ${activeGridTab === 'posts' ? 'opacity-100' : 'opacity-0'}`}>Feed</span>
          {activeGridTab === 'posts' && <motion.div layoutId="activeTab" className="absolute bottom-0 w-10 h-0.5 bg-zinc-900 rounded-full" />}
        </button>
        
        {isOwnProfile && (
          <button 
            onClick={() => setActiveGridTab('saved')}
            className={`flex-1 py-3.5 flex flex-col items-center gap-1.5 transition-all ${activeGridTab === 'saved' ? 'text-zinc-900' : 'text-zinc-300 hover:text-zinc-400'}`}
          >
            <Bookmark className="w-4 h-4" />
            <span className={`text-[7px] uppercase tracking-[0.2em] font-black transition-opacity ${activeGridTab === 'saved' ? 'opacity-100' : 'opacity-0'}`}>Saved</span>
            {activeGridTab === 'saved' && <motion.div layoutId="activeTab" className="absolute bottom-0 w-10 h-0.5 bg-zinc-900 rounded-full" />}
          </button>
        )}

        <button 
          onClick={() => setActiveGridTab('tagged')}
          className={`flex-1 py-3.5 flex flex-col items-center gap-1.5 transition-all ${activeGridTab === 'tagged' ? 'text-zinc-900' : 'text-zinc-300 hover:text-zinc-400'}`}
        >
          <Camera className="w-4 h-4" />
          <span className={`text-[7px] uppercase tracking-[0.2em] font-black transition-opacity ${activeGridTab === 'tagged' ? 'opacity-100' : 'opacity-0'}`}>Tagged</span>
          {activeGridTab === 'tagged' && <motion.div layoutId="activeTab" className="absolute bottom-0 w-10 h-0.5 bg-zinc-900 rounded-full" />}
        </button>
      </div>

      {/* Grid Content */}
      <div className="px-2 pt-2 pb-24">
        {isBlockedByMe ? (
          <div className="flex flex-col items-center justify-center py-24 text-zinc-500 px-10 text-center">
            <div className="w-20 h-20 bg-zinc-50 rounded-[2rem] flex items-center justify-center mb-6">
              <ShieldAlert className="w-10 h-10 text-zinc-300" />
            </div>
            <p className="text-xl font-black text-zinc-900 mb-2">Account Restricted</p>
            <p className="text-sm text-zinc-400 font-medium leading-relaxed">Unblock this creator to view their editorial feed and interactions.</p>
          </div>
        ) : loading ? (
          <div className="flex justify-center items-center py-24">
            <div className="w-8 h-8 border-4 border-zinc-100 border-t-zinc-900 rounded-full animate-spin" />
          </div>
        ) : (activeGridTab === 'posts' ? posts : activeGridTab === 'saved' ? savedPosts : taggedPosts).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-zinc-500">
            <div className="w-20 h-20 bg-zinc-50 rounded-[2rem] flex items-center justify-center mb-6">
              {activeGridTab === 'posts' ? <Camera className="w-10 h-10 text-zinc-300" /> : activeGridTab === 'saved' ? <Bookmark className="w-10 h-10 text-zinc-300" /> : <Camera className="w-10 h-10 text-zinc-300" />}
            </div>
            <p className="text-xl font-black text-zinc-900 mb-2">
              {activeGridTab === 'posts' ? 'No Posts Yet' : activeGridTab === 'saved' ? 'No Saved Posts' : 'No Tagged Posts'}
            </p>
            <p className="text-sm text-zinc-400 font-medium">
              {activeGridTab === 'posts' ? 'Capture and share your first moment.' : activeGridTab === 'saved' ? 'Save posts you love.' : 'When people tag you in posts, they will appear here.'}
            </p>
          </div>
        ) : activeGridTab === 'saved' ? (
          /* Editorial 2-Column Layout for Saved Posts */
          <div className="grid grid-cols-2 gap-4">
            {savedPosts.map((post, index) => (
              <motion.div 
                key={post.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="flex flex-col gap-3 group cursor-pointer"
                onClick={() => setSelectedPost(post)}
              >
                <div className="aspect-[3/4] bg-zinc-100 rounded-[2rem] overflow-hidden relative shadow-sm group-hover:shadow-xl transition-all duration-500">
                  {post.imageUrl?.match(/\.(mp4|webm|ogg|mov)$/i) || post.imageUrl?.includes('/video/upload/') ? (
                    <video 
                      src={post.imageUrl} 
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                      muted
                      playsInline
                    />
                  ) : (
                    <img 
                      src={getOptimizedImageUrl(post.imageUrl, 600)} 
                      alt="Saved post" 
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                      referrerPolicy="no-referrer"
                    />
                  )}
                  <div className="absolute top-4 right-4 p-2 bg-white/20 backdrop-blur-md rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity">
                    <Bookmark className="w-4 h-4 fill-current" />
                  </div>
                </div>
                <div className="px-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UserAvatar userId={post.authorId} size={20} className="rounded-lg" />
                    <span className="text-[10px] font-black text-zinc-900 uppercase tracking-tight">{post.authorName}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-zinc-400">
                    <Heart className="w-3 h-3" />
                    <span className="text-[9px] font-bold">{post.likesCount}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          /* Standard 3-Column Grid for Posts and Tagged */
          <div className="grid grid-cols-3 gap-1.5">
            {(activeGridTab === 'posts' ? posts : taggedPosts).map((post, index) => (
              <motion.div 
                key={post.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.03 }}
                className="aspect-square bg-zinc-50 relative group cursor-pointer overflow-hidden rounded-2xl"
              >
                {post.imageUrl?.match(/\.(mp4|webm|ogg|mov)$/i) || post.imageUrl?.includes('/video/upload/') ? (
                  <video 
                    src={post.imageUrl} 
                    className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110"
                    muted
                    playsInline
                    onClick={() => setSelectedPost(post)}
                  />
                ) : (
                  <img 
                    src={getOptimizedImageUrl(post.imageUrl, 400, 400)} 
                    alt="Post" 
                    className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110"
                    referrerPolicy="no-referrer"
                    onClick={() => setSelectedPost(post)}
                  />
                )}
                <div 
                  className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all duration-500 flex items-center justify-center text-white backdrop-blur-[4px]"
                  onClick={() => setSelectedPost(post)}
                >
                  <div className="flex items-center gap-6">
                    <div className="flex flex-col items-center gap-1.5">
                      <Heart className="w-5 h-5 fill-white" />
                      <span className="font-black text-[10px] tracking-widest uppercase">{(post.likesCount || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex flex-col items-center gap-1.5">
                      <MessageCircle className="w-5 h-5 fill-white" />
                      <span className="font-black text-[10px] tracking-widest uppercase">{(post.commentsCount || 0).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
                {isOwnProfile && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPostToDelete(post);
                    }}
                    className="absolute top-3 right-3 p-2.5 bg-white/90 backdrop-blur-md text-red-500 rounded-2xl shadow-xl opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 hover:text-white active:scale-90"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <AnimatePresence>
        {selectedPost && (
          <PostDetailsModal 
            post={selectedPost} 
            onClose={() => setSelectedPost(null)} 
            onUserClick={setViewedUserId}
            onTagClick={onTagClick}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isEditingProfile && userProfile && (
          <EditProfileModal 
            userProfile={userProfile} 
            onClose={() => setIsEditingProfile(false)} 
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {followModalType && targetUserId && (
          <FollowListModal
            userId={targetUserId}
            type={followModalType}
            onClose={() => setFollowModalType(null)}
            onUserClick={(id) => setViewedUserId(id)}
          />
        )}
      </AnimatePresence>

      <ConfirmationModal
        isOpen={showBlockConfirm}
        onClose={() => setShowBlockConfirm(false)}
        onConfirm={async () => {
          if (!targetUserId) return;
          setIsBlocking(true);
          try {
            await blockUser(targetUserId);
            setShowBlockConfirm(false);
          } finally {
            setIsBlocking(false);
          }
        }}
        isLoading={isBlocking}
        title={`Block ${userProfile.displayName}?`}
        message={`Are you sure you want to block ${userProfile.displayName}? They won't be able to see your posts or message you.`}
        confirmText="Block"
      />

      <ConfirmationModal
        isOpen={!!postToDelete}
        onClose={() => setPostToDelete(null)}
        onConfirm={async () => {
          if (!postToDelete || !auth.currentUser) return;
          setIsDeletingPost(true);
          try {
            const batch = writeBatch(db);
            
            // Delete post
            batch.delete(doc(db, 'posts', postToDelete.id));
            
            // Delete notifications related to this post
            const notificationsQuery = query(
              collection(db, 'notifications'), 
              where('postId', '==', postToDelete.id),
              where('userId', '==', auth.currentUser.uid)
            );
            const notificationsSnap = await getDocs(notificationsQuery);
            notificationsSnap.forEach(doc => batch.delete(doc.ref));

            await batch.commit();

            // Delete from Cloudinary
            if (postToDelete.imageUrl) {
              await deleteFromCloudinary(postToDelete.imageUrl);
            }
            setPostToDelete(null);
          } catch (err) {
            handleFirestoreError(err, OperationType.DELETE, `posts/${postToDelete.id}`);
          } finally {
            setIsDeletingPost(false);
          }
        }}
        isLoading={isDeletingPost}
        title="Delete Post?"
        message="Are you sure you want to delete this post? This action cannot be undone."
        confirmText="Delete"
      />

      <ConfirmationModal
        isOpen={!!highlightToDelete}
        onClose={() => setHighlightToDelete(null)}
        onConfirm={async () => {
          if (!highlightToDelete) return;
          setIsDeletingHighlight(true);
          try {
            await deleteHighlight(highlightToDelete.id, highlightToDelete);
            setHighlightToDelete(null);
          } catch (err) {
            console.error('Failed to delete highlight', err);
          } finally {
            setIsDeletingHighlight(false);
          }
        }}
        isLoading={isDeletingHighlight}
        title="Delete Highlight?"
        message="Are you sure you want to delete this highlight? This action cannot be undone."
        confirmText="Delete"
      />

      <AnimatePresence>
        {isCreatingHighlight && (
          <CreateHighlightModal onClose={() => setIsCreatingHighlight(false)} />
        )}
        {editingHighlight && (
          <EditHighlightModal 
            highlight={editingHighlight} 
            onClose={() => setEditingHighlight(null)} 
          />
        )}
        {viewingHighlight && (
          <HighlightViewerModal
            highlight={viewingHighlight}
            onClose={() => setViewingHighlight(null)}
            isOwnProfile={isOwnProfile}
            onEdit={() => {
              setViewingHighlight(null);
              setEditingHighlight(viewingHighlight);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
