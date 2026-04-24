import React, { useRef, useState } from 'react';
import { Image as ImageIcon, Camera, Grid, X, ChevronDown, Plus, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface MediaSelectorProps {
  initialType: 'post' | 'story' | 'reel';
  onSelect: (items: MediaItem[], type: 'post' | 'story' | 'reel') => void;
  onClose: () => void;
  showToast: (msg: string) => void;
}

export interface MediaItem {
  url: string;
  type: 'image' | 'video';
  file?: File;
}

export default function MediaSelector({ initialType, onSelect, onClose, showToast }: MediaSelectorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [selectedItems, setSelectedItems] = useState<MediaItem[]>([]);
  const [postType, setPostType] = useState<'post' | 'story' | 'reel'>(initialType || 'post');
  const [currentFolder, setCurrentFolder] = useState('All Photos');
  const [isFolderDropdownOpen, setIsFolderDropdownOpen] = useState(false);
  const [userUploads, setUserUploads] = useState<MediaItem[]>([]);

  const [gridCols, setGridCols] = useState(3);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const newUploads: MediaItem[] = Array.from(files).map((file: File) => {
        const url = URL.createObjectURL(file);
        const type = file.type.startsWith('video/') ? 'video' : 'image';
        return { url, type, file };
      });
      setUserUploads(prev => [...newUploads, ...prev]);
      
      // Auto-select the first new upload if nothing is selected
      if (selectedItems.length === 0) {
        setSelectedItems([newUploads[0]]);
      }
      
      setCurrentFolder('My Uploads');
    }
  };

  const toggleSelection = (item: MediaItem) => {
    setSelectedItems(prev => {
      const isSelected = prev.find(i => i.url === item.url);
      if (isSelected) {
        return prev.filter(i => i.url !== item.url);
      } else {
        // Limit to 10 items for performance
        if (prev.length >= 10) {
          showToast('Maximum 10 items allowed');
          return prev;
        }
        return [...prev, item];
      }
    });
  };

  const handleDeleteUpload = (e: React.MouseEvent, urlToDelete: string) => {
    e.stopPropagation();
    setUserUploads(prev => prev.filter(item => item.url !== urlToDelete));
    setSelectedItems(prev => prev.filter(item => item.url !== urlToDelete));
  };

  const toggleGrid = () => {
    setGridCols(prev => prev === 3 ? 4 : prev === 4 ? 2 : 3);
  };

  const handleNext = () => {
    if (selectedItems.length > 0) {
      onSelect(selectedItems, postType);
    } else {
      showToast('Please select at least one photo or video');
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-zinc-950 min-h-screen">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/50 backdrop-blur-xl bg-zinc-950/80 sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-full transition-colors">
            <X size={24} />
          </button>
          <h1 className="text-xl font-bold tracking-tight">Create</h1>
        </div>
        
        {/* Post Type Selector (Desktop) */}
        <div className="hidden md:flex bg-zinc-900 p-1 rounded-full">
          {(['post', 'story', 'reel'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setPostType(type)}
              className={`px-6 py-1.5 rounded-full text-sm font-bold capitalize transition-all ${postType === type ? 'bg-zinc-700 text-white shadow-md' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              {type}
            </button>
          ))}
        </div>

        <button 
          onClick={handleNext} 
          className={`px-6 py-2 rounded-full font-bold transition-all ${selectedItems.length > 0 ? 'bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-600/20' : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'}`}
        >
          Next Step ({selectedItems.length})
        </button>
      </header>

      {/* Post Type Selector (Mobile) */}
      <div className="md:hidden flex bg-zinc-950 p-3 border-b border-zinc-800/50 justify-center shrink-0">
        <div className="flex bg-zinc-900 p-1 rounded-full w-full max-w-sm">
          {(['post', 'story', 'reel'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setPostType(type)}
              className={`flex-1 py-1.5 rounded-full text-sm font-bold capitalize transition-all ${postType === type ? 'bg-zinc-700 text-white shadow-md' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>
      
      <div className="flex-1 flex flex-col md:flex-row overflow-y-auto md:overflow-hidden">
        {/* Main Preview Area */}
        <div className="flex-[1.5] bg-black flex items-center justify-center p-4 md:p-8 relative group">
          <div 
            className={`w-full max-w-2xl bg-zinc-900 rounded-3xl overflow-hidden shadow-2xl ring-1 ring-white/10 relative transition-all duration-300 ${
              postType === 'post' ? 'aspect-[4/5]' : 'aspect-[9/16]'
            } max-h-[50vh] md:max-h-none`}
          >
            {selectedItems.length > 0 ? (
              <motion.div
                key={selectedItems[selectedItems.length - 1].url}
                initial={{ opacity: 0, scale: 1.1 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full h-full"
              >
                {selectedItems[selectedItems.length - 1].type === 'video' ? (
                  <video 
                    src={selectedItems[selectedItems.length - 1].url} 
                    className="w-full h-full object-contain" 
                    autoPlay 
                    loop 
                    muted 
                    playsInline
                  />
                ) : (
                  <img 
                    src={selectedItems[selectedItems.length - 1].url} 
                    alt="Preview" 
                    className="w-full h-full object-contain" 
                  />
                )}
              </motion.div>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 text-zinc-500">
                <div className="w-24 h-24 rounded-full bg-zinc-800 flex items-center justify-center animate-pulse">
                  <ImageIcon size={40} />
                </div>
                <div className="text-center">
                  <p className="text-xl font-semibold text-white">No Media Selected</p>
                  <p className="text-zinc-500">Choose from your gallery or upload a file</p>
                </div>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="px-8 py-3 bg-white text-black rounded-full font-bold hover:bg-zinc-200 transition-colors flex items-center gap-2"
                >
                  <Plus size={20} />
                  Upload from Device
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Gallery Sidebar */}
        <div className="flex-1 border-l border-zinc-800/50 flex flex-col bg-zinc-950">
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between relative z-40">
              <div className="relative">
                <button 
                  onClick={() => setIsFolderDropdownOpen(!isFolderDropdownOpen)} 
                  className="flex items-center gap-2 text-lg font-bold hover:text-blue-400 transition-colors"
                >
                  {currentFolder} 
                  <motion.div animate={{ rotate: isFolderDropdownOpen ? 180 : 0 }}>
                    <ChevronDown size={20} />
                  </motion.div>
                </button>

                <AnimatePresence>
                  {isFolderDropdownOpen && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -10, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="absolute top-full left-0 mt-4 w-56 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden z-50"
                    >
                      {['All Photos', 'My Uploads', 'Browse Device Folders...'].map(folder => (
                        <button
                          key={folder}
                          onClick={() => {
                            if (folder === 'Browse Device Folders...') {
                              fileInputRef.current?.click();
                              setIsFolderDropdownOpen(false);
                            } else {
                              setCurrentFolder(folder);
                              setIsFolderDropdownOpen(false);
                            }
                          }}
                          className={`w-full text-left px-5 py-3 hover:bg-zinc-800 transition-colors text-sm ${currentFolder === folder ? 'text-blue-400 font-bold bg-zinc-800/50' : 'text-white font-medium'}`}
                        >
                          {folder}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div className="flex gap-2">
                <button onClick={toggleGrid} className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"><Grid size={20} /></button>
              </div>
            </div>

            <div className={`grid gap-2 overflow-y-auto max-h-[60vh] md:max-h-none no-scrollbar pb-20 ${gridCols === 2 ? 'grid-cols-2' : gridCols === 4 ? 'grid-cols-4' : 'grid-cols-3'}`}>
              <input 
                type="file" 
                accept="image/*,video/*" 
                multiple
                className="hidden" 
                ref={fileInputRef}
                onChange={handleFileChange}
                onClick={(e) => { (e.target as HTMLInputElement).value = '' }}
              />
              <input 
                type="file" 
                accept="image/*" 
                capture="environment"
                className="hidden" 
                ref={cameraInputRef}
                onChange={handleFileChange}
                onClick={(e) => { (e.target as HTMLInputElement).value = '' }}
              />
              <button 
                onClick={() => cameraInputRef.current?.click()}
                className="aspect-square bg-zinc-900 border-2 border-dashed border-zinc-800 rounded-xl flex flex-col items-center justify-center gap-2 hover:border-blue-500 hover:bg-zinc-800 transition-all group"
              >
                <Camera size={24} className="text-zinc-500 group-hover:text-blue-500" />
                <span className="text-[10px] font-bold text-zinc-500 group-hover:text-blue-500">CAMERA</span>
              </button>
              
              {(() => {
                return userUploads.map((item, i) => {
                  const selectionIndex = selectedItems.findIndex(i => i.url === item.url);
                  const isSelected = selectionIndex !== -1;
                  return (
                    <motion.div 
                      key={item.url + i} 
                      whileHover={{ scale: 0.98 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => toggleSelection(item)}
                      className={`aspect-square rounded-xl overflow-hidden cursor-pointer relative ring-2 transition-all ${isSelected ? 'ring-blue-500 ring-offset-2 ring-offset-zinc-950' : 'ring-transparent opacity-70 hover:opacity-100'}`}
                    >
                      <div className="w-full h-full relative flex items-center justify-center bg-zinc-900">
                        {item.type === 'video' ? (
                          <video 
                            src={item.url} 
                            className="w-full h-full object-contain absolute inset-0" 
                            muted 
                            playsInline
                          />
                        ) : (
                          <img 
                            src={item.url} 
                            className="w-full h-full object-contain absolute inset-0" 
                            alt="Gallery" 
                          />
                        )}
                      </div>
                      {isSelected && (
                        <div className="absolute top-2 right-2 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center shadow-lg text-[10px] font-bold text-white border-2 border-white">
                          {selectionIndex + 1}
                        </div>
                      )}
                      <button
                        onClick={(e) => handleDeleteUpload(e, item.url)}
                        className="absolute top-2 left-2 w-7 h-7 bg-black/50 hover:bg-red-500 rounded-full flex items-center justify-center text-white backdrop-blur-sm transition-colors md:opacity-0 md:group-hover:opacity-100 opacity-100"
                      >
                        <X size={14} />
                      </button>
                    </motion.div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
