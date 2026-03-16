/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Library } from './components/Library';
import { Reader } from './components/Reader';
import { Auth } from './components/Auth';
import { Profile } from './components/Profile';
import { AppExplainer } from './components/AppExplainer';
import { ErrorBoundary } from './components/ErrorBoundary';
import { auth } from './lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { Loader2, X, BookOpen } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function App() {
  const [currentBookId, setCurrentBookId] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [showProfile, setShowProfile] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | undefined>();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
      if (currentUser) {
        setShowAuth(false);
      }
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6 p-8 relative overflow-hidden">
        <div className="noise-overlay" />
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative"
        >
          <div className="w-24 h-24 border-2 border-gray-light/20 rounded-full animate-pulse" />
          <div className="absolute inset-0 border-t-2 border-accent rounded-full animate-spin" />
          <BookOpen className="absolute inset-0 m-auto w-8 h-8 text-accent" />
        </motion.div>
        <div className="space-y-2 text-center">
          <h1 className="text-4xl font-display tracking-tighter text-white-soft">FLIPVERSE</h1>
          <p className="text-accent text-xs uppercase tracking-[0.2em] font-medium">Initializing Reader Engine</p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <AnimatePresence mode="wait">
        {currentBookId ? (
          <motion.div 
            key="reader"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.02 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="h-screen w-full"
          >
            <Reader bookId={currentBookId} onBack={() => setCurrentBookId(null)} />
          </motion.div>
        ) : (
          <motion.div 
            key="library"
            initial={{ opacity: 0, scale: 1.02 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="relative min-h-screen bg-background"
          >
            <Library 
              onOpenBook={setCurrentBookId} 
              onRequireAuth={() => {
                setAuthMessage("Please enter your details for our verification of humans and for your materials/resources purpose so we need your details");
                setShowAuth(true);
              }} 
              headerActions={
                user ? (
                  <button 
                    onClick={() => setShowProfile(true)}
                    className="flex items-center gap-2 sm:gap-3 bg-gray-mid/20 backdrop-blur-md pl-1.5 pr-3 sm:pr-4 py-1.5 rounded-full border border-gray-light/20 hover:border-accent transition-colors whitespace-nowrap group"
                  >
                    {user.photoURL ? (
                      <img src={user.photoURL} alt="Profile" className="w-7 h-7 sm:w-8 sm:h-8 rounded-full" />
                    ) : (
                      <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-accent/10 flex items-center justify-center text-accent font-bold text-xs sm:text-sm">
                        {user.displayName?.charAt(0) || user.email?.charAt(0) || 'U'}
                      </div>
                    )}
                    <span className="text-sm font-medium text-white-soft hidden sm:block font-sans group-hover:text-accent transition-colors">{user.displayName || user.email}</span>
                  </button>
                ) : (
                  <button 
                    onClick={() => {
                      setAuthMessage(undefined);
                      setShowAuth(true);
                    }}
                    className="bg-accent text-background px-6 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap font-display uppercase tracking-wider cta-pulse"
                  >
                    Sign In
                  </button>
                )
              }
            />
            {showProfile && user && <Profile user={user} onClose={() => setShowProfile(false)} />}
            {showAuth && !user && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 overflow-y-auto">
                <div className="relative w-full max-w-md my-auto">
                  <button 
                    onClick={() => setShowAuth(false)}
                    className="absolute -top-12 right-0 text-gray-light hover:text-accent transition-colors bg-gray-mid/50 p-2 rounded-full"
                  >
                    <X className="w-6 h-6" strokeWidth={1.5} />
                  </button>
                  <div className="bg-gray-mid p-8 rounded-2xl border border-gray-light shadow-2xl">
                    <Auth 
                      isModal={true} 
                      message={authMessage} 
                      initialIsLogin={!authMessage}
                    />
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <AppExplainer />
    </ErrorBoundary>
  );
}
