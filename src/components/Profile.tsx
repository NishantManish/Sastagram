import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot, doc, getDoc, setDoc, deleteDoc, writeBatch, increment, serverTimestamp, getDocs, addDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { db, auth } from '../firebase';
import { handleFirestoreError, OperationType } from '../utils/firestore';
import { Post, User } from '../types';
import { Menu, Grid3X3, Camera, Edit2, UserPlus, UserMinus, ArrowLeft, ShieldAlert, ShieldCheck, MoreVertical, LogOut, Trash2 } from 'lucide-react';
import PostDetailsModal from './PostDetailsModal';
import EditProfileModal from './EditProfileModal';
import FollowListModal from './FollowListModal';
import { motion, AnimatePresence } from 'motion/react';
import { blockUser, unblockUser, useBlocks } from '../services/blockService';
import { getOptimizedImageUrl } from '../utils/cloudinary';
import { deleteFromCloudinary } from '../utils/media';
import UserAvatar from './UserAvatar';
import ConfirmationModal from './ConfirmationModal';

interface ProfileProps {
  userId?: string;
  onBack?: () => void;
  onNavigate?: (tab: 'feed' | 'search' | 'create' | 'notifications' | 'profile' | 'messages') => void;
}

export default function Profile({ userId, onBack, onNavigate }: ProfileProps) {
  const [posts, setPosts] = useState<Post[]>([]);
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
      // If we get a permission error, it might be because we are blocked
      if (error.message.includes('permission')) {
        setPosts([]);
      }
      console.error('Error fetching user posts:', error);
      setLoading(false);
    });

    return () => {
      unsubscribeUser();
      unsubscribePosts();
    };
  }, [targetUserId]);

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
    <div className="max-w-md mx-auto pb-20 bg-white min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-zinc-200">
        <div className="flex items-center gap-3">
          {(viewedUserId || onBack) && (
            <button 
              onClick={() => viewedUserId ? setViewedUserId(null) : onBack?.()}
              className="p-2 -ml-2 text-zinc-500 hover:bg-zinc-100 rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <h1 className="text-xl font-semibold text-zinc-900">{userProfile.displayName}</h1>
        </div>
        <div className="flex items-center gap-1">
          {!isOwnProfile && (
            <div className="relative">
              <button 
                onClick={() => setShowOptionsMenu(!showOptionsMenu)}
                className="p-2 text-zinc-500 hover:bg-zinc-100 rounded-full transition-colors"
              >
                <MoreVertical className="w-5 h-5" />
              </button>
              
              <AnimatePresence>
                {showOptionsMenu && (
                  <>
                    <div 
                      className="fixed inset-0 z-20" 
                      onClick={() => setShowOptionsMenu(false)} 
                    />
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -10 }}
                      className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-zinc-200 z-30 overflow-hidden"
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
                        className={`w-full px-4 py-3 text-left text-sm font-medium flex items-center gap-2 hover:bg-zinc-50 transition-colors ${
                          isBlockedByMe ? 'text-indigo-600' : 'text-red-600'
                        }`}
                      >
                        {isBlockedByMe ? (
                          <>
                            <ShieldCheck className="w-4 h-4" />
                            Unblock User
                          </>
                        ) : (
                          <>
                            <ShieldAlert className="w-4 h-4" />
                            Block User
                          </>
                        )}
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          )}
          {isOwnProfile && (
            <div className="relative">
              <button 
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="p-2 text-zinc-500 hover:bg-zinc-100 rounded-full transition-colors"
              >
                <Menu className="w-5 h-5" />
              </button>
              
              <AnimatePresence>
                {showProfileMenu && (
                  <>
                    <div 
                      className="fixed inset-0 z-20" 
                      onClick={() => setShowProfileMenu(false)} 
                    />
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -10 }}
                      className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-zinc-200 z-30 overflow-hidden"
                    >
                      <button
                        onClick={() => {
                          setShowProfileMenu(false);
                          handleSignOut();
                        }}
                        className="w-full px-4 py-3 text-left text-sm font-medium flex items-center gap-2 hover:bg-zinc-50 transition-colors text-red-600"
                      >
                        <LogOut className="w-4 h-4" />
                        Logout
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* Profile Info */}
      <div className="p-4 flex items-center gap-6">
        <UserAvatar 
          userId={targetUserId} 
          size={80} 
          className="border border-zinc-200"
          fallbackPhoto={userProfile.photoURL} 
          fallbackName={userProfile.displayName} 
        />
        <div className="flex-1 flex justify-around text-center">
          <div>
            <div className="font-semibold text-lg text-zinc-900">{posts.length}</div>
            <div className="text-sm text-zinc-500">Posts</div>
          </div>
          <div 
            className={`cursor-pointer hover:opacity-80 transition-opacity ${isBlockedByMe ? 'pointer-events-none opacity-50' : ''}`} 
            onClick={() => !isBlockedByMe && setFollowModalType('followers')}
          >
            <div className="font-semibold text-lg text-zinc-900">{isBlockedByMe ? '-' : (userProfile.followersCount || 0)}</div>
            <div className="text-sm text-zinc-500">Followers</div>
          </div>
          <div 
            className={`cursor-pointer hover:opacity-80 transition-opacity ${isBlockedByMe ? 'pointer-events-none opacity-50' : ''}`} 
            onClick={() => !isBlockedByMe && setFollowModalType('following')}
          >
            <div className="font-semibold text-lg text-zinc-900">{isBlockedByMe ? '-' : (userProfile.followingCount || 0)}</div>
            <div className="text-sm text-zinc-500">Following</div>
          </div>
        </div>
      </div>

      <div className="px-4 pb-4">
        <div className="font-semibold text-sm text-zinc-900">{userProfile.displayName}</div>
        {userProfile.username && <div className="text-sm text-zinc-500 mt-0.5">@{userProfile.username}</div>}
        {userProfile.bio && <div className="text-sm text-zinc-600 mt-1 whitespace-pre-wrap">{userProfile.bio}</div>}
        
        <div className="mt-4 flex gap-2">
          {isOwnProfile ? (
            <button 
              onClick={() => setIsEditingProfile(true)}
              className="w-full py-1.5 px-4 bg-zinc-100 hover:bg-zinc-200 text-zinc-900 font-medium rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
            >
              <Edit2 className="w-4 h-4" />
              Edit Profile
            </button>
          ) : (
            <>
              {isFollowing === false && !isBlockedByMe && (
                <button 
                  onClick={handleFollowToggle}
                  disabled={isFollowLoading}
                  className="flex-1 py-1.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-70"
                >
                  <UserPlus className="w-4 h-4" />
                  {isFollowedBy ? 'Follow Back' : 'Follow'}
                </button>
              )}
              {isFollowing === true && !isBlockedByMe && (
                <button 
                  onClick={handleFollowToggle}
                  disabled={isFollowLoading}
                  className="flex-1 py-1.5 px-4 bg-zinc-100 hover:bg-zinc-200 text-zinc-900 font-medium rounded-lg transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-70"
                >
                  <UserMinus className="w-4 h-4" />
                  Following
                </button>
              )}
              {!isBlockedByMe && (
                <button 
                  onClick={async () => {
                  if (!currentUser || !targetUserId || isMessagingLoading) return;
                  setIsMessagingLoading(true);
                  try {
                    // Check if chat exists
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
                      // Create new chat
                      await addDoc(collection(db, 'chats'), {
                        participants: [currentUser.uid, targetUserId],
                        updatedAt: serverTimestamp()
                      });
                    }
                    
                    if (onNavigate) {
                      onNavigate('messages');
                    } else {
                      alert('Chat created! Go to the Messages tab to start chatting.');
                    }
                  } catch (err) {
                    handleFirestoreError(err, OperationType.CREATE, 'chats');
                  } finally {
                    setIsMessagingLoading(false);
                  }
                }}
                disabled={isMessagingLoading}
                className="flex-1 py-1.5 px-4 bg-zinc-100 hover:bg-zinc-200 text-zinc-900 font-medium rounded-lg transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-50"
              >
                {isMessagingLoading ? 'Loading...' : 'Message'}
              </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-t border-zinc-200">
        <button className="flex-1 py-3 flex justify-center items-center border-t-2 border-zinc-900 text-zinc-900">
          <Grid3X3 className="w-6 h-6" />
        </button>
      </div>

      {/* Grid */}
      {isBlockedByMe ? (
        <div className="flex flex-col items-center justify-center h-64 text-zinc-500 px-8 text-center">
          <ShieldAlert className="w-12 h-12 mb-4 text-zinc-300" />
          <p className="text-lg font-medium text-zinc-900">You have blocked this user</p>
          <p className="text-sm">Unblock them to see their posts.</p>
        </div>
      ) : loading ? (
        <div className="flex justify-center items-center h-40">
          <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-zinc-500">
          <Camera className="w-12 h-12 mb-4 text-zinc-300" />
          <p className="text-lg font-medium text-zinc-900">No posts yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1">
          {posts.map((post) => (
            <div 
              key={post.id} 
              className="aspect-square bg-zinc-100 relative group cursor-pointer"
            >
              <img 
                src={getOptimizedImageUrl(post.imageUrl, 400, 400)} 
                alt="Post" 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
                onClick={() => setSelectedPost(post)}
              />
              <div 
                className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-medium"
                onClick={() => setSelectedPost(post)}
              >
                ❤️ {post.likesCount}
              </div>
              {isOwnProfile && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setPostToDelete(post);
                  }}
                  className="absolute top-2 right-2 p-1.5 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      <AnimatePresence>
        {selectedPost && (
          <PostDetailsModal 
            post={selectedPost} 
            onClose={() => setSelectedPost(null)} 
            onUserClick={setViewedUserId}
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
    </div>
  );
}
