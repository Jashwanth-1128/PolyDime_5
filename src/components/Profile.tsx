import React, { useState, useEffect } from 'react';
import { db, logOut } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/db';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { User, updateProfile as updateAuthProfile } from 'firebase/auth';
import { X, Edit2, Save, LogOut, Loader2, User as UserIcon } from 'lucide-react';

interface UserData {
  name: string;
  email: string;
  collegeName: string;
  rollNumber: string;
  curriculum: string;
  branch: string;
  yearOfCourse: string;
}

interface ProfileProps {
  user: User;
  onClose: () => void;
}

export function Profile({ user, onClose }: ProfileProps) {
  const [userData, setUserData] = useState<UserData | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [formData, setFormData] = useState<UserData | null>(null);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const path = `users/${user.uid}`;
        const docRef = doc(db, 'users', user.uid);
        try {
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data() as UserData;
            setUserData(data);
            setFormData(data);
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, path);
        }
      } catch (err) {
        console.error("Error fetching user data:", err);
        setError("Failed to load profile data.");
      } finally {
        setLoading(false);
      }
    };
    fetchUserData();
  }, [user.uid]);

  const handleSave = async () => {
    if (!formData) return;
    setSaving(true);
    setError('');
    try {
      // Update Firestore
      const path = `users/${user.uid}`;
      const docRef = doc(db, 'users', user.uid);
      try {
        await updateDoc(docRef, {
          name: formData.name,
          collegeName: formData.collegeName,
          rollNumber: formData.rollNumber,
          curriculum: formData.curriculum,
          branch: formData.branch,
          yearOfCourse: formData.yearOfCourse
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }

      // Update Auth Profile if name changed
      if (formData.name !== user.displayName) {
        await updateAuthProfile(user, { displayName: formData.name });
      }

      setUserData(formData);
      setIsEditing(false);
    } catch (err: any) {
      console.error("Error updating profile:", err);
      setError(err.message || "Failed to update profile.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-sm z-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-6 border-b border-zinc-800">
          <h2 className="text-xl font-semibold text-zinc-100 flex items-center gap-2">
            <UserIcon className="w-5 h-5 text-red-500" />
            User Profile
          </h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-50 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg mb-6 text-sm">
              {error}
            </div>
          )}

          {formData && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Full Name</label>
                <input
                  type="text"
                  disabled={!isEditing}
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-zinc-100 focus:outline-none focus:border-red-500 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Email Address</label>
                <input
                  type="email"
                  disabled
                  value={formData.email}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-zinc-500 cursor-not-allowed opacity-70"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">College Name</label>
                <input
                  type="text"
                  disabled={!isEditing}
                  value={formData.collegeName}
                  onChange={(e) => setFormData({ ...formData, collegeName: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-zinc-100 focus:outline-none focus:border-red-500 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Roll Number</label>
                <input
                  type="text"
                  disabled={!isEditing}
                  value={formData.rollNumber}
                  onChange={(e) => setFormData({ ...formData, rollNumber: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-zinc-100 focus:outline-none focus:border-red-500 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Curriculum (Year of Joining)</label>
                <select
                  disabled={!isEditing}
                  value={formData.curriculum}
                  onChange={(e) => setFormData({ ...formData, curriculum: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-zinc-100 focus:outline-none focus:border-red-500 transition-colors appearance-none disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  <option value="" disabled>Select Curriculum</option>
                  <option value="C18">C18</option>
                  <option value="C21">C21</option>
                  <option value="C24">C24</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Branch</label>
                  <select
                    disabled={!isEditing}
                    value={formData.branch}
                    onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-zinc-100 focus:outline-none focus:border-red-500 transition-colors appearance-none disabled:opacity-70 disabled:cursor-not-allowed"
                  >
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
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Year</label>
                  <select
                    disabled={!isEditing}
                    value={formData.yearOfCourse}
                    onChange={(e) => setFormData({ ...formData, yearOfCourse: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-zinc-100 focus:outline-none focus:border-red-500 transition-colors appearance-none disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    <option value="1st Year">1st Year</option>
                    <option value="2nd Year">2nd Year</option>
                    <option value="3rd Year">3rd Year</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-zinc-800 bg-zinc-900/50 flex items-center justify-between">
          <button
            onClick={logOut}
            className="flex items-center gap-2 text-red-400 hover:text-red-300 transition-colors px-4 py-2 rounded-lg hover:bg-red-400/10 font-medium"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
          
          <div className="flex gap-3">
            {isEditing ? (
              <>
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setFormData(userData);
                    setError('');
                  }}
                  disabled={saving}
                  className="px-4 py-2 text-zinc-400 hover:text-zinc-50 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-zinc-50 px-6 py-2 rounded-lg transition-colors font-medium disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save
                </button>
              </>
            ) : (
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-2 bg-zinc-800 hover:bg-teal-500 text-zinc-50 px-6 py-2 rounded-lg transition-colors font-medium"
              >
                <Edit2 className="w-4 h-4" />
                Edit Profile
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
