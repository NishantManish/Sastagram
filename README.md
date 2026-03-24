# Sastagram 📸

Sastagram is a modern, minimal social media application inspired by Instagram. It provides a clean space for visual storytelling, allowing users to share moments, connect with others, and discover creative content.

## ✨ Features

- **Modern Auth Experience:** Beautifully designed split-layout login and signup screens with Google and Email authentication.
- **Dynamic Feed:** Scroll through a real-time feed of posts from creators you follow.
- **Visual Stories:** Share ephemeral moments with a dedicated stories section at the top of the feed.
- **Post Creation:** Upload and share your photos with captions.
- **Rich Profiles:** Personalized user profiles with bios, follower/following counts, and a grid view of posts.
- **Real-time Notifications:** Stay updated with likes, follows, and messages.
- **Direct Messaging:** Connect with other users through a built-in messaging system.
- **Search:** Discover new creators and content easily.
- **Responsive Design:** Fully optimized for both desktop and mobile devices.

## 🛠️ Tech Stack & Libraries

This project is built with a robust set of modern web technologies:

### Frontend
- **React 19:** The core library for building the user interface.
- **Vite:** Next-generation frontend tooling for a fast development experience.
- **Tailwind CSS:** A utility-first CSS framework for rapid UI development.
- **Motion (Framer Motion):** For smooth, high-performance animations and transitions.
- **Lucide React:** A beautiful and consistent icon library.
- **React Easy Crop:** For professional-grade image cropping during profile setup.
- **Date-fns:** For easy and accurate date formatting.

### Backend & Infrastructure
- **Firebase:**
  - **Authentication:** Secure user sign-in with Google and Email.
  - **Firestore:** Real-time NoSQL database for storing posts, users, and interactions.
  - **Storage:** For handling file uploads (where applicable).
- **Express:** A minimal and flexible Node.js web application framework for the backend server.
- **Cloudinary:** For high-performance media storage, optimization, and delivery.
- **Google Gemini AI:** Integrated for advanced AI-powered features.

## 🚀 Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn
- A Firebase project
- A Cloudinary account

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/sastagram.git
   cd sastagram
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Environment Setup:**
   Create a `.env` file in the root directory and add your credentials (refer to `.env.example`):
   ```env
   VITE_CLOUDINARY_CLOUD_NAME=your_cloud_name
   VITE_CLOUDINARY_UPLOAD_PRESET=your_upload_preset
   CLOUDINARY_API_KEY=your_api_key
   CLOUDINARY_API_SECRET=your_api_secret
   GEMINI_API_KEY=your_gemini_api_key
   ```

4. **Firebase Configuration:**
   Place your `firebase-applet-config.json` in the root directory with your project details.

5. **Run the development server:**
   ```bash
   npm run dev
   ```
   The app will be available at `http://localhost:3000`.

## 📱 How to Install on Android

Since Sastagram is a Progressive Web App (PWA), you can easily "install" it on your Android device without using the Play Store:

1. **Open Chrome** on your Android phone.
2. **Navigate to the URL** where your app is hosted (e.g., your deployed Cloud Run or Vercel URL).
3. **Tap the three dots (menu)** in the top right corner of Chrome.
4. **Select "Add to Home screen"**.
5. **Confirm the name** (Sastagram) and tap "Add".

The app will now appear on your home screen and in your app drawer, providing a full-screen, app-like experience!

## 📄 License

This project is open-source and available under the MIT License.
