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
import { auth, db, storage } from '@/firebase/config';
import { disconnectGoogleCalendar } from '@/lib/googleCalendar';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { signOut } from 'firebase/auth';
import { doc, getDocFromServer, setDoc } from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
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

function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour}:${m.toString().padStart(2, '0')} ${period}`;
}

function hhmmFromDate(date: Date): string {
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

/** Recursively removes undefined values so Firestore doesn't reject the write */
function removeUndefined(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj;
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, removeUndefined(v)])
    );
  }
  return obj;
}

export default function ProfileEditor({ showBackButton = false, topPadding = 60 }: ProfileEditorProps) {
  const { user, userProfile, setUserProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ firstName?: string; lastName?: string; location?: string; roles?: string; portfolio?: string }>({});
  const [saveNotice, setSaveNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [firstName, setFirstName] = useState(userProfile?.firstName || '');
  const [lastName, setLastName] = useState(userProfile?.lastName || '');
  const [location, setLocation] = useState(() => {
    const saved = userProfile?.location || userProfile?.nailTechProfile?.location || '';
    return LOCATION_OPTIONS.slice(0, -1).includes(saved as any) ? saved : (saved && !LOCATION_OPTIONS.includes(saved as any) ? saved : '');
  });
  const [showOtherLocation, setShowOtherLocation] = useState(() => {
    const saved = userProfile?.location || userProfile?.nailTechProfile?.location || '';
    return !!saved && !LOCATION_OPTIONS.slice(0, -1).includes(saved as any);
  });
  const [selectedPreferences, setSelectedPreferences] = useState<string[]>(
    () => Array.isArray(userProfile?.preferences) ? userProfile.preferences : (userProfile?.preferences ? [userProfile.preferences] : [])
  );
  const [instagramHandle, setInstagramHandle] = useState(userProfile?.instagramHandle || '');
  const [bio, setBio] = useState(userProfile?.nailTechProfile?.bio || '');
  const [selectedTools, setSelectedTools] = useState<string[]>(userProfile?.nailTechProfile?.tools || []);
  const [selectedDesigns, setSelectedDesigns] = useState<string[]>(userProfile?.nailTechProfile?.designs || []);
  const [availSchedule, setAvailSchedule] = useState<Record<string, Array<{ start: string; end: string }>>>(
    userProfile?.nailTechProfile?.availabilities?.schedule ?? {}
  );
  const [timePicker, setTimePicker] = useState<{ day: string; blockIdx: number; field: 'start' | 'end' } | null>(null);
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
  const [usePricingTiers, setUsePricingTiers] = useState<boolean>(
    np0?.usePricingTiers !== undefined
      ? np0.usePricingTiers
      : Object.values(np0?.pricingTiers ?? {}).some((t: any) => t?.enabled)
  );
  const [pricingDescription, setPricingDescription] = useState(np0?.pricingDescription ?? '');
  const [removalAddOnEnabled, setRemovalAddOnEnabled] = useState(np0?.removalAddOn?.enabled ?? false);
  const [removalAddOnPrice, setRemovalAddOnPrice] = useState(String(np0?.removalAddOn?.price ?? 15));

  const [portfolio, setPortfolio] = useState<string[]>(userProfile?.nailTechProfile?.portfolio ?? []);
  const [portfolioUploading, setPortfolioUploading] = useState(false);

  const isNailTech = editing ? selectedRoles.includes('nailTech') : (userProfile?.roles?.includes('nailTech') ?? false);
  const isUser = editing ? selectedRoles.includes('user') : (userProfile?.roles?.includes('user') ?? false);

  const [googleConnected, setGoogleConnected] = useState(!!userProfile?.googleCalendar);

  const handleCalendarDisconnect = async () => {
    if (!user?.uid) return;
    await disconnectGoogleCalendar(user.uid);
    setGoogleConnected(false);
  };

  const handlePickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsMultipleSelection: true,
    });
    if (result.canceled || !result.assets.length) return;
    setPortfolioUploading(true);
    try {
      const urls = await Promise.all(result.assets.map(async (asset) => {
        const blob = await new Promise<Blob>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.onload = () => resolve(xhr.response);
          xhr.onerror = () => reject(new Error('Network request failed'));
          xhr.responseType = 'blob';
          xhr.open('GET', asset.uri, true);
          xhr.send(null);
        });
        const photoRef = storageRef(storage, `portfolios/${user!.uid}/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`);
        await uploadBytes(photoRef, blob);
        return getDownloadURL(photoRef);
      }));
      setPortfolio(prev => [...prev, ...urls]);
    } catch (e) {
      console.error('Portfolio upload error:', e);
      Alert.alert('Upload failed', 'Could not upload photo. Please try again.');
    } finally {
      setPortfolioUploading(false);
    }
  };

  const handleSetCoverPhoto = (url: string) => {
    setPortfolio(prev => [url, ...prev.filter(u => u !== url)]);
  };

  const handleRemovePhoto = (url: string) => {
    setPortfolio(prev => prev.filter(u => u !== url));
    // Best-effort delete from Storage
    try {
      const photoRef = storageRef(storage, url);
      deleteObject(photoRef).catch(() => {});
    } catch {}
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
      setAvailSchedule(userProfile.nailTechProfile?.availabilities?.schedule ?? {});
      setPortfolio(userProfile.nailTechProfile?.portfolio ?? []);
    }
  }, [userProfile?.roles, userProfile?.location, userProfile?.nailTechProfile?.location, userProfile?.preferences, userProfile?.nailTechProfile?.tools, userProfile?.nailTechProfile?.designs, userProfile?.nailTechProfile?.availabilities?.schedule, editing]);

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
        setAvailSchedule(np?.availabilities?.schedule ?? {});
        setPortfolio(Array.isArray(np?.portfolio) ? np.portfolio : []);
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
        setUsePricingTiers(
          np?.usePricingTiers !== undefined
            ? np.usePricingTiers
            : Object.values(np?.pricingTiers ?? {}).some((t: any) => t?.enabled)
        );
        setPricingDescription(np?.pricingDescription ?? '');
        setRemovalAddOnEnabled(np?.removalAddOn?.enabled ?? false);
        setRemovalAddOnPrice(String(np?.removalAddOn?.price ?? 15));
        setGoogleConnected(!!data.googleCalendar);
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
    setInstagramHandle(userProfile?.instagramHandle || '');
    const np = userProfile?.nailTechProfile;
    setBio(np?.bio || '');
    setSelectedTools(np?.tools || []);
    setSelectedDesigns(np?.designs || []);
    setAvailSchedule(np?.availabilities?.schedule ?? {});
    setPortfolio(np?.portfolio ?? []);
    setPricingTiers({
      tier1: np?.pricingTiers?.tier1 ?? { ...DEFAULT_PRICING_TIERS.tier1 },
      tier2: np?.pricingTiers?.tier2 ?? { ...DEFAULT_PRICING_TIERS.tier2 },
      tier3: np?.pricingTiers?.tier3 ?? { ...DEFAULT_PRICING_TIERS.tier3 },
    });
    setReschedulePolicy(np?.policies?.reschedule ?? '');
    setLatePolicy(np?.policies?.late ?? '');
    setSelectedPaymentMethods(np?.paymentMethods ?? []);
    setMaxApptPerWeek(np?.maxAppointmentsPerWeek ?? 0);
    setUsePricingTiers(
      np?.usePricingTiers !== undefined
        ? np.usePricingTiers
        : Object.values(np?.pricingTiers ?? {}).some((t: any) => t?.enabled)
    );
    setPricingDescription(np?.pricingDescription ?? '');
    setRemovalAddOnEnabled(np?.removalAddOn?.enabled ?? false);
    setRemovalAddOnPrice(String(np?.removalAddOn?.price ?? 15));
    setEditing(false);
  };

  const handleSave = async () => {
    const errors: typeof fieldErrors = {};
    if (selectedRoles.length === 0) errors.roles = 'Please choose at least one role';
    if (!firstName.trim()) errors.firstName = 'First name is required, please fill in';
    if (!lastName.trim()) errors.lastName = 'Last name is required, please fill in';
    if (isNailTech && !location) errors.location = 'Location is not given a value, please fill in';
    if (isNailTech && portfolio.length === 0) errors.portfolio = 'Please add at least one portfolio photo';
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      if (errors.roles) setExpandedSection('role');
      else if (errors.firstName || errors.lastName) setExpandedSection('basic');
      else if (errors.location) setExpandedSection('location');
      else if (errors.portfolio) setExpandedSection('portfolio');
      const missing = [
        errors.roles && 'role',
        errors.firstName && 'first name',
        errors.lastName && 'last name',
        errors.location && 'location',
        errors.portfolio && 'portfolio photo',
      ].filter(Boolean).join(', ');
      setSaveNotice({ type: 'error', text: `Please fill in: ${missing}` });
      return;
    }
    setFieldErrors({});
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
          portfolio: portfolio.length > 0 ? [...portfolio] : undefined,
          availabilities: {
            schedule: availSchedule,
          },
          usePricingTiers,
          ...(usePricingTiers
            ? { pricingTiers: { tier1: pricingTiers.tier1, tier2: pricingTiers.tier2, tier3: pricingTiers.tier3 } }
            : { pricingDescription: pricingDescription.trim() }),
          policies: {
            reschedule: reschedulePolicy.trim() || undefined,
            late: latePolicy.trim() || undefined,
          },
          paymentMethods: selectedPaymentMethods.length > 0 ? [...selectedPaymentMethods] : undefined,
          maxAppointmentsPerWeek: maxApptPerWeek,
          removalAddOn: { enabled: removalAddOnEnabled, price: parseFloat(removalAddOnPrice) || 0 },
        };
      }
      const updatedProfile = {
        ...userProfile,
        roles: selectedRoles,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        instagramHandle: instagramHandle.trim() || undefined,
        preferences: isUser && selectedPreferences.length > 0 ? [...selectedPreferences] : undefined,
        location: (isUser || isNailTech) && location ? location : undefined,
        nailTechProfile: nailTechProfile,
      };
      const writeData: Record<string, unknown> = {
        email: user.email,
        roles: selectedRoles,
        firstName: updatedProfile.firstName,
        lastName: updatedProfile.lastName,
        profileCompleted: true,
        createdAt: userProfile.createdAt || new Date(),
      };
      if (updatedProfile.instagramHandle) writeData.instagramHandle = updatedProfile.instagramHandle;
      if (updatedProfile.preferences != null) {
        writeData.preferences = updatedProfile.preferences;
      }
      if (updatedProfile.location) writeData.location = updatedProfile.location;
      if (updatedProfile.nailTechProfile != null) writeData.nailTechProfile = removeUndefined(updatedProfile.nailTechProfile);
      await setDoc(doc(db, 'users', user.uid), writeData, { merge: true });
      setUserProfile(updatedProfile);
      setEditing(false);
      setSaveNotice({ type: 'success', text: 'Profile saved!' });
      setTimeout(() => setSaveNotice(null), 3000);
    } catch (error: any) {
      console.error('Profile update error:', error);
      setSaveNotice({ type: 'error', text: 'Something went wrong — please check your connection and try again.' });
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

  const isCustomerOnly = isUser && !isNailTech;

  const sec = (id: string, title: string, preview?: string) =>
    editing ? (
      <TouchableOpacity
        style={styles.collapsibleHeader}
        onPress={() => setExpandedSection(prev => prev === id ? null : id)}
        activeOpacity={0.7}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionLabel}>{title}</Text>
          {preview && expandedSection !== id ? (
            <Text style={styles.sectionPreview} numberOfLines={1}>{preview}</Text>
          ) : null}
        </View>
        <Ionicons name={expandedSection === id ? 'chevron-up' : 'chevron-down'} size={16} color={Polish.colors.textMuted} />
      </TouchableOpacity>
    ) : (
      <Text style={styles.sectionLabel}>{title}</Text>
    );

  const open = (id: string) => !editing || expandedSection === id;

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
            onPress={() => { setSelectedRoles(userProfile?.roles ?? []); setExpandedSection(null); setEditing(true); }}
            activeOpacity={0.7}
          >
            <Text style={styles.editButton}>Edit</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>

      {saveNotice && (
        <View style={[styles.saveNotice, saveNotice.type === 'success' ? styles.saveNoticeSuccess : styles.saveNoticeError]}>
          <Ionicons
            name={saveNotice.type === 'success' ? 'checkmark-circle' : 'alert-circle'}
            size={16}
            color={saveNotice.type === 'success' ? Polish.colors.success : Polish.colors.error}
          />
          <Text style={[styles.saveNoticeText, { color: saveNotice.type === 'success' ? Polish.colors.success : Polish.colors.error }]}>
            {saveNotice.text}
          </Text>
        </View>
      )}

      {!editing && (
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>{displayName}</Text>
          {location ? (
            <View style={styles.heroLocationRow}>
              <Ionicons name="location-outline" size={13} color={Polish.colors.textMuted} />
              <Text style={styles.heroLocation}>{location}</Text>
            </View>
          ) : null}
          <View style={styles.heroBadgeRow}>
            {isUser && (
              <View style={styles.heroBadge}>
                <Text style={styles.heroBadgeText}>Customer</Text>
              </View>
            )}
            {isNailTech && (
              <View style={[styles.heroBadge, styles.heroBadgeTech]}>
                <Text style={[styles.heroBadgeText, styles.heroBadgeTextTech]}>Nail Tech</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {editing && (
        <View style={styles.section}>
          {sec('role', 'Role', selectedRoles.map((r: string) => r === 'nailTech' ? 'Nail Tech' : 'Customer').join(' & '))}
          {open('role') && (
            <>
              <View style={styles.roleRow}>
                <TouchableOpacity
                  style={[styles.roleChip, isUser && styles.roleChipSelected]}
                  onPress={() => { toggleRole('user'); setFieldErrors(e => ({ ...e, roles: undefined })); }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="person-outline" size={20} color={isUser ? '#fff' : Polish.colors.textSecondary} />
                  <Text style={[styles.roleChipText, isUser && styles.roleChipTextSelected]}>Customer</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.roleChip, isNailTech && styles.roleChipSelected]}
                  onPress={() => { toggleRole('nailTech'); setFieldErrors(e => ({ ...e, roles: undefined })); }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="sparkles-outline" size={20} color={isNailTech ? '#fff' : Polish.colors.textSecondary} />
                  <Text style={[styles.roleChipText, isNailTech && styles.roleChipTextSelected]}>Nail Tech</Text>
                </TouchableOpacity>
              </View>
              {fieldErrors.roles
                ? <Text style={styles.fieldError}>{fieldErrors.roles}</Text>
                : <Text style={styles.roleHint}>Choose at least one. You can be both.</Text>
              }
            </>
          )}
        </View>
      )}

      <View style={styles.section}>
        {sec('basic', 'Contact', [firstName, lastName].filter(Boolean).join(' ') || 'Name')}
        {open('basic') && (editing ? (
          <>
            <TextInput
              style={[styles.input, fieldErrors.firstName ? styles.inputError : null]}
              placeholder="First Name"
              value={firstName}
              onChangeText={(v) => { setFirstName(v); if (fieldErrors.firstName) setFieldErrors(e => ({ ...e, firstName: undefined })); }}
              autoCapitalize="words"
            />
            {fieldErrors.firstName ? <Text style={styles.fieldError}>{fieldErrors.firstName}</Text> : null}
            <TextInput
              style={[styles.input, fieldErrors.lastName ? styles.inputError : null]}
              placeholder="Last Name"
              value={lastName}
              onChangeText={(v) => { setLastName(v); if (fieldErrors.lastName) setFieldErrors(e => ({ ...e, lastName: undefined })); }}
              autoCapitalize="words"
            />
            {fieldErrors.lastName ? <Text style={styles.fieldError}>{fieldErrors.lastName}</Text> : null}
            <TextInput
              style={styles.input}
              placeholder="Instagram (optional, e.g. @yourhandle)"
              value={instagramHandle}
              onChangeText={(text) => {
                if (text === '' || text === '@') { setInstagramHandle(''); return; }
                setInstagramHandle(text.startsWith('@') ? text : '@' + text);
              }}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </>
        ) : (
          <>
            <View style={styles.infoRow}>
              <Ionicons name="person-outline" size={16} color={Polish.colors.textMuted} />
              <Text style={styles.infoRowText}>{[firstName, lastName].filter(Boolean).join(' ') || '—'}</Text>
            </View>
            {userProfile?.email ? (
              <View style={styles.infoRow}>
                <Ionicons name="mail-outline" size={16} color={Polish.colors.textMuted} />
                <Text style={styles.infoRowText}>{userProfile.email}</Text>
              </View>
            ) : null}
            {instagramHandle ? (
              <View style={styles.infoRow}>
                <Ionicons name="logo-instagram" size={16} color={Polish.colors.textMuted} />
                <Text style={styles.infoRowText}>
                  {instagramHandle.startsWith('@') ? instagramHandle : `@${instagramHandle}`}
                </Text>
              </View>
            ) : null}
          </>
        ))}
      </View>

      {(isUser || isNailTech) && (
        <View style={styles.section}>
          {sec('location', 'Location', location || 'Not set')}
          {open('location') && (editing ? (
            <>
              <View style={styles.chipRow}>
                {LOCATION_OPTIONS.map((loc) => (
                  <TouchableOpacity
                    key={loc}
                    style={[styles.chip, (loc === 'Other' ? showOtherLocation : location === loc) && styles.chipSelected]}
                    onPress={() => {
                      if (loc === 'Other') {
                        setShowOtherLocation(true);
                        setLocation('');
                      } else {
                        setShowOtherLocation(false);
                        setLocation(location === loc ? '' : loc);
                      }
                      if (fieldErrors.location) setFieldErrors(e => ({ ...e, location: undefined }));
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.chipText, (loc === 'Other' ? showOtherLocation : location === loc) && styles.chipTextSelected]}>{loc}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {showOtherLocation && (
                <TextInput
                  style={styles.input}
                  placeholder="Enter your location"
                  value={location}
                  onChangeText={setLocation}
                  autoCapitalize="words"
                  autoCorrect={false}
                />
              )}
              {fieldErrors.location ? <Text style={styles.fieldError}>{fieldErrors.location}</Text> : null}
            </>
          ) : (
            <View style={styles.infoRow}>
              <Ionicons name="location-outline" size={16} color={Polish.colors.textMuted} />
              <Text style={styles.infoRowText}>{location || 'Not specified'}</Text>
            </View>
          ))}
        </View>
      )}

      {isUser && (
        <View style={styles.section}>
          {sec('prefs', 'Style', selectedPreferences.join(', ') || 'None selected')}
          {open('prefs') && (editing ? (
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
            selectedPreferences.length > 0 ? (
              <View style={styles.chipRowCompact}>
                {selectedPreferences.map(p => (
                  <View key={p} style={styles.chipReadOnly}>
                    <Text style={styles.chipReadOnlyText}>{p}</Text>
                  </View>
                ))}
              </View>
            ) : null
          ))}
        </View>
      )}

      {isNailTech && (
        <View style={styles.section}>
          {sec('tech', 'Services', bio || [selectedTools[0], selectedDesigns[0]].filter(Boolean).join(', ') || 'Bio, tools & designs')}
          {open('tech') && (
            <>
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
                <View>
                  {bio ? <Text style={styles.bioText}>{bio}</Text> : null}
                  {selectedTools.length > 0 && (
                    <>
                      <Text style={styles.viewLabel}>{TOOLS_LABEL}</Text>
                      <View style={styles.chipRowCompact}>
                        {selectedTools.map(t => <View key={t} style={styles.chipReadOnly}><Text style={styles.chipReadOnlyText}>{t}</Text></View>)}
                      </View>
                    </>
                  )}
                  {selectedDesigns.length > 0 && (
                    <>
                      <Text style={styles.viewLabel}>{DESIGNS_LABEL}</Text>
                      <View style={styles.chipRowCompact}>
                        {selectedDesigns.map(d => <View key={d} style={styles.chipReadOnly}><Text style={styles.chipReadOnlyText}>{d}</Text></View>)}
                      </View>
                    </>
                  )}
                </View>
              )}
              {/* Availability schedule */}
              {editing ? (
                <View style={{ marginTop: Polish.spacing.xl }}>
                  <Text style={styles.label}>Available Hours</Text>
                  <Text style={styles.optionHint}>Tap + to add hours for a day. Tap a time to edit it.</Text>
                  {DAYS_OF_WEEK.map((day) => {
                    const blocks = availSchedule[day] ?? [];
                    const hasBlocks = blocks.length > 0;
                    return (
                      <View key={day} style={styles.scheduleDay}>
                        <View style={[styles.dayCircle, hasBlocks && styles.dayCircleActive]}>
                          <Text style={[styles.dayCircleText, hasBlocks && styles.dayCircleTextActive]}>
                            {day[0]}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          {hasBlocks ? (
                            blocks.map((block, idx) => (
                              <View key={idx}>
                                <View style={styles.scheduleBlockRow}>
                                  <TouchableOpacity
                                    style={styles.scheduleTimeBtn}
                                    onPress={() => setTimePicker({ day, blockIdx: idx, field: 'start' })}
                                    activeOpacity={0.8}
                                  >
                                    <Text style={styles.scheduleTimeText}>{formatTime(block.start)}</Text>
                                  </TouchableOpacity>
                                  <Text style={styles.scheduleDash}>–</Text>
                                  <TouchableOpacity
                                    style={styles.scheduleTimeBtn}
                                    onPress={() => setTimePicker({ day, blockIdx: idx, field: 'end' })}
                                    activeOpacity={0.8}
                                  >
                                    <Text style={styles.scheduleTimeText}>{formatTime(block.end)}</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={styles.scheduleRemoveBtn}
                                    onPress={() => {
                                      const next = { ...availSchedule };
                                      next[day] = blocks.filter((_, i) => i !== idx);
                                      if (next[day].length === 0) delete next[day];
                                      setAvailSchedule(next);
                                      if (timePicker?.day === day && timePicker.blockIdx === idx) setTimePicker(null);
                                    }}
                                    activeOpacity={0.8}
                                  >
                                    <Ionicons name="close" size={16} color={Polish.colors.textMuted} />
                                  </TouchableOpacity>
                                </View>
                                {timePicker?.day === day && timePicker.blockIdx === idx && Platform.OS !== 'web' && (
                                  <DateTimePicker
                                    value={(() => {
                                      const [h, m] = (timePicker.field === 'start' ? block.start : block.end).split(':').map(Number);
                                      const d = new Date(); d.setHours(h, m, 0, 0); return d;
                                    })()}
                                    mode="time"
                                    is24Hour={false}
                                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                    themeVariant="light"
                                    onChange={(_e, selected) => {
                                      if (Platform.OS !== 'ios') setTimePicker(null);
                                      if (!selected) return;
                                      const newTime = hhmmFromDate(selected);
                                      const [newH, newM] = newTime.split(':').map(Number);
                                      const [otherH, otherM] = (timePicker!.field === 'end' ? block.start : block.end).split(':').map(Number);
                                      const next = { ...availSchedule };
                                      if (timePicker!.field === 'end' && newH * 60 + newM <= otherH * 60 + otherM) {
                                        Alert.alert('Invalid time', 'End time must be after start time.');
                                        return;
                                      }
                                      if (timePicker!.field === 'start' && otherH * 60 + otherM <= newH * 60 + newM) {
                                        const endMins = Math.min(newH * 60 + newM + 60, 23 * 60 + 59);
                                        const autoEnd = `${String(Math.floor(endMins / 60)).padStart(2, '0')}:${String(endMins % 60).padStart(2, '0')}`;
                                        next[day] = blocks.map((b, i) => i === idx ? { ...b, start: newTime, end: autoEnd } : b);
                                      } else {
                                        next[day] = blocks.map((b, i) => i === idx ? { ...b, [timePicker!.field]: newTime } : b);
                                      }
                                      setAvailSchedule(next);
                                    }}
                                  />
                                )}
                              </View>
                            ))
                          ) : (
                            <Text style={styles.scheduleUnavailableText}>Unavailable</Text>
                          )}
                        </View>
                        <TouchableOpacity
                          style={styles.scheduleAddBtn}
                          onPress={() => {
                            setAvailSchedule(prev => ({
                              ...prev,
                              [day]: [...(prev[day] ?? []), { start: '10:00', end: '18:00' }],
                            }));
                            setTimePicker(null);
                          }}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="add" size={20} color={Polish.colors.primary} />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              ) : (
                (() => {
                  const entries = DAYS_OF_WEEK.filter(d => (availSchedule[d]?.length ?? 0) > 0);
                  return entries.length > 0 ? (
                    <View style={{ marginTop: Polish.spacing.lg }}>
                      <Text style={styles.label}>Available Hours</Text>
                      <Text style={styles.readOnlyText}>
                        {entries.map(d =>
                          `${d.slice(0, 3)} ${availSchedule[d].map(b => `${formatTime(b.start)}–${formatTime(b.end)}`).join(', ')}`
                        ).join(' · ')}
                      </Text>
                    </View>
                  ) : null;
                })()
              )}
            </>
          )}
        </View>
      )}

      {isNailTech && (
        <View style={styles.section}>
          {sec('portfolio', 'Portfolio', portfolio.length ? `${portfolio.length} photo${portfolio.length !== 1 ? 's' : ''}` : 'No photos yet')}
          {open('portfolio') && (
            editing ? (
              <>
                <Text style={styles.optionHint}>Tap to set cover · Long press to remove</Text>
                <View style={styles.portfolioGrid}>
                  {portfolio.map((url, idx) => (
                    <TouchableOpacity
                      key={idx}
                      onPress={() => handleSetCoverPhoto(url)}
                      onLongPress={() => handleRemovePhoto(url)}
                      activeOpacity={0.85}
                      style={styles.portfolioThumbWrap}
                    >
                      <Image source={{ uri: url }} style={styles.portfolioThumb} contentFit="cover" />
                      {idx === 0 && (
                        <View style={styles.portfolioCoverBadge}>
                          <Ionicons name="star" size={10} color="#fff" />
                          <Text style={styles.portfolioCoverBadgeText}>Cover</Text>
                        </View>
                      )}
                      <View style={styles.portfolioRemoveOverlay}>
                        <Ionicons name="close-circle" size={22} color="#fff" />
                      </View>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    style={styles.portfolioAddBtn}
                    onPress={handlePickPhoto}
                    disabled={portfolioUploading}
                    activeOpacity={0.8}
                  >
                    {portfolioUploading ? (
                      <ActivityIndicator color={Polish.colors.primary} />
                    ) : (
                      <Ionicons name="add" size={28} color={Polish.colors.primary} />
                    )}
                  </TouchableOpacity>
                </View>
              </>
            ) : portfolio.length > 0 ? (
              <View style={styles.portfolioGrid}>
                {portfolio.map((url, idx) => (
                  <Image
                    key={idx}
                    source={{ uri: url }}
                    style={styles.portfolioThumb}
                    contentFit="cover"
                  />
                ))}
              </View>
            ) : (
              <Text style={styles.readOnlyTextMuted}>No photos yet. Tap Edit to add your work.</Text>
            )
          )}
        </View>
      )}

      {isNailTech && (
        <>
          {/* Pricing */}
          <View style={styles.section}>
            {sec('pricing', 'Pricing', usePricingTiers ? 'Tiered pricing' : (pricingDescription || 'Not set'))}
            {open('pricing') && (
              <>
                <View style={styles.switchRow}>
                  <Text style={styles.label}>Use pricing tiers</Text>
                  <Switch
                    value={usePricingTiers}
                    onValueChange={editing ? setUsePricingTiers : undefined}
                    disabled={!editing}
                    trackColor={{ false: Polish.colors.border, true: Polish.colors.primary + '80' }}
                    thumbColor={usePricingTiers ? Polish.colors.primary : Polish.colors.textMuted}
                  />
                </View>
                {usePricingTiers ? (
                  <>
                    <Text style={styles.optionHint}>Enable tiers and enter a price for each one clients can choose from.</Text>
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
                                placeholder="Price ($) — required"
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
                  </>
                ) : (
                  <>
                    <Text style={styles.optionHint}>Describe your pricing so clients know what to expect.</Text>
                    <TextInput
                      style={[styles.input, styles.textArea, !editing && styles.inputDisabled]}
                      placeholder="e.g. Starting at $45 for basic gel, $65 for full set — DM for custom quotes"
                      placeholderTextColor={Polish.colors.textMuted}
                      value={pricingDescription}
                      onChangeText={setPricingDescription}
                      editable={editing}
                      multiline
                      numberOfLines={3}
                    />
                  </>
                )}
              </>
            )}
          </View>

          {/* Removal add-on */}
          <View style={styles.section}>
            {sec('addons', 'Add-ons', removalAddOnEnabled ? `Gel removal $${removalAddOnPrice}` : 'None')}
            {open('addons') && (
              <>
                <View style={styles.removalAddOnRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.tierLabel}>Gel Removal Add-on</Text>
                    <Text style={styles.tierHint}>Offer gel removal as an add-on service</Text>
                  </View>
                  <Switch
                    value={removalAddOnEnabled}
                    onValueChange={editing ? setRemovalAddOnEnabled : undefined}
                    disabled={!editing}
                    trackColor={{ false: Polish.colors.border, true: Polish.colors.primary }}
                    thumbColor="#fff"
                  />
                </View>
                {removalAddOnEnabled && (
                  <View style={styles.tierPriceRow}>
                    <Text style={styles.tierLabel}>Removal price</Text>
                    <View style={styles.priceInputWrapper}>
                      <Text style={styles.dollarSign}>$</Text>
                      <TextInput
                        style={styles.priceInput}
                        value={removalAddOnPrice}
                        onChangeText={setRemovalAddOnPrice}
                        keyboardType="decimal-pad"
                        placeholder="15"
                        placeholderTextColor={Polish.colors.textMuted}
                        editable={editing}
                      />
                    </View>
                  </View>
                )}
              </>
            )}
          </View>

          {/* Policies */}
          <View style={styles.section}>
            {sec('policies', 'Policies', reschedulePolicy || latePolicy ? 'Set' : 'Not set')}
            {open('policies') && (
              <>
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
              </>
            )}
          </View>

          {/* Payment Methods */}
          <View style={styles.section}>
            {sec('payment', 'Payment', selectedPaymentMethods.join(', ') || 'Not specified')}
            {open('payment') && (
              editing ? (
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
              )
            )}
          </View>

          {/* Weekly Booking Limit */}
          <View style={styles.section}>
            {sec('limit', 'Booking Limit', maxApptPerWeek === 0 ? 'Unlimited' : `${maxApptPerWeek}/week`)}
            {open('limit') && (
              <>
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
              </>
            )}
          </View>
        </>
      )}

      {/* Google Calendar — visible for all users */}
      <View style={styles.section}>
        {sec('gcal', 'Calendar', googleConnected ? 'Connected' : 'Not connected')}
        {open('gcal') && (
          googleConnected ? (
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
            <Text style={styles.readOnlyTextMuted}>
              Not connected. Sign out and sign back in with Google to link your calendar.
            </Text>
          )
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

      {!editing && isCustomerOnly && (
        <TouchableOpacity
          style={styles.becomeTechCard}
          onPress={() => router.push('/apply' as any)}
          activeOpacity={0.85}
        >
          <View style={styles.becomeTechIcon}>
            <Ionicons name="sparkles" size={22} color={Polish.colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.becomeTechTitle}>Become a Nail Tech</Text>
            <Text style={styles.becomeTechSub}>Apply to offer your services on Polish</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Polish.colors.textMuted} />
        </TouchableOpacity>
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
  collapsibleHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: Polish.spacing.sm,
    marginHorizontal: -Polish.spacing.xs,
    paddingHorizontal: Polish.spacing.xs,
    borderRadius: Polish.radius.sm,
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
    marginBottom: Polish.spacing.lg,
    paddingTop: Polish.spacing.sm,
    paddingBottom: Polish.spacing.lg,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Polish.colors.primary + '20',
    borderWidth: 2,
    borderColor: Polish.colors.primary + '40',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Polish.spacing.lg,
  },
  avatarInitials: {
    ...Polish.typography.title,
    color: Polish.colors.primary,
    fontSize: 26,
  },
  heroTitle: {
    ...Polish.typography.title,
    fontSize: 28,
    color: Polish.colors.text,
    textAlign: 'center',
    marginBottom: Polish.spacing.xs,
  },
  heroLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: Polish.spacing.xs,
    marginBottom: Polish.spacing.md,
  },
  heroLocation: {
    ...Polish.typography.caption,
    color: Polish.colors.textMuted,
  },
  heroBadgeRow: {
    flexDirection: 'row',
    gap: Polish.spacing.sm,
    marginTop: Polish.spacing.sm,
  },
  heroBadge: {
    paddingHorizontal: Polish.spacing.md,
    paddingVertical: 4,
    borderRadius: Polish.radius.xl,
    backgroundColor: Polish.colors.surface,
    borderWidth: 1,
    borderColor: Polish.colors.border,
  },
  heroBadgeTech: {
    backgroundColor: Polish.colors.primary + '15',
    borderColor: Polish.colors.primary + '60',
  },
  heroBadgeText: {
    ...Polish.typography.caption,
    color: Polish.colors.textSecondary,
    fontWeight: '600',
  },
  heroBadgeTextTech: {
    color: Polish.colors.primary,
  },
  heroSubtext: {
    ...Polish.typography.caption,
    color: Polish.colors.textMuted,
    marginTop: Polish.spacing.sm,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Polish.spacing.sm,
    paddingVertical: Polish.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Polish.colors.borderLight,
  },
  infoRowText: {
    ...Polish.typography.body,
    color: Polish.colors.textSecondary,
    flex: 1,
  },
  becomeTechCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Polish.spacing.md,
    backgroundColor: Polish.colors.surface,
    borderRadius: Polish.radius.lg,
    padding: Polish.spacing.lg,
    marginBottom: Polish.spacing.xxl,
    borderWidth: 1,
    borderColor: Polish.colors.primary + '40',
    ...Polish.shadowSm,
  },
  becomeTechIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Polish.colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  becomeTechTitle: {
    ...Polish.typography.bodyMedium,
    color: Polish.colors.text,
    marginBottom: 2,
  },
  becomeTechSub: {
    ...Polish.typography.caption,
    color: Polish.colors.textMuted,
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
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Polish.colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.8,
    marginBottom: Polish.spacing.md,
  },
  sectionPreview: {
    ...Polish.typography.caption,
    color: Polish.colors.text,
    marginTop: 2,
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
  scheduleDay: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: Polish.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Polish.colors.borderLight,
    gap: Polish.spacing.md,
  },
  dayCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Polish.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  dayCircleActive: {
    backgroundColor: Polish.colors.primary,
    borderColor: Polish.colors.primary,
  },
  dayCircleText: {
    ...Polish.typography.caption,
    fontWeight: '700',
    color: Polish.colors.textMuted,
  },
  dayCircleTextActive: {
    color: '#fff',
  },
  scheduleBlockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Polish.spacing.sm,
    marginBottom: 4,
  },
  scheduleTimeBtn: {
    paddingHorizontal: Polish.spacing.md,
    paddingVertical: 6,
    borderRadius: Polish.radius.md,
    borderWidth: 1,
    borderColor: Polish.colors.border,
    backgroundColor: Polish.colors.background,
  },
  scheduleTimeText: {
    ...Polish.typography.caption,
    color: Polish.colors.text,
    fontWeight: '500',
  },
  scheduleDash: {
    ...Polish.typography.caption,
    color: Polish.colors.textMuted,
  },
  scheduleRemoveBtn: {
    padding: 4,
  },
  scheduleUnavailableText: {
    ...Polish.typography.caption,
    color: Polish.colors.textMuted,
    paddingVertical: 6,
  },
  scheduleAddBtn: {
    padding: 4,
    marginTop: 2,
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
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Polish.spacing.md,
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
  removalAddOnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Polish.spacing.md,
  },
  tierLabel: {
    ...Polish.typography.bodyMedium,
    color: Polish.colors.text,
    marginBottom: 2,
  },
  tierHint: {
    ...Polish.typography.caption,
    color: Polish.colors.textMuted,
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Polish.spacing.md,
  },
  tierPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Polish.spacing.md,
  },
  priceInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Polish.colors.border,
    borderRadius: Polish.radius.md,
    paddingHorizontal: Polish.spacing.md,
    backgroundColor: Polish.colors.surface,
  },
  dollarSign: {
    ...Polish.typography.body,
    color: Polish.colors.textSecondary,
    marginRight: 2,
  },
  priceInput: {
    ...Polish.typography.body,
    color: Polish.colors.text,
    paddingVertical: Polish.spacing.sm,
    minWidth: 60,
  },
  portfolioGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Polish.spacing.sm,
    marginTop: Polish.spacing.sm,
  },
  portfolioThumbWrap: {
    position: 'relative',
  },
  portfolioThumb: {
    width: 100,
    height: 100,
    borderRadius: Polish.radius.md,
    backgroundColor: Polish.colors.surface,
  },
  portfolioRemoveOverlay: {
    position: 'absolute',
    top: 4,
    right: 4,
  },
  portfolioCoverBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: Polish.colors.primary,
    borderRadius: Polish.radius.sm,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  portfolioCoverBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
  },
  portfolioAddBtn: {
    width: 100,
    height: 100,
    borderRadius: Polish.radius.md,
    borderWidth: 1.5,
    borderColor: Polish.colors.primary,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Polish.colors.surface,
  },
  chipRowCompact: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: Polish.spacing.sm,
    marginTop: Polish.spacing.sm,
  },
  chipReadOnly: {
    paddingHorizontal: Polish.spacing.md,
    paddingVertical: 5,
    borderRadius: Polish.radius.xl,
    backgroundColor: Polish.colors.accent + '25',
    borderWidth: 1,
    borderColor: Polish.colors.accent + '60',
  },
  chipReadOnlyText: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: Polish.colors.primaryDark,
  },
  bioText: {
    ...Polish.typography.body,
    color: Polish.colors.textSecondary,
    lineHeight: 22,
    marginBottom: Polish.spacing.lg,
  },
  viewLabel: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Polish.colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.6,
    marginBottom: Polish.spacing.sm,
    marginTop: Polish.spacing.lg,
  },
  saveNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Polish.spacing.sm,
    padding: Polish.spacing.md,
    borderRadius: Polish.radius.md,
    marginBottom: Polish.spacing.lg,
  },
  saveNoticeSuccess: {
    backgroundColor: Polish.colors.success + '15',
    borderWidth: 1,
    borderColor: Polish.colors.success + '40',
  },
  saveNoticeError: {
    backgroundColor: Polish.colors.error + '15',
    borderWidth: 1,
    borderColor: Polish.colors.error + '40',
  },
  saveNoticeText: {
    ...Polish.typography.caption,
    fontWeight: '500',
  },
});
