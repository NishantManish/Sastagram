import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import path from "path";
import { v2 as cloudinary } from "cloudinary";

dotenv.config();

cloudinary.config({
  cloud_name: process.env.VITE_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Cloudinary delete route
app.post("/api/cloudinary/delete", async (req, res) => {
  try {
    const { publicId, resourceType } = req.body;
    if (!publicId || !resourceType) {
      return res.status(400).json({ error: "Missing publicId or resourceType" });
    }

    if (!process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      return res.status(500).json({ error: "Cloudinary credentials not configured on server" });
    }

    const result = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    res.json({ success: true, result });
  } catch (error: any) {
    console.error("Cloudinary delete error:", error);
    res.status(500).json({ error: error.message || "Failed to delete from Cloudinary" });
  }
});

// Helper to call OpenRouter
async function callOpenRouter(prompt: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY environment variable is required");
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "Social App"
    },
    body: JSON.stringify({
      model: "nvidia/nemotron-3-nano-30b-a3b:free",
      messages: [
        { role: "user", content: prompt }
      ]
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${err}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

// Default queries for new users (Indian context)
const DEFAULT_QUERIES = [
  "india travel", "indian street food", "bollywood lifestyle", 
  "indian festivals", "indian nature", "mumbai streets", 
  "indian ethnic wear", "delhi life", "kerala nature", "indian weddings"
];

// Helper to fetch videos from Pexels
async function fetchPexelsVideos(query: string, perPage: number = 15) {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    throw new Error("PEXELS_API_KEY environment variable is required");
  }

  try {
    const response = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=${perPage}&page=1&orientation=portrait`, {
      headers: {
        Authorization: apiKey
      }
    });
    
    if (!response.ok) {
      console.error(`Pexels API error: ${response.status} ${response.statusText}`);
      return [];
    }

    const data = await response.json();
    let videos = data.videos || [];
    
    if (videos.length > 0) {
      const idx = Math.floor(Math.random() * videos.length);
      videos = [videos[idx]];
    }

    return videos.map((v: any) => ({
      id: v.id,
      url: v.video_files.find((f: any) => f.quality === 'hd' || f.quality === 'sd')?.link || v.video_files[0].link,
      image: v.image,
      user: v.user.name,
      duration: v.duration,
      query: query, // attach query so client knows what this was
      type: 'pexels'
    }));
  } catch (error) {
    console.error("Error fetching from Pexels:", error);
    return [];
  }
}

// Helper to fetch YouTube Shorts
async function fetchYouTubeShorts(query: string, maxResults: number = 2) {
  const apiKey = process.env.VITE_YOUTUBE_API_KEY || process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    console.warn("YOUTUBE_API_KEY missing, skipping YouTube");
    return [];
  }

  try {
    const response = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query + ' #shorts')}&maxResults=${maxResults}&type=video&videoDuration=short&key=${apiKey}`);
    if (!response.ok) {
      console.error(`YouTube API error: ${response.status}`);
      return [];
    }
    const data = await response.json();
    return data.items.map((item: any) => ({
      id: `yt-${item.id.videoId}`,
      url: `https://www.youtube.com/embed/${item.id.videoId}?autoplay=1&controls=0&modestbranding=1&loop=1&playlist=${item.id.videoId}&showinfo=0&rel=0&iv_load_policy=3&fs=0`,
      image: item.snippet.thumbnails.high.url,
      user: item.snippet.channelTitle,
      duration: 60,
      query: query,
      type: 'youtube'
    }));
  } catch (err) {
    console.error("Failed to fetch YouTube shorts:", err);
    return [];
  }
}

// Helper to fetch images from Unsplash
async function fetchUnsplashImages(query: string, perPage: number = 15) {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) {
    console.warn("UNSPLASH_ACCESS_KEY environment variable is missing");
    return [];
  }

  try {
    const response = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${perPage}&page=1&orientation=portrait`, {
      headers: {
        Authorization: `Client-ID ${accessKey}`
      }
    });
    
    if (!response.ok) {
      console.error(`Unsplash API error: ${response.status} ${response.statusText}`);
      return [];
    }

    const data = await response.json();
    let results = data.results || [];
    
    if (results.length > 0) {
      const idx = Math.floor(Math.random() * results.length);
      results = [results[idx]];
    }

    return results.map((img: any) => ({
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
      queriesToSearch = shuffled.slice(0, 6);
    } else {
      // Use Gemini to generate personalized queries
      const prompt = `
      You are an elite, highly advanced video recommendation algorithm powering an addictive social media feed.
      Analyze the user's sequential interaction history and generate 6 highly targeted, nuanced search queries for a stock video API.
      
      User interactions (ordered chronologically, oldest to newest):
      ${JSON.stringify(interactions, null, 2)}
      
      Advanced Personalization Rules:
      1. Temporal Weighting: Recent interactions carry significantly more weight than older ones. Track the user's shifting interests.
      2. Affinity Mapping: Identify the underlying themes, aesthetics, and emotional tones of 'liked' and 'watched_full' items. 
      3. Negative Signals: Strongly suppress concepts, visual styles, and themes correlated with 'skipped' items.
      4. Serendipity Injection: Make 4 queries highly relevant to their core interests, but make the other 2 queries a "tangential exploration".
      5. Indian Context (CRITICAL): Ensure that the generated queries are highly contextualized for an Indian audience (e.g., "indian streets", "bollywood dance", "mumbai local", "kerala nature").
      6. Output Constraint: Return EXACTLY a JSON array containing exactly 6 string queries based strictly on the user's complex cognitive profile.
      `;

      try {
        const rawText = await callOpenRouter(prompt);
        const cleanText = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
        const generatedQueries = JSON.parse(cleanText);
        if (Array.isArray(generatedQueries) && generatedQueries.length > 0) {
          queriesToSearch = generatedQueries.slice(0, 6);
        } else {
          throw new Error("Invalid response from OpenRouter");
        }
      } catch (aiError) {
        console.error("AI error, falling back to defaults:", aiError);
        const shuffled = [...DEFAULT_QUERIES].sort(() => 0.5 - Math.random());
        queriesToSearch = shuffled.slice(0, 6);
      }
    }

    // Fetch videos for the selected queries
    const videoPromises = queriesToSearch.map(q => fetchPexelsVideos(q, 1));
    const ytPromises = queriesToSearch.slice(0, 3).map(q => fetchYouTubeShorts(q, 1));
    
    const [videoResults, ytResults] = await Promise.all([
      Promise.all(videoPromises),
      Promise.all(ytPromises)
    ]);
    
    // Flatten and shuffle the results
    let allVideos = [...videoResults.flat(), ...ytResults.flat()];
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
      queriesToSearch = shuffled.slice(0, 6);
    } else {
      const prompt = `
      You are an elite, highly advanced content recommendation algorithm powering an addictive image discovery feed.
      Analyze the user's sequential interaction history and generate 6 highly targeted, visually evocative search queries for the Unsplash API.
      
      User interactions (ordered chronologically, oldest to newest):
      ${JSON.stringify(interactions, null, 2)}
      
      Advanced Personalization Rules:
      1. Temporal Decay: Heavily prioritize the cognitive themes present in the most recent positive interactions.
      2. Visual Aesthetic Extraction: Deduce the user's preferred visual style (e.g., minimalist, moody, vibrant, macro).
      3. Aversion Modeling: Analyze 'skipped' items not just for their explicit subjects, but for their underlying genres.
      4. Exploitation vs. Exploration: 4 queries exploit known high-affinity topics, 2 explore adjacent domains.
      5. Unsplash Optimization & Indian Context: Formulate queries that perform exceptionally well on Unsplash AND are contextualized for an Indian audience (e.g., "indian architecture", "mumbai street photography", "indian culture"). 
      6. Output Constraint: Return EXACTLY a JSON array of 6 string queries reflecting this sophisticated analysis.
      `;

      try {
        const rawText = await callOpenRouter(prompt);
        const cleanText = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
        const generatedQueries = JSON.parse(cleanText);
        if (Array.isArray(generatedQueries) && generatedQueries.length > 0) {
          queriesToSearch = generatedQueries.slice(0, 6);
        } else {
          throw new Error("Invalid response from OpenRouter");
        }
      } catch (aiError) {
        console.error("AI error, falling back to defaults:", aiError);
        const shuffled = [...DEFAULT_QUERIES].sort(() => 0.5 - Math.random());
        queriesToSearch = shuffled.slice(0, 6);
      }
    }

    const imagePromises = queriesToSearch.map(q => fetchUnsplashImages(q, 1));
    const imageResults = await Promise.all(imagePromises);
    
    let allImages = imageResults.flat();
    allImages = allImages.sort(() => 0.5 - Math.random());

    res.json({ images: allImages, queriesUsed: queriesToSearch });
  } catch (error: any) {
    console.error("Error in /api/unsplash/next:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// API Route for AI Chat feature
app.post("/api/ai/chat", async (req, res) => {
  try {
    const { messages } = req.body;
    
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Messages array is required" });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "OPENROUTER_API_KEY environment variable is required" });
    }

    const systemMessage = {
      role: "system",
      content: "You are Sastagram AI, the official and helpful AI assistant for Sastagram, a modern social media platform. You are engaging, friendly, and knowledgeable about social media, trends, and content creation. You keep your answers concise and helpful."
    };

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "Sastagram"
      },
      body: JSON.stringify({
        model: "nvidia/nemotron-3-nano-30b-a3b:free",
        messages: [systemMessage, ...messages]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("OpenRouter API error:", err);
      return res.status(500).json({ error: "Failed to generate AI response" });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "I couldn't process that.";

    res.json({ reply });
  } catch (error: any) {
    console.error("Error in /api/ai/chat:", error);
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
