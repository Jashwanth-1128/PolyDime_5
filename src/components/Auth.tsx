import React, { useState, useEffect } from 'react';
import { auth, db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/db';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  updateProfile
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { BookOpen, Loader2, Mail } from 'lucide-react';
import { motion } from 'framer-motion';

export interface AuthProps {
  message?: string;
  isModal?: boolean;
  initialIsLogin?: boolean;
}

export function Auth({ message, isModal, initialIsLogin = true }: AuthProps) {
  const [isLogin, setIsLogin] = useState(initialIsLogin);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Email/Password fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Profile fields
  const [name, setName] = useState('');
  const [collegeName, setCollegeName] = useState('');
  const [rollNumber, setRollNumber] = useState('');
  const [branch, setBranch] = useState('');
  const [yearOfCourse, setYearOfCourse] = useState('');
  const [curriculum, setCurriculum] = useState('');

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        if (!name || !collegeName || !rollNumber || !branch || !yearOfCourse || !curriculum) {
          throw new Error('Please fill in all fields');
        }

        const rollNumberRegex = /^\d{5}-[a-zA-Z]{2}-\d{3}$/;
        if (!rollNumberRegex.test(rollNumber)) {
          throw new Error('Roll Number must be in the format: 20000-cs-000');
        }

        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        await updateProfile(user, { displayName: name });

        const path = `users/${user.uid}`;
        try {
          await setDoc(doc(db, 'users', user.uid), {
            name,
            email,
            collegeName,
            rollNumber,
            curriculum,
            branch,
            yearOfCourse
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, path);
        }
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during authentication');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setError('');
  };

  return (
    <div className={isModal ? "w-full text-zinc-100" : "min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-zinc-100 p-4 sm:p-8"}>
      <motion.div 
        initial={isModal ? { opacity: 0, scale: 0.95, y: 20 } : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className={`w-full max-w-md bg-zinc-900/90 backdrop-blur-xl border border-zinc-800/80 rounded-3xl p-8 shadow-2xl ${isModal ? '' : 'mx-auto'}`}
      >
        <div className="flex flex-col items-center mb-8">
          <div className="p-3 bg-red-500/10 rounded-2xl border border-red-500/20 mb-4">
            <BookOpen className="w-10 h-10 text-red-500" />
          </div>
          <h1 className="text-3xl font-serif tracking-tight text-zinc-100">{isLogin ? 'Welcome Back' : 'Create Account'}</h1>
          {message ? (
            <p className="text-red-400 mt-4 text-center text-sm font-medium bg-red-500/10 p-3 rounded-xl border border-red-500/20">
              {message}
            </p>
          ) : (
            <p className="text-zinc-400 mt-2 text-center">
              {isLogin ? 'Sign in to access your library' : 'Join Flipverse to start reading'}
            </p>
          )}
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl mb-6 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleEmailSubmit} className="space-y-4">
          {!isLogin && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1.5">Full Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-zinc-950/50 border border-zinc-800/80 rounded-xl px-4 py-3 text-zinc-100 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/50 transition-all"
                  placeholder="John Doe"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1.5">College Name</label>
                <input
                  type="text"
                  required
                  value={collegeName}
                  onChange={(e) => setCollegeName(e.target.value)}
                  className="w-full bg-zinc-950/50 border border-zinc-800/80 rounded-xl px-4 py-3 text-zinc-100 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/50 transition-all"
                  placeholder="Government Polytechnic"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1.5">Roll Number</label>
                <input
                  type="text"
                  required
                  value={rollNumber}
                  onChange={(e) => setRollNumber(e.target.value)}
                  pattern="\d{5}-[a-zA-Z]{2}-\d{3}"
                  title="Format: 20000-cs-000 (5 digits, hyphen, 2 letters, hyphen, 3 digits)"
                  className="w-full bg-zinc-950/50 border border-zinc-800/80 rounded-xl px-4 py-3 text-zinc-100 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/50 transition-all"
                  placeholder="20000-cs-000"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1.5">Curriculum (Year of Joining)</label>
                <select
                  required
                  value={curriculum}
                  onChange={(e) => setCurriculum(e.target.value)}
                  className="w-full bg-zinc-950/50 border border-zinc-800/80 rounded-xl px-4 py-3 text-zinc-100 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/50 transition-all appearance-none"
                >
                  <option value="" disabled>Select Curriculum</option>
                  <option value="C18">C18</option>
                  <option value="C21">C21</option>
                  <option value="C24">C24</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1.5">Branch</label>
                  <select
                    required
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    className="w-full bg-zinc-950/50 border border-zinc-800/80 rounded-xl px-4 py-3 text-zinc-100 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/50 transition-all appearance-none"
                  >
                    <option value="" disabled>Select Branch</option>
                    <option value="CME">CME</option>
                    <option value="CSE">CSE</option>
                    <option value="ECE">ECE</option>
                    <option value="EEE">EEE</option>
                    <option value="Civil">Civil</option>
                    <option value="Mechanical">Mechanical</option>
                    <option value="Automobile">Automobile</option>
                    <option value="Mining">Mining</option>
                    <option value="Pharmacy">Pharmacy</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1.5">Year</label>
                  <select
                    required
                    value={yearOfCourse}
                    onChange={(e) => setYearOfCourse(e.target.value)}
                    className="w-full bg-zinc-950/50 border border-zinc-800/80 rounded-xl px-4 py-3 text-zinc-100 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/50 transition-all appearance-none"
                  >
                    <option value="" disabled>Select Year</option>
                    <option value="1st Year">1st Year</option>
                    <option value="2nd Year">2nd Year</option>
                    <option value="3rd Year">3rd Year</option>
                  </select>
                </div>
              </div>
            </motion.div>
          )}

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1.5">Email Address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-zinc-950/50 border border-zinc-800/80 rounded-xl px-4 py-3 text-zinc-100 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/50 transition-all"
              placeholder="student@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1.5">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-zinc-950/50 border border-zinc-800/80 rounded-xl px-4 py-3 text-zinc-100 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/50 transition-all"
              placeholder="••••••••"
              minLength={6}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-red-600 hover:bg-red-500 text-zinc-50 font-medium py-3 rounded-xl transition-all active:scale-95 flex items-center justify-center mt-8 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-red-900/20"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 
              (isLogin ? 'Sign In' : 'Create Account')}
          </button>
        </form>

        <div className="mt-8 text-center">
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              resetForm();
            }}
            className="text-zinc-400 hover:text-red-400 text-sm transition-colors font-medium"
          >
            {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
