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
import { MessageSquare, ArrowLeft } from 'lucide-react';
import { cn } from './utils';

export default function App() {
  const [user, setUser] = useState(auth.currentUser);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('feed');
  const [showHeader, setShowHeader] = useState(true);
  const lastScrollY = useRef(0);

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
          "fixed top-0 left-0 right-0 z-30 bg-white/70 backdrop-blur-xl border-b border-zinc-100/50 px-6 h-16 flex items-center justify-between max-w-md mx-auto transition-transform duration-300 ease-in-out",
          !showHeader && "-translate-y-full"
        )}>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent tracking-tight">
            Sastagram
          </h1>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setActiveTab('messages')}
              className="relative p-2.5 text-zinc-700 hover:bg-zinc-100/80 rounded-2xl transition-all active:scale-95"
            >
              <MessageSquare className="w-6 h-6" />
              <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-indigo-500 border-2 border-white rounded-full" />
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
        activeTab === 'feed' && "pt-16"
      )}>
        {activeTab === 'feed' && <Feed onNavigate={setActiveTab} />}
        {activeTab === 'search' && <Search onNavigate={setActiveTab} />}
        {activeTab === 'create' && <CreatePost onSuccess={() => setActiveTab('feed')} />}
        {activeTab === 'notifications' && <Notifications onBack={() => setActiveTab('feed')} />}
        {activeTab === 'profile' && <Profile onNavigate={setActiveTab} />}
        {activeTab === 'messages' && <Messages onBack={() => setActiveTab('feed')} onNavigate={setActiveTab} />}
      </main>

      {/* Navigation */}
      {activeTab !== 'messages' && (
        <BottomNav activeTab={activeTab} onChange={setActiveTab} />
      )}
    </div>
  );
}

