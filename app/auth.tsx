import { Polish } from '@/constants/theme';
import { useAuth, UserType } from '@/contexts/AuthContext';
import { auth, db } from '@/firebase/config';
import { Ionicons } from '@expo/vector-icons';
import * as Google from 'expo-auth-session/providers/google';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { GoogleAuthProvider, signInWithCredential, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

WebBrowser.maybeCompleteAuthSession();

type AuthStep = 'signIn' | 'roleSelection';

export default function AuthScreen() {
  const { user, setUserProfile } = useAuth();
  const [step, setStep] = useState<AuthStep>('signIn');
  const [loading, setLoading] = useState(false);
  const [selectedRoles, setSelectedRoles] = useState<UserType[]>([]);
  const [pendingTokens, setPendingTokens] = useState<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  } | null>(null);

  const [googleRequest, googleResponse, googlePromptAsync] = Google.useAuthRequest({
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    scopes: [
      'profile',
      'email',
      'openid',
      'https://www.googleapis.com/auth/calendar.events',
    ],
  });

  useEffect(() => {
    if (user) router.replace('/(tabs)');
  }, [user]);

  useEffect(() => {
    if (googleResponse?.type !== 'success') return;
    const { authentication } = googleResponse as any;
    if (!authentication?.accessToken) return;
    handleGoogleSuccess(authentication);
  }, [googleResponse]);

  const handleGoogleSuccess = async (authentication: any) => {
    setLoading(true);
    try {
      const credential = GoogleAuthProvider.credential(
        authentication.idToken,
        authentication.accessToken
      );
      const result = await signInWithCredential(auth, credential);
      const firebaseUser = result.user;

      const DEMO_EMAILS = ['polish.app12@gmail.com'];
      if (!firebaseUser.email?.endsWith('@cornell.edu') && !DEMO_EMAILS.includes(firebaseUser.email ?? '')) {
        await signOut(auth);
        Alert.alert(
          'Cornell email required',
          'Please sign in with your @cornell.edu Google account.'
        );
        return;
      }

      const tokens = {
        accessToken: authentication.accessToken,
        refreshToken: authentication.refreshToken ?? '',
        expiresIn: authentication.expiresIn ?? 3600,
      };

      const userDocRef = doc(db, 'users', firebaseUser.uid);
      const userDoc = await getDoc(userDocRef);

      if (userDoc.exists()) {
        // Existing user — refresh GCal tokens and go to tabs
        await setDoc(userDocRef, {
          googleCalendar: {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            expiresAt: Date.now() + tokens.expiresIn * 1000,
          },
        }, { merge: true });
        router.replace('/(tabs)');
      } else {
        // New user — show role selection
        setPendingTokens(tokens);
        setStep('roleSelection');
      }
    } catch (error: any) {
      console.error('Google auth error:', error);
      Alert.alert('Sign in failed', error.message || 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleSelection = async () => {
    if (selectedRoles.length === 0) {
      Alert.alert('Select Role', 'Please select at least one role');
      return;
    }

    setLoading(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('User not found');

      const profileData: Record<string, any> = {
        email: currentUser.email,
        roles: selectedRoles,
        profileCompleted: false,
        createdAt: new Date(),
      };

      if (pendingTokens) {
        profileData.googleCalendar = {
          accessToken: pendingTokens.accessToken,
          refreshToken: pendingTokens.refreshToken,
          expiresAt: Date.now() + pendingTokens.expiresIn * 1000,
        };
      }

      await setDoc(doc(db, 'users', currentUser.uid), profileData, { merge: true });

      setUserProfile({
        uid: currentUser.uid,
        phoneNumber: null,
        email: currentUser.email,
        roles: selectedRoles,
        profileCompleted: false,
        createdAt: new Date(),
      });

      router.replace('/setup' as any);
    } catch (error: any) {
      console.error('Role selection error:', error);
      Alert.alert('Error', error.message || 'Failed to complete signup');
    } finally {
      setLoading(false);
    }
  };

  const toggleRole = (role: UserType) => {
    if (selectedRoles.includes(role)) {
      setSelectedRoles(selectedRoles.filter(r => r !== role));
    } else {
      setSelectedRoles([...selectedRoles, role]);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {step === 'signIn' ? (
          <>
            <Text style={styles.appName}>Polish</Text>
            <Text style={styles.title}>Welcome</Text>
            <Text style={styles.subtitle}>
              Sign in with your Cornell Google account to book or offer nail appointments.
            </Text>
            <TouchableOpacity
              style={[styles.googleButton, (!googleRequest || loading) && styles.buttonDisabled]}
              onPress={() => googlePromptAsync()}
              disabled={!googleRequest || loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color={Polish.colors.primary} size="small" />
              ) : (
                <>
                  <Ionicons name="logo-google" size={20} color={Polish.colors.primary} />
                  <Text style={styles.googleButtonText}>Sign in with Cornell Google</Text>
                </>
              )}
            </TouchableOpacity>
            <Text style={styles.note}>@cornell.edu accounts only</Text>
          </>
        ) : (
          <>
            <Text style={styles.title}>Choose Your Role(s)</Text>
            <Text style={styles.subtitle}>
              You can select one or both roles. You can change this later in settings.
            </Text>
            <TouchableOpacity
              style={[styles.roleButton, selectedRoles.includes('user') && styles.roleButtonSelected]}
              onPress={() => toggleRole('user')}
            >
              <Text style={[styles.roleButtonText, selectedRoles.includes('user') && styles.roleButtonTextSelected]}>
                👤 Customer
              </Text>
              <Text style={styles.roleDescription}>Book appointments with nail techs</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.roleButton, selectedRoles.includes('nailTech') && styles.roleButtonSelected]}
              onPress={() => toggleRole('nailTech')}
            >
              <Text style={[styles.roleButtonText, selectedRoles.includes('nailTech') && styles.roleButtonTextSelected]}>
                💅 Nail Tech
              </Text>
              <Text style={styles.roleDescription}>Offer your services and manage bookings</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleRoleSelection}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Continue</Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Polish.colors.background,
  },
  content: {
    flex: 1,
    padding: Polish.spacing.xl,
    paddingTop: 100,
    justifyContent: 'flex-start',
  },
  appName: {
    ...Polish.typography.caption,
    color: Polish.colors.primary,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: Polish.spacing.lg,
  },
  title: {
    ...Polish.typography.title,
    marginBottom: Polish.spacing.md,
    color: Polish.colors.text,
  },
  subtitle: {
    ...Polish.typography.body,
    color: Polish.colors.textSecondary,
    marginBottom: Polish.spacing.xxxl,
    lineHeight: 22,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Polish.spacing.md,
    borderWidth: 1.5,
    borderColor: Polish.colors.primary,
    borderRadius: Polish.radius.md,
    padding: Polish.spacing.lg,
    backgroundColor: Polish.colors.surface,
    marginBottom: Polish.spacing.md,
  },
  googleButtonText: {
    ...Polish.typography.button,
    color: Polish.colors.primary,
  },
  note: {
    ...Polish.typography.caption,
    color: Polish.colors.textMuted,
    textAlign: 'center',
  },
  button: {
    backgroundColor: Polish.colors.primary,
    borderRadius: Polish.radius.md,
    padding: Polish.spacing.lg,
    alignItems: 'center',
    marginTop: Polish.spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    ...Polish.typography.button,
    color: '#fff',
  },
  roleButton: {
    borderWidth: 2,
    borderColor: Polish.colors.border,
    borderRadius: Polish.radius.md,
    padding: Polish.spacing.xl,
    marginBottom: Polish.spacing.lg,
    backgroundColor: Polish.colors.surface,
  },
  roleButtonSelected: {
    borderColor: Polish.colors.primary,
    backgroundColor: Polish.colors.accent + '30',
  },
  roleButtonText: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
    color: Polish.colors.textSecondary,
  },
  roleButtonTextSelected: {
    color: Polish.colors.text,
  },
  roleDescription: {
    ...Polish.typography.caption,
    color: Polish.colors.textSecondary,
  },
});
