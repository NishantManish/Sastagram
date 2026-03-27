import React, { useState } from 'react';
import { signInWithPopup, GoogleAuthProvider, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, sendPasswordResetEmail } from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { Camera, Mail, Lock, User as UserIcon, AtSign, ArrowRight, ChevronLeft, Eye, EyeOff } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../utils/firestore';
import { motion, AnimatePresence } from 'motion/react';

export default function AuthScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const checkUsernameUnique = async (usernameToCheck: string) => {
    try {
      const q = query(collection(db, 'users'), where('username', '==', usernameToCheck.toLowerCase()));
      const snapshot = await getDocs(q);
      return snapshot.empty;
    } catch (err) {
      console.error('Error checking username uniqueness:', err);
      handleFirestoreError(err, OperationType.LIST, 'users');
      return false;
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
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
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
        }
      }
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user') return;
      setError(err.message || 'Failed to sign in');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (showReset) {
      handleResetPassword();
      return;
    }
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
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        const user = result.user;
        
        await updateProfile(user, { displayName: name });

        const userRef = doc(db, 'users', user.uid);
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
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
        }
      }
    } catch (err: any) {
      let errorMessage = 'Authentication failed';
      if (err.code === 'auth/invalid-credential') {
        errorMessage = 'Invalid email or password.';
      } else if (err.code === 'auth/email-already-in-use') {
        errorMessage = 'This email is already registered.';
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

  const handleResetPassword = async () => {
    if (!email) {
      setError('Please enter your email address first.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await sendPasswordResetEmail(auth, email);
      setResetSent(true);
      setShowReset(false);
    } catch (err: any) {
      setError(err.message || 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-white font-sans selection:bg-indigo-100 selection:text-indigo-900">
      {/* Left Side - Hero / Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-zinc-950">
        <div className="absolute inset-0 opacity-40">
          <img 
            src="https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?q=80&w=1974&auto=format&fit=crop" 
            alt="Hero" 
            className="w-full h-full object-cover grayscale"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-transparent to-transparent" />
        </div>
        
        <div className="relative z-10 flex flex-col justify-between p-16 w-full">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-2xl">
              <Camera className="w-6 h-6 text-zinc-950" />
            </div>
            <span className="text-white font-black tracking-tighter text-2xl">SASTAGRAM</span>
          </div>

          <div className="max-w-xl">
            <h1 className="text-7xl font-black text-white leading-[0.9] tracking-tighter mb-8 uppercase">
              Capture <br />
              <span className="text-zinc-500">The Moment</span>
            </h1>
            <p className="text-zinc-400 text-lg font-medium leading-relaxed max-w-md">
              A minimal space for your visual stories. Connect, share, and discover what matters most.
            </p>
          </div>

          <div className="flex items-center gap-8">
            <div className="flex flex-col">
              <span className="text-white font-black text-2xl">12k+</span>
              <span className="text-zinc-500 text-[10px] uppercase tracking-widest font-bold">Creators</span>
            </div>
            <div className="flex flex-col">
              <span className="text-white font-black text-2xl">45m</span>
              <span className="text-zinc-500 text-[10px] uppercase tracking-widest font-bold">Stories</span>
            </div>
          </div>
        </div>

        {/* Decorative elements */}
        <div className="absolute top-1/2 -right-24 w-48 h-48 bg-indigo-500/20 rounded-full blur-[100px]" />
        <div className="absolute bottom-1/4 -left-24 w-64 h-64 bg-purple-500/10 rounded-full blur-[120px]" />
      </div>

      {/* Right Side - Auth Form */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center items-center p-6 lg:p-12 bg-zinc-50/50">
        <div className="w-full max-w-[400px]">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center gap-2 mb-12">
            <div className="w-8 h-8 bg-zinc-950 rounded-lg flex items-center justify-center">
              <Camera className="w-5 h-5 text-white" />
            </div>
            <span className="text-zinc-950 font-black tracking-tighter text-xl">SASTAGRAM</span>
          </div>

          <AnimatePresence mode="wait">
            {showReset ? (
              <motion.div
                key="reset"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                <div>
                  <button 
                    onClick={() => setShowReset(false)}
                    className="flex items-center gap-2 text-zinc-500 hover:text-zinc-950 transition-colors mb-6 group"
                  >
                    <ChevronLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
                    <span className="text-sm font-bold uppercase tracking-widest">Back to Login</span>
                  </button>
                  <h2 className="text-4xl font-black text-zinc-950 tracking-tighter uppercase mb-3">Reset Password</h2>
                  <p className="text-zinc-500 font-medium">Enter your email to receive a recovery link.</p>
                </div>

                <form onSubmit={handleEmailAuth} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-widest font-black text-zinc-400 ml-1">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@example.com"
                        className="w-full pl-12 pr-4 py-4 bg-white border border-zinc-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-zinc-950 focus:border-transparent transition-all font-medium"
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-4 bg-zinc-950 text-white font-black uppercase tracking-widest text-sm rounded-2xl hover:bg-zinc-800 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Send Reset Link'}
                  </button>
                </form>
              </motion.div>
            ) : (
              <motion.div
                key={isLogin ? 'login' : 'signup'}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                <div>
                  <h2 className="text-4xl font-black text-zinc-950 tracking-tighter uppercase mb-3">
                    {isLogin ? 'Welcome Back' : 'Join Sastagram'}
                  </h2>
                  <p className="text-zinc-500 font-medium">
                    {isLogin ? 'Enter your details to access your account' : 'Create an account to start sharing your moments'}
                  </p>
                </div>

                {error && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600 text-sm font-bold"
                  >
                    <div className="w-1.5 h-1.5 bg-red-600 rounded-full animate-pulse" />
                    {error}
                  </motion.div>
                )}

                {resetSent && (
                  <div className="p-4 bg-green-50 border border-green-100 rounded-2xl text-green-700 text-sm font-bold">
                    Recovery email sent! Check your inbox.
                  </div>
                )}

                <form onSubmit={handleEmailAuth} className="space-y-4">
                  {!isLogin && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase tracking-widest font-black text-zinc-400 ml-1">Full Name</label>
                        <div className="relative">
                          <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                          <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="John Doe"
                            className="w-full pl-12 pr-4 py-4 bg-white border border-zinc-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-zinc-950 focus:border-transparent transition-all font-medium"
                            required
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase tracking-widest font-black text-zinc-400 ml-1">Username</label>
                        <div className="relative">
                          <AtSign className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                          <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value.replace(/\s+/g, '').toLowerCase())}
                            placeholder="johndoe"
                            className="w-full pl-12 pr-4 py-4 bg-white border border-zinc-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-zinc-950 focus:border-transparent transition-all font-medium"
                            required
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-widest font-black text-zinc-400 ml-1">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@example.com"
                        className="w-full pl-12 pr-4 py-4 bg-white border border-zinc-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-zinc-950 focus:border-transparent transition-all font-medium"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center px-1">
                      <label className="text-[10px] uppercase tracking-widest font-black text-zinc-400">Password</label>
                      {isLogin && (
                        <button 
                          type="button"
                          onClick={() => setShowReset(true)}
                          className="text-[10px] uppercase tracking-widest font-black text-indigo-600 hover:text-indigo-700 transition-colors"
                        >
                          Forgot?
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-12 pr-12 py-4 bg-white border border-zinc-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-zinc-950 focus:border-transparent transition-all font-medium"
                        required
                        minLength={6}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-950 transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {!isLogin && (
                    <div className="flex items-start gap-3 p-1">
                      <input
                        type="checkbox"
                        id="terms"
                        checked={agreedToTerms}
                        onChange={(e) => setAgreedToTerms(e.target.checked)}
                        className="mt-1 w-4 h-4 rounded border-zinc-300 text-zinc-950 focus:ring-zinc-950"
                      />
                      <label htmlFor="terms" className="text-xs text-zinc-500 font-medium leading-relaxed">
                        I agree to the <a href="#" className="text-zinc-950 font-bold hover:underline">Terms</a> and <a href="#" className="text-zinc-950 font-bold hover:underline">Privacy Policy</a>.
                      </label>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-4 bg-zinc-950 text-white font-black uppercase tracking-widest text-sm rounded-2xl hover:bg-zinc-800 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 group"
                  >
                    {loading ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        {isLogin ? 'Sign In' : 'Create Account'}
                        <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                      </>
                    )}
                  </button>
                </form>

                <div className="relative py-2">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-zinc-200"></div>
                  </div>
                  <div className="relative flex justify-center text-[10px] uppercase tracking-[0.2em] font-black">
                    <span className="bg-zinc-50 px-4 text-zinc-400">Or continue with</span>
                  </div>
                </div>

                <button
                  onClick={handleGoogleSignIn}
                  disabled={loading}
                  className="w-full py-4 bg-white border border-zinc-200 text-zinc-950 font-bold rounded-2xl hover:bg-zinc-50 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-3 shadow-sm"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Google
                </button>

                <p className="text-center text-sm font-medium text-zinc-500">
                  {isLogin ? "Don't have an account?" : "Already have an account?"}{' '}
                  <button
                    onClick={() => { setIsLogin(!isLogin); setError(null); }}
                    className="text-zinc-950 font-black uppercase tracking-widest text-[11px] hover:underline underline-offset-4"
                  >
                    {isLogin ? 'Sign Up' : 'Log In'}
                  </button>
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

