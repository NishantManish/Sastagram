import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, orderBy, limit, doc, deleteDoc, where, getDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { User, MessageSquare, Image as ImageIcon, Trash2, ChevronRight, ChevronLeft, ArrowLeft, Search, Bookmark, Heart, Users, Star, ShieldAlert, AlertTriangle, X, Layers, BarChart3, ShieldCheck, UserPlus, Mail } from 'lucide-react';
import { cn } from '../utils';
import { deleteFromCloudinary } from '../utils/media';
import { motion, AnimatePresence } from 'motion/react';
import HighlightViewerModal from './HighlightViewerModal';

interface UserData {
  uid: string;
  displayName: string;
  username: string;
  photoURL?: string;
  email?: string;
  role?: string;
  createdAt: any;
  followersCount?: number;
  followingCount?: number;
}

interface ChatData {
  id: string;
  participants: string[];
  participantNames?: string[];
  lastMessage?: string;
  updatedAt: any;
}

interface MessageData {
  id: string;
  text: string;
  senderId: string;
  createdAt: any;
  attachmentUrl?: string;
}

interface PostData {
  id: string;
  imageUrl?: string;
  videoUrl?: string;
  mediaUrls?: { url: string; type: string }[];
  caption?: string;
  createdAt: any;
}

interface StoryData {
  id: string;
  imageUrl?: string;
  videoUrl?: string;
  authorId: string;
  createdAt: any;
  viewers?: string[];
  viewsCount?: number;
}

interface HighlightData {
  id: string;
  label: string;
  imageUrl: string;
  createdAt: any;
}

