import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot, doc, getDoc, setDoc, deleteDoc, writeBatch, increment, serverTimestamp, getDocs, addDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { db, auth } from '../firebase';
import { handleFirestoreError, OperationType } from '../utils/firestore';
import { Post, User } from '../types';
import { LogOut, Grid3X3, Camera, Edit2, UserPlus, UserMinus, ArrowLeft } from 'lucide-react';
import PostDetailsModal from './PostDetailsModal';
import EditProfileModal from './EditProfileModal';
import FollowListModal from './FollowListModal';
import { AnimatePresence } from 'motion/react';

interface ProfileProps {
  userId?: string;
  onBack?: () => void;
}

export default function Profile({ userId, onBack }: ProfileProps) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [userProfile, setUserProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isFollowLoading, setIsFollowLoading] = useState(false);
  
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [followModalType, setFollowModalType] = useState<'followers' | 'following' | null>(null);
  const [viewedUserId, setViewedUserId] = useState<string | null>(null);

  const currentUser = auth.currentUser;
  const targetUserId = viewedUserId || userId || currentUser?.uid;
  const isOwnProfile = currentUser?.uid === targetUserId;

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
      console.error('Error fetching user posts:', error);
      setLoading(false);
    });

    return () => {
      unsubscribeUser();
      unsubscribePosts();
    };
  }, [targetUserId]);

  useEffect(() => {
    // Check follow status
    const checkFollow = async () => {
      if (!currentUser || isOwnProfile || !targetUserId) return;
      const followId = `${currentUser.uid}_${targetUserId}`;
      const followRef = doc(db, 'follows', followId);
      const followSnap = await getDoc(followRef);
      setIsFollowing(followSnap.exists());
    };
    checkFollow();
  }, [currentUser, targetUserId, isOwnProfile]);

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
        {isOwnProfile && (
          <button 
            onClick={handleSignOut}
            className="p-2 text-zinc-500 hover:text-red-500 transition-colors rounded-full hover:bg-zinc-100"
          >
            <LogOut className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Profile Info */}
      <div className="p-4 flex items-center gap-6">
        <div className="w-20 h-20 rounded-full bg-zinc-200 overflow-hidden shrink-0 border border-zinc-200">
          {userProfile.photoURL ? (
            <img src={userProfile.photoURL} alt={userProfile.displayName || ''} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-500 font-medium text-2xl">
              {userProfile.displayName?.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="flex-1 flex justify-around text-center">
          <div>
            <div className="font-semibold text-lg text-zinc-900">{posts.length}</div>
            <div className="text-sm text-zinc-500">Posts</div>
          </div>
          <div className="cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setFollowModalType('followers')}>
            <div className="font-semibold text-lg text-zinc-900">{userProfile.followersCount || 0}</div>
            <div className="text-sm text-zinc-500">Followers</div>
          </div>
          <div className="cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setFollowModalType('following')}>
            <div className="font-semibold text-lg text-zinc-900">{userProfile.followingCount || 0}</div>
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
              <button 
                onClick={handleFollowToggle}
                disabled={isFollowLoading}
                className={`flex-1 py-1.5 px-4 font-medium rounded-lg transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-70 ${
                  isFollowing 
                    ? 'bg-zinc-100 hover:bg-zinc-200 text-zinc-900' 
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                }`}
              >
                {isFollowing ? (
                  <>
                    <UserMinus className="w-4 h-4" />
                    Following
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" />
                    Follow
                  </>
                )}
              </button>
              <button 
                onClick={async () => {
                  if (!currentUser || !targetUserId) return;
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
                    try {
                      await addDoc(collection(db, 'chats'), {
                        participants: [currentUser.uid, targetUserId],
                        updatedAt: serverTimestamp()
                      });
                    } catch (err) {
                      handleFirestoreError(err, OperationType.CREATE, 'chats');
                    }
                  }
                  
                  // In a real app, we'd navigate to the messages tab and open this chat.
                  // For now, we just create it. The user can go to messages tab to see it.
                  alert('Chat created! Go to the Messages tab to start chatting.');
                }}
                className="flex-1 py-1.5 px-4 bg-zinc-100 hover:bg-zinc-200 text-zinc-900 font-medium rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
              >
                Message
              </button>
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
      {loading ? (
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
              onClick={() => setSelectedPost(post)}
            >
              <img 
                src={post.imageUrl} 
                alt="Post" 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-medium">
                ❤️ {post.likesCount}
              </div>
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
    </div>
  );
}
