import { Polish } from '@/constants/theme';
import { useAuth, UserType } from '@/contexts/AuthContext';
import { auth, db } from '@/firebase/config';
import { sendPhoneVerificationCode } from '@/lib/phoneAuth';
import { FirebaseRecaptchaVerifierModal } from 'expo-firebase-recaptcha';
import { router } from 'expo-router';
import { ConfirmationResult } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import React, { useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

type AuthStep = 'phone' | 'otp' | 'roleSelection';

export default function AuthScreen() {
  const { user, setUserProfile } = useAuth();
  const [step, setStep] = useState<AuthStep>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedRoles, setSelectedRoles] = useState<UserType[]>([]);
  const [isSignUp, setIsSignUp] = useState(true);
  
  // reCAPTCHA verifier for iOS/Android
  const recaptchaVerifier = useRef<FirebaseRecaptchaVerifierModal | null>(null);

  // If user is already logged in, redirect
  React.useEffect(() => {
    if (user) {
      router.replace('/(tabs)');
    }
  }, [user]);

  const formatPhoneNumber = (text: string): string => {
    // Remove all non-digits
    const cleaned = text.replace(/\D/g, '');
    
    // Format as +1 (XXX) XXX-XXXX for US numbers
    if (cleaned.length <= 1) return cleaned;
    if (cleaned.length <= 4) return `+1 (${cleaned.slice(1)}`;
    if (cleaned.length <= 7) return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4)}`;
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7, 11)}`;
  };

  const handlePhoneSubmit = async () => {
    if (!phoneNumber || phoneNumber.replace(/\D/g, '').length < 10) {
      Alert.alert('Invalid Phone Number', 'Please enter a valid phone number');
      return;
    }

    setLoading(true);
    try {
      // Following Firebase docs: send verification code
      // For iOS/Android, pass the recaptcha verifier from the modal
      // The ref itself acts as the verifier
      const verifier = Platform.OS !== 'web' ? recaptchaVerifier.current : undefined;
      const confirmation = await sendPhoneVerificationCode(phoneNumber, undefined, verifier as any);
      setConfirmationResult(confirmation);
      setStep('otp');
    } catch (error: any) {
      console.error('Phone auth error:', error);
      const errorMessage = error.message || 'Failed to send verification code.';
      
      // Log full error for debugging
      console.log('Full error:', JSON.stringify(error, null, 2));
      console.log('Phone number used:', phoneNumber);
      console.log('Formatted phone:', phoneNumber.replace(/\D/g, ''));
      
      // Provide helpful message for iOS/native
      if (Platform.OS !== 'web') {
        Alert.alert(
          'Phone Auth Error',
          `Error: ${errorMessage}\n\n` +
          'Make sure:\n' +
          '1. Test phone number in Firebase matches EXACTLY (including +1)\n' +
          '2. Format: +1 650-555-1234 (with country code)\n' +
          '3. Phone auth is enabled in Firebase Console\n\n' +
          'Check console for full error details.'
        );
      } else {
        Alert.alert('Error', errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOTPSubmit = async () => {
    if (!otp || otp.length !== 6) {
      Alert.alert('Invalid Code', 'Please enter the 6-digit verification code');
      return;
    }

    if (!confirmationResult) {
      Alert.alert('Error', 'Verification session expired. Please try again.');
      setStep('phone');
      return;
    }

    setLoading(true);
    try {
      // Following Firebase docs: use confirmationResult.confirm(code)
      const result = await confirmationResult.confirm(otp);
      
      // Check if this is a new user (signup) or existing user (login)
      const userDocRef = doc(db, 'users', result.user.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (!userDoc.exists()) {
        // New user - show role selection
        setStep('roleSelection');
      } else {
        // Existing user - sign in complete
        router.replace('/(tabs)');
      }
    } catch (error: any) {
      console.error('OTP verification error:', error);
      Alert.alert(
        'Error',
        error.message || 'Invalid verification code. Please try again.'
      );
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
      const user = auth.currentUser;
      if (!user) throw new Error('User not found');

      // Create user profile in Firestore (not completed yet)
      await setDoc(doc(db, 'users', user.uid), {
        phoneNumber: user.phoneNumber,
        roles: selectedRoles,
        profileCompleted: false, // Will be set to true after setup
        createdAt: new Date(),
      });

      // Update auth context
      setUserProfile({
        uid: user.uid,
        phoneNumber: user.phoneNumber,
        roles: selectedRoles,
        profileCompleted: false,
        createdAt: new Date(),
      });

      // Redirect to setup page
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
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* reCAPTCHA verifier modal for iOS/Android */}
      {(Platform.OS === 'ios' || Platform.OS === 'android') && (
        <FirebaseRecaptchaVerifierModal
          ref={recaptchaVerifier}
          firebaseConfig={{
            apiKey: "AIzaSyDGArvbdQ8sS13iie7XxtsRR7V3brCYxRY",
            authDomain: "polish-app-5e838.firebaseapp.com",
            projectId: "polish-app-5e838",
            storageBucket: "polish-app-5e838.firebasestorage.app",
            messagingSenderId: "53750585316",
            appId: "1:53750585316:web:5f139d556962a7e117d9f1"
          }}
          attemptInvisibleVerification={true}
        />
      )}
      
      {/* reCAPTCHA container for web - hidden but required for Firebase */}
      {Platform.OS === 'web' && (
        <View
          // @ts-ignore - web only property
          id="recaptcha-container"
          style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
        />
      )}
      <View style={styles.content}>
        <Text style={styles.title}>
          {step === 'phone' && (isSignUp ? 'Welcome!' : 'Welcome Back!')}
          {step === 'otp' && 'Verify Your Phone'}
          {step === 'roleSelection' && 'Choose Your Role(s)'}
        </Text>

        {step === 'phone' && (
          <>
            <Text style={styles.subtitle}>
              {isSignUp
                ? 'Sign up with your phone number to get started'
                : 'Sign in with your phone number'}
            </Text>
            <TextInput
              style={styles.input}
              placeholder="+1 (555) 123-4567"
              value={phoneNumber}
              onChangeText={(text) => setPhoneNumber(formatPhoneNumber(text))}
              keyboardType="phone-pad"
              autoFocus
            />
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handlePhoneSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.buttonText}>Continue</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.switchButton}
              onPress={() => setIsSignUp(!isSignUp)}
            >
              <Text style={styles.switchText}>
                {isSignUp
                  ? 'Already have an account? Sign in'
                  : "Don't have an account? Sign up"}
              </Text>
            </TouchableOpacity>
          </>
        )}

        {step === 'otp' && (
          <>
            <Text style={styles.subtitle}>
              Enter the 6-digit code sent to {phoneNumber}
            </Text>
            <TextInput
              style={styles.input}
              placeholder="000000"
              value={otp}
              onChangeText={setOtp}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
            />
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleOTPSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Verify</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.switchButton}
              onPress={() => {
                setStep('phone');
                setOtp('');
              }}
            >
              <Text style={styles.switchText}>Change phone number</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 'roleSelection' && (
          <>
            <Text style={styles.subtitle}>
              You can select one or both roles. You can change this later in settings.
            </Text>
            <TouchableOpacity
              style={[
                styles.roleButton,
                selectedRoles.includes('user') && styles.roleButtonSelected,
              ]}
              onPress={() => toggleRole('user')}
            >
              <Text
                style={[
                  styles.roleButtonText,
                  selectedRoles.includes('user') && styles.roleButtonTextSelected,
                ]}
              >
                👤 Customer
              </Text>
              <Text style={styles.roleDescription}>
                Book appointments with nail techs
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.roleButton,
                selectedRoles.includes('nailTech') && styles.roleButtonSelected,
              ]}
              onPress={() => toggleRole('nailTech')}
            >
              <Text
                style={[
                  styles.roleButtonText,
                  selectedRoles.includes('nailTech') && styles.roleButtonTextSelected,
                ]}
              >
                💅 Nail Tech
              </Text>
              <Text style={styles.roleDescription}>
                Offer your services and manage bookings
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleRoleSelection}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Complete Sign Up</Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
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
    paddingTop: 80,
    justifyContent: 'flex-start',
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
  input: {
    borderWidth: 1,
    borderColor: Polish.colors.border,
    borderRadius: Polish.radius.md,
    padding: Polish.spacing.lg,
    ...Polish.typography.body,
    marginBottom: Polish.spacing.xl,
    backgroundColor: Polish.colors.surface,
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
  switchButton: {
    marginTop: Polish.spacing.xl,
    alignItems: 'center',
  },
  switchText: {
    ...Polish.typography.caption,
    color: Polish.colors.textSecondary,
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
