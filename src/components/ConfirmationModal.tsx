import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trash2, X } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
  isLoading?: boolean;
}

export default function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDanger = true,
  isLoading = false,
}: ConfirmationModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-white rounded-2xl w-full max-w-xs overflow-hidden shadow-2xl"
          >
            <div className="p-6 text-center">
              <div className={`w-16 h-16 ${isDanger ? 'bg-red-50 text-red-600' : 'bg-indigo-50 text-indigo-600'} rounded-full flex items-center justify-center mx-auto mb-4`}>
                {isDanger ? <Trash2 className="w-8 h-8" /> : <X className="w-8 h-8" />}
              </div>
              <h3 className="text-lg font-bold text-zinc-900 mb-2">{title}</h3>
              <p className="text-zinc-500 text-sm mb-6">
                {message}
              </p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={onConfirm}
                  disabled={isLoading}
                  className={`w-full py-3 ${isDanger ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'} text-white font-bold rounded-xl transition-colors disabled:opacity-50`}
                >
                  {isLoading ? 'Processing...' : confirmText}
                </button>
                <button
                  onClick={onClose}
                  disabled={isLoading}
                  className="w-full py-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-900 font-bold rounded-xl transition-colors disabled:opacity-50"
                >
                  {cancelText}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
