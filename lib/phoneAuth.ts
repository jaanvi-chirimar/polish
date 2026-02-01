import { auth } from '@/firebase/config';
import {
  ApplicationVerifier,
  ConfirmationResult,
  RecaptchaVerifier,
  signInWithPhoneNumber
} from 'firebase/auth';
import { Platform } from 'react-native';

/**
 * Phone authentication helper following Firebase documentation
 * 
 * Note: For native (iOS/Android), you need to install expo-firebase-recaptcha
 * or use Firebase's native phone auth SDK. This implementation works on web.
 */
export async function sendPhoneVerificationCode(
  phoneNumber: string,
  buttonId?: string,
  recaptchaVerifier?: ApplicationVerifier
): Promise<ConfirmationResult> {
  const formattedPhone = formatPhoneNumber(phoneNumber);
  
  if (Platform.OS === 'web') {
    // Web: Use reCAPTCHA verifier following Firebase docs
    // For invisible reCAPTCHA, use button ID (recommended) or container ID
    const recaptchaContainerId = buttonId || 'recaptcha-container';
    
    // Wait for DOM to be ready and container to exist
    let container = null;
    let attempts = 0;
    while (!container && attempts < 10) {
      await new Promise(resolve => setTimeout(resolve, 100));
      container = typeof document !== 'undefined' ? document.getElementById(recaptchaContainerId) : null;
      attempts++;
    }
    
    // Check if container exists
    if (!container) {
      throw new Error(
        `reCAPTCHA container with id "${recaptchaContainerId}" not found. ` +
        `Make sure you have a View with id="recaptcha-container" in your auth screen. ` +
        `Current document ready state: ${typeof document !== 'undefined' ? document.readyState : 'N/A'}`
      );
    }
    
    const recaptchaVerifier = new RecaptchaVerifier(auth, recaptchaContainerId, {
      size: 'invisible',
      callback: () => {
        // reCAPTCHA solved, allow signInWithPhoneNumber
        console.log('reCAPTCHA solved');
      },
      'expired-callback': () => {
        // Response expired. Ask user to solve reCAPTCHA again.
        console.error('reCAPTCHA expired');
      },
    });

    const confirmationResult = await signInWithPhoneNumber(
      auth,
      formattedPhone,
      recaptchaVerifier
    );
    
    return confirmationResult;
  } else if (Platform.OS === 'ios' || Platform.OS === 'android') {
    // iOS/Android: Use expo-firebase-recaptcha verifier
    if (!recaptchaVerifier) {
      throw new Error(
        'reCAPTCHA verifier is required for iOS/Android. ' +
        'Make sure you pass the verifier from FirebaseRecaptchaVerifierModal.'
      );
    }

    const confirmationResult = await signInWithPhoneNumber(
      auth,
      formattedPhone,
      recaptchaVerifier
    );
    
    return confirmationResult;
  } else {
    // Android: Requires SHA-1 fingerprint setup
    throw new Error('Android phone authentication requires SHA-1 fingerprint setup in Firebase Console. See Firebase docs for details.');
  }
}

export function formatPhoneNumber(text: string): string {
  const cleaned = text.replace(/\D/g, '');
  return cleaned.startsWith('1') ? `+${cleaned}` : `+1${cleaned}`;
}
