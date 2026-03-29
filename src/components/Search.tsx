import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, limit, orderBy } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { handleFirestoreError, OperationType } from '../utils/firestore';
import { User, Post } from '../types';
import { Search as SearchIcon, User as UserIcon, ArrowLeft, TrendingUp, Sparkles, Users, Hash, Layout } from 'lucide-react';
import Profile from './Profile';
import { useBlocks } from '../services/blockService';
import UserAvatar from './UserAvatar';
import PostCard from './PostCard';
import PostDetailsModal from './PostDetailsModal';
import { motion, AnimatePresence } from 'motion/react';

interface SearchProps {
  onNavigate?: (tab: any) => void;
  initialQuery?: string;
  onClearInitialQuery?: () => void;
}

export default function Search({ onNavigate, initialQuery, onClearInitialQuery }: SearchProps) {
  const [searchQuery, setSearchQuery] = useState(initialQuery || '');
  const [results, setResults] = useState<User[]>([]);
  const [postResults, setPostResults] = useState<Post[]>([]);
  const [suggestedUsers, setSuggestedUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const { blockedIds, blockedByIds } = useBlocks(auth.currentUser?.uid);

  useEffect(() => {
    if (initialQuery) {
      setSearchQuery(initialQuery);
      onClearInitialQuery?.();
    }
  }, [initialQuery]);

  useEffect(() => {
    const fetchSuggested = async () => {
      try {
        const q = query(collection(db, 'users'), limit(5));
        const snapshot = await getDocs(q);
        const users = snapshot.docs
          .map(doc => ({ uid: doc.id, ...doc.data() } as User))
          .filter(u => u.uid !== auth.currentUser?.uid);
        setSuggestedUsers(users);
      } catch (err) {
        console.error(err);
      }
    };
    fetchSuggested();
  }, []);

  useEffect(() => {
    const searchItems = async () => {
      if (!searchQuery.trim()) {
        setResults([]);
        setPostResults([]);
        return;
      }

      setLoading(true);
      try {
        const searchLower = searchQuery.toLowerCase();
        
        if (searchLower.startsWith('@')) {
          // Username search
          const username = searchLower.slice(1);
          const q = query(collection(db, 'users'), limit(50));
          const snapshot = await getDocs(q);
          const users = snapshot.docs.map(doc => ({
            uid: doc.id,
            ...doc.data()
          })) as User[];
          
          const matchedUsers = users.filter(u => 
            u.uid !== auth.currentUser?.uid && 
            u.username?.toLowerCase().includes(username)
          );
          
          setResults(matchedUsers.slice(0, 5)); // max few accounts
          setPostResults([]);
        } else {
          // General search: users and tags
          const searchStr = searchLower.startsWith('#') ? searchLower.slice(1) : searchLower;
          
          // Users
          const usersQ = query(collection(db, 'users'), limit(50));
          const usersSnapshot = await getDocs(usersQ);
          const users = usersSnapshot.docs.map(doc => ({
            uid: doc.id,
            ...doc.data()
          })) as User[];
          
          const matchedUsers = users.filter(u => 
            u.uid !== auth.currentUser?.uid && 
            (
              u.displayName?.toLowerCase().includes(searchStr) || 
              u.username?.toLowerCase().includes(searchStr)
            )
          );
          setResults(matchedUsers.slice(0, 5)); // max few accounts

          // Tags
          const postsQ = query(
            collection(db, 'posts'),
            where('tags', 'array-contains', searchStr),
            limit(20)
          );
          const postsSnapshot = await getDocs(postsQ);
          const posts = postsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as Post[];
          setPostResults(posts);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, searchQuery.startsWith('#') ? 'posts' : 'users');
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(() => {
      searchItems();
    }, 400);

    return () => clearTimeout(debounce);
  }, [searchQuery]);

  const filteredResults = results.filter(user => 
    !blockedIds.includes(user.uid) && 
    !blockedByIds.includes(user.uid)
  );

  const filteredPostResults = postResults.filter(post =>
    !blockedIds.includes(post.authorId) &&
    !blockedByIds.includes(post.authorId)
  );

  if (selectedUserId) {
    return (
      <Profile userId={selectedUserId} onBack={() => setSelectedUserId(null)} onNavigate={onNavigate} />
    );
  }

  return (
    <div className="bg-white min-h-screen pb-24">
      {/* Search Bar */}
      <div className="sticky top-0 z-20 bg-white/80 backdrop-blur-xl border-b border-zinc-100/50 px-4 py-4">
        <div className="relative group">
          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none transition-colors group-focus-within:text-indigo-500">
            <SearchIcon className="h-5 w-5 text-zinc-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-12 pr-4 py-3 bg-zinc-100/50 border-none rounded-2xl leading-5 placeholder-zinc-500 focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500/20 transition-all text-[15px]"
            placeholder="Search #tags, @users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="px-6 py-6">
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div 
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex justify-center py-12"
            >
              <div className="w-8 h-8 border-3 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
            </motion.div>
          ) : (filteredResults.length > 0 || filteredPostResults.length > 0) ? (
            <motion.div 
              key="results"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {filteredResults.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 mb-4 text-zinc-400 px-2">
                    <Users className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">Users</span>
                  </div>
                  {filteredResults.map(user => (
                    <motion.div 
                      key={user.uid} 
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.98 }}
                      className="flex items-center gap-4 cursor-pointer hover:bg-zinc-50 p-3 rounded-2xl transition-all border border-transparent hover:border-zinc-100"
                      onClick={() => setSelectedUserId(user.uid)}
                    >
                      <UserAvatar 
                        userId={user.uid} 
                        size={52} 
                        fallbackPhoto={user.photoURL} 
                        fallbackName={user.displayName} 
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-zinc-900 truncate">{user.displayName}</div>
                        <div className="text-sm text-zinc-500 truncate">@{user.username}</div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}

              {filteredPostResults.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-4 text-zinc-400 px-2">
                    <Hash className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">Posts with #{searchQuery.replace(/^#/, '')}</span>
                  </div>
                  {filteredPostResults.map(post => (
                    <PostCard 
                      key={post.id} 
                      post={post} 
                      onUserClick={setSelectedUserId}
                      onTagClick={(tag) => setSearchQuery(`#${tag}`)}
                      onCommentClick={() => setSelectedPost(post)}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          ) : searchQuery.trim() ? (
            <motion.div 
              key="no-results"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-12"
            >
              <div className="w-16 h-16 bg-zinc-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <SearchIcon className="w-8 h-8 text-zinc-300" />
              </div>
              <p className="text-zinc-500">No results found matching "{searchQuery}"</p>
            </motion.div>
          ) : (
            <motion.div 
              key="suggested"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-8"
            >
              {/* Suggested Section */}
              <section>
                <div className="flex items-center justify-between mb-5 px-2">
                  <div className="flex items-center gap-2 text-zinc-900">
                    <Sparkles className="w-5 h-5 text-amber-500" />
                    <h3 className="font-bold text-lg">Suggested for you</h3>
                  </div>
                </div>
                <div className="space-y-3">
                  {suggestedUsers.map(user => (
                    <div 
                      key={user.uid} 
                      className="flex items-center justify-between p-3 rounded-2xl hover:bg-zinc-50 transition-colors cursor-pointer"
                      onClick={() => setSelectedUserId(user.uid)}
                    >
                      <div className="flex items-center gap-4">
                        <UserAvatar userId={user.uid} size={48} />
                        <div>
                          <div className="font-bold text-zinc-900">{user.displayName}</div>
                          <div className="text-xs text-zinc-500">Suggested for you</div>
                        </div>
                      </div>
                      <button className="px-4 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-full hover:bg-indigo-700 transition-colors">
                        View
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {selectedPost && (
          <PostDetailsModal 
            post={selectedPost} 
            onClose={() => setSelectedPost(null)} 
            onUserClick={setSelectedUserId}
            onTagClick={(tag) => {
              setSearchQuery(`#${tag}`);
              setSelectedPost(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
