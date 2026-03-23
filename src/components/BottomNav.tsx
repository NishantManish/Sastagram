import { Home, PlusSquare, User, Search, Bell } from 'lucide-react';
import { cn } from '../utils';
import { motion } from 'motion/react';

export type TabType = 'feed' | 'search' | 'create' | 'notifications' | 'profile' | 'messages';

interface BottomNavProps {
  activeTab: TabType;
  onChange: (tab: TabType) => void;
}

const tabs = [
  { id: 'feed', icon: Home, label: 'Home' },
  { id: 'search', icon: Search, label: 'Search' },
  { id: 'create', icon: PlusSquare, label: 'Create' },
  { id: 'notifications', icon: Bell, label: 'Activity' },
  { id: 'profile', icon: User, label: 'Profile' },
] as const;

export default function BottomNav({ activeTab, onChange }: BottomNavProps) {
  return (
    <div className="fixed bottom-6 left-0 right-0 flex justify-center z-40 px-4 pointer-events-none">
      <motion.div 
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="bg-white/90 backdrop-blur-xl border border-zinc-200/50 shadow-[0_8px_32px_rgba(0,0,0,0.12)] rounded-[2.5rem] px-2 py-1.5 flex items-center gap-1 max-w-md w-full pointer-events-auto"
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className="relative flex-1 flex flex-col items-center justify-center py-3 group outline-none"
            >
              {isActive && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute inset-x-1 inset-y-1 bg-indigo-50 rounded-[1.5rem] -z-10"
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
                  isActive ? "text-indigo-600" : "text-zinc-400 group-hover:text-zinc-600"
                )}
              >
                <Icon 
                  className={cn(
                    "w-6 h-6 transition-all duration-300",
                    isActive ? "stroke-[2.5px]" : "stroke-[2px]"
                  )} 
                />
              </motion.div>
              
              {isActive && (
                <motion.div 
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="absolute bottom-1 w-1 h-1 bg-indigo-600 rounded-full"
                />
              )}
            </button>
          );
        })}
      </motion.div>
    </div>
  );
}
