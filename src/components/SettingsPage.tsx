import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, Key, Bell, Shield, LogOut, Trash2, Heart, User as UserIcon, 
  ChevronRight, ShieldAlert, Lock, Bookmark, Archive, Clock, 
  Star, ShieldOff, Eye, EyeOff, MessageCircle, AtSign, MessageSquare, 
  Repeat, Ban, Type, UserPlus, History, Settings as SettingsIcon,
  HelpCircle, Info, Moon, Globe, CreditCard
} from 'lucide-react';
import { auth, db } from '../firebase';
import { signOut, deleteUser, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { collection, query, where, getDocs, doc, writeBatch, onSnapshot, orderBy, getDoc } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { Post, User } from '../types';
import PostDetailsModal from './PostDetailsModal';
import { getOptimizedImageUrl } from '../utils/cloudinary';
import { unblockUser, useBlocks } from '../services/blockService';
import UserAvatar from './UserAvatar';

import { useTheme } from '../contexts/ThemeContext';

interface SettingsPageProps {
  onBack: () => void;
  onEditProfile?: () => void;
}

export default function SettingsPage({ onBack, onEditProfile }: SettingsPageProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteCountdown, setDeleteCountdown] = useState(10);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  
  const [activeView, setActiveView] = useState<'main' | 'password' | 'notifications' | 'privacy' | 'saved' | 'liked' | 'blocked' | 'theme'>('main');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showDeletePassword, setShowDeletePassword] = useState(false);

  const [pushEnabled, setPushEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [privateAccount, setPrivateAccount] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [savedPosts, setSavedPosts] = useState<Post[]>([]);
  const [likedPosts, setLikedPosts] = useState<Post[]>([]);
  const [isPostsLoading, setIsPostsLoading] = useState(false);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);

  const [blockedUsers, setBlockedUsers] = useState<User[]>([]);
  const { blockedIds } = useBlocks(auth.currentUser?.uid);
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    if (activeView !== 'blocked' || blockedIds.length === 0) {
      setBlockedUsers([]);
      return;
    }

    const fetchBlockedUsers = async () => {
      const userPromises = blockedIds.map(async (id) => {
        const userDoc = await getDoc(doc(db, 'users', id));
        if (userDoc.exists()) {
          return { uid: userDoc.id, ...userDoc.data() } as User;
        }
        return null;
      });
      const resolvedUsers = (await Promise.all(userPromises)).filter(u => u !== null) as User[];
      setBlockedUsers(resolvedUsers);
    };

    fetchBlockedUsers();
  }, [activeView, blockedIds]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (showDeleteConfirm && deleteCountdown > 0) {
      timer = setTimeout(() => setDeleteCountdown(prev => prev - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [showDeleteConfirm, deleteCountdown]);

  useEffect(() => {
    if (!auth.currentUser || (activeView !== 'saved' && activeView !== 'liked')) return;

    setIsPostsLoading(true);
    let unsubscribe = () => {};

    if (activeView === 'saved') {
      const savedQ = query(
        collection(db, 'savedPosts'),
        where('userId', '==', auth.currentUser.uid),
        orderBy('createdAt', 'desc')
      );

      unsubscribe = onSnapshot(savedQ, async (snapshot) => {
        const postPromises = snapshot.docs.map(async (saveDoc) => {
          const postRef = doc(db, 'posts', saveDoc.data().postId);
          const postSnap = await getDoc(postRef);
          if (postSnap.exists()) {
            return { id: postSnap.id, ...postSnap.data() } as Post;
          }
          return null;
        });
        const resolvedPosts = (await Promise.all(postPromises)).filter(p => p !== null) as Post[];
        setSavedPosts(resolvedPosts);
        setIsPostsLoading(false);
      });
    } else if (activeView === 'liked') {
      const likedQ = query(
        collection(db, 'likes'),
        where('userId', '==', auth.currentUser.uid),
        orderBy('createdAt', 'desc')
      );

      unsubscribe = onSnapshot(likedQ, async (snapshot) => {
        const postPromises = snapshot.docs.map(async (likeDoc) => {
          const postRef = doc(db, 'posts', likeDoc.data().postId);
          const postSnap = await getDoc(postRef);
          if (postSnap.exists()) {
            return { id: postSnap.id, ...postSnap.data() } as Post;
          }
          return null;
        });
        const resolvedPosts = (await Promise.all(postPromises)).filter(p => p !== null) as Post[];
        setLikedPosts(resolvedPosts);
        setIsPostsLoading(false);
      });
    }

    return () => unsubscribe();
  }, [activeView]);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const handleDeleteAccount = async () => {
    if (!auth.currentUser || !auth.currentUser.email || !deletePassword) return;
    setIsDeleting(true);
    try {
      const credential = EmailAuthProvider.credential(auth.currentUser.email, deletePassword);
      await reauthenticateWithCredential(auth.currentUser, credential);

      const batch = writeBatch(db);
      
      // Delete user's posts
      const postsQuery = query(collection(db, 'posts'), where('authorId', '==', auth.currentUser.uid));
      const postsSnapshot = await getDocs(postsQuery);
      postsSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      // Delete user document
      batch.delete(doc(db, 'users', auth.currentUser.uid));
      
      await batch.commit();
      await deleteUser(auth.currentUser);
    } catch (error: any) {
      console.error('Error deleting account:', error);
      alert(error.message || 'Failed to delete account. Please check your password.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || !auth.currentUser.email || !currentPassword || !newPassword) return;
    setIsChangingPassword(true);
    setPasswordMessage('');
    try {
      const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, newPassword);
      setPasswordMessage('Password updated successfully.');
      setNewPassword('');
      setCurrentPassword('');
    } catch (error: any) {
      setPasswordMessage(error.message || 'Failed to update password. Please check your current password.');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const settingsGroups = [
    {
      title: "App Settings",
      items: [
        { icon: <Moon className="w-5 h-5" />, title: "Theme", onClick: () => setActiveView('theme') }
      ]
    },
    {
      title: "How you use Social App",
      items: [
        { icon: <Bookmark className="w-5 h-5" />, title: "Saved", onClick: () => setActiveView('saved') },
        { icon: <Heart className="w-5 h-5" />, title: "Liked", onClick: () => setActiveView('liked') },
        { icon: <Archive className="w-5 h-5" />, title: "Archive", onClick: () => {} },
        { icon: <History className="w-5 h-5" />, title: "Your activity", onClick: () => {} },
        { icon: <Bell className="w-5 h-5" />, title: "Notifications", onClick: () => setActiveView('notifications') },
        { icon: <Clock className="w-5 h-5" />, title: "Time management", onClick: () => {} }
      ]
    },
    {
      title: "Who can see your content",
      items: [
        { icon: <Shield className="w-5 h-5" />, title: "Account privacy", onClick: () => setActiveView('privacy') },
        { icon: <Star className="w-5 h-5" />, title: "Close Friends", onClick: () => {} },
        { icon: <ShieldOff className="w-5 h-5" />, title: "Blocked", onClick: () => setActiveView('blocked') },
        { icon: <EyeOff className="w-5 h-5" />, title: "Hide story and live", onClick: () => {} }
      ]
    },
    {
      title: "How others can interact with you",
      items: [
        { icon: <MessageCircle className="w-5 h-5" />, title: "Messages and story replies", onClick: () => {} },
        { icon: <AtSign className="w-5 h-5" />, title: "Tags and mentions", onClick: () => {} },
        { icon: <MessageSquare className="w-5 h-5" />, title: "Comments", onClick: () => {} },
        { icon: <Repeat className="w-5 h-5" />, title: "Sharing and remixes", onClick: () => {} },
        { icon: <Ban className="w-5 h-5" />, title: "Restricted", onClick: () => {} },
        { icon: <Type className="w-5 h-5" />, title: "Hidden words", onClick: () => {} }
      ]
    },
    {
      title: "More info and support",
      items: [
        { icon: <HelpCircle className="w-5 h-5" />, title: "Help", onClick: () => {} },
        { icon: <Info className="w-5 h-5" />, title: "About", onClick: () => {} }
      ]
    },
    {
      title: "Login",
      items: [
        { icon: <LogOut className="w-5 h-5" />, title: "Log Out", onClick: handleSignOut, color: "text-red-500" },
        { icon: <Trash2 className="w-5 h-5" />, title: "Delete Account", onClick: () => { setDeleteCountdown(10); setShowDeleteConfirm(true); }, color: "text-red-600" }
      ]
    }
  ];

  const renderPostGrid = (posts: Post[], emptyMessage: string) => {
    if (isPostsLoading) {
      return (
        <div className="grid grid-cols-3 gap-0.5 p-0.5">
          {[...Array(9)].map((_, i) => (
            <div key={i} className="aspect-square bg-zinc-100 animate-pulse rounded-sm" />
          ))}
        </div>
      );
    }

    if (posts.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-20 px-10 text-center">
          <div className="w-16 h-16 rounded-full border-2 border-zinc-200 flex items-center justify-center mb-4">
            {activeView === 'saved' ? <Bookmark className="w-8 h-8 text-zinc-300" /> : <Heart className="w-8 h-8 text-zinc-300" />}
          </div>
          <h3 className="text-xl font-bold text-zinc-900 mb-2">No {activeView} posts yet</h3>
          <p className="text-zinc-500 text-sm">{emptyMessage}</p>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-3 gap-0.5 p-0.5">
        {posts.map((post) => (
          <motion.div
            key={post.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="aspect-square relative group cursor-pointer"
            onClick={() => setSelectedPost(post)}
          >
            {post.mediaUrls && post.mediaUrls.length > 0 ? (
              post.mediaUrls[0].type === 'video' ? (
                <video 
                  src={post.mediaUrls[0].url} 
                  className="w-full h-full object-cover"
                  muted
                  playsInline
                />
              ) : (
                <img 
                  src={getOptimizedImageUrl(post.mediaUrls[0].url, 400)} 
                  alt={post.caption}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              )
            ) : post.mediaType === 'video' || post.videoUrl || (post.imageUrl && (post.imageUrl.match(/\.(mp4|webm|ogg|mov)$/i) || post.imageUrl.includes('/video/upload/'))) ? (
              <video 
                src={post.videoUrl || post.imageUrl} 
                className="w-full h-full object-cover"
                muted
                playsInline
              />
            ) : (
              <img 
                src={getOptimizedImageUrl(post.imageUrl, 400)} 
                alt={post.caption}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            )}
          </motion.div>
        ))}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="max-w-md mx-auto bg-white h-[100dvh] flex flex-col items-center justify-center overflow-hidden">
        <div className="relative flex flex-col items-center">
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
            className="w-8 h-8 border-2 border-zinc-100 border-t-zinc-900 rounded-full"
          />
          <motion.span 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-4 text-[11px] font-bold text-zinc-400 tracking-[0.2em] uppercase"
          >
            Loading
          </motion.span>
        </div>
      </div>
    );
  }

  if (activeView === 'password') {
    return (
      <div className="max-w-md mx-auto bg-white h-[100dvh] flex flex-col overflow-hidden">
        <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b border-zinc-100 px-4 py-3 flex items-center gap-3 shadow-sm shrink-0">
          <button onClick={() => setActiveView('main')} className="p-2 -ml-2 text-zinc-500 hover:bg-zinc-100 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold text-zinc-900">Change Password</h1>
        </div>
        <div className="p-4">
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Current Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                <input
                  type={showCurrentPassword ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full pl-10 pr-12 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                  placeholder="Enter current password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-900 transition-colors"
                >
                  {showCurrentPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">New Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                <input
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full pl-10 pr-12 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                  placeholder="Enter new password"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-900 transition-colors"
                >
                  {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
            {passwordMessage && (
              <p className={`text-sm ${passwordMessage.includes('success') ? 'text-green-600' : 'text-red-600'}`}>
                {passwordMessage}
              </p>
            )}
            <button
              type="submit"
              disabled={isChangingPassword || !currentPassword || !newPassword}
              className="w-full py-3.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {isChangingPassword ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (activeView === 'notifications') {
    return (
      <div className="max-w-md mx-auto bg-white h-[100dvh] flex flex-col overflow-hidden">
        <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b border-zinc-100 px-4 py-3 flex items-center gap-3 shadow-sm shrink-0">
          <button onClick={() => setActiveView('main')} className="p-2 -ml-2 text-zinc-500 hover:bg-zinc-100 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold text-zinc-900">Notifications</h1>
        </div>
        <div className="p-4 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-zinc-900">Push Notifications</h3>
              <p className="text-sm text-zinc-500">Receive push notifications on this device.</p>
            </div>
            <button 
              onClick={() => setPushEnabled(!pushEnabled)}
              className={`w-12 h-6 rounded-full transition-colors relative ${pushEnabled ? 'bg-indigo-600' : 'bg-zinc-200'}`}
            >
              <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${pushEnabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
            </button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-zinc-900">Email Notifications</h3>
              <p className="text-sm text-zinc-500">Receive updates via email.</p>
            </div>
            <button 
              onClick={() => setEmailEnabled(!emailEnabled)}
              className={`w-12 h-6 rounded-full transition-colors relative ${emailEnabled ? 'bg-indigo-600' : 'bg-zinc-200'}`}
            >
              <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${emailEnabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (activeView === 'privacy') {
    return (
      <div className="max-w-md mx-auto bg-white h-[100dvh] flex flex-col overflow-hidden">
        <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b border-zinc-100 px-4 py-3 flex items-center gap-3 shadow-sm shrink-0">
          <button onClick={() => setActiveView('main')} className="p-2 -ml-2 text-zinc-500 hover:bg-zinc-100 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold text-zinc-900">Privacy</h1>
        </div>
        <div className="p-4 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-zinc-900">Private Account</h3>
              <p className="text-sm text-zinc-500">Only approved followers can see your posts.</p>
            </div>
            <button 
              onClick={() => setPrivateAccount(!privateAccount)}
              className={`w-12 h-6 rounded-full transition-colors relative ${privateAccount ? 'bg-indigo-600' : 'bg-zinc-200'}`}
            >
              <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${privateAccount ? 'translate-x-6' : 'translate-x-0.5'}`} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (activeView === 'saved' || activeView === 'liked') {
    return (
      <div className="max-w-md mx-auto bg-white h-[100dvh] flex flex-col overflow-hidden">
        <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b border-zinc-100 px-4 py-3 flex items-center gap-3 shadow-sm shrink-0">
          <button onClick={() => setActiveView('main')} className="p-2 -ml-2 text-zinc-500 hover:bg-zinc-100 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold text-zinc-900 capitalize">{activeView}</h1>
        </div>
        <div className="flex-1 overflow-y-auto">
          {renderPostGrid(
            activeView === 'saved' ? savedPosts : likedPosts,
            activeView === 'saved' ? "Save posts to see them here." : "Like posts to see them here."
          )}
        </div>
        {selectedPost && (
          <PostDetailsModal
            post={selectedPost}
            onClose={() => setSelectedPost(null)}
          />
        )}
      </div>
    );
  }

  if (activeView === 'theme') {
    return (
      <div className="max-w-md mx-auto bg-white h-[100dvh] flex flex-col overflow-hidden">
        <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b border-zinc-100 px-4 py-3 flex items-center gap-3 shadow-sm shrink-0">
          <button onClick={() => setActiveView('main')} className="p-2 -ml-2 text-zinc-500 hover:bg-zinc-100 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold text-zinc-900">Theme</h1>
        </div>
        <div className="p-4 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-zinc-900">Dark Mode</h3>
              <p className="text-sm text-zinc-500">Switch between light and dark themes.</p>
            </div>
            <button 
              onClick={toggleTheme}
              className={`w-12 h-6 rounded-full transition-colors relative ${theme === 'dark' ? 'bg-indigo-600' : 'bg-zinc-200'}`}
            >
              <div className={`w-5 h-5 rounded-full absolute top-0.5 transition-transform ${theme === 'dark' ? 'translate-x-6' : 'translate-x-0.5'}`} style={{ backgroundColor: '#ffffff' }} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (activeView === 'blocked') {
    return (
      <div className="max-w-md mx-auto bg-white h-[100dvh] flex flex-col overflow-hidden">
        <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b border-zinc-100 px-4 py-3 flex items-center gap-3 shadow-sm shrink-0">
          <button onClick={() => setActiveView('main')} className="p-2 -ml-2 text-zinc-500 hover:bg-zinc-100 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold text-zinc-900">Blocked</h1>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="p-4">
            <p className="text-sm text-zinc-500 mb-6 px-2">
              You can unblock people at any time from their profile or here. When you unblock someone, they'll be able to see your posts and follow you again.
            </p>
            {isPostsLoading ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 bg-zinc-100 rounded-full animate-pulse" />
                      <div className="space-y-2">
                        <div className="w-24 h-4 bg-zinc-100 rounded animate-pulse" />
                        <div className="w-16 h-3 bg-zinc-100 rounded animate-pulse" />
                      </div>
                    </div>
                    <div className="w-20 h-8 bg-zinc-100 rounded-lg animate-pulse" />
                  </div>
                ))}
              </div>
            ) : blockedUsers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center px-10">
                <div className="w-16 h-16 rounded-full bg-zinc-50 flex items-center justify-center mb-4">
                  <ShieldOff className="w-8 h-8 text-zinc-300" />
                </div>
                <h3 className="text-lg font-bold text-zinc-900 mb-1">No blocked users</h3>
                <p className="text-sm text-zinc-500">You haven't blocked anyone yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {blockedUsers.map((user) => (
                  <div key={user.uid} className="flex items-center justify-between group">
                    <div className="flex items-center gap-3">
                      <UserAvatar userId={user.uid} size={44} className="rounded-full" />
                      <div>
                        <h4 className="text-sm font-bold text-zinc-900">{user.username}</h4>
                        <p className="text-xs text-zinc-500">{user.displayName}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => unblockUser(user.uid)}
                      className="px-4 py-1.5 bg-zinc-100 text-zinc-900 text-xs font-bold rounded-lg hover:bg-zinc-200 transition-colors"
                    >
                      Unblock
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto bg-zinc-50 h-[100dvh] flex flex-col overflow-hidden">
      <div className="sticky top-0 z-10 bg-white border-b border-zinc-100 px-4 py-3 flex items-center gap-3 shrink-0">
        <button onClick={onBack} className="p-2 -ml-2 text-zinc-900 hover:bg-zinc-100 rounded-full transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold text-zinc-900">Settings and activity</h1>
      </div>

      <div className="flex-1 overflow-y-auto pb-safe">
        {/* Accounts Center Section */}
        <div className="p-4">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-zinc-100 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-indigo-600 rounded flex items-center justify-center">
                  <span className="text-white text-[10px] font-bold">M</span>
                </div>
                <span className="text-sm font-bold text-zinc-900">Accounts Center</span>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-400" />
            </div>
            <p className="text-xs text-zinc-500 mb-4">Password, security, personal details, ad preferences</p>
            <div className="space-y-4">
              <button onClick={onEditProfile} className="w-full flex items-center gap-3 text-zinc-700 hover:bg-zinc-50 p-2 -mx-2 rounded-xl transition-colors">
                <UserIcon className="w-5 h-5" />
                <span className="text-sm font-medium">Personal details</span>
              </button>
              <button onClick={() => setActiveView('password')} className="w-full flex items-center gap-3 text-zinc-700 hover:bg-zinc-50 p-2 -mx-2 rounded-xl transition-colors">
                <Key className="w-5 h-5" />
                <span className="text-sm font-medium">Password and security</span>
              </button>
            </div>
          </div>

          {/* Grouped Settings */}
          <div className="space-y-6">
            {settingsGroups.map((group, gIndex) => (
              <div key={gIndex} className="space-y-3">
                <h2 className="px-2 text-xs font-bold text-zinc-400 uppercase tracking-widest">{group.title}</h2>
                <div className="bg-white rounded-2xl overflow-hidden border border-zinc-100 shadow-sm">
                  {group.items.map((item, iIndex) => (
                    <button
                      key={iIndex}
                      onClick={item.onClick}
                      className={`w-full flex items-center justify-between p-4 hover:bg-zinc-50 transition-colors ${iIndex !== group.items.length - 1 ? 'border-b border-zinc-50' : ''}`}
                    >
                      <div className={`flex items-center gap-3 ${item.color || 'text-zinc-700'}`}>
                        {item.icon}
                        <span className="text-sm font-medium">{item.title}</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-zinc-400" />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden"
            >
              <div className="p-6">
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4 mx-auto">
                  <ShieldAlert className="w-6 h-6 text-red-600" />
                </div>
                <h3 className="text-xl font-bold text-center text-zinc-900 mb-2">Delete Account?</h3>
                <p className="text-center text-zinc-500 text-sm mb-6">
                  This action cannot be undone. All your posts, comments, likes, and profile data will be permanently deleted.
                </p>
                <div className="mb-6">
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Confirm Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                    <input
                      type={showDeletePassword ? "text" : "password"}
                      value={deletePassword}
                      onChange={(e) => setDeletePassword(e.target.value)}
                      className="w-full pl-10 pr-12 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-all"
                      placeholder="Enter your password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowDeletePassword(!showDeletePassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-900 transition-colors"
                    >
                      {showDeletePassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-3">
                  <button
                    onClick={handleDeleteAccount}
                    disabled={deleteCountdown > 0 || isDeleting || !deletePassword}
                    className="w-full py-3.5 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isDeleting ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4" />
                        {deleteCountdown > 0 ? `Delete Account (${deleteCountdown}s)` : 'Yes, Delete My Account'}
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={isDeleting}
                    className="w-full py-3.5 bg-zinc-100 text-zinc-900 font-bold rounded-xl hover:bg-zinc-200 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
