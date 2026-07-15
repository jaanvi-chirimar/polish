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
    PREFERENCES_LABEL,
    TOOLS_HINT,
    TOOLS_LABEL,
} from '@/constants/nailTechOptions';
import { Polish } from '@/constants/theme';
import { NailTechProfile, PricingTier, useAuth, UserType } from '@/contexts/AuthContext';
import { db, storage } from '@/firebase/config';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { doc, setDoc } from 'firebase/firestore';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

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

export default function SetupScreen() {
  const { user, userProfile, setUserProfile } = useAuth();
  const [loading, setLoading] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [instagramHandle, setInstagramHandle] = useState('');
  const [location, setLocation] = useState('');
  const [showOtherLocation, setShowOtherLocation] = useState(false);
  const [selectedPreferences, setSelectedPreferences] = useState<string[]>([]);
  const [bio, setBio] = useState('');
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [selectedDesigns, setSelectedDesigns] = useState<string[]>([]);
  const [availSchedule, setAvailSchedule] = useState<Record<string, Array<{ start: string; end: string }>>>({});
  const [timePicker, setTimePicker] = useState<{ day: string; blockIdx: number; field: 'start' | 'end' } | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<UserType[]>([]);
  const [portfolio, setPortfolio] = useState<string[]>([]);
  const [portfolioUploading, setPortfolioUploading] = useState(false);
  const [pricingTiers, setPricingTiers] = useState<{ tier1: PricingTier; tier2: PricingTier; tier3: PricingTier }>({
    tier1: { ...DEFAULT_PRICING_TIERS.tier1 },
    tier2: { ...DEFAULT_PRICING_TIERS.tier2 },
    tier3: { ...DEFAULT_PRICING_TIERS.tier3 },
  });
  const [usePricingTiers, setUsePricingTiers] = useState(false);
  const [pricingDescription, setPricingDescription] = useState('');
  const [removalAddOnEnabled, setRemovalAddOnEnabled] = useState(false);
  const [removalAddOnPrice, setRemovalAddOnPrice] = useState('15');
  const [selectedPaymentMethods, setSelectedPaymentMethods] = useState<string[]>([]);
  const [maxApptPerWeek, setMaxApptPerWeek] = useState(0);
  const [reschedulePolicy, setReschedulePolicy] = useState('');
  const [latePolicy, setLatePolicy] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [stepIndex, setStepIndex] = useState(0);

  const roles = userProfile?.roles || selectedRoles;
  const isNailTech = roles.includes('nailTech');
  const isUser = roles.includes('user');

  const stepList = useMemo(() => {
    const s: string[] = [];
    if (!userProfile) s.push('role');
    s.push('basic');
    if (isUser || isNailTech) s.push('style');
    if (isNailTech) s.push('schedule');
    if (isNailTech) s.push('pricing');
    return s;
  }, [userProfile, isUser, isNailTech]);

  const safeIndex = Math.min(stepIndex, stepList.length - 1);
  const currentStep = stepList[safeIndex];
  const isLastStep = safeIndex === stepList.length - 1;

  const toggleItem = (list: string[], item: string, setter: (v: string[]) => void) => {
    setter(list.includes(item) ? list.filter(i => i !== item) : [...list, item]);
  };

  const toggleRole = (role: UserType) => {
    setSelectedRoles(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]);
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
    if (result.canceled || !result.assets.length || !user) return;
    setPortfolioUploading(true);
    try {
      const urls = await Promise.all(result.assets.map(async (asset) => {
        const response = await fetch(asset.uri);
        const blob = await response.blob();
        const photoRef = storageRef(storage, `portfolios/${user.uid}/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`);
        await uploadBytes(photoRef, blob);
        return getDownloadURL(photoRef);
      }));
      setPortfolio(prev => [...prev, ...urls]);
      setErrors(e => ({ ...e, portfolio: '' }));
    } catch {
      Alert.alert('Upload failed', 'Could not upload photo. Please try again.');
    } finally {
      setPortfolioUploading(false);
    }
  };

  const validateStep = (step: string): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (step === 'role' && selectedRoles.length === 0) {
      errs.roles = 'Role is not given a value, please fill in';
    }
    if (step === 'basic') {
      if (!firstName.trim()) errs.firstName = 'First name is required, please fill in';
      if (!lastName.trim()) errs.lastName = 'Last name is required, please fill in';
      if (isNailTech && !location) errs.location = 'Location is not given a value, please fill in';
    }
    if (step === 'schedule' && isNailTech) {
      if (portfolio.length === 0) errs.portfolio = 'At least one portfolio photo is required';
      if (Object.keys(availSchedule).length === 0) errs.availability = 'Set your availability for at least one day';
    }
    if (step === 'pricing' && isNailTech) {
      if (usePricingTiers) {
        const anyEnabled = (['tier1', 'tier2', 'tier3'] as const).some(k => pricingTiers[k].enabled && pricingTiers[k].price > 0);
        if (!anyEnabled) errs.pricing = 'Enable at least one pricing tier with a price';
      } else {
        if (!pricingDescription.trim()) errs.pricing = 'Enter your pricing info';
      }
      if (selectedPaymentMethods.length === 0) errs.payment = 'Select at least one payment method';
    }
    return errs;
  };

  const handleNext = () => {
    const errs = validateStep(currentStep);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setErrors({});
    setStepIndex(i => i + 1);
  };

  const handleBack = () => {
    setErrors({});
    setStepIndex(i => Math.max(i - 1, 0));
  };

  const handleSubmit = async () => {
    const errs = validateStep(currentStep);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setErrors({});
    setLoading(true);
    try {
      if (!user) throw new Error('User not found');
      const finalRoles = userProfile?.roles || selectedRoles;
      if (finalRoles.length === 0) throw new Error('No roles selected');

      let nailTechProfile: NailTechProfile | undefined;
      if (isNailTech) {
        nailTechProfile = {
          location: location.trim(),
          availabilities: { schedule: availSchedule },
          portfolio: [...portfolio],
          usePricingTiers,
          ...(usePricingTiers
            ? { pricingTiers: { tier1: pricingTiers.tier1, tier2: pricingTiers.tier2, tier3: pricingTiers.tier3 } }
            : { pricingDescription: pricingDescription.trim() }),
          removalAddOn: { enabled: removalAddOnEnabled, price: parseFloat(removalAddOnPrice) || 0 },
          ...(selectedPaymentMethods.length > 0 ? { paymentMethods: [...selectedPaymentMethods] } : {}),
          maxAppointmentsPerWeek: maxApptPerWeek,
          policies: {
            ...(reschedulePolicy.trim() ? { reschedule: reschedulePolicy.trim() } : {}),
            ...(latePolicy.trim() ? { late: latePolicy.trim() } : {}),
          },
        };
        if (bio.trim()) nailTechProfile.bio = bio.trim();
        if (selectedTools.length > 0) nailTechProfile.tools = [...selectedTools];
        if (selectedDesigns.length > 0) nailTechProfile.designs = [...selectedDesigns];
      }

      const profileData: Record<string, any> = {
        email: user.email,
        roles: finalRoles,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        profileCompleted: true,
        createdAt: userProfile?.createdAt || new Date(),
      };
      if (instagramHandle.trim()) profileData.instagramHandle = instagramHandle.trim();
      if (selectedPreferences.length > 0) profileData.preferences = [...selectedPreferences];
      if ((isUser || isNailTech) && location.trim()) profileData.location = location.trim();
      if (nailTechProfile) profileData.nailTechProfile = nailTechProfile;

      await setDoc(doc(db, 'users', user.uid), profileData, { merge: true });

      setUserProfile({
        uid: user.uid,
        phoneNumber: null,
        email: user.email,
        roles: finalRoles,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        instagramHandle: instagramHandle.trim() || undefined,
        profileCompleted: true,
        preferences: selectedPreferences.length > 0 ? [...selectedPreferences] : undefined,
        location: location.trim() || undefined,
        nailTechProfile,
        createdAt: userProfile?.createdAt || new Date(),
      });

      router.replace('/(tabs)');
    } catch (error: any) {
      console.error('Setup error:', error);
      Alert.alert('Error', error.message || 'Failed to save profile');
    } finally {
      setLoading(false);
    }
  };

  const stepMeta: Record<string, { title: string; subtitle: string }> = {
    role: {
      title: 'Choose your role',
      subtitle: 'Select one or both — you can change this later.',
    },
    basic: {
      title: 'About you',
      subtitle: 'Just the basics to get started.',
    },
    style: {
      title: isNailTech && isUser ? 'Your preferences & services' : isNailTech ? 'Your services' : 'Your preferences',
      subtitle: isNailTech ? 'Let clients know what you offer.' : 'Help us match you with the right techs.',
    },
    schedule: {
      title: 'Portfolio & availability',
      subtitle: 'Show off your work and set your hours.',
    },
    pricing: {
      title: 'Pricing & policies',
      subtitle: 'Set your rates, payment methods, and booking rules.',
    },
  };

  const meta = stepMeta[currentStep] ?? { title: '', subtitle: '' };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header with progress dots */}
      <View style={styles.header}>
        {safeIndex > 0 ? (
          <TouchableOpacity onPress={handleBack} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-back" size={22} color={Polish.colors.text} />
          </TouchableOpacity>
        ) : (
          <View style={styles.backBtn} />
        )}
        <View style={styles.progressDots}>
          {stepList.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i < safeIndex && styles.dotDone,
                i === safeIndex && styles.dotActive,
              ]}
            />
          ))}
        </View>
        <View style={styles.backBtn} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{meta.title}</Text>
        <Text style={styles.subtitle}>{meta.subtitle}</Text>

        {/* Step: Role */}
        {currentStep === 'role' && (
          <View>
            <TouchableOpacity
              style={[styles.roleButton, selectedRoles.includes('user') && styles.roleButtonSelected]}
              onPress={() => { toggleRole('user'); setErrors(e => ({ ...e, roles: '' })); }}
            >
              <Text style={[styles.roleButtonText, selectedRoles.includes('user') && styles.roleButtonTextSelected]}>
                👤 Customer
              </Text>
              <Text style={styles.roleDescription}>Book appointments with nail techs</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.roleButton, selectedRoles.includes('nailTech') && styles.roleButtonSelected]}
              onPress={() => { toggleRole('nailTech'); setErrors(e => ({ ...e, roles: '' })); }}
            >
              <Text style={[styles.roleButtonText, selectedRoles.includes('nailTech') && styles.roleButtonTextSelected]}>
                💅 Nail Tech
              </Text>
              <Text style={styles.roleDescription}>Offer your services and manage bookings</Text>
            </TouchableOpacity>
            {errors.roles ? <Text style={styles.errorText}>{errors.roles}</Text> : null}
          </View>
        )}

        {/* Step: Basic info */}
        {currentStep === 'basic' && (
          <View>
            <TextInput
              style={[styles.input, errors.firstName ? styles.inputError : undefined]}
              placeholder="First Name *"
              value={firstName}
              onChangeText={v => { setFirstName(v); if (errors.firstName) setErrors(e => ({ ...e, firstName: '' })); }}
              autoCapitalize="words"
            />
            {errors.firstName ? <Text style={styles.errorText}>{errors.firstName}</Text> : null}
            <TextInput
              style={[styles.input, errors.lastName ? styles.inputError : undefined]}
              placeholder="Last Name *"
              value={lastName}
              onChangeText={v => { setLastName(v); if (errors.lastName) setErrors(e => ({ ...e, lastName: '' })); }}
              autoCapitalize="words"
            />
            {errors.lastName ? <Text style={styles.errorText}>{errors.lastName}</Text> : null}
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
            <Text style={styles.label}>Location {isNailTech ? '*' : '(Optional)'}</Text>
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
                    if (errors.location) setErrors(e => ({ ...e, location: '' }));
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
            {errors.location ? <Text style={styles.errorText}>{errors.location}</Text> : null}
          </View>
        )}

        {/* Step: Style / preferences */}
        {currentStep === 'style' && (
          <View>
            {isUser && (
              <View style={styles.section}>
                <Text style={styles.label}>{PREFERENCES_LABEL} (Optional)</Text>
                <Text style={styles.optionHint}>{PREFERENCES_HINT}</Text>
                <View style={styles.chipRow}>
                  {CUSTOMER_PREFERENCES_OPTIONS.map((pref) => (
                    <TouchableOpacity
                      key={pref}
                      style={[styles.chip, selectedPreferences.includes(pref) && styles.chipSelected]}
                      onPress={() => toggleItem(selectedPreferences, pref, setSelectedPreferences)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.chipText, selectedPreferences.includes(pref) && styles.chipTextSelected]}>{pref}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
            {isNailTech && (
              <View>
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
                      <Text style={[styles.chipText, selectedTools.includes(tool) && styles.chipTextSelected]}>{tool}</Text>
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
                      <Text style={[styles.chipText, selectedDesigns.includes(design) && styles.chipTextSelected]}>{design}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </View>
        )}

        {/* Step: Portfolio & schedule */}
        {currentStep === 'schedule' && (
          <View>
            <Text style={styles.label}>Portfolio Photos *</Text>
            <Text style={styles.optionHint}>Tap to set cover · Long press to remove</Text>
            <View style={styles.portfolioGrid}>
              {portfolio.map((url, idx) => (
                <TouchableOpacity
                  key={idx}
                  onPress={() => setPortfolio(prev => [url, ...prev.filter((_, i) => i !== idx)])}
                  onLongPress={() => setPortfolio(prev => prev.filter((_, i) => i !== idx))}
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
              <TouchableOpacity style={styles.portfolioAddBtn} onPress={handlePickPhoto} disabled={portfolioUploading} activeOpacity={0.8}>
                {portfolioUploading ? <ActivityIndicator color={Polish.colors.primary} /> : <Ionicons name="add" size={28} color={Polish.colors.primary} />}
              </TouchableOpacity>
            </View>
            {errors.portfolio ? <Text style={styles.errorText}>{errors.portfolio}</Text> : null}

            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Bio (Optional)"
              value={bio}
              onChangeText={setBio}
              multiline
              numberOfLines={3}
            />

            <Text style={[styles.label, { marginTop: Polish.spacing.sm }]}>Available Hours</Text>
            <Text style={styles.optionHint}>Tap + to add hours for a day. You can add multiple blocks per day.</Text>
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
            {errors.availability ? <Text style={styles.errorText}>{errors.availability}</Text> : null}

          </View>
        )}

        {/* Step: Pricing & policies */}
        {currentStep === 'pricing' && (
          <View>
            {/* Pricing */}
            <Text style={styles.label}>Pricing</Text>
            <View style={styles.switchRow}>
              <Text style={styles.optionHint}>Use tiered pricing</Text>
              <Switch
                value={usePricingTiers}
                onValueChange={setUsePricingTiers}
                trackColor={{ false: Polish.colors.border, true: Polish.colors.primary + '80' }}
                thumbColor={usePricingTiers ? Polish.colors.primary : Polish.colors.textMuted}
              />
            </View>
            {usePricingTiers ? (
              <>
                <Text style={styles.optionHint}>Enable tiers and enter a price for each one.</Text>
                {(['tier1', 'tier2', 'tier3'] as const).map((key, i) => {
                  const tier = pricingTiers[key];
                  return (
                    <View key={key} style={styles.tierCard}>
                      <TouchableOpacity
                        style={styles.tierHeader}
                        onPress={() => setPricingTiers(prev => ({ ...prev, [key]: { ...prev[key], enabled: !prev[key].enabled } }))}
                        activeOpacity={0.8}
                      >
                        <View style={[styles.tierToggle, tier.enabled && styles.tierToggleOn]}>
                          <Text style={[styles.tierToggleText, tier.enabled && styles.tierToggleTextOn]}>
                            {tier.enabled ? 'On' : 'Off'}
                          </Text>
                        </View>
                        <Text style={styles.tierDefaultName}>Tier {i + 1} — {DEFAULT_PRICING_TIERS[key].name}</Text>
                      </TouchableOpacity>
                      {tier.enabled && (
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
                            placeholder="Description (optional)"
                            placeholderTextColor={Polish.colors.textMuted}
                            multiline
                            numberOfLines={2}
                          />
                        </View>
                      )}
                    </View>
                  );
                })}
              </>
            ) : (
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="e.g. Starting at $45 for basic gel, $65 for full set"
                placeholderTextColor={Polish.colors.textMuted}
                value={pricingDescription}
                onChangeText={setPricingDescription}
                multiline
                numberOfLines={3}
              />
            )}
            {errors.pricing ? <Text style={styles.errorText}>{errors.pricing}</Text> : null}

            {/* Removal add-on */}
            <Text style={[styles.label, { marginTop: Polish.spacing.md }]}>Add-ons</Text>
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.optionHint}>Gel Removal Add-on</Text>
              </View>
              <Switch
                value={removalAddOnEnabled}
                onValueChange={setRemovalAddOnEnabled}
                trackColor={{ false: Polish.colors.border, true: Polish.colors.primary }}
                thumbColor="#fff"
              />
            </View>
            {removalAddOnEnabled && (
              <View style={styles.priceRow}>
                <Text style={styles.optionHint}>Removal price</Text>
                <View style={styles.priceInputWrapper}>
                  <Text style={styles.dollarSign}>$</Text>
                  <TextInput
                    style={styles.priceInput}
                    value={removalAddOnPrice}
                    onChangeText={setRemovalAddOnPrice}
                    keyboardType="decimal-pad"
                    placeholder="15"
                    placeholderTextColor={Polish.colors.textMuted}
                  />
                </View>
              </View>
            )}

            {/* Payment methods */}
            <Text style={[styles.label, { marginTop: Polish.spacing.md }]}>Payment Methods</Text>
            <View style={styles.chipRow}>
              {(PAYMENT_METHOD_OPTIONS as readonly string[]).map((method) => (
                <TouchableOpacity
                  key={method}
                  style={[styles.chip, selectedPaymentMethods.includes(method) && styles.chipSelected]}
                  onPress={() => setSelectedPaymentMethods(prev =>
                    prev.includes(method) ? prev.filter(m => m !== method) : [...prev, method]
                  )}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.chipText, selectedPaymentMethods.includes(method) && styles.chipTextSelected]}>{method}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {errors.payment ? <Text style={styles.errorText}>{errors.payment}</Text> : null}

            {/* Booking limit */}
            <Text style={[styles.label, { marginTop: Polish.spacing.md }]}>Weekly Booking Limit</Text>
            <Text style={styles.optionHint}>Max appointments per week. 0 = unlimited.</Text>
            <View style={styles.stepperRow}>
              <TouchableOpacity style={styles.stepperButton} onPress={() => setMaxApptPerWeek(Math.max(0, maxApptPerWeek - 1))} activeOpacity={0.8}>
                <Text style={styles.stepperButtonText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.stepperValue}>{maxApptPerWeek === 0 ? 'Unlimited' : maxApptPerWeek}</Text>
              <TouchableOpacity style={styles.stepperButton} onPress={() => setMaxApptPerWeek(maxApptPerWeek + 1)} activeOpacity={0.8}>
                <Text style={styles.stepperButtonText}>+</Text>
              </TouchableOpacity>
            </View>

            {/* Policies */}
            <Text style={[styles.label, { marginTop: Polish.spacing.xl }]}>Policies (Optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Reschedule policy, e.g. 24 hours notice required"
              placeholderTextColor={Polish.colors.textMuted}
              value={reschedulePolicy}
              onChangeText={setReschedulePolicy}
              multiline
              numberOfLines={2}
            />
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Late policy, e.g. 10+ min late may require rescheduling"
              placeholderTextColor={Polish.colors.textMuted}
              value={latePolicy}
              onChangeText={setLatePolicy}
              multiline
              numberOfLines={2}
            />
          </View>
        )}
      </ScrollView>

      {/* Sticky bottom button */}
      <View style={styles.bottomNav}>
        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={isLastStep ? handleSubmit : handleNext}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.buttonText}>{isLastStep ? 'Complete Setup' : 'Next'}</Text>
          }
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Polish.colors.background },
  scrollView: { flex: 1 },
  content: { padding: Polish.spacing.xl, paddingTop: Polish.spacing.lg, paddingBottom: 40 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Polish.spacing.xl,
    paddingTop: 56,
    paddingBottom: Polish.spacing.lg,
  },
  backBtn: { width: 36 },
  progressDots: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Polish.colors.borderLight,
  },
  dotDone: { backgroundColor: Polish.colors.primary, opacity: 0.4 },
  dotActive: { width: 20, backgroundColor: Polish.colors.primary },
  title: { ...Polish.typography.title, marginBottom: Polish.spacing.sm, color: Polish.colors.text },
  subtitle: { ...Polish.typography.body, color: Polish.colors.textSecondary, marginBottom: Polish.spacing.xxxl, lineHeight: 22 },
  section: { marginBottom: Polish.spacing.xl },
  input: {
    borderWidth: 1,
    borderColor: Polish.colors.border,
    borderRadius: Polish.radius.md,
    padding: Polish.spacing.lg,
    ...Polish.typography.body,
    marginBottom: Polish.spacing.lg,
    backgroundColor: Polish.colors.surface,
  },
  inputError: { borderColor: '#e53935' },
  errorText: { ...Polish.typography.caption, color: '#e53935', marginTop: -Polish.spacing.md, marginBottom: Polish.spacing.lg },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  label: { ...Polish.typography.bodyMedium, marginBottom: Polish.spacing.md, color: Polish.colors.text },
  optionHint: { ...Polish.typography.caption, color: Polish.colors.textMuted, marginBottom: Polish.spacing.md },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: Polish.spacing.lg, gap: Polish.spacing.sm },
  chip: {
    paddingHorizontal: Polish.spacing.md,
    paddingVertical: Polish.spacing.sm,
    borderRadius: Polish.radius.xl,
    borderWidth: 1,
    borderColor: Polish.colors.border,
    backgroundColor: Polish.colors.surface,
  },
  chipSelected: { backgroundColor: Polish.colors.primary, borderColor: Polish.colors.primary },
  chipText: { ...Polish.typography.caption, color: Polish.colors.textSecondary, fontWeight: '500' },
  chipTextSelected: { color: '#fff' },
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
  dayCircleActive: { backgroundColor: Polish.colors.primary, borderColor: Polish.colors.primary },
  dayCircleText: { ...Polish.typography.caption, fontWeight: '700', color: Polish.colors.textMuted },
  dayCircleTextActive: { color: '#fff' },
  scheduleBlockRow: { flexDirection: 'row', alignItems: 'center', gap: Polish.spacing.sm, marginBottom: 4 },
  scheduleTimeBtn: {
    paddingHorizontal: Polish.spacing.md,
    paddingVertical: 6,
    borderRadius: Polish.radius.md,
    borderWidth: 1,
    borderColor: Polish.colors.border,
    backgroundColor: Polish.colors.background,
  },
  scheduleTimeText: { ...Polish.typography.caption, color: Polish.colors.text, fontWeight: '500' },
  scheduleDash: { ...Polish.typography.caption, color: Polish.colors.textMuted },
  scheduleRemoveBtn: { padding: 4 },
  scheduleUnavailableText: { ...Polish.typography.caption, color: Polish.colors.textMuted, paddingVertical: 6 },
  scheduleAddBtn: { padding: 4, marginTop: 2 },
  roleButton: {
    borderWidth: 2,
    borderColor: Polish.colors.border,
    borderRadius: Polish.radius.md,
    padding: Polish.spacing.xl,
    marginBottom: Polish.spacing.lg,
    backgroundColor: Polish.colors.surface,
  },
  roleButtonSelected: { borderColor: Polish.colors.primary, backgroundColor: Polish.colors.accent + '30' },
  roleButtonText: { fontSize: 20, fontWeight: '600', marginBottom: 8, color: Polish.colors.textSecondary },
  roleButtonTextSelected: { color: Polish.colors.text },
  roleDescription: { ...Polish.typography.caption, color: Polish.colors.textSecondary },
  button: {
    backgroundColor: Polish.colors.primary,
    borderRadius: Polish.radius.md,
    padding: Polish.spacing.lg,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { ...Polish.typography.button, color: '#fff' },
  bottomNav: {
    paddingHorizontal: Polish.spacing.xl,
    paddingBottom: 36,
    paddingTop: Polish.spacing.md,
    backgroundColor: Polish.colors.background,
    borderTopWidth: 1,
    borderTopColor: Polish.colors.borderLight,
  },
  portfolioGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Polish.spacing.sm, marginBottom: Polish.spacing.lg },
  portfolioThumbWrap: { position: 'relative' },
  portfolioThumb: { width: 100, height: 100, borderRadius: Polish.radius.md, backgroundColor: Polish.colors.surface },
  portfolioRemoveOverlay: { position: 'absolute', top: 4, right: 4 },
  portfolioAddBtn: { width: 100, height: 100, borderRadius: Polish.radius.md, borderWidth: 1.5, borderStyle: 'dashed', borderColor: Polish.colors.primary, alignItems: 'center', justifyContent: 'center', backgroundColor: Polish.colors.surface },
  portfolioCoverBadge: { position: 'absolute', bottom: 4, left: 4, flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: Polish.colors.primary, borderRadius: Polish.radius.sm, paddingHorizontal: 5, paddingVertical: 2 },
  portfolioCoverBadgeText: { color: '#fff', fontSize: 9, fontWeight: '700' as const },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Polish.spacing.md },
  tierCard: { borderWidth: 1, borderColor: Polish.colors.border, borderRadius: Polish.radius.md, marginBottom: Polish.spacing.md, overflow: 'hidden' },
  tierHeader: { flexDirection: 'row', alignItems: 'center', gap: Polish.spacing.md, padding: Polish.spacing.md },
  tierToggle: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Polish.radius.xl, borderWidth: 1, borderColor: Polish.colors.border, backgroundColor: Polish.colors.surface },
  tierToggleOn: { backgroundColor: Polish.colors.primary, borderColor: Polish.colors.primary },
  tierToggleText: { ...Polish.typography.caption, color: Polish.colors.textMuted, fontWeight: '600' as const },
  tierToggleTextOn: { color: '#fff' },
  tierDefaultName: { ...Polish.typography.bodyMedium, color: Polish.colors.text },
  tierFields: { padding: Polish.spacing.md, borderTopWidth: 1, borderTopColor: Polish.colors.borderLight },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Polish.spacing.md },
  priceInputWrapper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: Polish.colors.border, borderRadius: Polish.radius.md, paddingHorizontal: Polish.spacing.md, backgroundColor: Polish.colors.surface },
  dollarSign: { ...Polish.typography.body, color: Polish.colors.textMuted, marginRight: 4 },
  priceInput: { ...Polish.typography.body, color: Polish.colors.text, width: 70, paddingVertical: Polish.spacing.sm },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: Polish.spacing.lg, marginBottom: Polish.spacing.lg },
  stepperButton: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: Polish.colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: Polish.colors.surface },
  stepperButtonText: { ...Polish.typography.body, color: Polish.colors.text, fontWeight: '600' as const },
  stepperValue: { ...Polish.typography.bodyMedium, color: Polish.colors.text, minWidth: 70, textAlign: 'center' as const },
});