export default function AdminDashboard() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserData[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [view, setView] = useState<'users' | 'user-details' | 'user-chats' | 'user-chat-messages' | 'user-posts' | 'user-saved' | 'user-liked' | 'user-highlights' | 'user-stories' | 'user-followers' | 'user-following' | 'post-details'>('users');
  
  const [fullControl, setFullControl] = useState(false);

  const [userChats, setUserChats] = useState<ChatData[]>([]);
  const [selectedChat, setSelectedChat] = useState<ChatData | null>(null);
  const [chatMessages, setChatMessages] = useState<MessageData[]>([]);
  
  const [userPosts, setUserPosts] = useState<PostData[]>([]);
  const [userSaved, setUserSaved] = useState<PostData[]>([]);
  const [userLiked, setUserLiked] = useState<PostData[]>([]);
  const [userHighlights, setUserHighlights] = useState<HighlightData[]>([]);
  const [userStories, setUserStories] = useState<StoryData[]>([]);
  const [userFollowers, setUserFollowers] = useState<UserData[]>([]);
  const [userFollowing, setUserFollowing] = useState<UserData[]>([]);
  const [selectedPost, setSelectedPost] = useState<PostData | null>(null);
  const [currentPostMediaIndex, setCurrentPostMediaIndex] = useState(0);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const [postDetailsSource, setPostDetailsSource] = useState<'user-posts' | 'user-saved' | 'user-liked'>('user-posts');
  const [viewingHighlight, setViewingHighlight] = useState<HighlightData | null>(null);
  const [confirmModal, setConfirmModal] = useState<{

    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    isDestructive?: boolean;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    isDestructive: true
  });

  const confirmAction = (title: string, message: string, onConfirm: () => void, isDestructive = true) => {
    setConfirmModal({ isOpen: true, title, message, onConfirm, isDestructive });
  };

  const sendAdminDeleteNotification = async (userId: string, contentPreview: string, contentId?: string, contentType?: 'post' | 'story' | 'comment' | 'highlight' | 'message') => {
    try {
      await addDoc(collection(db, 'notifications'), {
        userId,
        type: 'admin_delete',
        senderId: auth.currentUser?.uid || 'admin',
        senderName: 'Administrator',
        senderPhoto: '',
        contentPreview,
        postId: contentType === 'post' ? contentId : undefined,
        storyId: contentType === 'story' ? contentId : undefined,
        commentId: contentType === 'comment' ? contentId : undefined,
        read: false,
        createdAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error sending admin delete notification:', error);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredUsers(users);
    } else {
      const lowerQ = searchQuery.toLowerCase();
      setFilteredUsers(users.filter(u => 
        u.displayName.toLowerCase().includes(lowerQ) || 
        u.username.toLowerCase().includes(lowerQ) ||
        (u.email && u.email.toLowerCase().includes(lowerQ))
      ));
    }
  }, [searchQuery, users]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(100));
      const snapshot = await getDocs(q);
      const usersData = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserData));
      setUsers(usersData);
      setFilteredUsers(usersData);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUserClick = (user: UserData) => {
    setSelectedUser(user);
    setView('user-details');
  };

  const fetchUserFollowers = async (userId: string) => {
    setLoadingDetails(true);
    setView('user-followers');
    try {
      const q = query(collection(db, 'follows'), where('followingId', '==', userId));
      const snapshot = await getDocs(q);
      const followerIds = snapshot.docs.map(doc => doc.data().followerId).filter(Boolean);
      
      const followers: UserData[] = [];
      for (const fid of followerIds) {
        if (!fid) continue;
        const uDoc = await getDoc(doc(db, 'users', fid));
        if (uDoc.exists()) {
          followers.push({ uid: uDoc.id, ...uDoc.data() } as UserData);
        }
      }
      setUserFollowers(followers);
    } catch (error) {
      console.error('Error fetching followers:', error);
    } finally {
      setLoadingDetails(false);
    }
  };

  const fetchUserFollowing = async (userId: string) => {
    setLoadingDetails(true);
    setView('user-following');
    try {
      const q = query(collection(db, 'follows'), where('followerId', '==', userId));
      const snapshot = await getDocs(q);
      const followingIds = snapshot.docs.map(doc => doc.data().followingId).filter(Boolean);
      
      const following: UserData[] = [];
      for (const fid of followingIds) {
        if (!fid) continue;
        const uDoc = await getDoc(doc(db, 'users', fid));
        if (uDoc.exists()) {
          following.push({ uid: uDoc.id, ...uDoc.data() } as UserData);
        }
      }
      setUserFollowing(following);
    } catch (error) {
      console.error('Error fetching following:', error);
    } finally {
      setLoadingDetails(false);
    }
  };

  const fetchUserChats = async (userId: string) => {
    setLoadingDetails(true);
    setView('user-chats');
    try {
      const q = query(collection(db, 'chats'), where('participants', 'array-contains', userId));
      const snapshot = await getDocs(q);
      const chatsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatData));
      
      // Fetch participant names
      for (const chat of chatsData) {
        const names = [];
        for (const pId of chat.participants) {
          const uDoc = await getDoc(doc(db, 'users', pId));
          if (uDoc.exists()) {
            names.push(uDoc.data().displayName || pId.slice(0, 8));
          } else {
            names.push(pId.slice(0, 8));
          }
        }
        chat.participantNames = names;
      }
      
      setUserChats(chatsData);
    } catch (error) {
      console.error('Error fetching chats:', error);
    } finally {
      setLoadingDetails(false);
    }
  };

  const fetchChatMessages = async (chatId: string) => {
    setLoadingDetails(true);
    setView('user-chat-messages');
    try {
      const q = query(collection(db, `chats/${chatId}/messages`), orderBy('createdAt', 'asc'));
      const snapshot = await getDocs(q);
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MessageData));
      setChatMessages(msgs);
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoadingDetails(false);
    }
  };

  const fetchUserPosts = async (userId: string) => {
    setLoadingDetails(true);
    setView('user-posts');
    try {
      const q = query(collection(db, 'posts'), where('authorId', '==', userId));
      const snapshot = await getDocs(q);
      let postsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PostData));
      postsData.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setUserPosts(postsData);
    } catch (error) {
      console.error('Error fetching posts:', error);
    } finally {
      setLoadingDetails(false);
    }
  };

  const fetchUserSaved = async (userId: string) => {
    setLoadingDetails(true);
    setView('user-saved');
    try {
      const q = query(collection(db, 'savedPosts'), where('userId', '==', userId));
      const snapshot = await getDocs(q);
      let savedDocs = snapshot.docs.map(doc => doc.data());
      savedDocs.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      const postIds = savedDocs.map(data => data.postId).filter(Boolean);
      
      const posts: PostData[] = [];
      for (const pid of postIds) {
        if (!pid) continue;
        const pDoc = await getDoc(doc(db, 'posts', pid));
        if (pDoc.exists()) {
          posts.push({ id: pDoc.id, ...pDoc.data() } as PostData);
        }
      }
      setUserSaved(posts);
    } catch (error) {
      console.error('Error fetching saved posts:', error);
    } finally {
      setLoadingDetails(false);
    }
  };

  const fetchUserLiked = async (userId: string) => {
    setLoadingDetails(true);
    setView('user-liked');
    try {
      const q = query(collection(db, 'likes'), where('userId', '==', userId));
      const snapshot = await getDocs(q);
      let likedDocs = snapshot.docs.map(doc => doc.data());
      likedDocs.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      const postIds = likedDocs.map(data => data.postId).filter(Boolean);
      
      const posts: PostData[] = [];
      for (const pid of postIds) {
        if (!pid) continue;
        const pDoc = await getDoc(doc(db, 'posts', pid));
        if (pDoc.exists()) {
          posts.push({ id: pDoc.id, ...pDoc.data() } as PostData);
        }
      }
      setUserLiked(posts);
    } catch (error) {
      console.error('Error fetching liked posts:', error);
    } finally {
      setLoadingDetails(false);
    }
  };

  const fetchUserStories = async (userId: string) => {
    setLoadingDetails(true);
    setView('user-stories');
    try {
      const q = query(collection(db, 'stories'), where('authorId', '==', userId));
      const snapshot = await getDocs(q);
      let storiesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StoryData));
      storiesData.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setUserStories(storiesData);
    } catch (error) {
      console.error('Error fetching stories:', error);
    } finally {
      setLoadingDetails(false);
    }
  };

  const fetchUserHighlights = async (userId: string) => {
    setLoadingDetails(true);
    setView('user-highlights');
    try {
      const q = query(collection(db, 'highlights'), where('userId', '==', userId));
      const snapshot = await getDocs(q);
      let highlightsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as HighlightData));
      highlightsData.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setUserHighlights(highlightsData);
    } catch (error) {
      console.error('Error fetching highlights:', error);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleDeletePost = async (postId: string, postData?: PostData) => {
    if (!fullControl || !selectedUser) return;
    confirmAction('Delete Post', 'Are you sure you want to delete this post? This action cannot be undone.', async () => {
      try {
        const postSnap = await getDoc(doc(db, 'posts', postId));
        const fetchedPostData = postSnap.exists() ? postSnap.data() as PostData : null;
        const finalPostData = postData || fetchedPostData;
        const authorId = finalPostData?.authorId || selectedUser.uid;
        const caption = finalPostData?.caption || '';

        await deleteDoc(doc(db, 'posts', postId));
        
        // Delete all media
        if (finalPostData) {
          const mediaToDelete: string[] = [];
          if (finalPostData.imageUrl) mediaToDelete.push(finalPostData.imageUrl);
          if (finalPostData.videoUrl) mediaToDelete.push(finalPostData.videoUrl);
          if (finalPostData.mediaUrls) {
            finalPostData.mediaUrls.forEach(m => mediaToDelete.push(m.url));
          }
          await Promise.all(mediaToDelete.map(url => deleteFromCloudinary(url)));
        }

        // Send notification to user
        await sendAdminDeleteNotification(
          authorId,
          caption.slice(0, 50) || 'Post content removed',
          postId,
          'post'
        );

        setUserPosts(prev => prev.filter(p => p.id !== postId));
        setUserSaved(prev => prev.filter(p => p.id !== postId));
        setUserLiked(prev => prev.filter(p => p.id !== postId));
        if (view === 'post-details') {
          setView('user-posts');
        }
      } catch (error) {
        console.error('Error deleting post:', error);
        alert('Failed to delete post');
      }
    });
  };

  const handleDeleteHighlight = async (highlightId: string, imageUrl: string) => {
    if (!fullControl || !selectedUser) return;
    confirmAction('Delete Highlight', 'Are you sure you want to delete this highlight?', async () => {
      try {
        const hSnap = await getDoc(doc(db, 'highlights', highlightId));
        const hData = hSnap.exists() ? hSnap.data() : null;
        const label = hData?.label || 'Highlight';

        await deleteDoc(doc(db, 'highlights', highlightId));
        
        const mediaToDelete: string[] = [];
        if (imageUrl) mediaToDelete.push(imageUrl);
        if (hData?.imageUrl && hData.imageUrl !== imageUrl) mediaToDelete.push(hData.imageUrl);
        if (hData?.mediaUrls) {
          hData.mediaUrls.forEach((url: string) => mediaToDelete.push(url));
        }
        await Promise.all(mediaToDelete.map(url => deleteFromCloudinary(url)));

        // Send notification
        await sendAdminDeleteNotification(
          selectedUser.uid,
          `Highlight "${label}" removed`,
          highlightId,
          'highlight'
        );

        setUserHighlights(prev => prev.filter(h => h.id !== highlightId));
      } catch (error) {
        console.error('Error deleting highlight:', error);
      }
    });
  };

  const handleDeleteStory = async (storyId: string, imageUrl?: string, videoUrl?: string) => {
    if (!fullControl || !selectedUser) return;
    confirmAction('Delete Story', 'Are you sure you want to delete this story?', async () => {
      try {
        await deleteDoc(doc(db, 'stories', storyId));
        if (imageUrl) {
          await deleteFromCloudinary(imageUrl);
        }
        if (videoUrl) {
          await deleteFromCloudinary(videoUrl);
        }

        // Send notification
        await sendAdminDeleteNotification(
          selectedUser.uid,
          `Story removed`,
          storyId,
          'story'
        );

        setUserStories(prev => prev.filter(s => s.id !== storyId));
      } catch (error) {
        console.error('Error deleting story:', error);
      }
    });
  };

  const handleRemoveSaved = async (postId: string) => {
    if (!fullControl || !selectedUser) return;
    confirmAction('Remove Saved Post', 'Remove this post from saved items?', async () => {
      try {
        const q = query(collection(db, 'savedPosts'), where('userId', '==', selectedUser.uid), where('postId', '==', postId));
        const snapshot = await getDocs(q);
        for (const d of snapshot.docs) {
          await deleteDoc(doc(db, 'savedPosts', d.id));
        }
        setUserSaved(prev => prev.filter(p => p.id !== postId));
      } catch (error) {
        console.error('Error removing saved post:', error);
      }
    });
  };

  const handleRemoveLiked = async (postId: string) => {
    if (!fullControl || !selectedUser) return;
    confirmAction('Remove Liked Post', 'Remove this post from liked items?', async () => {
      try {
        const q = query(collection(db, 'likes'), where('userId', '==', selectedUser.uid), where('postId', '==', postId));
        const snapshot = await getDocs(q);
        for (const d of snapshot.docs) {
          await deleteDoc(doc(db, 'likes', d.id));
        }
        setUserLiked(prev => prev.filter(p => p.id !== postId));
      } catch (error) {
        console.error('Error removing liked post:', error);
      }
    });
  };

  const handleDeleteChat = async (chatId: string) => {
    if (!fullControl) return;
    confirmAction('Delete Chat', 'Delete this chat and all its messages permanently?', async () => {
      try {
        const messagesQ = query(collection(db, `chats/${chatId}/messages`));
        const messagesSnapshot = await getDocs(messagesQ);
        for (const msgDoc of messagesSnapshot.docs) {
          const msgData = msgDoc.data() as MessageData;
          if (msgData.attachmentUrl) {
            await deleteFromCloudinary(msgData.attachmentUrl);
          }
          await deleteDoc(doc(db, `chats/${chatId}/messages`, msgDoc.id));
        }
        await deleteDoc(doc(db, 'chats', chatId));
        setUserChats(prev => prev.filter(c => c.id !== chatId));
      } catch (error) {
        console.error('Error deleting chat:', error);
      }
    });
  };

  const handleDeleteMessage = async (chatId: string, msgId: string, attachmentUrl?: string) => {
    if (!fullControl || !selectedUser) return;
    confirmAction('Delete Message', 'Are you sure you want to delete this message?', async () => {
      try {
        const msgSnap = await getDoc(doc(db, `chats/${chatId}/messages`, msgId));
        const msgData = msgSnap.exists() ? msgSnap.data() : null;
        const text = msgData?.text || 'Message content';
        const senderId = msgData?.senderId;

        await deleteDoc(doc(db, `chats/${chatId}/messages`, msgId));
        if (attachmentUrl) {
          await deleteFromCloudinary(attachmentUrl);
        }

        // Send notification to message sender
        if (senderId) {
          await sendAdminDeleteNotification(
            senderId,
            `Message removed: "${text.slice(0, 30)}..."`,
            msgId,
            'message'
          );
        }

        setChatMessages(prev => prev.filter(m => m.id !== msgId));
      } catch (error) {
        console.error('Error deleting message:', error);
      }
    });
  };

  const handleDeleteUser = async (user: UserData) => {
    if (!fullControl) return;
    confirmAction(
      'Delete User Account',
      `Are you sure you want to permanently delete user ${user.displayName}? This action cannot be undone and will delete all their posts, chats, and data.`,
      async () => {
        setLoadingDetails(true);
        try {
          // 0. Notify user via email first
          try {
            await fetch('/api/admin/notify-account-deletion', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: user.email,
                displayName: user.displayName
              })
            });
          } catch (emailError) {
            console.error('Failed to send email notification:', emailError);
            // Continue with deletion anyway as per requirement "notify and then delete"
          }

          // 1. Delete user's posts
          const postsQ = query(collection(db, 'posts'), where('authorId', '==', user.uid));
          const postsSnapshot = await getDocs(postsQ);
          for (const postDoc of postsSnapshot.docs) {
            const postData = postDoc.data() as PostData;
            const mediaToDelete: string[] = [];
            if (postData.imageUrl) mediaToDelete.push(postData.imageUrl);
            if (postData.videoUrl) mediaToDelete.push(postData.videoUrl);
            if (postData.mediaUrls) {
              postData.mediaUrls.forEach(m => mediaToDelete.push(m.url));
            }
            await Promise.all(mediaToDelete.map(url => deleteFromCloudinary(url)));
            await deleteDoc(doc(db, 'posts', postDoc.id));
          }

          // 2. Delete user's highlights
          const highlightsQ = query(collection(db, 'highlights'), where('userId', '==', user.uid));
          const highlightsSnapshot = await getDocs(highlightsQ);
          for (const highlightDoc of highlightsSnapshot.docs) {
            const hData = highlightDoc.data();
            const mediaToDelete: string[] = [];
            if (hData.imageUrl) mediaToDelete.push(hData.imageUrl);
            if (hData.mediaUrls) {
              hData.mediaUrls.forEach((url: string) => mediaToDelete.push(url));
            }
            await Promise.all(mediaToDelete.map(url => deleteFromCloudinary(url)));
            await deleteDoc(doc(db, 'highlights', highlightDoc.id));
          }

          // 3. Delete user's chats and messages
          const chatsQ = query(collection(db, 'chats'), where('participants', 'array-contains', user.uid));
          const chatsSnapshot = await getDocs(chatsQ);
          for (const chatDoc of chatsSnapshot.docs) {
            // Delete messages in chat
            const messagesQ = query(collection(db, `chats/${chatDoc.id}/messages`));
            const messagesSnapshot = await getDocs(messagesQ);
            for (const msgDoc of messagesSnapshot.docs) {
              const msgData = msgDoc.data() as MessageData;
              if (msgData.attachmentUrl) {
                await deleteFromCloudinary(msgData.attachmentUrl);
              }
              await deleteDoc(doc(db, `chats/${chatDoc.id}/messages`, msgDoc.id));
            }
            // Delete chat document
            await deleteDoc(doc(db, 'chats', chatDoc.id));
          }

          // 4. Delete user's stories
          const storiesQ = query(collection(db, 'stories'), where('authorId', '==', user.uid));
          const storiesSnapshot = await getDocs(storiesQ);
          for (const storyDoc of storiesSnapshot.docs) {
            const storyData = storyDoc.data() as StoryData;
            if (storyData.imageUrl) {
              await deleteFromCloudinary(storyData.imageUrl);
            }
            if (storyData.videoUrl) {
              await deleteFromCloudinary(storyData.videoUrl);
            }
            await deleteDoc(doc(db, 'stories', storyDoc.id));
          }

          // 5. Delete user's savedPosts
          const savedPostsQ = query(collection(db, 'savedPosts'), where('userId', '==', user.uid));
          const savedPostsSnapshot = await getDocs(savedPostsQ);
          for (const savedPostDoc of savedPostsSnapshot.docs) {
            await deleteDoc(doc(db, 'savedPosts', savedPostDoc.id));
          }

          // 6. Delete user's blocks
          const blocksQ = query(collection(db, 'blocks'), where('userId', '==', user.uid));
          const blocksSnapshot = await getDocs(blocksQ);
          for (const blockDoc of blocksSnapshot.docs) {
            await deleteDoc(doc(db, 'blocks', blockDoc.id));
          }

          // 7. Delete user document
          await deleteDoc(doc(db, 'users', user.uid));

          // Update UI
          setUsers(prev => prev.filter(u => u.uid !== user.uid));
          setFilteredUsers(prev => prev.filter(u => u.uid !== user.uid));
          setView('users');
          setSelectedUser(null);
        } catch (error) {
          console.error('Error deleting user:', error);
          alert('Failed to delete user completely. Check console for details.');
        } finally {
          setLoadingDetails(false);
        }
      }
    );
  };

  const renderPostGrid = (posts: PostData[], type: 'posts' | 'saved' | 'liked') => {
    if (loadingDetails) {
      return <div className="flex justify-center p-8"><div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>;
    }
    if (posts.length === 0) {
      return <p className="text-center text-zinc-500 p-8">No posts found.</p>;
    }
    return (
      <div className="grid grid-cols-3 gap-1">
        {posts.map(post => {
          const mediaList = post.mediaUrls && post.mediaUrls.length > 0 
            ? post.mediaUrls 
            : [{ url: post.imageUrl || post.videoUrl, type: post.videoUrl ? 'video' : 'image' }];
          const displayUrl = mediaList[0]?.url;
          const isMultiMedia = mediaList.length > 1;

          return (
            <div 
              key={post.id} 
              className="relative aspect-square bg-zinc-100 group cursor-pointer overflow-hidden"
              onClick={() => {
                setSelectedPost(post);
                setCurrentPostMediaIndex(0);
                setPostDetailsSource(type === 'posts' ? 'user-posts' : type === 'saved' ? 'user-saved' : 'user-liked');
                setView('post-details');
              }}
            >
              {displayUrl ? (
                mediaList[0].type === 'video' ? (
                  <div className="w-full h-full relative">
                    <video src={displayUrl} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/10" />
                  </div>
                ) : (
                  <img src={displayUrl} alt="" className="w-full h-full object-cover" />
                )
              ) : (
                <div className="w-full h-full flex items-center justify-center p-2 text-center text-[10px] text-zinc-500 overflow-hidden">
                  {post.caption}
                </div>
              )}
              
              {isMultiMedia && (
                <div className="absolute top-2 right-2 p-1 bg-black/50 backdrop-blur-sm rounded-md">
                  <Layers className="w-3 h-3 text-white" />
                </div>
              )}

              {fullControl && (
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      if (type === 'posts') handleDeletePost(post.id, post);
                      else if (type === 'saved') handleRemoveSaved(post.id);
                      else if (type === 'liked') handleRemoveLiked(post.id);
                    }}
                    className="p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors shadow-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  if (loading && view === 'users') {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  const pageVariants = {
    initial: { opacity: 0, y: 10, scale: 0.98 },
    animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.3 } },
    exit: { opacity: 0, y: -10, scale: 0.98, transition: { duration: 0.2 } }
  };

  return (
    <div className="bg-[#F8F9FB] min-h-screen pb-20 font-sans">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white/90 backdrop-blur-xl border-b border-zinc-200/50 px-4 h-16 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          {view !== 'users' && (
            <button 
              onClick={() => {
                if (view === 'user-chat-messages') setView('user-chats');
                else if (view === 'post-details') setView(postDetailsSource);
                else if (view === 'user-followers' || view === 'user-following' || view === 'user-chats' || view === 'user-posts' || view === 'user-saved' || view === 'user-liked' || view === 'user-highlights' || view === 'user-stories') setView('user-details');
                else setView('users');
              }}
              className="p-2 bg-zinc-100 text-zinc-600 hover:bg-zinc-200 rounded-xl transition-all active:scale-95"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div>
            <h1 className="text-lg font-bold text-zinc-900 leading-tight">
              {view === 'users' ? 'Admin Console' : 
               view === 'user-details' ? 'User Profile' :
               view === 'user-chats' ? 'Conversations' : 
               view === 'user-chat-messages' ? 'Chat History' :
               view === 'user-posts' ? 'User Gallery' :
               view === 'user-saved' ? 'Saved Items' :
               view === 'user-liked' ? 'Liked Content' :
               view === 'user-highlights' ? 'Highlights' :
               view === 'user-stories' ? 'Stories' :
               view === 'user-followers' ? 'Followers' :
               view === 'user-following' ? 'Following' :
               view === 'post-details' ? 'Content Review' : ''}
            </h1>
            {view === 'users' && <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">System Management</p>}
            {view !== 'users' && selectedUser && <p className="text-[10px] text-indigo-600 font-bold uppercase tracking-wider">@{selectedUser.username}</p>}
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-full transition-all border",
            fullControl ? "bg-red-50 border-red-100 text-red-600" : "bg-zinc-50 border-zinc-100 text-zinc-500"
          )}>
            <ShieldAlert className={cn("w-3.5 h-3.5", fullControl ? "animate-pulse" : "")} />
            <span className="text-[10px] font-bold uppercase tracking-tight">Control</span>
            <button 
              onClick={() => setFullControl(!fullControl)}
              className={cn(
                "w-8 h-4 rounded-full transition-all relative flex items-center px-0.5", 
                fullControl ? "bg-red-500" : "bg-zinc-300"
              )}
            >
              <div className={cn(
                "w-3 h-3 bg-white rounded-full shadow-sm transition-transform duration-300", 
                fullControl ? "translate-x-4" : "translate-x-0"
              )} />
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 max-w-2xl mx-auto">
        <AnimatePresence mode="wait">
          {view === 'users' && (
            <motion.div 
              key="users"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="space-y-6"
            >
              {/* Stats Overview */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white p-4 rounded-3xl border border-zinc-100 shadow-sm">
                  <div className="w-10 h-10 bg-indigo-50 rounded-2xl flex items-center justify-center mb-3">
                    <Users className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div className="text-2xl font-bold text-zinc-900">{users.length}</div>
                  <div className="text-xs text-zinc-500 font-medium">Total Users</div>
                </div>
                <div className="bg-white p-4 rounded-3xl border border-zinc-100 shadow-sm">
                  <div className="w-10 h-10 bg-emerald-50 rounded-2xl flex items-center justify-center mb-3">
                    <ShieldCheck className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div className="text-2xl font-bold text-zinc-900">{users.filter(u => u.role === 'admin').length}</div>
                  <div className="text-xs text-zinc-500 font-medium">Admins</div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="relative group">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400 group-focus-within:text-indigo-500 transition-colors" />
                  <input
                    type="text"
                    placeholder="Search by name, username, or email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 bg-white border border-zinc-200 rounded-3xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all shadow-sm"
                  />
                </div>
                
                <div className="flex items-center justify-between px-1">
                  <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Directory</h2>
                  <span className="text-[10px] font-bold bg-zinc-100 text-zinc-500 px-2 py-1 rounded-lg">{filteredUsers.length} Results</span>
                </div>

                <div className="space-y-3">
                  {filteredUsers.map(user => (
                    <div 
                      key={user.uid} 
                      onClick={() => handleUserClick(user)}
                      className="flex items-center justify-between p-4 bg-white border border-zinc-100 rounded-3xl cursor-pointer hover:border-indigo-200 hover:shadow-md transition-all active:scale-[0.98]"
                    >
                      <div className="flex items-center gap-4">
                        <div className="relative">
                          <div className="w-12 h-12 rounded-2xl bg-zinc-100 overflow-hidden shrink-0 border border-zinc-200">
                            {user.photoURL ? (
                              <img src={user.photoURL} alt={user.displayName} className="w-full h-full object-cover" />
                            ) : (
                              <User className="w-6 h-6 m-3 text-zinc-400" />
                            )}
                          </div>
                          {user.role === 'admin' && (
                            <div className="absolute -top-1 -right-1 w-4 h-4 bg-indigo-600 rounded-full border-2 border-white flex items-center justify-center">
                              <ShieldCheck className="w-2 h-2 text-white" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-zinc-900 truncate">{user.displayName}</div>
                          <div className="text-xs text-zinc-500 truncate">@{user.username}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-[10px] font-bold text-zinc-400 bg-zinc-50 px-2 py-1 rounded-lg hidden sm:block">
                          {new Date(user.createdAt?.seconds * 1000).toLocaleDateString()}
                        </div>
                        <ChevronRight className="w-5 h-5 text-zinc-300" />
                      </div>
                    </div>
                  ))}
                  {filteredUsers.length === 0 && (
                    <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-zinc-200">
                      <Search className="w-12 h-12 text-zinc-200 mx-auto mb-3" />
                      <p className="text-zinc-400 font-medium">No users found matching your search</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {view === 'user-details' && selectedUser && (
            <motion.div 
              key="user-details"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="space-y-6"
            >
              <div className="bg-white p-8 rounded-[40px] border border-zinc-100 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-24 bg-gradient-to-r from-indigo-500 to-purple-600 opacity-10" />
                
                <div className="relative flex flex-col items-center">
                  <div className="w-28 h-28 rounded-[32px] bg-white p-1 shadow-xl mb-4">
                    <div className="w-full h-full rounded-[28px] bg-zinc-100 overflow-hidden">
                      {selectedUser.photoURL ? (
                        <img src={selectedUser.photoURL} alt={selectedUser.displayName} className="w-full h-full object-cover" />
                      ) : (
                        <User className="w-12 h-12 m-8 text-zinc-400" />
                      )}
                    </div>
                  </div>
                  
                  <h2 className="text-2xl font-black text-zinc-900">{selectedUser.displayName}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-sm font-bold text-indigo-600">@{selectedUser.username}</span>
                    <span className="w-1 h-1 bg-zinc-300 rounded-full" />
                    <span className="text-xs font-medium text-zinc-500">{selectedUser.email || 'No Email'}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-8 mt-8 w-full max-w-xs">
                    <button onClick={() => fetchUserFollowers(selectedUser.uid)} className="text-center group">
                      <div className="text-xl font-black text-zinc-900 group-hover:text-indigo-600 transition-colors">{selectedUser.followersCount || 0}</div>
                      <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Followers</div>
                    </button>
                    <button onClick={() => fetchUserFollowing(selectedUser.uid)} className="text-center group">
                      <div className="text-xl font-black text-zinc-900 group-hover:text-indigo-600 transition-colors">{selectedUser.followingCount || 0}</div>
                      <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Following</div>
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => fetchUserPosts(selectedUser.uid)}
                  className="group flex flex-col items-center justify-center p-6 bg-white border border-zinc-100 rounded-[32px] hover:border-indigo-200 hover:shadow-lg transition-all active:scale-95"
                >
                  <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                    <ImageIcon className="w-6 h-6 text-indigo-600" />
                  </div>
                  <span className="font-bold text-zinc-900">Gallery</span>
                  <span className="text-[10px] text-zinc-400 font-bold uppercase mt-1">Posts</span>
                </button>
                
                <button 
                  onClick={() => fetchUserChats(selectedUser.uid)}
                  className="group flex flex-col items-center justify-center p-6 bg-white border border-zinc-100 rounded-[32px] hover:border-purple-200 hover:shadow-lg transition-all active:scale-95"
                >
                  <div className="w-12 h-12 bg-purple-50 rounded-2xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                    <MessageSquare className="w-6 h-6 text-purple-600" />
                  </div>
                  <span className="font-bold text-zinc-900">Messages</span>
                  <span className="text-[10px] text-zinc-400 font-bold uppercase mt-1">Chats</span>
                </button>
                
                <button 
                  onClick={() => fetchUserSaved(selectedUser.uid)}
                  className="group flex flex-col items-center justify-center p-6 bg-white border border-zinc-100 rounded-[32px] hover:border-emerald-200 hover:shadow-lg transition-all active:scale-95"
                >
                  <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                    <Bookmark className="w-6 h-6 text-emerald-600" />
                  </div>
                  <span className="font-bold text-zinc-900">Saved</span>
                  <span className="text-[10px] text-zinc-400 font-bold uppercase mt-1">Collection</span>
                </button>
                
                <button 
                  onClick={() => fetchUserLiked(selectedUser.uid)}
                  className="group flex flex-col items-center justify-center p-6 bg-white border border-zinc-100 rounded-[32px] hover:border-rose-200 hover:shadow-lg transition-all active:scale-95"
                >
                  <div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                    <Heart className="w-6 h-6 text-rose-600" />
                  </div>
                  <span className="font-bold text-zinc-900">Liked</span>
                  <span className="text-[10px] text-zinc-400 font-bold uppercase mt-1">Interactions</span>
                </button>

                <button 
                  onClick={() => fetchUserHighlights(selectedUser.uid)}
                  className="group flex items-center gap-4 p-6 bg-white border border-zinc-100 rounded-[32px] hover:border-amber-200 hover:shadow-lg transition-all active:scale-95 col-span-2"
                >
                  <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center group-hover:rotate-12 transition-transform">
                    <Star className="w-6 h-6 text-amber-600" />
                  </div>
                  <div className="text-left">
                    <span className="block font-bold text-zinc-900">Profile Highlights</span>
                    <span className="text-[10px] text-zinc-400 font-bold uppercase">Curated Stories</span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-zinc-300 ml-auto" />
                </button>

                <button 
                  onClick={() => fetchUserStories(selectedUser.uid)}
                  className="group flex items-center gap-4 p-6 bg-white border border-zinc-100 rounded-[32px] hover:border-fuchsia-200 hover:shadow-lg transition-all active:scale-95 col-span-2"
                >
                  <div className="w-12 h-12 bg-fuchsia-50 rounded-2xl flex items-center justify-center group-hover:rotate-12 transition-transform">
                    <Layers className="w-6 h-6 text-fuchsia-600" />
                  </div>
                  <div className="text-left">
                    <span className="block font-bold text-zinc-900">Active Stories</span>
                    <span className="text-[10px] text-zinc-400 font-bold uppercase">24h Content</span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-zinc-300 ml-auto" />
                </button>
              </div>

              {fullControl && (
                <div className="pt-4">
                  <button
                    onClick={() => handleDeleteUser(selectedUser)}
                    disabled={loadingDetails}
                    className="w-full py-5 px-6 bg-red-50 text-red-600 font-bold rounded-[32px] flex items-center justify-center gap-3 hover:bg-red-100 transition-all active:scale-95 border border-red-100"
                  >
                    <Trash2 className="w-5 h-5" />
                    {loadingDetails ? 'Processing Deletion...' : 'Terminate User Account'}
                  </button>
                  <p className="text-[10px] text-center text-red-400 font-bold uppercase tracking-widest mt-3">Warning: This action is irreversible</p>
                </div>
              )}
            </motion.div>
          )}

          {(view === 'user-followers' || view === 'user-following') && (
            <motion.div 
              key="user-follow"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="space-y-4"
            >
              {loadingDetails ? (
                <div className="flex justify-center p-12">
                  <div className="w-8 h-8 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
                </div>
              ) : (view === 'user-followers' ? userFollowers : userFollowing).length === 0 ? (
                <div className="text-center py-16 bg-white rounded-[40px] border border-dashed border-zinc-200">
                  <Users className="w-12 h-12 text-zinc-200 mx-auto mb-3" />
                  <p className="text-zinc-400 font-medium">No {view === 'user-followers' ? 'followers' : 'following'} found</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {(view === 'user-followers' ? userFollowers : userFollowing).map(user => (
                    <div 
                      key={user.uid} 
                      onClick={() => handleUserClick(user)}
                      className="flex items-center justify-between p-4 bg-white border border-zinc-100 rounded-3xl cursor-pointer hover:border-indigo-200 hover:shadow-md transition-all active:scale-[0.98]"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-zinc-100 overflow-hidden shrink-0 border border-zinc-200">
                          {user.photoURL ? (
                            <img src={user.photoURL} alt={user.displayName} className="w-full h-full object-cover" />
                          ) : (
                            <User className="w-6 h-6 m-3 text-zinc-400" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-zinc-900 truncate">{user.displayName}</div>
                          <div className="text-xs text-zinc-500 truncate">@{user.username}</div>
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-zinc-300 shrink-0" />
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {view === 'user-chats' && (
            <motion.div 
              key="user-chats"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="space-y-4"
            >
              {loadingDetails ? (
                <div className="flex justify-center p-12">
                  <div className="w-8 h-8 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
                </div>
              ) : userChats.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-[40px] border border-dashed border-zinc-200">
                  <MessageSquare className="w-12 h-12 text-zinc-200 mx-auto mb-3" />
                  <p className="text-zinc-400 font-medium">No active conversations found</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {userChats.map(chat => (
                    <div 
                      key={chat.id} 
                      onClick={() => {
                        setSelectedChat(chat);
                        fetchChatMessages(chat.id);
                      }}
                      className="group relative p-5 bg-white border border-zinc-100 rounded-[32px] cursor-pointer hover:border-purple-200 hover:shadow-lg transition-all active:scale-[0.98]"
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-purple-50 rounded-xl flex items-center justify-center">
                            <MessageSquare className="w-4 h-4 text-purple-600" />
                          </div>
                          <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">ID: {chat.id.slice(0, 8)}</span>
                        </div>
                        <ChevronRight className="w-5 h-5 text-zinc-300 group-hover:text-purple-400 transition-colors" />
                      </div>
                      
                      <div className="mb-4">
                        <div className="text-xs font-bold text-zinc-400 uppercase tracking-tight mb-1.5">Participants</div>
                        <div className="flex flex-wrap gap-1.5">
                          {(chat.participantNames || chat.participants).map((name, i) => (
                            <span key={i} className="px-2 py-1 bg-zinc-50 text-zinc-600 text-[10px] font-bold rounded-lg border border-zinc-100">
                              {name}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="bg-zinc-50/50 p-4 rounded-2xl border border-zinc-100/50">
                        <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-tight mb-1">Last Message</div>
                        <p className="text-sm text-zinc-600 truncate font-medium italic">
                          "{chat.lastMessage || 'No messages yet'}"
                        </p>
                      </div>

                      {fullControl && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteChat(chat.id);
                          }}
                          className="absolute top-4 right-12 p-2 bg-red-50 text-red-600 rounded-xl opacity-0 group-hover:opacity-100 transition-all hover:bg-red-100 shadow-sm"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {view === 'user-chat-messages' && selectedChat && (
            <motion.div 
              key="user-chat-messages"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="space-y-6"
            >
              <div className="bg-white p-4 rounded-3xl border border-zinc-100 shadow-sm flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-50 rounded-2xl flex items-center justify-center">
                    <Users className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-zinc-400 uppercase tracking-tight">Conversation with</div>
                    <div className="text-sm font-black text-zinc-900">
                      {selectedChat.participantNames ? selectedChat.participantNames.join(', ') : selectedChat.participants.join(', ')}
                    </div>
                  </div>
                </div>
              </div>

              {loadingDetails ? (
                <div className="flex justify-center p-12">
                  <div className="w-8 h-8 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
                </div>
              ) : chatMessages.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-[40px] border border-dashed border-zinc-200">
                  <Mail className="w-12 h-12 text-zinc-200 mx-auto mb-3" />
                  <p className="text-zinc-400 font-medium">No messages in this thread</p>
                </div>
              ) : (
                <div className="space-y-4 flex flex-col">
                  {chatMessages.map(msg => {
                    const isSelectedUser = msg.senderId === selectedUser?.uid;
                    return (
                      <div 
                        key={msg.id} 
                        className={cn(
                          "max-w-[85%] rounded-3xl p-4 relative group shadow-sm border",
                          isSelectedUser 
                            ? "bg-indigo-600 border-indigo-500 text-white self-end rounded-tr-sm" 
                            : "bg-white border-zinc-100 text-zinc-900 self-start rounded-tl-sm"
                        )}
                      >
                        <div className={cn(
                          "text-[10px] font-bold uppercase tracking-widest mb-2 opacity-70", 
                          isSelectedUser ? "text-indigo-100" : "text-zinc-400"
                        )}>
                          {msg.senderId === selectedUser?.uid 
                            ? selectedUser?.displayName 
                            : (selectedChat.participantNames?.[selectedChat.participants.indexOf(msg.senderId)] || msg.senderId.slice(0, 8))}
                        </div>
                        
                        {msg.attachmentUrl && (
                          <div className="rounded-2xl overflow-hidden mb-3 border border-black/5 shadow-inner">
                            <img src={msg.attachmentUrl} alt="Attachment" className="w-full h-auto max-h-64 object-cover" />
                          </div>
                        )}
                        
                        <p className="text-sm leading-relaxed font-medium whitespace-pre-wrap break-words">{msg.text}</p>
                        
                        <div className={cn(
                          "text-[9px] mt-2 font-bold opacity-50",
                          isSelectedUser ? "text-indigo-200" : "text-zinc-400"
                        )}>
                          {new Date(msg.createdAt?.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>

                        {fullControl && (
                          <button 
                            onClick={() => handleDeleteMessage(selectedChat.id, msg.id, msg.attachmentUrl)}
                            className={cn(
                              "absolute top-1/2 -translate-y-1/2 p-2 bg-red-50 text-red-600 rounded-xl opacity-0 group-hover:opacity-100 transition-all hover:bg-red-100 shadow-lg border border-red-100",
                              isSelectedUser ? "-left-12" : "-right-12"
                            )}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}

          {view === 'user-posts' && (
            <motion.div key="user-posts" variants={pageVariants} initial="initial" animate="animate" exit="exit">
              {renderPostGrid(userPosts, 'posts')}
            </motion.div>
          )}
          {view === 'user-saved' && (
            <motion.div key="user-saved" variants={pageVariants} initial="initial" animate="animate" exit="exit">
              {renderPostGrid(userSaved, 'saved')}
            </motion.div>
          )}
          {view === 'user-liked' && (
            <motion.div key="user-liked" variants={pageVariants} initial="initial" animate="animate" exit="exit">
              {renderPostGrid(userLiked, 'liked')}
            </motion.div>
          )}

          {view === 'post-details' && selectedPost && (
            <motion.div 
              key="post-details"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="space-y-6"
            >
              <div className="bg-white rounded-[40px] border border-zinc-100 shadow-xl overflow-hidden">
                {/* Media Carousel */}
                <div className="relative aspect-square bg-black group">
                  {(() => {
                    const mediaList = selectedPost.mediaUrls && selectedPost.mediaUrls.length > 0 
                      ? selectedPost.mediaUrls 
                      : [{ url: selectedPost.imageUrl || selectedPost.videoUrl, type: selectedPost.videoUrl ? 'video' : 'image' }];
                    const currentMedia = mediaList[currentPostMediaIndex];

                    return (
                      <>
                        {currentMedia?.type === 'video' ? (
                          <video 
                            src={currentMedia.url} 
                            controls 
                            className="w-full h-full object-contain"
                            autoPlay
                            loop
                            muted
                          />
                        ) : (
                          <img 
                            src={currentMedia?.url} 
                            alt="" 
                            className="w-full h-full object-contain" 
                          />
                        )}

                        {mediaList.length > 1 && (
                          <>
                            <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 flex justify-between pointer-events-none">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCurrentPostMediaIndex(prev => (prev > 0 ? prev - 1 : mediaList.length - 1));
                                }}
                                className="w-10 h-10 bg-white/20 backdrop-blur-md text-white rounded-full flex items-center justify-center pointer-events-auto hover:bg-white/40 transition-all active:scale-90"
                              >
                                <ChevronLeft className="w-6 h-6" />
                              </button>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCurrentPostMediaIndex(prev => (prev < mediaList.length - 1 ? prev + 1 : 0));
                                }}
                                className="w-10 h-10 bg-white/20 backdrop-blur-md text-white rounded-full flex items-center justify-center pointer-events-auto hover:bg-white/40 transition-all active:scale-90"
                              >
                                <ChevronRight className="w-6 h-6" />
                              </button>
                            </div>
                            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 px-3 py-1.5 bg-black/20 backdrop-blur-md rounded-full">
                              {mediaList.map((_, idx) => (
                                <div 
                                  key={idx} 
                                  className={cn(
                                    "w-1.5 h-1.5 rounded-full transition-all duration-300",
                                    idx === currentPostMediaIndex ? "bg-white w-4" : "bg-white/40"
                                  )} 
                                />
                              ))}
                            </div>
                          </>
                        )}
                      </>
                    );
                  })()}
                </div>

                <div className="p-6">
                  <div className="flex items-start gap-4 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-zinc-100 flex items-center justify-center shrink-0">
                      <ImageIcon className="w-5 h-5 text-zinc-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-zinc-900 font-medium leading-relaxed whitespace-pre-wrap">{selectedPost.caption || 'No caption provided'}</p>
                      <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest mt-2">Post ID: {selectedPost.id}</p>
                    </div>
                  </div>

                  {fullControl && (
                    <button 
                      onClick={() => {
                        const mediaList = selectedPost.mediaUrls && selectedPost.mediaUrls.length > 0 
                          ? selectedPost.mediaUrls 
                          : [{ url: selectedPost.imageUrl || selectedPost.videoUrl, type: selectedPost.videoUrl ? 'video' : 'image' }];
                        handleDeletePost(selectedPost.id, selectedPost);
                      }}
                      className="w-full py-4 px-6 bg-red-50 text-red-600 font-bold rounded-2xl flex items-center justify-center gap-3 hover:bg-red-100 transition-all active:scale-95 border border-red-100"
                    >
                      <Trash2 className="w-5 h-5" />
                      Remove Content
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
          
          {view === 'user-highlights' && (
            <motion.div 
              key="user-highlights"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="space-y-6"
            >
              {loadingDetails ? (
                <div className="flex justify-center p-12">
                  <div className="w-8 h-8 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
                </div>
              ) : userHighlights.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-[40px] border border-dashed border-zinc-200">
                  <Star className="w-12 h-12 text-zinc-200 mx-auto mb-3" />
                  <p className="text-zinc-400 font-medium">No highlights created yet</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-4">
                  {userHighlights.map(highlight => (
                    <div 
                      key={highlight.id} 
                      className="relative flex flex-col items-center gap-3 group cursor-pointer"
                      onClick={() => setViewingHighlight(highlight)}
                    >
                      <div className="relative">
                        <div className="w-20 h-20 rounded-full p-1 bg-gradient-to-tr from-amber-400 to-rose-500 shadow-md transition-transform group-hover:scale-105">
                          <div className="w-full h-full rounded-full border-2 border-white overflow-hidden">
                            <img src={highlight.imageUrl} alt={highlight.label} className="w-full h-full object-cover" />
                          </div>
                        </div>
                        {fullControl && (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteHighlight(highlight.id, highlight.imageUrl);
                            }}
                            className="absolute -top-1 -right-1 p-2 bg-red-500 text-white rounded-xl opacity-0 group-hover:opacity-100 transition-all hover:bg-red-600 shadow-lg scale-75 group-hover:scale-100"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <span className="text-[10px] font-black text-zinc-700 uppercase tracking-widest truncate w-full text-center px-1">{highlight.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {view === 'user-stories' && (
            <motion.div 
              key="user-stories"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="space-y-6"
            >
              {loadingDetails ? (
                <div className="flex justify-center p-12">
                  <div className="w-8 h-8 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
                </div>
              ) : userStories.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-[40px] border border-dashed border-zinc-200">
                  <Layers className="w-12 h-12 text-zinc-200 mx-auto mb-3" />
                  <p className="text-zinc-400 font-medium">No active stories found</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-4">
                  {userStories.map(story => {
                    const mediaUrl = story.imageUrl || story.videoUrl;
                    const isVideo = !!story.videoUrl || (mediaUrl && (mediaUrl.includes('/video/') || mediaUrl.match(/\.(mp4|webm|ogg|mov)$/i)));
                    
                    return (
                      <div 
                        key={story.id} 
                        className="relative flex flex-col items-center gap-3 group cursor-pointer"
                        onClick={() => {
                          setViewingHighlight({
                            id: story.id,
                            userId: story.authorId,
                            label: 'Story',
                            imageUrl: mediaUrl || '',
                            mediaUrls: [mediaUrl || ''],
                            createdAt: story.createdAt,
                            viewers: story.viewers,
                            viewsCount: story.viewsCount
                          } as any);
                        }}
                      >
                        <div className="relative">
                          <div className="w-20 h-20 rounded-full p-1 bg-gradient-to-tr from-fuchsia-400 to-purple-500 shadow-md transition-transform group-hover:scale-105">
                            <div className="w-full h-full rounded-full border-2 border-white overflow-hidden bg-black">
                              {isVideo ? (
                                <video src={mediaUrl} className="w-full h-full object-cover opacity-80" />
                              ) : (
                                <img src={mediaUrl} alt="Story" className="w-full h-full object-cover" />
                              )}
                            </div>
                          </div>
                          {fullControl && (
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteStory(story.id, story.imageUrl, story.videoUrl);
                              }}
                              className="absolute -top-1 -right-1 p-2 bg-red-500 text-white rounded-xl opacity-0 group-hover:opacity-100 transition-all hover:bg-red-600 shadow-lg scale-75 group-hover:scale-100"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        <span className="text-[10px] font-black text-zinc-700 uppercase tracking-widest truncate w-full text-center px-1">
                          {story.viewsCount || 0} Views
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Custom Confirmation Modal */}
      <AnimatePresence>
        {viewingHighlight && (
          <HighlightViewerModal
            highlight={viewingHighlight as any}
            onClose={() => setViewingHighlight(null)}
            isOwnProfile={false}
            isAdminView={true}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmModal.isOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl relative"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className={cn("p-3 rounded-full", confirmModal.isDestructive ? "bg-red-100 text-red-600" : "bg-indigo-100 text-indigo-600")}>
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-zinc-900">{confirmModal.title}</h3>
              </div>
              <p className="text-zinc-600 mb-6">{confirmModal.message}</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                  className="flex-1 py-3 px-4 bg-zinc-100 text-zinc-700 font-semibold rounded-xl hover:bg-zinc-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    confirmModal.onConfirm();
                    setConfirmModal(prev => ({ ...prev, isOpen: false }));
                  }}
                  className={cn(
                    "flex-1 py-3 px-4 font-semibold rounded-xl transition-colors text-white",
                    confirmModal.isDestructive ? "bg-red-600 hover:bg-red-700" : "bg-indigo-600 hover:bg-indigo-700"
                  )}
                >
                  Confirm
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
