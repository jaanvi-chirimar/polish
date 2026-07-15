import { auth, db } from '@/firebase/config';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import React, { createContext, useContext, useEffect, useState } from 'react';

export type UserType = 'user' | 'nailTech';

export interface PricingTier {
  name: string;
  description?: string;
  price: number;
  enabled: boolean;
}

export interface NailTechProfile {
  portfolio?: string[];
  availabilities?: {
    schedule: Record<string, Array<{ start: string; end: string }>>; // day name -> array of time blocks, e.g. { "Monday": [{ start: "14:00", end: "20:00" }] }
  };
  tools?: string[];
  designs?: string[];
  bio?: string;
  location?: string;
  pricingTiers?: {
    tier1?: PricingTier;
    tier2?: PricingTier;
    tier3?: PricingTier;
  };
  policies?: {
    reschedule?: string;
    late?: string;
  };
  paymentMethods?: string[];
  maxAppointmentsPerWeek?: number;
  usePricingTiers?: boolean;
  pricingDescription?: string;
  removalAddOn?: { enabled: boolean; price: number };
}

export interface UserProfile {
  uid: string;
  phoneNumber: string | null;
  email?: string | null;
  roles: UserType[]; // Array to support dual roles
  firstName?: string;
  lastName?: string;
  profileCompleted: boolean; // Whether they've completed the setup
  preferences?: string | string[]; // User preferences (string for legacy, array for multiselect)
  location?: string; // User location (optional)
  instagramHandle?: string;
  nailTechProfile?: NailTechProfile; // Only if they have nailTech role
  googleCalendar?: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
  };
  createdAt?: Date;
}

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  setUserProfile: (profile: UserProfile) => void;
  hasRole: (role: UserType) => boolean;
  addRole: (role: UserType) => Promise<void>;
  removeRole: (role: UserType) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userProfile: null,
  loading: true,
  setUserProfile: () => {},
  hasRole: () => false,
  addRole: async () => {},
  removeRole: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      
      if (firebaseUser) {
        // Fetch user profile from Firestore
        try {
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          const userDoc = await getDoc(userDocRef);
          
          if (userDoc.exists()) {
            const data = userDoc.data();
            // Normalize roles: never default to ['user'] so tech-only users get tech Home
            const roles = Array.isArray(data.roles)
              ? data.roles
              : data.roles
                ? [data.roles]
                : data.userType
                  ? [data.userType]
                  : [];
            setUserProfile({
              uid: firebaseUser.uid,
              phoneNumber: firebaseUser.phoneNumber,
              email: firebaseUser.email,
              roles: roles,
              firstName: data.firstName,
              lastName: data.lastName,
              profileCompleted: data.profileCompleted ?? false,
              preferences: Array.isArray(data.preferences) ? data.preferences : data.preferences,
              location: data.location,
              instagramHandle: data.instagramHandle,
              nailTechProfile: data.nailTechProfile,
              createdAt: data.createdAt?.toDate(),
            });
          } else {
            // User doesn't have a profile yet (shouldn't happen after signup, but handle it)
            setUserProfile(null);
          }
        } catch (error) {
          console.error('Error fetching user profile:', error);
          setUserProfile(null);
        }
      } else {
        setUserProfile(null);
      }
      
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const updateUserProfile = async (profile: UserProfile) => {
    try {
      const userDocRef = doc(db, 'users', profile.uid);
      
      // Build data object, excluding undefined values (Firestore doesn't allow undefined)
      const profileData: Record<string, any> = {
        phoneNumber: profile.phoneNumber,
        roles: profile.roles,
        firstName: profile.firstName,
        lastName: profile.lastName,
        profileCompleted: profile.profileCompleted,
        createdAt: profile.createdAt || new Date(),
      };
      
      if (profile.preferences !== undefined && profile.preferences !== null) {
        profileData.preferences = Array.isArray(profile.preferences)
          ? profile.preferences
          : profile.preferences;
      }
      if (profile.location !== undefined && profile.location !== null) {
        profileData.location = profile.location;
      }
      if (profile.instagramHandle !== undefined && profile.instagramHandle !== null) {
        profileData.instagramHandle = profile.instagramHandle;
      }
      if (profile.nailTechProfile !== undefined) {
        profileData.nailTechProfile = profile.nailTechProfile;
      }
      
      await setDoc(userDocRef, profileData, { merge: true });
      
      setUserProfile(profile);
    } catch (error) {
      console.error('Error updating user profile:', error);
      throw error;
    }
  };

  const hasRole = (role: UserType): boolean => {
    return userProfile?.roles.includes(role) ?? false;
  };

  const addRole = async (role: UserType) => {
    if (!user || !userProfile) throw new Error('User not authenticated');
    
    if (userProfile.roles.includes(role)) {
      return; // Role already exists
    }

    const updatedRoles = [...userProfile.roles, role];
    await updateUserProfile({
      ...userProfile,
      roles: updatedRoles,
    });
  };

  const removeRole = async (role: UserType) => {
    if (!user || !userProfile) throw new Error('User not authenticated');
    
    if (userProfile.roles.length === 1) {
      throw new Error('Cannot remove last role. User must have at least one role.');
    }

    const updatedRoles = userProfile.roles.filter(r => r !== role);
    await updateUserProfile({
      ...userProfile,
      roles: updatedRoles,
    });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        userProfile,
        loading,
        setUserProfile: updateUserProfile,
        hasRole,
        addRole,
        removeRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
