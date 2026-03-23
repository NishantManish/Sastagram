import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { handleFirestoreError, OperationType } from '../utils/firestore';
import { User } from '../types';
import { Loader2, X } from 'lucide-react';
import { motion } from 'motion/react';

interface FollowListModalProps {
  userId: string;
  type: 'followers' | 'following';
  onClose: () => void;
  onUserClick: (userId: string) => void;
}

export default function FollowListModal({ userId, type, onClose, onUserClick }: FollowListModalProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUsers = async () => {
      setLoading(true);
      try {
        const followsRef = collection(db, 'follows');
        const q = type === 'followers' 
          ? query(followsRef, where('followingId', '==', userId))
          : query(followsRef, where('followerId', '==', userId));
          
        const snapshot = await getDocs(q);
        
        const userIds = snapshot.docs.map(doc => 
          type === 'followers' ? doc.data().followerId : doc.data().followingId
        );

        const fetchedUsers: User[] = [];
        for (const id of userIds) {
          const userDoc = await getDoc(doc(db, 'users', id));
          if (userDoc.exists()) {
            fetchedUsers.push({ uid: userDoc.id, ...userDoc.data() } as User);
          }
        }
        
        setUsers(fetchedUsers);
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'follows');
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, [userId, type]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: "spring", duration: 0.5, bounce: 0 }}
        className="relative w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[80vh]"
      >
        <div className="flex items-center justify-between p-4 border-b border-zinc-200 shrink-0">
          <h3 className="font-semibold text-zinc-900 capitalize">{type}</h3>
          <button 
            onClick={onClose}
            className="p-1 text-zinc-500 hover:text-zinc-900 transition-colors rounded-full hover:bg-zinc-100"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <div className="overflow-y-auto p-2 flex-1">
          {loading ? (
            <div className="flex justify-center items-center h-32">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
            </div>
          ) : users.length === 0 ? (
            <div className="flex justify-center items-center h-32 text-zinc-500">
              No {type} yet.
            </div>
          ) : (
            <div className="space-y-1">
              {users.map(user => (
                <div 
                  key={user.uid}
                  onClick={() => {
                    onUserClick(user.uid);
                    onClose();
                  }}
                  className="flex items-center gap-3 p-3 hover:bg-zinc-50 rounded-xl cursor-pointer transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-zinc-200 overflow-hidden shrink-0">
                    {user.photoURL ? (
                      <img src={user.photoURL} alt={user.displayName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-500 font-medium">
                        {user.displayName?.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-zinc-900 truncate">{user.displayName}</div>
                    {user.username && <div className="text-sm text-zinc-500 truncate">@{user.username}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
