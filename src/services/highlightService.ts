import { Highlight } from '../types';
import { db } from '../firebase';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../utils/firestore';
import { deleteFromCloudinary } from '../utils/media';

export const updateHighlight = async (highlightId: string, data: Partial<Highlight>) => {
  try {
    const highlightRef = doc(db, 'highlights', highlightId);
    await updateDoc(highlightRef, data);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `highlights/${highlightId}`);
    throw error;
  }
};

export const deleteHighlight = async (highlightId: string, highlight?: Highlight) => {
  try {
    if (highlight) {
      if (highlight.imageUrl) {
        await deleteFromCloudinary(highlight.imageUrl).catch(console.error);
      }
      if (highlight.mediaUrls && highlight.mediaUrls.length > 0) {
        await Promise.all(highlight.mediaUrls.map(url => deleteFromCloudinary(url).catch(console.error)));
      }
    }
    const highlightRef = doc(db, 'highlights', highlightId);
    await deleteDoc(highlightRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `highlights/${highlightId}`);
    throw error;
  }
};
