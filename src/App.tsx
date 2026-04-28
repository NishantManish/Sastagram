import { useState, useEffect, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, onSnapshot, getDoc, doc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { handleFirestoreError, OperationType } from './utils/firestore';
import AuthScreen from './components/AuthScreen';
import Feed, { FeedRef } from './components/Feed';
import CreatePost from './components/CreatePost';
import Profile from './components/Profile';
import BottomNav, { TabType } from './components/BottomNav';
import Notifications from './components/Notifications';
import Search from './components/Search';
import Messages from './components/Messages';
import MessageNotification from './components/MessageNotification';
import AdminDashboard from './components/AdminDashboard';
import Reels from './components/Reels';
import { Send, ArrowLeft, Camera, Bell, PlusSquare, Clapperboard } from 'lucide-react';
import { cn } from './utils';
import { useTheme } from './contexts/ThemeContext';
import { motion } from 'motion/react';

import ErrorBoundary from './components/ErrorBoundary';

export default function App() {
  const [user, setUser] = useState(auth.currentUser);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('feed');
  const [messagesViewKey, setMessagesViewKey] = useState(0);
  const [reelsViewKey, setReelsViewKey] = useState(0);
  const [createInitialType, setCreateInitialType] = useState<'post' | 'story'>('post');
  const [initialSearchQuery, setInitialSearchQuery] = useState('');
  const [initialPostId, setInitialPostId] = useState<string | null>(null);
  const [initialSlideIndex, setInitialSlideIndex] = useState(0);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [showHeader, setShowHeader] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const lastScrollY = useRef(0);
  const feedRef = useRef<FeedRef>(null);

  const handleNavigateToSearch = (query: string) => {
    setInitialSearchQuery(query);
    setActiveTab('search');
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
          if (userDoc.exists()) {
            setIsAdmin(userDoc.data().role === 'admin' || currentUser.email === 'nishantmanish4@gmail.com');
          } else {
            setIsAdmin(currentUser.email === 'nishantmanish4@gmail.com');
          }
        } catch (error) {
          console.error('Error fetching user role:', error);
          setIsAdmin(currentUser.email === 'nishantmanish4@gmail.com');
        }
      } else {
        setIsAdmin(false);
      }
      setLoading(false);
    });

    // Handle deep links
    const path = window.location.pathname;
    const searchParams = new URLSearchParams(window.location.search);
    
    if (path.startsWith('/post/')) {
      const postId = path.split('/')[2];
      const slide = parseInt(searchParams.get('slide') || '0', 10);
      
      setInitialPostId(postId);
      setInitialSlideIndex(slide);
      setActiveTab('feed');
      
      // Clean up URL without reloading
      window.history.replaceState({}, '', '/');
    }

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    // Notifications count
    const qNotifications = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      where('read', '==', false)
    );
    const unsubscribeNotifications = onSnapshot(qNotifications, (snapshot) => {
      setUnreadNotifications(snapshot.size);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'notifications');
    });

    // Messages count (unread chats)
    const qMessages = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', user.uid)
    );
    const unsubscribeMessages = onSnapshot(qMessages, (snapshot) => {
      const unreadCount = snapshot.docs.filter(doc => {
        const data = doc.data();
        return data.readStatus?.[user.uid] === false;
      }).length;
      setUnreadMessages(unreadCount);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'chats');
    });

    return () => {
      unsubscribeNotifications();
      unsubscribeMessages();
    };
  }, [user]);

  useEffect(() => {
    if (activeTab !== 'feed') {
      setShowHeader(true);
      return;
    }

    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      
      if (currentScrollY < lastScrollY.current || currentScrollY < 10) {
        setShowHeader(true);
      } else if (currentScrollY > lastScrollY.current && currentScrollY > 70) {
        setShowHeader(false);
      }
      
      lastScrollY.current = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [activeTab]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-zinc-50">
        <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  const handleNavigate = (tab: TabType, initialType?: 'post' | 'story' | string) => {
    if (tab === 'create' && initialType && (initialType === 'post' || initialType === 'story')) {
      setCreateInitialType(initialType);
    } else if (tab === 'profile' && initialType) {
      setSelectedUserId(initialType);
    } else if (tab === 'profile' && !initialType) {
      setSelectedUserId(null);
    }
    setActiveTab(tab);
  };

  return (
    <ErrorBoundary>
      <div className={cn(
        "min-h-screen transition-colors duration-500",
        activeTab === 'reels' ? "bg-black" : "bg-zinc-50"
      )}>
        <MessageNotification onNavigate={handleNavigate} activeTab={activeTab} />
        {/* Header */}
        {activeTab === 'feed' ? (
          <header className={cn(
            "fixed top-0 left-0 right-0 z-40 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-100/50 dark:border-zinc-800/50 px-4 h-16 flex items-center justify-between max-w-md mx-auto transition-all duration-300 ease-in-out",
            !showHeader && "-translate-y-full shadow-none",
            showHeader && "shadow-sm shadow-zinc-200/20"
          )}>
            <motion.div 
              className="flex items-center gap-2.5 cursor-pointer origin-left"
              whileHover="hover"
              whileTap="tap"
              onClick={() => {
                if (activeTab === 'feed') {
                  feedRef.current?.resetView();
                } else {
                  handleNavigate('feed');
                }
              }}
            >
              <motion.div 
                variants={{
                  hover: { scale: 1.1, rotate: 0, x: 2 },
                  tap: { scale: 0.9, rotate: -12, x: 0 }
                }}
                transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                className="w-9 h-9 bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20 -rotate-3"
              >
                <Camera className="w-5 h-5 text-white rotate-3" />
              </motion.div>
              <motion.h1 
                variants={{
                  hover: { x: -3, scale: 1.02 },
                  tap: { x: -6, scale: 0.98 }
                }}
                transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                className="text-xl font-black text-zinc-900 dark:text-white tracking-tighter"
              >
                Sasta<span className="text-indigo-600 dark:text-indigo-400">gram</span>
              </motion.h1>
            </motion.div>
            <div className="flex items-center gap-1.5">
              <button 
                onClick={() => handleNavigate('create')}
                className="p-2.5 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100/80 dark:hover:bg-zinc-800/80 rounded-2xl transition-all active:scale-90 group"
              >
                <div className="w-6 h-6 rounded-lg border-2 border-zinc-700 dark:border-zinc-300 flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:border-indigo-600 dark:group-hover:border-indigo-400">
                  <div className="w-3 h-0.5 bg-zinc-700 dark:bg-zinc-300 absolute group-hover:bg-indigo-600 dark:group-hover:bg-indigo-400 transition-colors" />
                  <div className="w-0.5 h-3 bg-zinc-700 dark:bg-zinc-300 absolute group-hover:bg-indigo-600 dark:group-hover:bg-indigo-400 transition-colors" />
                </div>
              </button>
              <button 
                onClick={() => handleNavigate('notifications')}
                className="relative p-2.5 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100/80 dark:hover:bg-zinc-800/80 rounded-2xl transition-all active:scale-90 group"
              >
                <Bell className={cn(
                  "w-6 h-6 transition-all duration-300",
                  unreadNotifications > 0 ? "text-indigo-600 dark:text-indigo-400 fill-indigo-600/10" : "group-hover:rotate-12"
                )} />
                {unreadNotifications > 0 && (
                  <span className="absolute top-1.5 right-1.5 flex h-5 min-w-[20px] px-1 items-center justify-center rounded-full bg-red-500 text-[10px] font-black text-white ring-2 ring-white dark:ring-zinc-950 animate-in zoom-in duration-300 shadow-lg shadow-red-500/20">
                    {unreadNotifications > 9 ? '9+' : unreadNotifications}
                  </span>
                )}
              </button>
            </div>
          </header>
        ) : (activeTab !== 'profile' && activeTab !== 'messages' && activeTab !== 'search' && activeTab !== 'notifications' && activeTab !== 'create' && activeTab !== 'admin' && activeTab !== 'reels') ? (
          <header className="sticky top-0 z-30 bg-white/70 backdrop-blur-xl border-b border-zinc-100/50 px-4 h-16 flex items-center max-w-md mx-auto">
            <button 
              onClick={() => handleNavigate('feed')}
              className="p-2.5 -ml-2 text-zinc-500 hover:bg-zinc-100/80 rounded-2xl transition-all active:scale-95"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <h2 className="ml-2 font-bold text-zinc-900 capitalize">{activeTab}</h2>
          </header>
        ) : null}

        {/* Main Content */}
        <main className={cn(
          "max-w-md mx-auto min-h-[calc(100vh-4rem)] transition-all duration-300",
          activeTab === 'feed' && "pt-16",
          activeTab !== 'reels' && activeTab !== 'create' && "pb-32"
        )}>
          {/* Cached Pages */}
          <div className={cn(activeTab !== 'feed' && "hidden")}>
            <Feed 
              ref={feedRef}
              onNavigate={handleNavigate} 
              onTagClick={handleNavigateToSearch} 
              initialPostId={initialPostId}
              initialSlideIndex={initialSlideIndex}
            />
          </div>
          <div className={cn(activeTab !== 'search' && "hidden")}>
            <Search onNavigate={handleNavigate} initialQuery={initialSearchQuery} onClearInitialQuery={() => setInitialSearchQuery('')} />
          </div>
          <div className={cn(activeTab !== 'messages' && "hidden")}>
            <Messages 
              key={`messages-${messagesViewKey}`}
              onBack={() => handleNavigate('feed')} 
              onNavigate={handleNavigate} 
              onTagClick={handleNavigateToSearch} 
            />
          </div>

          {/* Non-cached Pages */}
          {activeTab === 'reels' && (
            <Reels 
              key={`reels-${reelsViewKey}`} 
              onNavigate={handleNavigate} 
            />
          )}
          {activeTab === 'create' && <CreatePost initialType={createInitialType} onSuccess={() => handleNavigate('feed')} onBack={() => handleNavigate('feed')} />}
          {activeTab === 'notifications' && <Notifications onBack={() => handleNavigate('feed')} />}
          {activeTab === 'profile' && <Profile userId={selectedUserId} onNavigate={handleNavigate} onTagClick={handleNavigateToSearch} onSettingsToggle={setIsSettingsOpen} />}
          {activeTab === 'admin' && isAdmin && <AdminDashboard />}
        </main>

        {/* Navigation */}
        {!isSettingsOpen && activeTab !== 'create' && (
          <BottomNav 
            activeTab={activeTab} 
            isDark={activeTab === 'reels'}
            onChange={(tab) => {
              if (tab === 'feed' && activeTab === 'feed') {
                feedRef.current?.resetView();
              } else if (tab === 'messages' && activeTab === 'messages') {
                setMessagesViewKey(prev => prev + 1);
              } else if (tab === 'reels' && activeTab === 'reels') {
                setReelsViewKey(prev => prev + 1);
              } else {
                handleNavigate(tab);
              }
            }} 
            unreadMessages={unreadMessages}
            isAdmin={isAdmin}
          />
        )}
      </div>
    </ErrorBoundary>
  );
}

