import {
  CUSTOMER_PREFERENCES_OPTIONS,
  DEFAULT_PRICING_TIERS,
  DESIGNS_HINT,
  DESIGNS_LABEL,
  LOCATION_OPTIONS,
  NAIL_TECH_DESIGNS,
  NAIL_TECH_TOOLS,
  PAYMENT_METHOD_OPTIONS,
  PREFERENCES_HINT,
  TOOLS_HINT,
  TOOLS_LABEL,
} from '@/constants/nailTechOptions';
import { Polish } from '@/constants/theme';
import { NailTechProfile, PricingTier, useAuth, UserType } from '@/contexts/AuthContext';
import { auth, db } from '@/firebase/config';
import { disconnectGoogleCalendar, storeGoogleTokens } from '@/lib/googleCalendar';
import { Ionicons } from '@expo/vector-icons';
import * as Google from 'expo-auth-session/providers/google';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { signOut } from 'firebase/auth';
import { doc, getDocFromServer, setDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';

WebBrowser.maybeCompleteAuthSession();
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

interface ProfileEditorProps {
  showBackButton?: boolean;
  topPadding?: number;
}

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function ProfileEditor({ showBackButton = false, topPadding = 60 }: ProfileEditorProps) {
  const { user, userProfile, setUserProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ firstName?: string; lastName?: string; location?: string }>({});

  const [firstName, setFirstName] = useState(userProfile?.firstName || '');
  const [lastName, setLastName] = useState(userProfile?.lastName || '');
  const [location, setLocation] = useState(() => {
    const saved = userProfile?.location || userProfile?.nailTechProfile?.location || '';
    return LOCATION_OPTIONS.includes(saved as any) ? saved : '';
  });
  const [selectedPreferences, setSelectedPreferences] = useState<string[]>(
    () => Array.isArray(userProfile?.preferences) ? userProfile.preferences : (userProfile?.preferences ? [userProfile.preferences] : [])
  );
  const [bio, setBio] = useState(userProfile?.nailTechProfile?.bio || '');
  const [selectedTools, setSelectedTools] = useState<string[]>(userProfile?.nailTechProfile?.tools || []);
  const [selectedDesigns, setSelectedDesigns] = useState<string[]>(userProfile?.nailTechProfile?.designs || []);
  const [availableDays, setAvailableDays] = useState<string[]>(userProfile?.nailTechProfile?.availabilities?.days || []);
  const [selectedRoles, setSelectedRoles] = useState<UserType[]>(userProfile?.roles ?? []);

  const np0 = userProfile?.nailTechProfile;
  const [pricingTiers, setPricingTiers] = useState<{ tier1: PricingTier; tier2: PricingTier; tier3: PricingTier }>({
    tier1: np0?.pricingTiers?.tier1 ?? { ...DEFAULT_PRICING_TIERS.tier1 },
    tier2: np0?.pricingTiers?.tier2 ?? { ...DEFAULT_PRICING_TIERS.tier2 },
    tier3: np0?.pricingTiers?.tier3 ?? { ...DEFAULT_PRICING_TIERS.tier3 },
  });
  const [reschedulePolicy, setReschedulePolicy] = useState(np0?.policies?.reschedule ?? '');
  const [latePolicy, setLatePolicy] = useState(np0?.policies?.late ?? '');
  const [selectedPaymentMethods, setSelectedPaymentMethods] = useState<string[]>(np0?.paymentMethods ?? []);
  const [maxApptPerWeek, setMaxApptPerWeek] = useState(np0?.maxAppointmentsPerWeek ?? 0);

  const isNailTech = editing ? selectedRoles.includes('nailTech') : (userProfile?.roles?.includes('nailTech') ?? false);
  const isUser = editing ? selectedRoles.includes('user') : (userProfile?.roles?.includes('user') ?? false);

  // Google Calendar
  const [googleRequest, googleResponse, googlePromptAsync] = Google.useAuthRequest({
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    scopes: [
      'profile', 'email', 'openid',
      'https://www.googleapis.com/auth/calendar.events',
    ],
  });
  const [googleConnected, setGoogleConnected] = useState(!!userProfile?.googleCalendar);

  useEffect(() => {
    if (googleResponse?.type !== 'success') return;
    const { authentication } = googleResponse as any;
    if (!authentication?.accessToken || !user?.uid) return;
    storeGoogleTokens(user.uid, {
      accessToken: authentication.accessToken,
      refreshToken: authentication.refreshToken ?? '',
      expiresAt: Date.now() + (authentication.expiresIn ?? 3600) * 1000,
    }).then(() => setGoogleConnected(true)).catch(() => {
      Alert.alert('Error', 'Could not save Google Calendar connection.');
    });
  }, [googleResponse]);

  const handleCalendarDisconnect = async () => {
    if (!user?.uid) return;
    await disconnectGoogleCalendar(user.uid);
    setGoogleConnected(false);
  };

  const toggleItem = (list: string[], item: string, setter: (v: string[]) => void) => {
    setter(list.includes(item) ? list.filter(i => i !== item) : [...list, item]);
  };

  const toggleRole = (role: UserType) => {
    if (selectedRoles.includes(role)) {
      if (selectedRoles.length <= 1) return;
      setSelectedRoles(selectedRoles.filter(r => r !== role));
    } else {
      setSelectedRoles([...selectedRoles, role]);
    }
  };

  useEffect(() => {
    if (userProfile && !editing) {
      if (userProfile.roles?.length) setSelectedRoles(userProfile.roles);
      setLocation(userProfile.location || userProfile.nailTechProfile?.location || '');
      setSelectedPreferences(Array.isArray(userProfile.preferences) ? userProfile.preferences : (userProfile.preferences ? [userProfile.preferences] : []));
      setSelectedTools(Array.isArray(userProfile.nailTechProfile?.tools) ? userProfile.nailTechProfile.tools : []);
      setSelectedDesigns(Array.isArray(userProfile.nailTechProfile?.designs) ? userProfile.nailTechProfile.designs : []);
      setAvailableDays(Array.isArray(userProfile.nailTechProfile?.availabilities?.days) ? userProfile.nailTechProfile.availabilities.days : []);
    }
  }, [userProfile?.roles, userProfile?.location, userProfile?.nailTechProfile?.location, userProfile?.preferences, userProfile?.nailTechProfile?.tools, userProfile?.nailTechProfile?.designs, userProfile?.nailTechProfile?.availabilities?.days, editing]);

  useEffect(() => {
    if (!user?.uid || editing) return;
    let mounted = true;
    (async () => {
      try {
        const snap = await getDocFromServer(doc(db, 'users', user.uid));
        if (!mounted || !snap.exists()) return;
        const data = snap.data();
        const np = data.nailTechProfile;
        setSelectedTools(Array.isArray(np?.tools) ? np.tools : []);
        setSelectedDesigns(Array.isArray(np?.designs) ? np.designs : []);
        setAvailableDays(Array.isArray(np?.availabilities?.days) ? np.availabilities.days : []);
        const saved = data.location || np?.location || '';
        setLocation(LOCATION_OPTIONS.includes(saved as any) ? saved : '');
        setSelectedPreferences(Array.isArray(data.preferences) ? data.preferences : (data.preferences ? [data.preferences] : []));
        setPricingTiers({
          tier1: np?.pricingTiers?.tier1 ?? { ...DEFAULT_PRICING_TIERS.tier1 },
          tier2: np?.pricingTiers?.tier2 ?? { ...DEFAULT_PRICING_TIERS.tier2 },
          tier3: np?.pricingTiers?.tier3 ?? { ...DEFAULT_PRICING_TIERS.tier3 },
        });
        setReschedulePolicy(np?.policies?.reschedule ?? '');
        setLatePolicy(np?.policies?.late ?? '');
        setSelectedPaymentMethods(Array.isArray(np?.paymentMethods) ? np.paymentMethods : []);
        setMaxApptPerWeek(np?.maxAppointmentsPerWeek ?? 0);
      } catch (_) {}
    })();
    return () => { mounted = false; };
  }, [user?.uid, editing]);

  const resetForm = () => {
    setSelectedRoles(userProfile?.roles ?? []);
    setFirstName(userProfile?.firstName || '');
    setLastName(userProfile?.lastName || '');
    const saved = userProfile?.location || userProfile?.nailTechProfile?.location || '';
    setLocation(LOCATION_OPTIONS.includes(saved as any) ? saved : '');
    setSelectedPreferences(Array.isArray(userProfile?.preferences) ? userProfile.preferences : (userProfile?.preferences ? [userProfile.preferences] : []));
    const np = userProfile?.nailTechProfile;
    setBio(np?.bio || '');
    setSelectedTools(np?.tools || []);
    setSelectedDesigns(np?.designs || []);
    setAvailableDays(np?.availabilities?.days || []);
    setPricingTiers({
      tier1: np?.pricingTiers?.tier1 ?? { ...DEFAULT_PRICING_TIERS.tier1 },
      tier2: np?.pricingTiers?.tier2 ?? { ...DEFAULT_PRICING_TIERS.tier2 },
      tier3: np?.pricingTiers?.tier3 ?? { ...DEFAULT_PRICING_TIERS.tier3 },
    });
    setReschedulePolicy(np?.policies?.reschedule ?? '');
    setLatePolicy(np?.policies?.late ?? '');
    setSelectedPaymentMethods(np?.paymentMethods ?? []);
    setMaxApptPerWeek(np?.maxAppointmentsPerWeek ?? 0);
    setEditing(false);
  };

  const handleSave = async () => {
    const errors: typeof fieldErrors = {};
    if (!firstName.trim()) errors.firstName = 'First name is required';
    if (!lastName.trim()) errors.lastName = 'Last name is required';
    if (isNailTech && !location) errors.location = 'Please select your location';
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    if (selectedRoles.length === 0) {
      Alert.alert('Select a role', 'Please choose at least one: Customer or Nail Tech');
      return;
    }
    setLoading(true);
    try {
      if (!user || !userProfile) throw new Error('User not found');
      let nailTechProfile: NailTechProfile | undefined;
      if (isNailTech) {
        nailTechProfile = {
          ...userProfile.nailTechProfile,
          bio: bio.trim() || undefined,
          location: location,
          tools: selectedTools.length > 0 ? [...selectedTools] : undefined,
          designs: selectedDesigns.length > 0 ? [...selectedDesigns] : undefined,
          availabilities: {
            ...userProfile.nailTechProfile?.availabilities,
            days: availableDays,
          },
          pricingTiers: {
            tier1: pricingTiers.tier1,
            tier2: pricingTiers.tier2,
            tier3: pricingTiers.tier3,
          },
          policies: {
            reschedule: reschedulePolicy.trim() || undefined,
            late: latePolicy.trim() || undefined,
          },
          paymentMethods: selectedPaymentMethods.length > 0 ? [...selectedPaymentMethods] : undefined,
          maxAppointmentsPerWeek: maxApptPerWeek,
        };
      }
      const updatedProfile = {
        ...userProfile,
        roles: selectedRoles,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        preferences: isUser && selectedPreferences.length > 0 ? [...selectedPreferences] : undefined,
        location: (isUser || isNailTech) && location ? location : undefined,
        nailTechProfile: nailTechProfile,
      };
      const writeData: Record<string, unknown> = {
        phoneNumber: user.phoneNumber,
        roles: selectedRoles,
        firstName: updatedProfile.firstName,
        lastName: updatedProfile.lastName,
        profileCompleted: true,
        createdAt: userProfile.createdAt || new Date(),
      };
      if (updatedProfile.preferences != null) {
        writeData.preferences = updatedProfile.preferences;
      }
      if (updatedProfile.location) writeData.location = updatedProfile.location;
      if (updatedProfile.nailTechProfile != null) writeData.nailTechProfile = updatedProfile.nailTechProfile;
      await setDoc(doc(db, 'users', user.uid), writeData, { merge: true });
      setUserProfile(updatedProfile);
      setEditing(false);
      Alert.alert('Success', 'Profile updated successfully');
    } catch (error: any) {
      console.error('Profile update error:', error);
      Alert.alert('Error', error.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const performLogout = async () => {
    try {
      setLoading(true);
      await signOut(auth);
      setTimeout(() => {
        router.replace('/auth' as any);
      }, 100);
    } catch (error: any) {
      console.error('Logout error:', error);
      setLoading(false);
      Alert.alert('Error', error.message || 'Failed to log out. Please try again.');
    }
  };

  const handleLogout = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.confirm) {
      if (window.confirm('Are you sure you want to log out?')) {
        performLogout();
      }
    } else {
      Alert.alert(
        'Log Out',
        'Are you sure you want to log out?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Log Out', style: 'destructive', onPress: performLogout },
        ],
        { cancelable: true }
      );
    }
  };

  const displayName = [firstName, lastName].filter(Boolean).join(' ').trim() || 'Profile';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: topPadding }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        {showBackButton ? (
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={24} color={Polish.colors.text} />
          </TouchableOpacity>
        ) : (
          <View style={styles.backButton} />
        )}
        <Text style={styles.headerTitle}>Profile</Text>
        {!editing ? (
          <TouchableOpacity
            onPress={() => { setSelectedRoles(userProfile?.roles ?? []); setEditing(true); }}
            activeOpacity={0.7}
          >
            <Text style={styles.editButton}>Edit</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>

      {showBackButton && (
        <View style={styles.hero}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={40} color={Polish.colors.primary} />
          </View>
          <Text style={styles.heroTitle}>{displayName}</Text>
          {userProfile?.phoneNumber ? (
            <Text style={styles.heroSubtext}>{userProfile.phoneNumber}</Text>
          ) : null}
        </View>
      )}

      {editing && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>I am a</Text>
          <View style={styles.roleRow}>
            <TouchableOpacity
              style={[styles.roleChip, isUser && styles.roleChipSelected]}
              onPress={() => toggleRole('user')}
              activeOpacity={0.8}
            >
              <Ionicons name="person-outline" size={20} color={isUser ? '#fff' : Polish.colors.textSecondary} />
              <Text style={[styles.roleChipText, isUser && styles.roleChipTextSelected]}>Customer</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.roleChip, isNailTech && styles.roleChipSelected]}
              onPress={() => toggleRole('nailTech')}
              activeOpacity={0.8}
            >
              <Ionicons name="sparkles-outline" size={20} color={isNailTech ? '#fff' : Polish.colors.textSecondary} />
              <Text style={[styles.roleChipText, isNailTech && styles.roleChipTextSelected]}>Nail Tech</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.roleHint}>Choose at least one. You can be both.</Text>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Basic Information</Text>
        <TextInput
          style={[styles.input, !editing && styles.inputDisabled, fieldErrors.firstName ? styles.inputError : null]}
          placeholder="First Name"
          value={firstName}
          onChangeText={(v) => { setFirstName(v); if (fieldErrors.firstName) setFieldErrors(e => ({ ...e, firstName: undefined })); }}
          editable={editing}
          autoCapitalize="words"
        />
        {fieldErrors.firstName ? <Text style={styles.fieldError}>{fieldErrors.firstName}</Text> : null}
        <TextInput
          style={[styles.input, !editing && styles.inputDisabled, fieldErrors.lastName ? styles.inputError : null]}
          placeholder="Last Name"
          value={lastName}
          onChangeText={(v) => { setLastName(v); if (fieldErrors.lastName) setFieldErrors(e => ({ ...e, lastName: undefined })); }}
          editable={editing}
          autoCapitalize="words"
        />
        {fieldErrors.lastName ? <Text style={styles.fieldError}>{fieldErrors.lastName}</Text> : null}
        {!editing && (
          <Text style={styles.infoText}>Phone: {userProfile?.phoneNumber || 'N/A'}</Text>
        )}
      </View>

      {(isUser || isNailTech) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Location</Text>
          {editing ? (
            <>
              <View style={styles.chipRow}>
                {LOCATION_OPTIONS.map((loc) => (
                  <TouchableOpacity
                    key={loc}
                    style={[styles.chip, location === loc && styles.chipSelected]}
                    onPress={() => { setLocation(location === loc ? '' : loc); if (fieldErrors.location) setFieldErrors(e => ({ ...e, location: undefined })); }}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.chipText, location === loc && styles.chipTextSelected]}>{loc}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {fieldErrors.location ? <Text style={styles.fieldError}>{fieldErrors.location}</Text> : null}
            </>
          ) : (
            <Text style={location ? styles.readOnlyText : styles.readOnlyTextMuted}>
              {location || 'Not specified'}
            </Text>
          )}
        </View>
      )}

      {isUser && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Preferences</Text>
          {editing ? (
            <>
              <Text style={styles.optionHint}>{PREFERENCES_HINT}</Text>
              <View style={styles.chipRow}>
                {CUSTOMER_PREFERENCES_OPTIONS.map((pref) => (
                  <TouchableOpacity
                    key={pref}
                    style={[styles.chip, selectedPreferences.includes(pref) && styles.chipSelected]}
                    onPress={() => toggleItem(selectedPreferences, pref, setSelectedPreferences)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.chipText, selectedPreferences.includes(pref) && styles.chipTextSelected]}>
                      {pref}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          ) : (
            selectedPreferences.length > 0 && (
              <Text style={styles.readOnlyText}>{selectedPreferences.join(', ')}</Text>
            )
          )}
        </View>
      )}

      {isNailTech && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Nail Tech Profile</Text>
          <TextInput
            style={[styles.input, styles.textArea, !editing && styles.inputDisabled]}
            placeholder="Bio"
            value={bio}
            onChangeText={setBio}
            editable={editing}
            multiline
            numberOfLines={3}
          />
          {editing ? (
            <>
              <Text style={styles.label}>{TOOLS_LABEL}</Text>
              <Text style={styles.optionHint}>{TOOLS_HINT}</Text>
              <View style={styles.chipRow}>
                {NAIL_TECH_TOOLS.map((tool) => (
                  <TouchableOpacity
                    key={tool}
                    style={[styles.chip, selectedTools.includes(tool) && styles.chipSelected]}
                    onPress={() => toggleItem(selectedTools, tool, setSelectedTools)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.chipText, selectedTools.includes(tool) && styles.chipTextSelected]}>
                      {tool}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={[styles.label, { marginTop: Polish.spacing.xl }]}>{DESIGNS_LABEL}</Text>
              <Text style={styles.optionHint}>{DESIGNS_HINT}</Text>
              <View style={styles.chipRow}>
                {NAIL_TECH_DESIGNS.map((design) => (
                  <TouchableOpacity
                    key={design}
                    style={[styles.chip, selectedDesigns.includes(design) && styles.chipSelected]}
                    onPress={() => toggleItem(selectedDesigns, design, setSelectedDesigns)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.chipText, selectedDesigns.includes(design) && styles.chipTextSelected]}>
                      {design}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          ) : (
            <View style={styles.readOnlySection}>
              <Text style={styles.label}>{TOOLS_LABEL}</Text>
              {selectedTools.length > 0 ? (
                <Text style={styles.readOnlyText}>{selectedTools.join(', ')}</Text>
              ) : (
                <Text style={styles.readOnlyTextMuted}>Not specified</Text>
              )}
              <Text style={[styles.label, { marginTop: Polish.spacing.lg }]}>{DESIGNS_LABEL}</Text>
              {selectedDesigns.length > 0 ? (
                <Text style={styles.readOnlyText}>{selectedDesigns.join(', ')}</Text>
              ) : (
                <Text style={styles.readOnlyTextMuted}>Not specified</Text>
              )}
            </View>
          )}
          {editing && (
            <>
              <Text style={styles.label}>Available Days</Text>
              <View style={styles.daysContainer}>
                {DAYS_OF_WEEK.map((day) => (
                  <TouchableOpacity
                    key={day}
                    style={[styles.dayButton, availableDays.includes(day) && styles.dayButtonSelected]}
                    onPress={() => toggleItem(availableDays, day, setAvailableDays)}
                  >
                    <Text style={[styles.dayButtonText, availableDays.includes(day) && styles.dayButtonTextSelected]}>
                      {day.slice(0, 3)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
        </View>
      )}

      {isNailTech && (
        <>
          {/* Pricing Tiers */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Pricing Tiers</Text>
            <Text style={styles.optionHint}>Enable tiers to show pricing on your profile. Write a description for each (e.g. "Starting at $45 — gel polish included").</Text>
            {(['tier1', 'tier2', 'tier3'] as const).map((key, idx) => {
              const tier = pricingTiers[key];
              const defaultName = DEFAULT_PRICING_TIERS[key].name;
              return (
                <View key={key} style={styles.tierCard}>
                  <TouchableOpacity
                    style={styles.tierHeader}
                    onPress={() => editing && setPricingTiers(prev => ({ ...prev, [key]: { ...prev[key], enabled: !prev[key].enabled } }))}
                    activeOpacity={editing ? 0.8 : 1}
                  >
                    <View style={[styles.tierToggle, tier.enabled && styles.tierToggleOn]}>
                      <Text style={[styles.tierToggleText, tier.enabled && styles.tierToggleTextOn]}>
                        {tier.enabled ? 'On' : 'Off'}
                      </Text>
                    </View>
                    <Text style={styles.tierDefaultName}>Tier {idx + 1} — {defaultName}</Text>
                  </TouchableOpacity>
                  {tier.enabled && editing && (
                    <View style={styles.tierFields}>
                      <TextInput
                        style={styles.input}
                        value={tier.price > 0 ? String(tier.price) : ''}
                        onChangeText={(v) => setPricingTiers(prev => ({ ...prev, [key]: { ...prev[key], price: parseFloat(v) || 0 } }))}
                        placeholder="Price ($)"
                        placeholderTextColor={Polish.colors.textMuted}
                        keyboardType="decimal-pad"
                      />
                      <TextInput
                        style={[styles.input, styles.textArea]}
                        value={tier.description ?? ''}
                        onChangeText={(v) => setPricingTiers(prev => ({ ...prev, [key]: { ...prev[key], description: v } }))}
                        placeholder="Description (optional, e.g. Gel polish included)"
                        placeholderTextColor={Polish.colors.textMuted}
                        multiline
                        numberOfLines={2}
                      />
                    </View>
                  )}
                  {tier.enabled && !editing ? (
                    <View style={styles.tierDisplayRow}>
                      <Text style={styles.tierPrice}>${tier.price}</Text>
                      {tier.description ? <Text style={styles.tierDesc}>{tier.description}</Text> : null}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>

          {/* Policies */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Policies</Text>
            <Text style={styles.label}>Reschedule Policy</Text>
            <TextInput
              style={[styles.input, styles.textArea, !editing && styles.inputDisabled]}
              placeholder="e.g. Reschedule at least 24 hours in advance"
              placeholderTextColor={Polish.colors.textMuted}
              value={reschedulePolicy}
              onChangeText={setReschedulePolicy}
              editable={editing}
              multiline
              numberOfLines={2}
            />
            <Text style={styles.label}>Late Policy</Text>
            <TextInput
              style={[styles.input, styles.textArea, !editing && styles.inputDisabled]}
              placeholder="e.g. 10+ min late may require rescheduling"
              placeholderTextColor={Polish.colors.textMuted}
              value={latePolicy}
              onChangeText={setLatePolicy}
              editable={editing}
              multiline
              numberOfLines={2}
            />
          </View>

          {/* Payment Methods */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Accepted Payment</Text>
            {editing ? (
              <View style={styles.chipRow}>
                {(PAYMENT_METHOD_OPTIONS as readonly string[]).map((method) => (
                  <TouchableOpacity
                    key={method}
                    style={[styles.chip, selectedPaymentMethods.includes(method) && styles.chipSelected]}
                    onPress={() => toggleItem(selectedPaymentMethods, method, setSelectedPaymentMethods)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.chipText, selectedPaymentMethods.includes(method) && styles.chipTextSelected]}>
                      {method}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : selectedPaymentMethods.length > 0 ? (
              <Text style={styles.readOnlyText}>{selectedPaymentMethods.join(', ')}</Text>
            ) : (
              <Text style={styles.readOnlyTextMuted}>Not specified</Text>
            )}
          </View>

          {/* Weekly Booking Limit */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Weekly Booking Limit</Text>
            <Text style={styles.optionHint}>Max appointments per week. Set to 0 for unlimited.</Text>
            {editing ? (
              <View style={styles.stepperRow}>
                <TouchableOpacity
                  style={styles.stepperButton}
                  onPress={() => setMaxApptPerWeek(Math.max(0, maxApptPerWeek - 1))}
                  activeOpacity={0.8}
                >
                  <Text style={styles.stepperButtonText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.stepperValue}>
                  {maxApptPerWeek === 0 ? 'Unlimited' : maxApptPerWeek}
                </Text>
                <TouchableOpacity
                  style={styles.stepperButton}
                  onPress={() => setMaxApptPerWeek(maxApptPerWeek + 1)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.stepperButtonText}>+</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={styles.readOnlyText}>
                {maxApptPerWeek === 0 ? 'Unlimited' : `${maxApptPerWeek} per week`}
              </Text>
            )}
          </View>
        </>
      )}

      {/* Google Calendar — visible for all users */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Google Calendar</Text>
        {googleConnected ? (
          <View style={styles.calendarRow}>
            <Ionicons name="checkmark-circle" size={18} color={Polish.colors.success} />
            <Text style={styles.calendarConnectedText}>Connected</Text>
            {editing && (
              <TouchableOpacity onPress={handleCalendarDisconnect} style={styles.disconnectButton}>
                <Text style={styles.disconnectText}>Disconnect</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <>
            <Text style={styles.optionHint}>
              Connect to automatically add confirmed appointments to your Google Calendar.
            </Text>
            {editing ? (
              <TouchableOpacity
                style={[styles.calendarConnectButton, !googleRequest && styles.buttonDisabled]}
                onPress={() => googlePromptAsync()}
                disabled={!googleRequest}
                activeOpacity={0.85}
              >
                <Ionicons name="calendar-outline" size={18} color={Polish.colors.primary} />
                <Text style={styles.calendarConnectText}>Connect Google Calendar</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.readOnlyTextMuted}>Not connected — tap Edit to connect</Text>
            )}
          </>
        )}
      </View>

      {editing && (
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.button, styles.saveButton]}
            onPress={handleSave}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save</Text>}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.cancelButton]}
            onPress={resetForm}
            activeOpacity={0.85}
          >
            <Text style={[styles.buttonText, styles.cancelButtonText]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity
        style={[styles.button, styles.logoutButton, loading && styles.buttonDisabled]}
        onPress={handleLogout}
        disabled={loading}
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Log Out</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Polish.colors.background,
  },
  content: {
    paddingHorizontal: Polish.spacing.xl,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Polish.spacing.xl,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  headerTitle: {
    ...Polish.typography.title,
    color: Polish.colors.text,
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 50,
  },
  editButton: {
    ...Polish.typography.button,
    color: Polish.colors.primary,
  },
  hero: {
    alignItems: 'center',
    marginBottom: Polish.spacing.xxl,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Polish.colors.accent + '50',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Polish.spacing.lg,
  },
  heroTitle: {
    ...Polish.typography.title,
    color: Polish.colors.text,
    textAlign: 'center',
  },
  heroSubtext: {
    ...Polish.typography.caption,
    color: Polish.colors.textMuted,
    marginTop: Polish.spacing.sm,
  },
  roleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Polish.spacing.md,
    marginBottom: Polish.spacing.sm,
  },
  roleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Polish.spacing.sm,
    paddingVertical: Polish.spacing.md,
    paddingHorizontal: Polish.spacing.lg,
    borderRadius: Polish.radius.xl,
    borderWidth: 2,
    borderColor: Polish.colors.border,
    backgroundColor: Polish.colors.surface,
  },
  roleChipSelected: {
    borderColor: Polish.colors.primary,
    backgroundColor: Polish.colors.primary,
  },
  roleChipText: {
    ...Polish.typography.bodyMedium,
    color: Polish.colors.textSecondary,
  },
  roleChipTextSelected: {
    color: '#fff',
  },
  roleHint: {
    ...Polish.typography.caption,
    color: Polish.colors.textMuted,
  },
  section: {
    backgroundColor: Polish.colors.surface,
    borderRadius: Polish.radius.lg,
    padding: Polish.spacing.xl,
    marginBottom: Polish.spacing.xxl,
    borderWidth: 1,
    borderColor: Polish.colors.borderLight,
    ...Polish.shadowSm,
  },
  sectionTitle: {
    ...Polish.typography.subtitle,
    marginBottom: Polish.spacing.lg,
    color: Polish.colors.text,
  },
  input: {
    borderWidth: 1,
    borderColor: Polish.colors.border,
    borderRadius: Polish.radius.md,
    padding: Polish.spacing.lg,
    ...Polish.typography.body,
    marginBottom: Polish.spacing.lg,
    backgroundColor: Polish.colors.surface,
  },
  inputDisabled: {
    backgroundColor: Polish.colors.borderLight,
    color: Polish.colors.textSecondary,
  },
  inputError: {
    borderColor: Polish.colors.error,
  },
  fieldError: {
    ...Polish.typography.caption,
    color: Polish.colors.error,
    marginTop: -Polish.spacing.md,
    marginBottom: Polish.spacing.md,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  infoText: {
    ...Polish.typography.caption,
    color: Polish.colors.textSecondary,
    marginTop: -8,
    marginBottom: Polish.spacing.lg,
  },
  label: {
    ...Polish.typography.bodyMedium,
    marginBottom: Polish.spacing.md,
    color: Polish.colors.text,
  },
  optionHint: {
    ...Polish.typography.caption,
    color: Polish.colors.textMuted,
    marginBottom: Polish.spacing.md,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: Polish.spacing.lg,
    gap: Polish.spacing.sm,
  },
  chip: {
    paddingHorizontal: Polish.spacing.md,
    paddingVertical: Polish.spacing.sm,
    borderRadius: Polish.radius.xl,
    borderWidth: 1,
    borderColor: Polish.colors.border,
    backgroundColor: Polish.colors.surface,
  },
  chipSelected: {
    backgroundColor: Polish.colors.primary,
    borderColor: Polish.colors.primary,
  },
  chipText: {
    ...Polish.typography.caption,
    color: Polish.colors.textSecondary,
    fontWeight: '500',
  },
  chipTextSelected: {
    color: '#fff',
  },
  readOnlySection: {
    marginBottom: Polish.spacing.lg,
  },
  readOnlyText: {
    ...Polish.typography.body,
    color: Polish.colors.textSecondary,
  },
  readOnlyTextMuted: {
    ...Polish.typography.body,
    color: Polish.colors.textMuted,
  },
  daysContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: Polish.spacing.lg,
    gap: Polish.spacing.sm,
  },
  dayButton: {
    paddingHorizontal: Polish.spacing.lg,
    paddingVertical: Polish.spacing.md,
    borderRadius: Polish.radius.xl,
    borderWidth: 1,
    borderColor: Polish.colors.border,
    backgroundColor: Polish.colors.surface,
    marginRight: Polish.spacing.sm,
    marginBottom: Polish.spacing.sm,
  },
  dayButtonSelected: {
    backgroundColor: Polish.colors.primary,
    borderColor: Polish.colors.primary,
  },
  dayButtonText: {
    ...Polish.typography.caption,
    color: Polish.colors.textSecondary,
    fontWeight: '500',
  },
  dayButtonTextSelected: {
    color: '#fff',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: Polish.spacing.md,
    marginBottom: Polish.spacing.lg,
  },
  button: {
    flex: 1,
    borderRadius: Polish.radius.lg,
    padding: Polish.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    ...Polish.shadow,
  },
  saveButton: {
    backgroundColor: Polish.colors.primary,
  },
  cancelButton: {
    backgroundColor: Polish.colors.surface,
    borderWidth: 2,
    borderColor: Polish.colors.border,
  },
  cancelButtonText: {
    color: Polish.colors.text,
  },
  logoutButton: {
    backgroundColor: Polish.colors.error,
    marginTop: Polish.spacing.lg,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    ...Polish.typography.button,
    color: '#fff',
  },
  tierCard: {
    backgroundColor: Polish.colors.background,
    borderRadius: Polish.radius.md,
    borderWidth: 1,
    borderColor: Polish.colors.borderLight,
    padding: Polish.spacing.md,
    marginBottom: Polish.spacing.md,
  },
  tierHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Polish.spacing.md,
  },
  tierToggle: {
    paddingHorizontal: Polish.spacing.md,
    paddingVertical: 4,
    borderRadius: Polish.radius.xl,
    borderWidth: 1,
    borderColor: Polish.colors.border,
    backgroundColor: Polish.colors.surface,
  },
  tierToggleOn: {
    backgroundColor: Polish.colors.primary,
    borderColor: Polish.colors.primary,
  },
  tierToggleText: {
    ...Polish.typography.caption,
    color: Polish.colors.textMuted,
    fontWeight: '600',
  },
  tierToggleTextOn: {
    color: '#fff',
  },
  tierDefaultName: {
    ...Polish.typography.bodyMedium,
    color: Polish.colors.text,
    flex: 1,
  },
  tierPrice: {
    ...Polish.typography.bodyMedium,
    color: Polish.colors.primary,
    fontWeight: '700',
  },
  tierFields: {
    marginTop: Polish.spacing.md,
  },
  tierDisplayRow: {
    marginTop: Polish.spacing.sm,
  },
  tierDesc: {
    ...Polish.typography.caption,
    color: Polish.colors.textSecondary,
    marginTop: Polish.spacing.sm,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Polish.spacing.xl,
    marginTop: Polish.spacing.sm,
  },
  stepperButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Polish.colors.border,
    backgroundColor: Polish.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonText: {
    ...Polish.typography.title,
    color: Polish.colors.text,
    lineHeight: 28,
  },
  stepperValue: {
    ...Polish.typography.subtitle,
    color: Polish.colors.text,
    minWidth: 80,
    textAlign: 'center',
  },
  calendarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Polish.spacing.sm,
  },
  calendarConnectedText: {
    ...Polish.typography.body,
    color: Polish.colors.success,
    fontWeight: '600',
    flex: 1,
  },
  disconnectButton: {
    paddingHorizontal: Polish.spacing.md,
    paddingVertical: Polish.spacing.sm,
  },
  disconnectText: {
    ...Polish.typography.caption,
    color: Polish.colors.error,
    fontWeight: '600',
  },
  calendarConnectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Polish.spacing.sm,
    borderWidth: 1.5,
    borderColor: Polish.colors.primary,
    borderRadius: Polish.radius.md,
    padding: Polish.spacing.lg,
    backgroundColor: Polish.colors.surface,
    marginTop: Polish.spacing.sm,
  },
  calendarConnectText: {
    ...Polish.typography.button,
    color: Polish.colors.primary,
  },
});
