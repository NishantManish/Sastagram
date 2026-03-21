import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { handleFirestoreError, OperationType } from '../utils/firestore';
import { User } from '../types';
import { Search as SearchIcon, User as UserIcon, ArrowLeft } from 'lucide-react';
import Profile from './Profile';
import { useBlocks } from '../services/blockService';
import UserAvatar from './UserAvatar';

export default function Search({ onNavigate }: { onNavigate?: (tab: any) => void }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const { blockedIds, blockedByIds } = useBlocks(auth.currentUser?.uid);

  useEffect(() => {
    const searchUsers = async () => {
      if (!searchQuery.trim()) {
        setResults([]);
        return;
      }

      setLoading(true);
      try {
        // Since Firestore doesn't support case-insensitive prefix search well,
        // we'll fetch a larger batch of users and filter client-side.
        // In a real app, we'd use a search index like Algolia.
        const q = query(
          collection(db, 'users'),
          limit(100)
        );

        const snapshot = await getDocs(q);
        const users = snapshot.docs.map(doc => ({
          uid: doc.id,
          ...doc.data()
        })) as User[];
        
        const searchLower = searchQuery.toLowerCase();
        const matchedUsers = users.filter(u => 
          u.uid !== auth.currentUser?.uid && 
          (
            u.displayName?.toLowerCase().includes(searchLower) || 
            u.username?.toLowerCase().includes(searchLower)
          )
        );
        
        setResults(matchedUsers);
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'users');
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(() => {
      searchUsers();
    }, 500);

    return () => clearTimeout(debounce);
  }, [searchQuery]);

  const filteredResults = results.filter(user => 
    !blockedIds.includes(user.uid) && 
    !blockedByIds.includes(user.uid)
  );

  if (selectedUserId) {
    return (
      <Profile userId={selectedUserId} onBack={() => setSelectedUserId(null)} onNavigate={onNavigate} />
    );
  }

  return (
    <div className="max-w-md mx-auto pb-20 bg-white min-h-screen">
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-zinc-200 px-4 py-3">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <SearchIcon className="h-5 w-5 text-zinc-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-2 border border-zinc-300 rounded-xl leading-5 bg-zinc-50 placeholder-zinc-500 focus:outline-none focus:bg-white focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="p-4">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          </div>
        ) : filteredResults.length > 0 ? (
          <div className="space-y-4">
            {filteredResults.map(user => (
              <div 
                key={user.uid} 
                className="flex items-center gap-3 cursor-pointer hover:bg-zinc-50 p-2 rounded-xl transition-colors"
                onClick={() => setSelectedUserId(user.uid)}
              >
                <UserAvatar 
                  userId={user.uid} 
                  size={48} 
                  fallbackPhoto={user.photoURL} 
                  fallbackName={user.displayName} 
                />
                <div>
                  <div className="font-semibold text-zinc-900">{user.displayName}</div>
                  <div className="text-sm text-zinc-500">@{user.username}</div>
                </div>
              </div>
            ))}
          </div>
        ) : searchQuery.trim() ? (
          <div className="text-center py-8 text-zinc-500">
            No users found matching "{searchQuery}"
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-[50vh] text-zinc-500">
            <SearchIcon className="w-12 h-12 mb-4 text-zinc-300" />
            <p className="text-lg font-medium text-zinc-900">Find people</p>
            <p className="text-sm">Search for users by their display name.</p>
          </div>
        )}
      </div>
    </div>
  );
}
