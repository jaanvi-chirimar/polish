import { Polish } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  Timestamp,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { db } from "../../../firebase/config";

export default function BookScreen() {
  const insets = useSafeAreaInsets();
  const { id, name } = useLocalSearchParams<{ id?: string; name?: string }>();
  const router = useRouter();

  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [techName, setTechName] = useState<string | null>(name ?? null);
  const [dateTime, setDateTime] = useState<Date | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<"date" | "time">("date");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadName() {
      // If the route provided a name param, prefer it and update immediately
      if (name) {
        setTechName(name);
        return;
      }

      if (!id) {
        setTechName(null);
        return;
      }

      // Clear previous name while loading new one (prevents showing stale name)
      setTechName(null);

      try {
        // Query users collection instead of tech
        const ref = doc(db, "users", id);
        const snap = await getDoc(ref);
        if (!mounted) return;
        if (snap.exists()) {
          const data = snap.data() as any;
          // Build name from firstName and lastName
          const firstName = data.firstName || "";
          const lastName = data.lastName || "";
          const techName = firstName && lastName 
            ? `${firstName} ${lastName}`.trim()
            : firstName || lastName || `Tech ${id}`;
          setTechName(techName);
        } else {
          setTechName(`Tech ${id}`);
        }
      } catch (e) {
        if (!mounted) return;
        setTechName(`Tech ${id}`);
      }
    }

    loadName();

    return () => {
      mounted = false;
    };
  }, [id, name]);

  function showPickerModeLocal(mode: "date" | "time") {
    setPickerMode(mode);
    setShowPicker(true);
  }

  function onPickerChange(event: any, selected?: Date) {
    setShowPicker(Platform.OS === "ios");
    if (!selected) return;

    if (!dateTime) {
      setDateTime(selected);
      return;
    }
    const next = new Date(dateTime);
    if (pickerMode === "date") {
      next.setFullYear(
        selected.getFullYear(),
        selected.getMonth(),
        selected.getDate()
      );
    } else {
      next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
    }
    setDateTime(next);
  }

  async function handleConfirm() {
    if (!id) {
      Alert.alert("Error", "No nail tech selected.");
      return;
    }
    if (!dateTime) {
      Alert.alert("Select time", "Please choose a date and time first.");
      return;
    }

    try {
      setSubmitting(true);

      // TODO: replace this with the real logged-in user ID from Firebase Auth
      const fakeClientId = "demo-client-123"; 

      await addDoc(collection(db, "appointments"), {
        techId: id,
        clientId: fakeClientId,
        dateTime: Timestamp.fromDate(dateTime),
        note: note.trim(),
        status: "pending",
        createdAt: Timestamp.now(),
      });

      setConfirmed(true);
      // clear the form values (so if the screen remains mounted they are reset)
      setNote("");
      setDateTime(null);
      setShowPicker(false);
      setPickerMode("date");

      // brief success pause then go back to the tech profile
      setTimeout(() => {
        router.back();
      }, 800);
    } catch (err) {
      console.error("Error creating appointment:", err);
      Alert.alert(
        "Booking failed",
        "Something went wrong while creating your appointment. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  const topPadding = insets.top + 24;

  return (
    <View style={[styles.container, { paddingTop: topPadding }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Ionicons name="calendar-outline" size={28} color={Polish.colors.primary} />
          </View>
          <Text style={styles.title}>
            Book with {techName ?? (id ? `Tech ${id}` : "Unknown")}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Preferred date & time</Text>
          <View style={styles.dateTimeRow}>
            <TouchableOpacity
              style={styles.dateTimeButton}
              onPress={() => showPickerModeLocal("date")}
              activeOpacity={0.8}
            >
              <Ionicons name="calendar-outline" size={20} color={Polish.colors.textSecondary} />
              <Text style={styles.dateTimeText}>
                {dateTime ? dateTime.toLocaleDateString() : "Select date"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.dateTimeButton}
              onPress={() => showPickerModeLocal("time")}
              activeOpacity={0.8}
            >
              <Ionicons name="time-outline" size={20} color={Polish.colors.textSecondary} />
              <Text style={styles.dateTimeText}>
                {dateTime
                  ? dateTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                  : "Select time"}
              </Text>
            </TouchableOpacity>
          </View>

          {showPicker &&
            Platform.OS !== "web" &&
            typeof DateTimePicker !== "undefined" ? (
              <DateTimePicker
                value={dateTime ?? new Date()}
                mode={pickerMode}
                is24Hour={false}
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={onPickerChange}
              />
            ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Notes (optional)</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Design, color, inspo, etc."
            placeholderTextColor={Polish.colors.textMuted}
            onFocus={() => setShowPicker(false)}
            style={styles.textArea}
            multiline
          />
        </View>

        <TouchableOpacity
          style={[styles.button, submitting && styles.buttonDisabled]}
          onPress={handleConfirm}
          disabled={submitting}
          activeOpacity={0.85}
        >
          {submitting ? (
            <Text style={styles.buttonText}>Booking...</Text>
          ) : (
            <>
              <Ionicons name="checkmark-circle-outline" size={22} color="#fff" />
              <Text style={styles.buttonText}>Confirm Booking</Text>
            </>
          )}
        </TouchableOpacity>

        {confirmed && (
          <View style={styles.confirmBanner}>
            <Ionicons name="checkmark-circle" size={24} color={Polish.colors.success} />
            <Text style={styles.confirmText}>Booking requested!</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Polish.colors.background,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Polish.spacing.xl,
    paddingTop: Polish.spacing.xl,
    paddingBottom: Polish.spacing.xxxl,
  },
  header: {
    alignItems: "center",
    marginBottom: Polish.spacing.xxl,
  },
  headerIcon: {
    width: 56,
    height: 56,
    borderRadius: Polish.radius.lg,
    backgroundColor: Polish.colors.accent + "50",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Polish.spacing.lg,
  },
  title: {
    ...Polish.typography.title,
    color: Polish.colors.text,
    textAlign: "center",
  },
  section: {
    marginBottom: Polish.spacing.xxl,
  },
  label: {
    ...Polish.typography.label,
    color: Polish.colors.text,
    marginBottom: Polish.spacing.md,
  },
  dateTimeRow: {
    flexDirection: "row",
    gap: Polish.spacing.md,
  },
  dateTimeButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Polish.spacing.sm,
    padding: Polish.spacing.lg,
    borderRadius: Polish.radius.md,
    backgroundColor: Polish.colors.surface,
    borderWidth: 1,
    borderColor: Polish.colors.border,
  },
  dateTimeText: {
    ...Polish.typography.body,
    color: Polish.colors.text,
  },
  textArea: {
    ...Polish.typography.body,
    padding: Polish.spacing.lg,
    borderRadius: Polish.radius.md,
    backgroundColor: Polish.colors.surface,
    borderWidth: 1,
    borderColor: Polish.colors.border,
    color: Polish.colors.text,
    minHeight: 96,
    textAlignVertical: "top",
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Polish.spacing.sm,
    paddingVertical: Polish.spacing.lg,
    borderRadius: Polish.radius.lg,
    backgroundColor: Polish.colors.primary,
    ...Polish.shadow,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    ...Polish.typography.button,
    color: "#fff",
  },
  confirmBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Polish.spacing.sm,
    marginTop: Polish.spacing.xl,
    padding: Polish.spacing.lg,
    borderRadius: Polish.radius.md,
    backgroundColor: Polish.colors.success + "18",
  },
  confirmText: {
    ...Polish.typography.bodyMedium,
    color: Polish.colors.success,
  },
});
