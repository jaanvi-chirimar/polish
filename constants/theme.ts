/**
 * App theme: colors, typography, spacing, radii, shadows.
 * Light mode tuned for a warm, polished nail-salon feel.
 */

import { Platform } from 'react-native';

/** Design tokens for Polish app – warm, salon-style UI */
export const Polish = {
  colors: {
    background: '#FAF9F7',
    surface: '#FFFFFF',
    surfaceElevated: '#FFFFFF',
    primary: '#C97B84',
    primaryDark: '#B05D67',
    accent: '#E8B4BC',
    text: '#1A1A1A',
    textSecondary: '#5C5C5C',
    textMuted: '#8C8C8C',
    border: '#E8E6E3',
    borderLight: '#F0EEEC',
    success: '#5B8A72',
    error: '#C75B5B',
    tabIconDefault: '#8C8C8C',
    tabIconSelected: '#C97B84',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    full: 9999,
  },
  typography: {
    title: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.5 },
    titleSmall: { fontSize: 22, fontWeight: '700' as const },
    subtitle: { fontSize: 18, fontWeight: '600' as const },
    body: { fontSize: 16, fontWeight: '400' as const },
    bodyMedium: { fontSize: 16, fontWeight: '500' as const },
    caption: { fontSize: 14, fontWeight: '400' as const },
    label: { fontSize: 14, fontWeight: '600' as const },
    button: { fontSize: 16, fontWeight: '600' as const },
  },
  shadow: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
    },
    android: { elevation: 3 },
    default: {},
  }),
  shadowSm: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 4,
    },
    android: { elevation: 2 },
    default: {},
  }),
};
