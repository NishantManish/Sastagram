import React from 'react';
import { Reel } from '../types';
import { X } from 'lucide-react';
import ReelCard from './ReelCard';
import { motion, AnimatePresence } from 'motion/react';

import { useAudio } from '../contexts/AudioContext';

interface ReelDetailsModalProps {
  reel: Reel;
  onClose: () => void;
  onNavigate?: (tab: any, initialType?: any) => void;
}

export default function ReelDetailsModal({ reel, onClose, onNavigate }: ReelDetailsModalProps) {
  const { isMuted, setIsMuted } = useAudio();
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black sm:bg-black/90"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-[110] p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
        >
          <X className="w-6 h-6" />
        </button>

        <div className="w-full h-full max-w-md bg-black relative flex flex-col">
          <div className="flex-1 overflow-hidden">
            <ReelCard 
              reel={reel} 
              isActive={true} 
              onNavigate={onNavigate}
              onDelete={() => onClose()}
              isModal={true}
            />
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
