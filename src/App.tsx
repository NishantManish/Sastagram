import { useState, useEffect } from 'react';
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
import { MessageSquare, ArrowLeft } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState(auth.currentUser);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('feed');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

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
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      {/* Header */}
      {activeTab === 'feed' ? (
        <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-zinc-200 px-4 h-14 flex items-center justify-between max-w-md mx-auto">
          <h1 className="text-xl font-semibold text-zinc-900 font-serif italic">InstaClone</h1>
          <button 
            onClick={() => setActiveTab('messages')}
            className="p-2 text-zinc-900 hover:bg-zinc-100 rounded-full transition-colors"
          >
            <MessageSquare className="w-6 h-6" />
          </button>
        </header>
      ) : (activeTab !== 'profile' && activeTab !== 'messages' && activeTab !== 'search' && activeTab !== 'notifications') ? (
        <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-zinc-200 px-4 h-14 flex items-center max-w-md mx-auto">
          <button 
            onClick={() => setActiveTab('feed')}
            className="p-2 -ml-2 text-zinc-500 hover:bg-zinc-100 rounded-full transition-colors"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
        </header>
      ) : null}

      {/* Main Content */}
      <main className="min-h-[calc(100vh-3.5rem)]">
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

