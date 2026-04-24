import React, { useState, useEffect } from 'react';
import { ArrowLeft, Search, X, CheckCircle2, Circle } from 'lucide-react';
import { collection, query, getDocs, doc, updateDoc, getDoc, limit, where } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { User } from '../types';
import UserAvatar from './UserAvatar';
import { handleFirestoreError, OperationType } from '../utils/firestore';

interface CloseFriendsManagerProps {
  onBack: () => void;
}

export default function CloseFriendsManager({ onBack }: CloseFriendsManagerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [closeFriends, setCloseFriends] = useState<User[]>([]);
  const [closeFriendIds, setCloseFriendIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchCloseFriends = async () => {
      if (!auth.currentUser) return;
      try {
        const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data() as User;
          const ids = userData.closeFriends || [];
          setCloseFriendIds(ids);

          if (ids.length > 0) {
            // Fetch user details for close friends
            // Note: In a real app with many close friends, we'd need to chunk this or paginate
            const usersRef = collection(db, 'users');
            const q = query(usersRef, where('__name__', 'in', ids.slice(0, 30)));
            const snapshot = await getDocs(q);
            const friends = snapshot.docs.map(d => ({ uid: d.id, ...d.data() } as User));
            setCloseFriends(friends);
          }
        }
      } catch (error) {
        console.error('Error fetching close friends:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCloseFriends();
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const searchUsers = async () => {
      setIsSearching(true);
      try {
        const q = query(
          collection(db, 'users'),
          where('username', '>=', searchQuery.toLowerCase()),
          where('username', '<=', searchQuery.toLowerCase() + '\uf8ff'),
          limit(20)
        );
        const snapshot = await getDocs(q);
        const results = snapshot.docs
          .map(doc => ({ uid: doc.id, ...doc.data() } as User))
          .filter(u => u.uid !== auth.currentUser?.uid);
        setSearchResults(results);
      } catch (error) {
        console.error('Error searching users:', error);
      } finally {
        setIsSearching(false);
      }
    };

    const debounce = setTimeout(searchUsers, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery]);

  const toggleCloseFriend = (user: User) => {
    if (closeFriendIds.includes(user.uid)) {
      setCloseFriendIds(prev => prev.filter(id => id !== user.uid));
      setCloseFriends(prev => prev.filter(u => u.uid !== user.uid));
    } else {
      setCloseFriendIds(prev => [...prev, user.uid]);
      if (!closeFriends.find(u => u.uid === user.uid)) {
        setCloseFriends(prev => [...prev, user]);
      }
    }
  };

  const handleSave = async () => {
    if (!auth.currentUser) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        closeFriends: closeFriendIds
      });
      onBack();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${auth.currentUser.uid}`);
    } finally {
      setIsSaving(false);
    }
  };

  const displayUsers = searchQuery.trim() ? searchResults : closeFriends;

  return (
    <div className="max-w-md mx-auto bg-white h-[100dvh] flex flex-col overflow-hidden">
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b border-zinc-100 px-4 py-3 flex items-center justify-between shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 -ml-2 text-zinc-500 hover:bg-zinc-100 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold text-zinc-900">Close Friends</h1>
        </div>
        <button 
          onClick={handleSave}
          disabled={isSaving}
          className="text-blue-500 font-semibold disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : 'Done'}
        </button>
      </div>

      <div className="p-4 shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
          <input
            type="text"
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-100 border-none rounded-xl py-2.5 pl-10 pr-10 text-sm focus:ring-0"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 pt-0">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-zinc-200 border-t-zinc-900 rounded-full animate-spin" />
          </div>
        ) : displayUsers.length === 0 ? (
          <div className="text-center py-8 text-zinc-500">
            {searchQuery ? 'No users found' : 'You have no close friends yet.'}
          </div>
        ) : (
          <div className="space-y-4">
            {displayUsers.map(user => {
              const isSelected = closeFriendIds.includes(user.uid);
              return (
                <div key={user.uid} className="flex items-center justify-between" onClick={() => toggleCloseFriend(user)}>
                  <div className="flex items-center gap-3">
                    <UserAvatar 
                      userId={user.uid} 
                      size={40} 
                      fallbackPhoto={user.photoURL} 
                      fallbackName={user.displayName} 
                    />
                    <div>
                      <p className="font-semibold text-sm text-zinc-900">{user.username}</p>
                      <p className="text-sm text-zinc-500">{user.displayName}</p>
                    </div>
                  </div>
                  <button className="p-2">
                    {isSelected ? (
                      <CheckCircle2 className="w-6 h-6 text-green-500 fill-green-500" />
                    ) : (
                      <Circle className="w-6 h-6 text-zinc-300" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
