import { Home, PlusSquare, User, Search, Bell, MessageSquare } from 'lucide-react';
import { cn } from '../utils';

export type TabType = 'feed' | 'search' | 'create' | 'notifications' | 'profile' | 'messages';

interface BottomNavProps {
  activeTab: TabType;
  onChange: (tab: TabType) => void;
}

export default function BottomNav({ activeTab, onChange }: BottomNavProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-zinc-200 pb-safe z-50">
      <div className="flex justify-around items-center h-16 max-w-md mx-auto px-2">
        <button
          onClick={() => onChange('feed')}
          className={cn(
            'flex flex-col items-center justify-center w-full h-full text-zinc-400 hover:text-zinc-900 transition-colors',
            activeTab === 'feed' && 'text-zinc-900'
          )}
        >
          <Home className={cn('w-6 h-6', activeTab === 'feed' && 'fill-zinc-900')} />
        </button>
        <button
          onClick={() => onChange('search')}
          className={cn(
            'flex flex-col items-center justify-center w-full h-full text-zinc-400 hover:text-zinc-900 transition-colors',
            activeTab === 'search' && 'text-zinc-900'
          )}
        >
          <Search className={cn('w-6 h-6', activeTab === 'search' && 'text-zinc-900 font-bold')} />
        </button>
        <button
          onClick={() => onChange('create')}
          className={cn(
            'flex flex-col items-center justify-center w-full h-full text-zinc-400 hover:text-zinc-900 transition-colors',
            activeTab === 'create' && 'text-zinc-900'
          )}
        >
          <PlusSquare className={cn('w-6 h-6', activeTab === 'create' && 'fill-zinc-900')} />
        </button>
        <button
          onClick={() => onChange('notifications')}
          className={cn(
            'flex flex-col items-center justify-center w-full h-full text-zinc-400 hover:text-zinc-900 transition-colors',
            activeTab === 'notifications' && 'text-zinc-900'
          )}
        >
          <Bell className={cn('w-6 h-6', activeTab === 'notifications' && 'fill-zinc-900')} />
        </button>
        <button
          onClick={() => onChange('profile')}
          className={cn(
            'flex flex-col items-center justify-center w-full h-full text-zinc-400 hover:text-zinc-900 transition-colors',
            activeTab === 'profile' && 'text-zinc-900'
          )}
        >
          <User className={cn('w-6 h-6', activeTab === 'profile' && 'fill-zinc-900')} />
        </button>
      </div>
    </div>
  );
}
