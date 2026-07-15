import {
  NAIL_TECH_DESIGNS,
  NAIL_TECH_TOOLS,
  LOCATION_OPTIONS,
} from '@/constants/nailTechOptions';
import { Polish } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/firebase/config';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { addDoc, collection, doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

export default function ApplyScreen() {
  const { user, userProfile } = useAuth();
  const [step, setStep] = useState<'form' | 'submitted'>('form');
  const [submitting, setSubmitting] = useState(false);

  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('');
  const [showOtherLocation, setShowOtherLocation] = useState(false);
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [selectedDesigns, setSelectedDesigns] = useState<string[]>([]);
  const [instagramHandle, setInstagramHandle] = useState(userProfile?.instagramHandle || '');
  const [whyApply, setWhyApply] = useState('');

  const toggleItem = (list: string[], item: string, setter: (v: string[]) => void) => {
    setter(list.includes(item) ? list.filter(i => i !== item) : [...list, item]);
  };

  const handleSubmit = async () => {
    if (!location) {
      Alert.alert('Required', 'Please select your location.');
      return;
    }
    if (!bio.trim()) {
      Alert.alert('Required', 'Please tell clients a bit about yourself.');
      return;
    }
    if (!user?.uid) return;

    // Check if already applied
    const existing = await getDoc(doc(db, 'applications', user.uid));
    if (existing.exists()) {
      const status = existing.data().status;
      if (status === 'pending') {
        Alert.alert('Already applied', 'Your application is still under review.');
        return;
      }
      if (status === 'approved') {
        Alert.alert('Already approved', 'You are already a nail tech on Polish!');
        return;
      }
    }

    setSubmitting(true);
    try {
      await addDoc(collection(db, 'applications'), {
        uid: user.uid,
        name: [userProfile?.firstName, userProfile?.lastName].filter(Boolean).join(' '),
        email: user.email,
        bio: bio.trim(),
        location,
        tools: selectedTools,
        designs: selectedDesigns,
        instagramHandle: instagramHandle.trim() || null,
        whyApply: whyApply.trim() || null,
        status: 'pending',
        createdAt: serverTimestamp(),
      });
      // Also pre-fill nailTechProfile data so it's ready when approved
      await updateDoc(doc(db, 'users', user.uid), {
        'nailTechProfile.bio': bio.trim(),
        'nailTechProfile.location': location,
        ...(selectedTools.length > 0 ? { 'nailTechProfile.tools': selectedTools } : {}),
        ...(selectedDesigns.length > 0 ? { 'nailTechProfile.designs': selectedDesigns } : {}),
        ...(instagramHandle.trim() ? { instagramHandle: instagramHandle.trim() } : {}),
      });
      setStep('submitted');
    } catch (err) {
      console.error('Application error:', err);
      Alert.alert('Error', 'Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (step === 'submitted') {
    return (
      <View style={styles.container}>
        <View style={styles.successContainer}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark-circle" size={56} color={Polish.colors.success} />
          </View>
          <Text style={styles.successTitle}>Application submitted!</Text>
          <Text style={styles.successBody}>
            We'll review your application and get back to you soon. Once approved, your profile will appear in the directory.
          </Text>
          <TouchableOpacity style={styles.doneButton} onPress={() => router.back()} activeOpacity={0.85}>
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={24} color={Polish.colors.text} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Become a Nail Tech</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.subtitle}>
          Tell us about yourself and we'll review your application within a few days.
        </Text>

        <View style={styles.section}>
          <Text style={styles.label}>Location *</Text>
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
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Bio *</Text>
          <Text style={styles.hint}>A short intro about your style, experience, and what makes you unique.</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="e.g. I'm a self-taught nail artist specializing in minimalist gel designs..."
            placeholderTextColor={Polish.colors.textMuted}
            value={bio}
            onChangeText={setBio}
            multiline
            numberOfLines={4}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Instagram (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="@yourhandle"
            placeholderTextColor={Polish.colors.textMuted}
            value={instagramHandle}
            onChangeText={(text) => {
              if (text === '' || text === '@') { setInstagramHandle(''); return; }
              setInstagramHandle(text.startsWith('@') ? text : '@' + text);
            }}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Services / Techniques</Text>
          <Text style={styles.hint}>Select all that apply.</Text>
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
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Design Styles</Text>
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

        <View style={styles.section}>
          <Text style={styles.label}>Why do you want to join? (optional)</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Anything else you'd like us to know..."
            placeholderTextColor={Polish.colors.textMuted}
            value={whyApply}
            onChangeText={setWhyApply}
            multiline
            numberOfLines={3}
          />
        </View>

        <TouchableOpacity
          style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
          activeOpacity={0.85}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>Submit Application</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Polish.colors.background },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Polish.spacing.lg,
    paddingTop: 56,
    paddingBottom: Polish.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Polish.colors.borderLight,
    backgroundColor: Polish.colors.background,
  },
  backButton: { width: 40, height: 40, justifyContent: 'center' },
  navTitle: { ...Polish.typography.subtitle, color: Polish.colors.text },
  scroll: { flex: 1 },
  content: { padding: Polish.spacing.xl, paddingBottom: 48 },
  subtitle: {
    ...Polish.typography.body,
    color: Polish.colors.textSecondary,
    marginBottom: Polish.spacing.xxl,
    lineHeight: 22,
  },
  section: { marginBottom: Polish.spacing.xxl },
  label: { ...Polish.typography.bodyMedium, color: Polish.colors.text, marginBottom: Polish.spacing.sm },
  hint: { ...Polish.typography.caption, color: Polish.colors.textMuted, marginBottom: Polish.spacing.md },
  input: {
    borderWidth: 1,
    borderColor: Polish.colors.border,
    borderRadius: Polish.radius.md,
    padding: Polish.spacing.lg,
    ...Polish.typography.body,
    backgroundColor: Polish.colors.surface,
    color: Polish.colors.text,
  },
  textArea: { minHeight: 96, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Polish.spacing.sm },
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
  submitButton: {
    backgroundColor: Polish.colors.primary,
    borderRadius: Polish.radius.lg,
    paddingVertical: Polish.spacing.lg,
    alignItems: 'center',
    ...Polish.shadow,
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { ...Polish.typography.button, color: '#fff' },
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Polish.spacing.xxxl,
  },
  successIcon: { marginBottom: Polish.spacing.xl },
  successTitle: { ...Polish.typography.title, color: Polish.colors.text, textAlign: 'center', marginBottom: Polish.spacing.lg },
  successBody: {
    ...Polish.typography.body,
    color: Polish.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Polish.spacing.xxxl,
  },
  doneButton: {
    backgroundColor: Polish.colors.primary,
    borderRadius: Polish.radius.lg,
    paddingVertical: Polish.spacing.lg,
    paddingHorizontal: Polish.spacing.xxxl,
  },
  doneButtonText: { ...Polish.typography.button, color: '#fff' },
});
