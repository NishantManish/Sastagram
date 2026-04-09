import { db, auth } from '../firebase';
import { doc, getDoc, setDoc, increment } from 'firebase/firestore';
import { Reel } from '../types';

// Pre-defined high-quality videos for the infinite discover feed
export const DISCOVER_REELS = [
  { url: 'https://www.w3schools.com/html/mov_bbb.mp4', tags: ['animation', 'nature'] },
  { url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/friday.mp4', tags: ['lifestyle', 'people'] },
  { url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm', tags: ['nature', 'plants'] },
  { url: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/c/c0/Big_Buck_Bunny_4K.webm/Big_Buck_Bunny_4K.webm.480p.vp9.webm', tags: ['animation', 'animals'] },
  { url: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/8/87/Schlossbergbahn.webm/Schlossbergbahn.webm.480p.vp9.webm', tags: ['city', 'travel'] },
  { url: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/a/a4/BBH_front_view.webm/BBH_front_view.webm.480p.vp9.webm', tags: ['science', 'tech'] },
  { url: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/b/b7/How_to_make_a_simple_origami_crane.webm/How_to_make_a_simple_origami_crane.webm.480p.vp9.webm', tags: ['art', 'lifestyle'] },
  { url: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/c/c4/Physicsworks.ogv/Physicsworks.ogv.480p.vp9.webm', tags: ['science', 'education'] },
  { url: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/4/4d/Bathing_macaques_in_Jigokudani_Monkey_Park_%288216968%29.webm/Bathing_macaques_in_Jigokudani_Monkey_Park_%288216968%29.webm.480p.vp9.webm', tags: ['animals', 'nature'] },
  { url: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/9/9b/A_day_in_the_life_of_a_cat.webm/A_day_in_the_life_of_a_cat.webm.480p.vp9.webm', tags: ['animals', 'pets'] }
];

export const updateUserPreferences = async (tags: string[] | undefined, weight: number = 1) => {
  if (!auth.currentUser || !tags || tags.length === 0) return;
  
  const prefsRef = doc(db, 'userPreferences', auth.currentUser.uid);
  
  try {
    const updates: Record<string, any> = {};
    tags.forEach(tag => {
      updates[`tags.${tag}`] = increment(weight);
    });
    
    await setDoc(prefsRef, updates, { merge: true });
  } catch (error) {
    console.error('Error updating preferences:', error);
  }
};

export const getUserPreferences = async (): Promise<Record<string, number>> => {
  if (!auth.currentUser) return {};
  
  try {
    const prefsRef = doc(db, 'userPreferences', auth.currentUser.uid);
    const docSnap = await getDoc(prefsRef);
    
    if (docSnap.exists() && docSnap.data().tags) {
      return docSnap.data().tags;
    }
  } catch (error) {
    console.error('Error getting preferences:', error);
  }
  
  return {};
};

export const generatePersonalizedFeed = async (
  existingReels: Reel[], 
  count: number = 5
): Promise<Reel[]> => {
  const prefs = await getUserPreferences();
  
  let availableDiscoverReels = [...DISCOVER_REELS];

  // Try to fetch from Pexels API
  try {
    const response = await fetch(`/api/pexels/reels?per_page=${count * 2}`);
    if (response.ok) {
      const data = await response.json();
      if (data.reels && data.reels.length > 0) {
        availableDiscoverReels = data.reels;
      }
    } else {
      console.warn("Pexels API not configured or failed, falling back to default reels.");
    }
  } catch (error) {
    console.warn("Failed to fetch Pexels reels, falling back to default reels:", error);
  }
  
  // 1. Try to get reels matching top preferences
  // We allow duplicates in the infinite feed if they've scrolled far enough,
  // but try to avoid immediate repeats by checking the last 20 reels
  const recentReels = existingReels.slice(-20);
  
  const filteredDiscoverReels = availableDiscoverReels.filter(dr => 
    !recentReels.some(er => er.videoUrl === dr.url)
  );
  
  // If we've exhausted all unique ones recently, just use all of them
  const poolToUse = filteredDiscoverReels.length >= count ? filteredDiscoverReels : availableDiscoverReels;
  
  // Score available reels based on user preferences
  const scoredReels = poolToUse.map(reel => {
    let score = 0;
    reel.tags.forEach((tag: string) => {
      if (prefs[tag]) {
        score += prefs[tag];
      }
    });
    // Add randomness to avoid getting stuck in a bubble and to shuffle equally scored items
    score += Math.random() * 10; 
    return { ...reel, score };
  });
  
  // Sort by score descending
  scoredReels.sort((a, b) => b.score - a.score);
  
  // Take top 'count' reels
  const selectedDiscoverReels = scoredReels.slice(0, count);
  
  // Convert to Reel objects
  const generatedReels: Reel[] = selectedDiscoverReels.map((dr, index) => ({
    id: `discover_${Date.now()}_${index}_${Math.random().toString(36).substring(7)}`,
    authorId: 'discover_system',
    authorName: (dr as any).author || 'Discover',
    authorPhoto: `https://ui-avatars.com/api/?name=${encodeURIComponent((dr as any).author || 'Discover')}&background=6366f1&color=fff`,
    videoUrl: dr.url,
    caption: (dr as any).title || `Explore more ${dr.tags.join(', ')} content! #discover #${dr.tags[0]}`,
    tags: dr.tags,
    likesCount: Math.floor(Math.random() * 10000) + 100,
    commentsCount: Math.floor(Math.random() * 500) + 10,
    viewsCount: Math.floor(Math.random() * 50000) + 1000,
    createdAt: new Date(),
  }));
  
  return generatedReels;
};
