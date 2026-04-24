import React, { useState } from 'react';
import MediaEditor from './MediaEditor';
import ShareScreen from './ShareScreen';
import MediaSelector, { MediaItem } from './MediaSelector';
import { AnimatePresence, motion } from 'motion/react';
import { addDoc, collection, serverTimestamp, Timestamp, writeBatch, doc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { handleFirestoreError, OperationType, parseFirestoreError } from '../utils/firestore';
import { deleteFromCloudinary } from '../utils/media';

export type FlowState = 'select' | 'edit' | 'share';

interface CreatePostProps {
  onSuccess: () => void;
  onBack?: () => void;
  initialType?: 'post' | 'story' | 'reel';
}

function dataURItoBlob(dataURI: string) {
  const byteString = atob(dataURI.split(',')[1]);
  const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type: mimeString });
}

export default function CreatePost({ onSuccess, onBack, initialType = 'post' }: CreatePostProps) {
  const [flowState, setFlowState] = useState<FlowState>('select');
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [postType, setPostType] = useState<'post' | 'story' | 'reel'>(initialType || 'post');
  const [editedImages, setEditedImages] = useState<string[]>([]);
  const [editorStates, setEditorStates] = useState<any[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleShare = async (caption: string, visibility: string) => {
    if (!auth.currentUser) {
      showToast('You must be logged in to upload.');
      return;
    }

    setIsUploading(true);
    showToast('Uploading, please wait...');

    try {
      const uploadedUrls: { url: string, type: 'image' | 'video' }[] = [];

      for (let i = 0; i < mediaItems.length; i++) {
        const item = mediaItems[i];
        let fileToUpload: Blob | File | null = null;
        const resourceType = item.type === 'video' ? 'video' : 'image';
        let originalFileName = 'upload';

        if (item.type === 'image' && editedImages[i] && editedImages[i].startsWith('data:image')) {
           fileToUpload = dataURItoBlob(editedImages[i]);
           originalFileName = 'edited_image.jpg';
        } else if (item.file) {
           fileToUpload = item.file;
           originalFileName = item.file.name;
        }

        if (!fileToUpload) {
            throw new Error("Unable to locate file to upload");
        }

        const formData = new FormData();
        formData.append('file', fileToUpload, originalFileName);
        formData.append('upload_preset', (import.meta as any).env.VITE_CLOUDINARY_UPLOAD_PRESET);

        const response = await fetch(
          `https://api.cloudinary.com/v1_1/${(import.meta as any).env.VITE_CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`,
          { method: 'POST', body: formData }
        );

        if (!response.ok) {
          throw new Error(`Failed to upload to Cloudinary`);
        }

        const data = await response.json();
        uploadedUrls.push({ url: data.secure_url, type: item.type });
      }

      // Now create Firestore documents
      if (postType === 'post') {
          const tags = caption.match(/#(\w+)/g)?.map(t => t.slice(1).toLowerCase()) || [];
          const mentions = caption.match(/@(\w+)/g)?.map(m => m.slice(1).toLowerCase()) || [];

          await addDoc(collection(db, 'posts'), {
            authorId: auth.currentUser.uid,
            authorName: auth.currentUser.displayName || 'Anonymous',
            authorPhoto: auth.currentUser.photoURL || '',
            imageUrl: uploadedUrls[0].type === 'image' ? uploadedUrls[0].url : '',
            videoUrl: uploadedUrls[0].type === 'video' ? uploadedUrls[0].url : '',
            mediaType: uploadedUrls[0].type,
            mediaUrls: uploadedUrls,
            caption: caption.trim(),
            tags,
            mentions,
            likesCount: 0,
            commentsCount: 0,
            createdAt: serverTimestamp(),
            audience: visibility === 'friends' ? 'close_friends' : 'all',
          });
      } else if (postType === 'reel') {
          await addDoc(collection(db, 'reels'), {
            authorId: auth.currentUser.uid,
            authorName: auth.currentUser.displayName || 'Anonymous',
            authorPhoto: auth.currentUser.photoURL || '',
            videoUrl: uploadedUrls[0].url,
            caption: caption.trim(),
            likesCount: 0,
            commentsCount: 0,
            viewsCount: 0,
            createdAt: serverTimestamp(),
          });
      } else {
          const expiresAt = new Date();
          expiresAt.setHours(expiresAt.getHours() + 24);

          const batch = writeBatch(db);
          for (const media of uploadedUrls) {
            const storyRef = doc(collection(db, 'stories'));
            batch.set(storyRef, {
              authorId: auth.currentUser.uid,
              authorName: auth.currentUser.displayName || 'Anonymous',
              authorPhoto: auth.currentUser.photoURL || '',
              imageUrl: media.type === 'image' ? media.url : '',
              videoUrl: media.type === 'video' ? media.url : '',
              mediaType: media.type,
              createdAt: serverTimestamp(),
              expiresAt: Timestamp.fromDate(expiresAt),
              audience: visibility === 'friends' ? 'close_friends' : 'all',
            });
          }
          await batch.commit();
      }

      showToast('Successfully posted!');
      setTimeout(() => {
         onSuccess();
      }, 1000);

    } catch (err: any) {
      console.error(`Error creating ${postType}:`, err);
      showToast(parseFirestoreError(err));
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="w-full min-h-[calc(100vh-4rem)] bg-zinc-950 text-white relative flex flex-col overflow-hidden pt-4 pb-24 z-50">
      <AnimatePresence>
        {flowState === 'select' && (
          <motion.div 
            key="select"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="absolute inset-0 flex flex-col z-30 bg-zinc-950"
          >
            <MediaSelector 
              initialType={postType}
              onSelect={(items, type) => { 
                setMediaItems(items); 
                setPostType(type); 
                setFlowState('edit'); 
              }} 
              onClose={() => {
                if (onBack) onBack();
              }}
              showToast={showToast}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {(flowState === 'edit' || flowState === 'share') && mediaItems.length > 0 && (
        <motion.div 
          initial={false}
          animate={{ 
            opacity: flowState === 'edit' ? 1 : 0, 
            scale: flowState === 'edit' ? 1 : 0.95,
            pointerEvents: flowState === 'edit' ? 'auto' : 'none'
          }}
          className="absolute inset-0 flex flex-col bg-zinc-950"
          style={{ zIndex: flowState === 'edit' ? 20 : 10 }}
        >
          <MediaEditor 
            mediaItems={mediaItems} 
            postType={postType as any}
            onNext={(imgs, states) => { setEditedImages(imgs); setEditorStates(states); setFlowState('share'); }} 
            onBack={() => {
              setFlowState('select');
              setMediaItems([]);
            }} 
            showToast={showToast}
          />
        </motion.div>
      )}

      {(flowState === 'edit' || flowState === 'share') && mediaItems.length > 0 && editedImages.length > 0 && (
        <motion.div 
          initial={false}
          animate={{ 
            opacity: flowState === 'share' ? 1 : 0, 
            x: flowState === 'share' ? 0 : 20,
            pointerEvents: flowState === 'share' ? 'auto' : 'none'
          }}
          className="absolute inset-0 flex flex-col bg-zinc-950"
          style={{ zIndex: flowState === 'share' ? 30 : 10 }}
        >
          <ShareScreen 
            images={editedImages} 
            mediaItems={mediaItems}
            editorStates={editorStates}
            postType={postType as any}
            onBack={() => setFlowState('edit')} 
            onShare={handleShare} 
            showToast={showToast}
          />
          {isUploading && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex flex-col items-center justify-center">
               <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
               <p className="mt-4 font-bold tracking-widest text-zinc-300">UPLOADING...</p>
            </div>
          )}
        </motion.div>
      )}

      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            className="fixed bottom-12 left-1/2 -translate-x-1/2 bg-white text-black px-6 py-3 rounded-2xl shadow-2xl z-[100] font-semibold whitespace-nowrap border border-zinc-200"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
