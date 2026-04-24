import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Initialize Gemini lazily
let ai: GoogleGenAI | null = null;
function getAI() {
  if (!ai) {
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return ai;
}

// Default queries for new users
const DEFAULT_QUERIES = ["nature", "travel", "sports", "technology", "lifestyle", "food", "animals", "fashion"];

// Helper to fetch videos from Pexels
async function fetchPexelsVideos(query: string, perPage: number = 5) {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    throw new Error("PEXELS_API_KEY environment variable is required");
  }

  try {
    const response = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=portrait`, {
      headers: {
        Authorization: apiKey
      }
    });
    
    if (!response.ok) {
      console.error(`Pexels API error: ${response.status} ${response.statusText}`);
      return [];
    }

    const data = await response.json();
    return data.videos.map((v: any) => ({
      id: v.id,
      url: v.video_files.find((f: any) => f.quality === 'hd' || f.quality === 'sd')?.link || v.video_files[0].link,
      image: v.image,
      user: v.user.name,
      duration: v.duration,
      query: query // attach query so client knows what this was
    }));
  } catch (error) {
    console.error("Error fetching from Pexels:", error);
    return [];
  }
}

// Helper to fetch images from Unsplash
async function fetchUnsplashImages(query: string, perPage: number = 5) {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) {
    console.warn("UNSPLASH_ACCESS_KEY environment variable is missing");
    return [];
  }

  try {
    const response = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=portrait`, {
      headers: {
        Authorization: `Client-ID ${accessKey}`
      }
    });
    
    if (!response.ok) {
      console.error(`Unsplash API error: ${response.status} ${response.statusText}`);
      return [];
    }

    const data = await response.json();
    return data.results.map((img: any) => ({
      id: img.id,
      url: img.urls.regular,
      user: {
        id: img.user.id,
        name: img.user.name,
        profile_image: img.user.profile_image.medium
      },
      description: img.description || img.alt_description || '',
      likes: img.likes,
      query: query
    }));
  } catch (error) {
    console.error("Error fetching from Unsplash:", error);
    return [];
  }
}

// API Route to get next batch of personalized reels
app.post("/api/reels/next", async (req, res) => {
  try {
    const { interactions } = req.body;
    let queriesToSearch: string[] = [];

    if (!interactions || interactions.length === 0) {
      // Pick 3 random default queries
      const shuffled = [...DEFAULT_QUERIES].sort(() => 0.5 - Math.random());
      queriesToSearch = shuffled.slice(0, 3);
    } else {
      // Use Gemini to generate personalized queries
      const prompt = `
      You are a video recommendation engine. Analyze the user's recent video interactions and generate 3 specific, diverse search queries for a stock video API to find videos this user will enjoy.
      
      User interactions:
      ${JSON.stringify(interactions, null, 2)}
      
      Rules:
      1. Focus on topics similar to what the user 'liked' or 'watched_full'.
      2. Avoid topics similar to what the user 'skipped'.
      3. Make the queries specific enough to yield good stock videos (e.g., "mountain biking" instead of just "sports").
      4. Return ONLY a JSON array of 3 strings.
      `;

      try {
        const aiClient = getAI();
        const response = await aiClient.models.generateContent({
          model: "gemini-2.5-flash",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.STRING
              }
            }
          }
        });

        const generatedQueries = JSON.parse(response.text || "[]");
        if (Array.isArray(generatedQueries) && generatedQueries.length > 0) {
          queriesToSearch = generatedQueries.slice(0, 3);
        } else {
          throw new Error("Invalid response from Gemini");
        }
      } catch (geminiError) {
        console.error("Gemini error, falling back to defaults:", geminiError);
        const shuffled = [...DEFAULT_QUERIES].sort(() => 0.5 - Math.random());
        queriesToSearch = shuffled.slice(0, 3);
      }
    }

    // Fetch videos for the selected queries
    const videoPromises = queriesToSearch.map(q => fetchPexelsVideos(q, 4));
    const videoResults = await Promise.all(videoPromises);
    
    // Flatten and shuffle the results
    let allVideos = videoResults.flat();
    allVideos = allVideos.sort(() => 0.5 - Math.random());

    res.json({ videos: allVideos, queriesUsed: queriesToSearch });
  } catch (error: any) {
    console.error("Error in /api/reels/next:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// API Route to get next batch of personalized Unsplash posts
app.post("/api/unsplash/next", async (req, res) => {
  try {
    const { interactions } = req.body;
    let queriesToSearch: string[] = [];

    if (!interactions || interactions.length === 0) {
      const shuffled = [...DEFAULT_QUERIES].sort(() => 0.5 - Math.random());
      queriesToSearch = shuffled.slice(0, 3);
    } else {
      const prompt = `
      You are an image recommendation engine. Analyze the user's recent interactions and generate 3 specific, diverse search queries for a stock photo API to find images this user will enjoy.
      
      User interactions:
      ${JSON.stringify(interactions, null, 2)}
      
      Rules:
      1. Focus on topics similar to what the user 'liked' or 'watched_full'.
      2. Avoid topics similar to what the user 'skipped'.
      3. Make the queries specific enough to yield good stock photos (e.g., "mountain biking" instead of just "sports").
      4. Return ONLY a JSON array of 3 strings.
      `;

      try {
        const aiClient = getAI();
        const response = await aiClient.models.generateContent({
          model: "gemini-2.5-flash",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.STRING
              }
            }
          }
        });

        const generatedQueries = JSON.parse(response.text || "[]");
        if (Array.isArray(generatedQueries) && generatedQueries.length > 0) {
          queriesToSearch = generatedQueries.slice(0, 3);
        } else {
          throw new Error("Invalid response from Gemini");
        }
      } catch (geminiError) {
        console.error("Gemini error, falling back to defaults:", geminiError);
        const shuffled = [...DEFAULT_QUERIES].sort(() => 0.5 - Math.random());
        queriesToSearch = shuffled.slice(0, 3);
      }
    }

    const imagePromises = queriesToSearch.map(q => fetchUnsplashImages(q, 4));
    const imageResults = await Promise.all(imagePromises);
    
    let allImages = imageResults.flat();
    allImages = allImages.sort(() => 0.5 - Math.random());

    res.json({ images: allImages, queriesUsed: queriesToSearch });
  } catch (error: any) {
    console.error("Error in /api/unsplash/next:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
