import { Home, PlusSquare, User, Search, Send, ShieldAlert, Clapperboard } from 'lucide-react';
import { cn } from '../utils';
import { motion } from 'motion/react';

export type TabType = 'feed' | 'search' | 'reels' | 'create' | 'notifications' | 'profile' | 'messages' | 'admin';

interface BottomNavProps {
  activeTab: TabType;
  onChange: (tab: TabType) => void;
  unreadMessages?: number;
  isAdmin?: boolean;
  isDark?: boolean;
}

const baseTabs = [
  { id: 'feed', icon: Home, label: 'Home' },
  { id: 'search', icon: Search, label: 'Search' },
  { id: 'messages', icon: Send, label: 'Messages' },
  { id: 'reels', icon: ({ className }: { className?: string }) => (
    <div className={cn("relative flex items-center justify-center", className)}>
      <div className="w-5 h-5 border-2 border-current rounded-md flex items-center justify-center">
        <div className="w-0 h-0 border-t-[3px] border-t-transparent border-l-[5px] border-l-current border-b-[3px] border-b-transparent ml-0.5" />
      </div>
      <div className="absolute -top-1 -right-1 w-2 h-2 bg-current rounded-full" />
    </div>
  ), label: 'Reels' },
  { id: 'profile', icon: User, label: 'Profile' },
] as const;

export default function BottomNav({ activeTab, onChange, unreadMessages = 0, isAdmin = false, isDark = false }: BottomNavProps) {
  const tabs = isAdmin 
    ? [...baseTabs, { id: 'admin', icon: ShieldAlert, label: 'Admin' }] 
    : baseTabs;

  return (
    <div className="fixed bottom-6 left-0 right-0 flex justify-center z-40 px-4 pointer-events-none">
      <motion.div 
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className={cn(
          "backdrop-blur-xl border shadow-[0_8px_32px_rgba(0,0,0,0.12)] rounded-[2.5rem] px-2 py-1.5 flex items-center gap-1 max-w-md w-full pointer-events-auto transition-colors duration-500",
          isDark 
            ? "bg-zinc-900/80 border-zinc-800 text-white" 
            : "bg-white/90 border-zinc-200/50 text-zinc-900"
        )}
      >
        {tabs.map((tab, idx) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          
          return (
            <button
              key={`${tab.id}-${idx}`}
              onClick={() => onChange(tab.id as TabType)}
              className="relative flex-1 flex flex-col items-center justify-center py-3 group outline-none"
            >
              {isActive && (
                <motion.div
                  layoutId="activeTab"
                  className={cn(
                    "absolute inset-x-1 inset-y-1 rounded-[1.5rem] -z-10",
                    isDark ? "bg-white/10" : "bg-indigo-50"
                  )}
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                />
              )}
              
              <motion.div
                animate={{ 
                  scale: isActive ? 1.15 : 1,
                  y: isActive ? -1 : 0
                }}
                whileTap={{ scale: 0.9 }}
                className={cn(
                  "transition-colors duration-300",
                  isActive 
                    ? (isDark ? "text-white" : "text-indigo-600") 
                    : (isDark ? "text-zinc-500 group-hover:text-zinc-300" : "text-zinc-400 group-hover:text-zinc-600")
                )}
              >
                <Icon 
                  className={cn(
                    "w-6 h-6 transition-all duration-300",
                    isActive ? "stroke-[2.5px]" : "stroke-[2px]",
                    tab.id === 'messages' && "-rotate-12"
                  )} 
                />
                {tab.id === 'messages' && unreadMessages > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-indigo-500 text-[9px] font-black text-white ring-2 ring-white animate-in zoom-in duration-300">
                    {unreadMessages > 9 ? '9+' : unreadMessages}
                  </span>
                )}
              </motion.div>
            </button>
          );
        })}
      </motion.div>
    </div>
  );
}
