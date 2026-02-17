import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { user, userProfile, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) {
      // Still loading auth state - don't navigate yet
      return;
    }

    const currentRoute = segments[0];
    const inAuthGroup = currentRoute === 'auth';
    const inSetupGroup = currentRoute === 'setup';
    const inTabsGroup = currentRoute === '(tabs)';
    const inProfileGroup = currentRoute === 'profile';

    // Debug logging
    console.log('🔍 Routing check:', { 
      hasUser: !!user, 
      hasProfile: !!userProfile, 
      profileCompleted: userProfile?.profileCompleted,
      currentRoute: currentRoute || 'empty',
      loading 
    });

    // PRIORITY 1: If no user OR user without phone number, MUST go to auth
    // (Phone auth is required - no anonymous users allowed)
    if (!user || !user.phoneNumber) {
      console.log('❌ No user or no phone number - redirecting to /auth', {
        hasUser: !!user,
        hasPhone: !!user?.phoneNumber
      });
      if (!inAuthGroup) {
        router.replace('/auth' as any);
      }
      return;
    }

    // PRIORITY 2: User exists with phone - check profile
    if (userProfile === null && !loading) {
      // Profile doesn't exist in Firestore - needs setup
      console.log('⚠️ No profile found - redirecting to /setup');
      if (!inSetupGroup && !inProfileGroup) {
        router.replace('/setup' as any);
      }
      return;
    }

    if (userProfile) {
      if (!userProfile.profileCompleted) {
        // Profile not completed - go to setup
        console.log('⚠️ Profile not completed - redirecting to /setup');
        if (!inSetupGroup && !inProfileGroup) {
          router.replace('/setup' as any);
        }
      } else {
        // Profile completed - should be on tabs
        console.log('✅ Profile completed - checking route');
        if (inAuthGroup || inSetupGroup) {
          // On auth/setup but profile is done - go to tabs
          console.log('→ Redirecting to /(tabs)');
          router.replace('/(tabs)');
        }
      }
    } else {
      // Profile still loading - wait (don't navigate yet)
      console.log('⏳ User exists but profile loading...');
    }
  }, [user, userProfile, loading, segments]);

  // Show loading screen while checking auth
  if (loading) {
    return (
      <ThemeProvider value={colorScheme === 'dark' ? DefaultTheme : DefaultTheme}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="auth" />
          <Stack.Screen name="setup" />
          <Stack.Screen name="profile" />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="book/[id]" />
          <Stack.Screen name="tech/[id]" />
          </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DefaultTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="auth" />
        <Stack.Screen name="setup" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="book/[id]" />
        <Stack.Screen name="tech/[id]" />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <RootLayoutNav />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
