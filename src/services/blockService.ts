import React, { useState, useEffect } from 'react';
import { doc, setDoc, deleteDoc, collection, query, where, onSnapshot, serverTimestamp, writeBatch, getDoc, getDocs, increment } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { handleFirestoreError, OperationType } from '../utils/firestore';

export const blockUser = async (blockedId: string) => {
  if (!auth.currentUser) return;
  const blockerId = auth.currentUser.uid;
  const blockId = `${blockerId}_${blockedId}`;
  
  const batch = writeBatch(db);
  
  try {
    // 1. Create the block document
    batch.set(doc(db, 'blocks', blockId), {
      blockerId,
      blockedId,
      createdAt: serverTimestamp(),
    });

    // 2. Handle unfollowing both ways
    const follow1Id = `${blockerId}_${blockedId}`;
    const follow1Ref = doc(db, 'follows', follow1Id);
    const follow1Snap = await getDoc(follow1Ref);
    
    const follow2Id = `${blockedId}_${blockerId}`;
    const follow2Ref = doc(db, 'follows', follow2Id);
    const follow2Snap = await getDoc(follow2Ref);

    let blockerUpdates: any = {};
    let blockedUpdates: any = {};

    if (follow1Snap.exists()) {
      batch.delete(follow1Ref);
      blockerUpdates.followingCount = increment(-1);
      blockedUpdates.followersCount = increment(-1);
    }

    if (follow2Snap.exists()) {
      batch.delete(follow2Ref);
      blockedUpdates.followingCount = increment(-1);
      blockerUpdates.followersCount = increment(-1);
    }

    if (Object.keys(blockerUpdates).length > 0) {
      batch.update(doc(db, 'users', blockerId), blockerUpdates);
    }
    if (Object.keys(blockedUpdates).length > 0) {
      batch.update(doc(db, 'users', blockedId), blockedUpdates);
    }

    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `blocks/${blockId}`);
  }
};

export const unblockUser = async (blockedId: string) => {
  if (!auth.currentUser) return;
  const blockerId = auth.currentUser.uid;
  const blockId = `${blockerId}_${blockedId}`;
  
  try {
    await deleteDoc(doc(db, 'blocks', blockId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `blocks/${blockId}`);
  }
};

export const useBlocks = (userId: string | undefined) => {
  const [blockedIds, setBlockedIds] = useState<string[]>([]);
  const [blockedByIds, setBlockedByIds] = useState<string[]>([]);

  useEffect(() => {
    if (!userId) return;

    const q1 = query(collection(db, 'blocks'), where('blockerId', '==', userId));
    const unsub1 = onSnapshot(q1, (snapshot) => {
      setBlockedIds(snapshot.docs.map(doc => doc.data().blockedId));
    }, (err) => {
      console.error('Error fetching blocked users:', err);
    });

    const q2 = query(collection(db, 'blocks'), where('blockedId', '==', userId));
    const unsub2 = onSnapshot(q2, (snapshot) => {
      setBlockedByIds(snapshot.docs.map(doc => doc.data().blockerId));
    }, (err) => {
      console.error('Error fetching users who blocked me:', err);
    });

    return () => {
      unsub1();
      unsub2();
    };
  }, [userId]);

  return { blockedIds, blockedByIds };
};
