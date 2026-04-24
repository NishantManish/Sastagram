# 📸 Sastagram

> **A high-fidelity social storytelling platform.** Sastagram reimagines visual connection with a focus on speed, aesthetics, and real-time interaction.

---

## 🚀 Core Experience

Sastagram is more than just a clone—it's a performance-tuned social engine built with the latest stack. It combines the familiarity of Instagram with cutting-edge PWA features and AI-driven enhancements.

### ✨ Key Features

- **⚡ Instant Feedback:** Motion-powered transitions and optimistic UI updates for a buttery-smooth feel.
- **🎨 Creative Studio:** Advanced post creation with multiple media support, custom aspect ratios, and AI-powered text styling.
- **🌀 Interactive Reels:** A full-screen, vertically scrollable video experience with native-like performance.
- **💬 Real-time DMs:** Low-latency messaging with attachment support and live presence indicators.
- **🔥 Visual Stories:** Ephemeral content at the top of your feed with engaging transitions.
- **🛠️ Power User Tools:** A integrated Admin Dashboard for comprehensive content and user management.
- **🤖 Gemini AI Integration:** Smart features including intelligent image analysis and content suggestions.
- **📱 PWA Ready:** Installable on Android/iOS for a native app feel with offline support hooks.

---

## 🛠️ Performance Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Framework** | [React 19](https://react.dev) | High-concurrency UI logic |
| **Build Tool** | [Vite 8](https://vitejs.dev) | Near-instant HMR and optimized bundling |
| **Styling** | [Tailwind CSS 4](https://tailwindcss.com) | Modern, responsive utility-first design |
| **Animation** | [Motion](https://motion.dev) | Fluid layout animations and gestures |
| **Backend** | [Firebase](https://firebase.google.com) | Real-time Data, Auth, and Security Rules |
| **Server** | [Express](https://expressjs.com) | Custom API routes & Gemini integration |
| **Media** | [Cloudinary](https://cloudinary.com) | CDN-delivered image/video optimization |

---

## 📂 Architecture at a Glance

```text
src/
├── components/       # Atomic UI & complex feature containers
├── contexts/         # global state: Auth, Theme, Notifications
├── services/         # Logic for Firebase, Cloudinary, and Gemini
├── utils/            # Media processing, date formatters, and helpers
├── types.ts          # Centralized TypeScript definitions
└── App.tsx           # Router-level logic and layout orchestration
```

---

## 🗺️ Detailed Usage Guide

### 1. Setup & Configuration

Sastagram requires a few external integrations to function at 100%.

#### External Credentials
Create a `.env` file based on `.env.example`:
```env
# Cloudinary (Sign up at cloudinary.com)
VITE_CLOUDINARY_CLOUD_NAME=dxxxxxxxx
VITE_CLOUDINARY_UPLOAD_PRESET=ml_default
CLOUDINARY_API_KEY=xxxxxxxxxxxxxxx
CLOUDINARY_API_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxx

# Google Gemini (Get key at aistudio.google.com)
GEMINI_API_KEY=AIzaSyxxxxxxxxxxxxxxxxxxxxx
```

#### Firebase Integration
1. Create a project in [Firebase Console](https://console.firebase.google.com/).
2. Enable **Authentication** (Google & Email).
3. Enable **Firestore** in Test Mode (or apply `firestore.rules`).
4. Download your `firebase-applet-config.json` and place it in the root.

---

### 2. Feature Walkthrough

#### 🏠 Home & Feed
- **Scroll** through posts from followings.
- **Double Tap** on any post to quickly Like.
- **Long Press** on media to see a full-view preview.
- **Swipe** through multi-media posts with fluid gesture controls.

#### 🎥 Reels
- Access the Reels tab from the bottom navigation.
- **Swipe Vertical** to switch between immersive video content.
- Video playback is optimized to auto-pause when out of view.

#### ➕ Modern Creator
- Click the **(+)** button to open the editor.
- **Drag & Drop** multiple images or videos.
- Use the built-in editor to crop images and overlay styled text.

#### 🔐 Admin Dashboard
- Access `/admin` (available to owners designated in database).
- Manage reported content, oversee users, and monitor system health.

---

## 📱 Mobile Installation (Android & iOS)

Sastagram is designed to behave like a native app.

**On Android (Chrome):**
1. Visit the app URL.
2. Tap the **Menu (⋮)** → **Add to Home screen**.
3. Launch from your home screen for a full-screen experience.

**On iOS (Safari):**
1. Visit the app URL.
2. Tap the **Share** button.
3. Scroll down and select **Add to Home Screen**.

---

## 📜 Development Commands

| Command | Action |
| :--- | :--- |
| `npm install` | Install dev and runtime dependencies |
| `npm run dev` | Spin up Express + Vite development server |
| `npm run build` | Generate production-ready optimized assets |
| `npm run lint` | Static type checking with `tsc` |

---

## 📜 License

This project is open-source under the [MIT License](LICENSE).
