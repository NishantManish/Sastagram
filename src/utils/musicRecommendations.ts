import { doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../firebase';

const CACHE_KEY = 'sastagram_music_cache';

export const fetchPersonalizedMusic = async (uid: string) => {
  try {
    let queries = ['trending', 'top hits', 'viral'];
    
    if (uid) {
      const userRef = doc(db, 'users', uid);
      const userDoc = await getDoc(userRef);
      if (userDoc.exists()) {
        const data = userDoc.data();
        if (data.recentMusicSearches && data.recentMusicSearches.length > 0) {
          // Use up to 3 recent searches to build a personalized flavor
          queries = [...data.recentMusicSearches].slice(-3);
        }
      }
    }

    // Pick a random query from their history or defaults
    const selectedQuery = queries[Math.floor(Math.random() * queries.length)];
    
    const cacheKey = `${CACHE_KEY}_${selectedQuery}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Date.now() - parsed.time < 1000 * 60 * 60) {
        return parsed.data;
      }
    }

    const response = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(selectedQuery)}&media=music&limit=25`);
    const data = await response.json();
    
    if (data && data.results) {
      const results = data.results.map((track: any) => ({
        id: track.trackId,
        title: track.trackName,
        artist: track.artistName,
        url: track.previewUrl,
        artwork: track.artworkUrl100
      })).filter((t: any) => t.url);
      
      localStorage.setItem(cacheKey, JSON.stringify({ data: results, time: Date.now() }));
      return results;
    }
    return [];
  } catch (error) {
    console.error('Failed to fetch personalized music', error);
    return [];
  }
};

export const saveMusicSearchActivity = async (uid: string, query: string) => {
  if (!uid || !query || query.trim() === '' || query.trim().length < 3) return;
  
  try {
    const userRef = doc(db, 'users', uid);
    // Add to specific history array. If it gets too large, could be sliced, but standard arrayUnion adds it safely
    await updateDoc(userRef, {
      recentMusicSearches: arrayUnion(query.trim().toLowerCase())
    });
  } catch (error) {
    console.warn('Failed to save music search activity', error);
  }
};
