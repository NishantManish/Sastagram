import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { handleFirestoreError, OperationType } from '../utils/firestore';
import { User } from '../types';
import { Search as SearchIcon, User as UserIcon } from 'lucide-react';
import Profile from './Profile';

export default function Search() {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  useEffect(() => {
    const searchUsers = async () => {
      if (!searchQuery.trim()) {
        setResults([]);
        return;
      }

      setLoading(true);
      try {
        // Note: Firestore doesn't support native full-text search or case-insensitive starts-with easily without extra setup.
        // For this clone, we'll do a simple exact match or prefix match if possible, or just fetch all and filter client-side if small.
        // A better approach for production is Algolia or Typesense.
        // Here we'll do a simple query where displayName >= searchQuery and < searchQuery + '\uf8ff'
        const q = query(
          collection(db, 'users'),
          where('displayName', '>=', searchQuery),
          where('displayName', '<=', searchQuery + '\uf8ff'),
          limit(20)
        );

        const snapshot = await getDocs(q);
        const users = snapshot.docs.map(doc => ({
          uid: doc.id,
          ...doc.data()
        })) as User[];
        
        // Filter out current user
        setResults(users.filter(u => u.uid !== auth.currentUser?.uid));
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

  if (selectedUserId) {
    return (
      <Profile userId={selectedUserId} onBack={() => setSelectedUserId(null)} />
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
        ) : results.length > 0 ? (
          <div className="space-y-4">
            {results.map(user => (
              <div 
                key={user.uid} 
                className="flex items-center gap-3 cursor-pointer hover:bg-zinc-50 p-2 rounded-xl transition-colors"
                onClick={() => setSelectedUserId(user.uid)}
              >
                <div className="w-12 h-12 rounded-full bg-zinc-200 overflow-hidden shrink-0">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt={user.displayName || ''} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-500 font-medium">
                      {user.displayName?.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div>
                  <div className="font-semibold text-zinc-900">{user.displayName}</div>
                  {user.bio && <div className="text-sm text-zinc-500 line-clamp-1">{user.bio}</div>}
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
