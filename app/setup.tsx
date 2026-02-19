import {
    CUSTOMER_PREFERENCES_OPTIONS,
    DESIGNS_HINT,
    DESIGNS_LABEL,
    NAIL_TECH_DESIGNS,
    NAIL_TECH_TOOLS,
    PREFERENCES_HINT,
    PREFERENCES_LABEL,
    TOOLS_HINT,
    TOOLS_LABEL,
} from '@/constants/nailTechOptions';
import { Polish } from '@/constants/theme';
import { NailTechProfile, useAuth, UserType } from '@/contexts/AuthContext';
import { db } from '@/firebase/config';
import { router } from 'expo-router';
import { doc, setDoc } from 'firebase/firestore';
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

export default function SetupScreen() {
  const { user, userProfile, setUserProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  
  // Basic info (required)
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  
  // Single location for both user and nail tech when they have both roles
  const [location, setLocation] = useState('');
  const [selectedPreferences, setSelectedPreferences] = useState<string[]>([]);
  
  // Nail tech profile (if they have nailTech role)
  const [bio, setBio] = useState('');
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [selectedDesigns, setSelectedDesigns] = useState<string[]>([]);
  const [availableDays, setAvailableDays] = useState<string[]>([]);
  
  // Role selection (if no profile exists yet)
  const [selectedRoles, setSelectedRoles] = useState<UserType[]>([]);
  
  // Get roles from profile or use selected roles
  const roles = userProfile?.roles || selectedRoles;
  const isNailTech = roles.includes('nailTech');
  const isUser = roles.includes('user');
  
  const toggleItem = (list: string[], item: string, setter: (v: string[]) => void) => {
    setter(list.includes(item) ? list.filter(i => i !== item) : [...list, item]);
  };

  const toggleRole = (role: UserType) => {
    if (selectedRoles.includes(role)) {
      setSelectedRoles(selectedRoles.filter(r => r !== role));
    } else {
      setSelectedRoles([...selectedRoles, role]);
    }
  };

  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  
  const handleSubmit = async () => {
    // Validate required fields
    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert('Required Fields', 'Please enter your first and last name');
      return;
    }
    
    // If no profile exists, require role selection
    if (!userProfile && selectedRoles.length === 0) {
      Alert.alert('Select Role', 'Please select at least one role');
      return;
    }
    
    if (isNailTech && !location.trim()) {
      Alert.alert('Required Fields', 'Please enter your location');
      return;
    }
    
    setLoading(true);
    try {
      if (!user) throw new Error('User not found');
      
      // Use roles from profile or selected roles
      const finalRoles = userProfile?.roles || selectedRoles;
      if (finalRoles.length === 0) {
        throw new Error('No roles selected');
      }
      
      // Build nail tech profile if applicable
      let nailTechProfile: NailTechProfile | undefined;
      if (isNailTech) {
        nailTechProfile = {
          location: location.trim(),
          availabilities: {
            days: availableDays,
          },
          portfolio: [], // Will be added later with image uploads
        };
        
        // Only add optional fields if they have values
        if (bio.trim()) {
          nailTechProfile.bio = bio.trim();
        }
        if (selectedTools.length > 0) {
          nailTechProfile.tools = [...selectedTools];
        }
        if (selectedDesigns.length > 0) {
          nailTechProfile.designs = [...selectedDesigns];
        }
      }
      
      // Create or update user profile in Firestore
      // Build the data object, only including defined fields (Firestore doesn't allow undefined)
      const profileData: Record<string, any> = {
        phoneNumber: user.phoneNumber,
        roles: finalRoles,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        profileCompleted: true,
        createdAt: userProfile?.createdAt || new Date(),
      };
      
      if (selectedPreferences.length > 0) {
        profileData.preferences = [...selectedPreferences];
      }
      if ((isUser || isNailTech) && location.trim()) {
        profileData.location = location.trim();
      }
      
      // Only add nail tech profile if it exists
      if (nailTechProfile) {
        profileData.nailTechProfile = nailTechProfile;
      }
      
      await setDoc(doc(db, 'users', user.uid), profileData, { merge: true });
      
      const updatedProfile = {
        uid: user.uid,
        phoneNumber: user.phoneNumber,
        roles: finalRoles,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        profileCompleted: true,
        preferences: selectedPreferences.length > 0 ? [...selectedPreferences] : undefined,
        location: location.trim() || undefined,
        nailTechProfile: nailTechProfile,
        createdAt: userProfile?.createdAt || new Date(),
      };
      
      // Update auth context
      setUserProfile(updatedProfile);
      
      // Redirect to main app
      router.replace('/(tabs)');
    } catch (error: any) {
      console.error('Setup error:', error);
      Alert.alert('Error', error.message || 'Failed to save profile');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Complete Your Profile</Text>
        <Text style={styles.subtitle}>
          {userProfile
            ? (isNailTech && isUser
                ? 'Set up your profile as both a customer and nail tech'
                : isNailTech
                ? 'Set up your nail tech profile'
                : 'Tell us a bit about yourself')
            : 'First, choose your role(s), then complete your profile'}
        </Text>
        
        {/* Role Selection (if no profile exists) */}
        {!userProfile && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Choose Your Role(s) *</Text>
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
          </View>
        )}
        
        {/* Required: Name */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Basic Information *</Text>
          <TextInput
            style={styles.input}
            placeholder="First Name *"
            value={firstName}
            onChangeText={setFirstName}
            autoCapitalize="words"
          />
          <TextInput
            style={styles.input}
            placeholder="Last Name *"
            value={lastName}
            onChangeText={setLastName}
            autoCapitalize="words"
          />
        </View>
        
        {/* Location (shared when user and/or nail tech) */}
        {(isUser || isNailTech) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Location {isNailTech ? '*' : '(Optional)'}</Text>
            <TextInput
              style={styles.input}
              placeholder="Your location"
              value={location}
              onChangeText={setLocation}
            />
          </View>
        )}

        {/* User Preferences (multiselect, optional) */}
        {isUser && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{PREFERENCES_LABEL} (Optional)</Text>
            <Text style={styles.optionHint}>{PREFERENCES_HINT}</Text>
            <View style={styles.chipRow}>
              {CUSTOMER_PREFERENCES_OPTIONS.map((pref) => (
                <TouchableOpacity
                  key={pref}
                  style={[
                    styles.chip,
                    selectedPreferences.includes(pref) && styles.chipSelected,
                  ]}
                  onPress={() => toggleItem(selectedPreferences, pref, setSelectedPreferences)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.chipText,
                      selectedPreferences.includes(pref) && styles.chipTextSelected,
                    ]}
                  >
                    {pref}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
        
        {/* Nail Tech Profile */}
        {isNailTech && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Nail Tech Profile</Text>
            
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Bio (Optional)"
              value={bio}
              onChangeText={setBio}
              multiline
              numberOfLines={3}
            />

            <Text style={styles.label}>{TOOLS_LABEL}</Text>
            <Text style={styles.optionHint}>{TOOLS_HINT}</Text>
            <View style={styles.chipRow}>
              {NAIL_TECH_TOOLS.map((tool) => (
                <TouchableOpacity
                  key={tool}
                  style={[
                    styles.chip,
                    selectedTools.includes(tool) && styles.chipSelected,
                  ]}
                  onPress={() => toggleItem(selectedTools, tool, setSelectedTools)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.chipText,
                      selectedTools.includes(tool) && styles.chipTextSelected,
                    ]}
                  >
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
                  style={[
                    styles.chip,
                    selectedDesigns.includes(design) && styles.chipSelected,
                  ]}
                  onPress={() => toggleItem(selectedDesigns, design, setSelectedDesigns)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.chipText,
                      selectedDesigns.includes(design) && styles.chipTextSelected,
                    ]}
                  >
                    {design}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            
            <Text style={styles.label}>Available Days</Text>
            <View style={styles.daysContainer}>
              {daysOfWeek.map((day) => (
                <TouchableOpacity
                  key={day}
                  style={[
                    styles.dayButton,
                    availableDays.includes(day) && styles.dayButtonSelected,
                  ]}
                  onPress={() => toggleItem(availableDays, day, setAvailableDays)}
                >
                  <Text
                    style={[
                      styles.dayButtonText,
                      availableDays.includes(day) && styles.dayButtonTextSelected,
                    ]}
                  >
                    {day.slice(0, 3)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            
            <Text style={styles.note}>
              Portfolio images can be added later from your profile
            </Text>
          </View>
        )}
        
        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Complete Setup</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Polish.colors.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Polish.spacing.xl,
    paddingTop: 80,
    paddingBottom: 40,
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
  section: {
    marginBottom: Polish.spacing.xxxl,
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
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
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
  note: {
    ...Polish.typography.caption,
    fontSize: 12,
    color: Polish.colors.textMuted,
    fontStyle: 'italic',
    marginTop: Polish.spacing.sm,
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
});
