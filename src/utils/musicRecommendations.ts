import { doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../firebase';

const CACHE_KEY = 'sastagram_music_cache';

export const fetchPersonalizedMusic = async (uid: string) => {
  try {
    // Default Indian-centric queries with heavy focus on regional languages
    const defaultQueries = [
      'Hindi Top Hits',
      'Punjabi Viral',
      'New Hindi Songs',
      'Arijit Singh Hits',
      'Sidhu Moose Wala',
      'Diljit Dosanjh',
      'Badshah',
      'Telugu Melodies',
      'Tamil Gana',
      'Malayalam Hits',
      'Kannada Grooves',
      'Haryanvi Hits',
      'Bhojpuri Top 10',
      'Lofi India Hindi',
      'Gazals',
      'Bollywood Party Hits',
      'Indian Hip Hop',
      'Coke Studio Bharat',
      'Desi Pop'
    ];
    
    let queries = [...defaultQueries];
    
    if (uid) {
      const userRef = doc(db, 'users', uid);
      const userDoc = await getDoc(userRef);
      if (userDoc.exists()) {
        const data = userDoc.data();
        if (data.recentMusicSearches && data.recentMusicSearches.length > 0) {
          // Mix user search history with global defaults, prioritizing user history
          const searchHistory = [...data.recentMusicSearches].slice(-5);
          // If they have history, focus on it 80% of the time
          if (Math.random() > 0.2) {
            queries = searchHistory;
          } else {
            // Otherwise mix history with defaults
            queries = [...searchHistory, ...defaultQueries];
          }
        }
      }
    }

    // Pick a random query from the weighted list
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
