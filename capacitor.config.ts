import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nishantmanish.socialapp',
  appName: 'SocialApp',
  webDir: 'dist',
  server: {
    // This allows the app to load content from the local dist folder
    // while still being able to make requests to your live backend.
    androidScheme: 'https',
    cleartext: true,
    allowNavigation: [
      '*.run.app',
      '*.cloudinary.com',
      '*.firebaseapp.com',
      '*.googleapis.com'
    ]
  }
};

export default config;
