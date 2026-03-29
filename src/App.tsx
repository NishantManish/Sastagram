import { useState, useEffect, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import AuthScreen from './components/AuthScreen';
import Feed from './components/Feed';
import CreatePost from './components/CreatePost';
import Profile from './components/Profile';
import BottomNav, { TabType } from './components/BottomNav';
import Notifications from './components/Notifications';
import Search from './components/Search';
import Messages from './components/Messages';
import MessageNotification from './components/MessageNotification';
import { MessageSquare, ArrowLeft, Camera, Bell } from 'lucide-react';
import { cn } from './utils';
import { useTheme } from './contexts/ThemeContext';

export default function App() {
  const [user, setUser] = useState(auth.currentUser);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('feed');
  const [initialSearchQuery, setInitialSearchQuery] = useState('');
  const [showHeader, setShowHeader] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const lastScrollY = useRef(0);

  const handleNavigateToSearch = (query: string) => {
    setInitialSearchQuery(query);
    setActiveTab('search');
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

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

  return (
    <div className="min-h-screen bg-zinc-50">
      <MessageNotification onNavigate={setActiveTab} activeTab={activeTab} />
      {/* Header */}
      {activeTab === 'feed' ? (
        <header className={cn(
          "fixed top-0 left-0 right-0 z-40 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-100/50 dark:border-zinc-800/50 px-4 h-16 flex items-center justify-between max-w-md mx-auto transition-all duration-300 ease-in-out",
          !showHeader && "-translate-y-full shadow-none",
          showHeader && "shadow-sm shadow-zinc-200/20"
        )}>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20 -rotate-3">
              <Camera className="w-5 h-5 text-white rotate-3" />
            </div>
            <h1 className="text-xl font-black text-zinc-900 dark:text-white tracking-tighter">
              Sasta<span className="text-indigo-600 dark:text-indigo-400">gram</span>
            </h1>
          </div>
          <div className="flex items-center gap-1">
            <button 
              onClick={() => setActiveTab('notifications')}
              className="relative p-2 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100/80 dark:hover:bg-zinc-800/80 rounded-xl transition-all active:scale-95"
            >
              <Bell className="w-6 h-6" />
              <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-red-500 border-2 border-white dark:border-zinc-950 rounded-full" />
            </button>
            <button 
              onClick={() => setActiveTab('messages')}
              className="relative p-2 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100/80 dark:hover:bg-zinc-800/80 rounded-xl transition-all active:scale-95"
            >
              <MessageSquare className="w-6 h-6" />
              <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-indigo-500 border-2 border-white dark:border-zinc-950 rounded-full" />
            </button>
          </div>
        </header>
      ) : (activeTab !== 'profile' && activeTab !== 'messages' && activeTab !== 'search' && activeTab !== 'notifications' && activeTab !== 'create') ? (
        <header className="sticky top-0 z-30 bg-white/70 backdrop-blur-xl border-b border-zinc-100/50 px-4 h-16 flex items-center max-w-md mx-auto">
          <button 
            onClick={() => setActiveTab('feed')}
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
        activeTab !== 'messages' && "pb-32"
      )}>
        {activeTab === 'feed' && <Feed onNavigate={setActiveTab} onTagClick={handleNavigateToSearch} />}
        {activeTab === 'search' && <Search onNavigate={setActiveTab} initialQuery={initialSearchQuery} onClearInitialQuery={() => setInitialSearchQuery('')} />}
        {activeTab === 'create' && <CreatePost onSuccess={() => setActiveTab('feed')} />}
        {activeTab === 'notifications' && <Notifications onBack={() => setActiveTab('feed')} />}
        {activeTab === 'profile' && <Profile onNavigate={setActiveTab} onTagClick={handleNavigateToSearch} onSettingsToggle={setIsSettingsOpen} />}
        {activeTab === 'messages' && <Messages onBack={() => setActiveTab('feed')} onNavigate={setActiveTab} onTagClick={handleNavigateToSearch} />}
      </main>

      {/* Navigation */}
      {activeTab !== 'messages' && !isSettingsOpen && (
        <BottomNav activeTab={activeTab} onChange={setActiveTab} />
      )}
    </div>
  );
}

