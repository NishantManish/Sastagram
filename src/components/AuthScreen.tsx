import React, { useState } from 'react';
import { signInWithPopup, GoogleAuthProvider, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { Camera, Mail, Lock, User as UserIcon, AtSign } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../utils/firestore';

export default function AuthScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const checkUsernameUnique = async (usernameToCheck: string) => {
    console.log('Checking username uniqueness:', usernameToCheck);
    try {
      const q = query(collection(db, 'users'), where('username', '==', usernameToCheck.toLowerCase()));
      const snapshot = await getDocs(q);
      console.log('Username uniqueness check complete. Empty:', snapshot.empty);
      return snapshot.empty;
    } catch (err) {
      console.error('Error checking username uniqueness:', err);
      handleFirestoreError(err, OperationType.LIST, 'users');
      return false;
    }
  };

  const handleGoogleSignIn = async () => {
    console.log('Starting Google Sign-In');
    setLoading(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      console.log('Google Sign-In successful for user:', user.uid);

      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        console.log('Creating new user document for Google user');
        // Generate a random username for Google sign-in
        const baseUsername = user.email?.split('@')[0] || 'user';
        const randomSuffix = Math.floor(Math.random() * 10000);
        const generatedUsername = `${baseUsername}${randomSuffix}`.toLowerCase();

        try {
          await setDoc(userRef, {
            uid: user.uid,
            username: generatedUsername,
            displayName: user.displayName || 'Anonymous User',
            photoURL: user.photoURL || '',
            bio: '',
            followersCount: 0,
            followingCount: 0,
            createdAt: serverTimestamp(),
          });
          console.log('User document created successfully');
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
        }
      }
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user') return;
      console.error('Sign-in error:', err);
      setError(err.message || 'Failed to sign in');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Starting Email Auth. Mode:', isLogin ? 'Login' : 'Signup');
    setLoading(true);
    setError(null);

    if (!isLogin && !agreedToTerms) {
      setError('You must agree to the Terms and Privacy Policy to sign up.');
      setLoading(false);
      return;
    }

    if (!isLogin) {
      if (username.length < 3) {
        setError('Username must be at least 3 characters long.');
        setLoading(false);
        return;
      }
      const isUnique = await checkUsernameUnique(username);
      if (!isUnique) {
        setError('Username is already taken. Please choose another one.');
        setLoading(false);
        return;
      }
    }

    try {
      if (isLogin) {
        console.log('Attempting sign-in with email:', email);
        await signInWithEmailAndPassword(auth, email, password);
        console.log('Sign-in successful');
      } else {
        console.log('Attempting sign-up with email:', email);
        const result = await createUserWithEmailAndPassword(auth, email, password);
        const user = result.user;
        console.log('Sign-up successful for user:', user.uid);
        
        await updateProfile(user, { displayName: name });
        console.log('Auth profile updated with name:', name);

        const userRef = doc(db, 'users', user.uid);
        console.log('Creating user document in Firestore');
        try {
          await setDoc(userRef, {
            uid: user.uid,
            username: username.toLowerCase(),
            displayName: name || 'Anonymous User',
            photoURL: '',
            bio: '',
            followersCount: 0,
            followingCount: 0,
            createdAt: serverTimestamp(),
          });
          console.log('User document created successfully');
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
        }
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      let errorMessage = 'Authentication failed';
      
      if (err.code === 'auth/invalid-credential') {
        errorMessage = 'Invalid email or password. If you are trying to create a new account, please switch to the "Sign Up" tab.';
      } else if (err.code === 'auth/email-already-in-use') {
        errorMessage = 'This email is already registered. Please switch to the "Log In" tab.';
      } else if (err.code === 'auth/weak-password') {
        errorMessage = 'Password should be at least 6 characters.';
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-4">
      <div className="w-full max-w-sm bg-white/95 backdrop-blur-xl p-8 rounded-3xl shadow-2xl border border-white/20 flex flex-col items-center">
        <div className="w-16 h-16 bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 rounded-full flex items-center justify-center mb-6 shadow-lg">
          <Camera className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-zinc-900 mb-6 font-serif italic">InstaClone</h1>

        {/* Tabs */}
        <div className="flex w-full bg-zinc-100 rounded-xl p-1 mb-6">
          <button
            type="button"
            onClick={() => { setIsLogin(true); setError(null); }}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${isLogin ? 'bg-white text-purple-600 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
          >
            Log In
          </button>
          <button
            type="button"
            onClick={() => { setIsLogin(false); setError(null); }}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${!isLogin ? 'bg-white text-purple-600 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
          >
            Sign Up
          </button>
        </div>

        {error && (
          <div className="w-full p-3 mb-4 bg-red-50/80 text-red-600 text-sm rounded-xl text-center border border-red-100">
            {error}
          </div>
        )}

        <form onSubmit={handleEmailAuth} className="w-full space-y-4">
          {!isLogin && (
            <>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Full Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white transition-all"
                />
              </div>
              <div className="relative">
                <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.replace(/\s+/g, '').toLowerCase())}
                  required
                  minLength={3}
                  maxLength={30}
                  className="w-full pl-10 pr-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white transition-all"
                />
              </div>
            </>
          )}
          
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full pl-10 pr-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white transition-all"
            />
          </div>

          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full pl-10 pr-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white transition-all"
            />
          </div>

          {!isLogin && (
            <div className="flex items-start gap-2 mt-2">
              <input
                type="checkbox"
                id="terms"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="mt-1 rounded text-purple-600 focus:ring-purple-500"
              />
              <label htmlFor="terms" className="text-xs text-zinc-500 leading-tight">
                I agree to the <a href="#" className="text-purple-600 hover:underline">Terms of Service</a> and <a href="#" className="text-purple-600 hover:underline">Privacy Policy</a>.
              </label>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold rounded-xl transition-all disabled:opacity-70 shadow-md hover:shadow-lg flex items-center justify-center"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              isLogin ? 'Log In' : 'Create Account'
            )}
          </button>
        </form>

        <div className="w-full flex items-center gap-4 my-6">
          <div className="flex-1 h-px bg-zinc-200"></div>
          <span className="text-zinc-400 text-sm font-medium">OR</span>
          <div className="flex-1 h-px bg-zinc-200"></div>
        </div>

        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full py-3 px-4 bg-white border border-zinc-200 hover:bg-zinc-50 text-zinc-700 font-medium rounded-xl transition-colors disabled:opacity-70 flex items-center justify-center gap-2 shadow-sm"
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" />
          Continue with Google
        </button>
      </div>
    </div>
  );
}
