import { APPOINTMENT_TYPES } from "@/constants/nailTechOptions";
import { Polish } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/firebase/config";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  getDocFromServer,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  Alert,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type PricingTier = { name: string; description?: string; price: number; enabled: boolean };

export default function BookScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { id, name } = useLocalSearchParams<{ id?: string; name?: string }>();
  const router = useRouter();

  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [techName, setTechName] = useState<string | null>(name ?? null);
  const [techTools, setTechTools] = useState<string[]>([]);
  const [techDesigns, setTechDesigns] = useState<string[]>([]);
  const [techPricingTiers, setTechPricingTiers] = useState<PricingTier[]>([]);
  const [techReschedulePolicy, setTechReschedulePolicy] = useState("");
  const [techLatePolicy, setTechLatePolicy] = useState("");
  const [techMaxPerWeek, setTechMaxPerWeek] = useState(0);
  const [dateTime, setDateTime] = useState<Date | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<"date" | "time">("date");
  const [submitting, setSubmitting] = useState(false);
  const [appointmentType, setAppointmentType] = useState<string>("");
  const [selectedTierKey, setSelectedTierKey] = useState<string>("");

  useEffect(() => {
    let mounted = true;

    async function loadTech() {
      if (!id) {
        setTechName(name ?? null);
        return;
      }
      if (name) setTechName(name);
      try {
        const snap = await getDocFromServer(doc(db, "users", id));
        if (!mounted) return;
        if (snap.exists()) {
          const data = snap.data() as Record<string, unknown>;
          const firstName = (data.firstName as string) || "";
          const lastName = (data.lastName as string) || "";
          setTechName(
            firstName && lastName
              ? `${firstName} ${lastName}`.trim()
              : firstName || lastName || `Tech ${id}`
          );
          const np = data.nailTechProfile as Record<string, unknown> | undefined;
          if (np) {
            setTechTools(Array.isArray(np.tools) ? (np.tools as string[]) : []);
            setTechDesigns(Array.isArray(np.designs) ? (np.designs as string[]) : []);
            // Pricing tiers
            const pt = np.pricingTiers as Record<string, PricingTier> | undefined;
            if (pt) {
              const enabled = (['tier1', 'tier2', 'tier3'] as const)
                .map(k => pt[k])
                .filter((t): t is PricingTier => !!t?.enabled);
              setTechPricingTiers(enabled);
            }
            // Policies
            const pol = np.policies as { reschedule?: string; late?: string } | undefined;
            setTechReschedulePolicy(pol?.reschedule ?? '');
            setTechLatePolicy(pol?.late ?? '');
            // Weekly limit
            setTechMaxPerWeek((np.maxAppointmentsPerWeek as number) || 0);
          }
        } else {
          setTechName(`Tech ${id}`);
        }
      } catch {
        if (!mounted) return;
        setTechName(`Tech ${id}`);
      }
    }

    loadTech();
    return () => { mounted = false; };
  }, [id, name]);

  function showPickerModeLocal(mode: "date" | "time") {
    setPickerMode(mode);
    setShowPicker(true);
  }

  function onPickerChange(_event: any, selected?: Date) {
    setShowPicker(Platform.OS === "ios");
    if (!selected) return;
    if (!dateTime) { setDateTime(selected); return; }
    const next = new Date(dateTime);
    if (pickerMode === "date") {
      next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
    } else {
      next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
    }
    setDateTime(next);
  }

  async function handleConfirm() {
    if (!id) { Alert.alert("Error", "No nail tech selected."); return; }
    if (!appointmentType) { Alert.alert("Select service", "Please choose an appointment type."); return; }
    if (!dateTime) { Alert.alert("Select time", "Please choose a date and time first."); return; }
    if (!user?.uid) { Alert.alert("Sign in required", "Please sign in to book."); return; }

    try {
      setSubmitting(true);

      // Weekly limit check
      if (techMaxPerWeek > 0) {
        const now = new Date();
        const day = now.getDay();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
        startOfWeek.setHours(0, 0, 0, 0);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);

        const q = query(
          collection(db, "appointments"),
          where("techId", "==", id),
          where("dateTime", ">=", Timestamp.fromDate(startOfWeek)),
          where("dateTime", "<=", Timestamp.fromDate(endOfWeek))
        );
        const snap = await getDocs(q);
        const activeCount = snap.docs.filter(d => d.data().status !== "declined").length;

        if (activeCount >= techMaxPerWeek) {
          const nextWeek = new Date(startOfWeek);
          nextWeek.setDate(startOfWeek.getDate() + 7);
          Alert.alert(
            "Fully booked this week",
            `${techName ?? "This tech"} is fully booked for this week. Try booking for the week of ${nextWeek.toLocaleDateString(undefined, { month: "short", day: "numeric" })}.`
          );
          return;
        }
      }

      await addDoc(collection(db, "appointments"), {
        techId: id,
        clientId: user.uid,
        dateTime: Timestamp.fromDate(dateTime),
        note: note.trim(),
        status: "pending",
        appointmentType,
        ...(selectedTierKey ? { pricingTier: selectedTierKey } : {}),
        createdAt: Timestamp.now(),
      });

      setConfirmed(true);
      setNote("");
      setDateTime(null);
      setAppointmentType("");
      setSelectedTierKey("");
      setShowPicker(false);
      setTimeout(() => router.back(), 800);
    } catch (err) {
      console.error("Error creating appointment:", err);
      Alert.alert("Booking failed", "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const topPadding = insets.top + 24;
  const hasPolicies = techReschedulePolicy || techLatePolicy;

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

        {(techTools.length > 0 || techDesigns.length > 0) && (
          <View style={styles.section}>
            {techTools.length > 0 && (
              <>
                <Text style={styles.label}>Tools / Techniques</Text>
                <Text style={styles.techTags}>{techTools.join(" · ")}</Text>
              </>
            )}
            {techDesigns.length > 0 && (
              <>
                <Text style={[styles.label, techTools.length > 0 && { marginTop: Polish.spacing.lg }]}>Designs</Text>
                <Text style={styles.techTags}>{techDesigns.join(" · ")}</Text>
              </>
            )}
          </View>
        )}

        {/* Appointment Type */}
        <View style={styles.section}>
          <Text style={styles.label}>Service type</Text>
          <View style={styles.typeRow}>
            {(APPOINTMENT_TYPES as readonly string[]).map((type) => (
              <TouchableOpacity
                key={type}
                style={[styles.typeButton, appointmentType === type && styles.typeButtonSelected]}
                onPress={() => setAppointmentType(type)}
                activeOpacity={0.8}
              >
                <Text style={[styles.typeButtonText, appointmentType === type && styles.typeButtonTextSelected]}>
                  {type}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Pricing Tiers */}
        {techPricingTiers.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.label}>Select a tier</Text>
            {techPricingTiers.map((tier, i) => {
              const key = `tier${i + 1}`;
              return (
                <TouchableOpacity
                  key={key}
                  style={[styles.tierOption, selectedTierKey === key && styles.tierOptionSelected]}
                  onPress={() => setSelectedTierKey(selectedTierKey === key ? "" : key)}
                  activeOpacity={0.8}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.tierName, selectedTierKey === key && styles.tierNameSelected]}>
                      {tier.name}
                    </Text>
                    {tier.description ? (
                      <Text style={styles.tierDesc}>{tier.description}</Text>
                    ) : null}
                  </View>
                  <Text style={[styles.tierPrice, selectedTierKey === key && styles.tierPriceSelected]}>
                    ${tier.price}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Date & Time */}
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
          {showPicker && Platform.OS !== "web" && typeof DateTimePicker !== "undefined" ? (
            <DateTimePicker
              value={dateTime ?? new Date()}
              mode={pickerMode}
              is24Hour={false}
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={onPickerChange}
            />
          ) : null}
        </View>

        {/* Notes */}
        <View style={styles.section}>
          <Text style={styles.label}>Notes (optional)</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Design, color, inspo, etc."
            placeholderTextColor={Polish.colors.textMuted}
            onFocus={() => setShowPicker(false)}
            onSubmitEditing={() => Keyboard.dismiss()}
            submitBehavior="blurAndSubmit"
            style={styles.textArea}
            multiline
          />
        </View>

        {/* Policies */}
        {hasPolicies ? (
          <View style={styles.policiesBox}>
            <Text style={styles.policiesTitle}>Policies</Text>
            {techReschedulePolicy ? (
              <View style={styles.policyItem}>
                <Text style={styles.policyLabel}>Reschedule</Text>
                <Text style={styles.policyText}>{techReschedulePolicy}</Text>
              </View>
            ) : null}
            {techLatePolicy ? (
              <View style={styles.policyItem}>
                <Text style={styles.policyLabel}>Late</Text>
                <Text style={styles.policyText}>{techLatePolicy}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

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
  container: { flex: 1, backgroundColor: Polish.colors.background },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Polish.spacing.xl,
    paddingTop: Polish.spacing.xl,
    paddingBottom: Polish.spacing.xxxl,
  },
  header: { alignItems: "center", marginBottom: Polish.spacing.xxl },
  headerIcon: {
    width: 56,
    height: 56,
    borderRadius: Polish.radius.lg,
    backgroundColor: Polish.colors.accent + "50",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Polish.spacing.lg,
  },
  title: { ...Polish.typography.title, color: Polish.colors.text, textAlign: "center" },
  section: { marginBottom: Polish.spacing.xxl },
  label: { ...Polish.typography.label, color: Polish.colors.text, marginBottom: Polish.spacing.md },
  typeRow: { flexDirection: "row", flexWrap: "wrap", gap: Polish.spacing.sm },
  typeButton: {
    paddingHorizontal: Polish.spacing.md,
    paddingVertical: Polish.spacing.sm,
    borderRadius: Polish.radius.xl,
    borderWidth: 1,
    borderColor: Polish.colors.border,
    backgroundColor: Polish.colors.surface,
  },
  typeButtonSelected: {
    backgroundColor: Polish.colors.primary,
    borderColor: Polish.colors.primary,
  },
  typeButtonText: {
    ...Polish.typography.caption,
    color: Polish.colors.textSecondary,
    fontWeight: "600",
  },
  typeButtonTextSelected: { color: "#fff" },
  tierOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: Polish.spacing.lg,
    borderRadius: Polish.radius.md,
    borderWidth: 1,
    borderColor: Polish.colors.border,
    backgroundColor: Polish.colors.surface,
    marginBottom: Polish.spacing.sm,
  },
  tierOptionSelected: {
    borderColor: Polish.colors.primary,
    borderWidth: 2,
    backgroundColor: Polish.colors.primary + "08",
  },
  tierName: { ...Polish.typography.bodyMedium, color: Polish.colors.text },
  tierNameSelected: { color: Polish.colors.primary },
  tierDesc: { ...Polish.typography.caption, color: Polish.colors.textMuted, marginTop: 2 },
  tierPrice: { ...Polish.typography.bodyMedium, color: Polish.colors.textSecondary, fontWeight: "700" },
  tierPriceSelected: { color: Polish.colors.primary },
  dateTimeRow: { flexDirection: "row", gap: Polish.spacing.md },
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
  dateTimeText: { ...Polish.typography.body, color: Polish.colors.text },
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
  policiesBox: {
    backgroundColor: Polish.colors.surface,
    borderRadius: Polish.radius.md,
    padding: Polish.spacing.lg,
    borderWidth: 1,
    borderColor: Polish.colors.borderLight,
    marginBottom: Polish.spacing.xxl,
  },
  policiesTitle: {
    ...Polish.typography.caption,
    color: Polish.colors.textMuted,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: Polish.spacing.md,
  },
  policyItem: { marginBottom: Polish.spacing.sm },
  policyLabel: {
    ...Polish.typography.caption,
    color: Polish.colors.textSecondary,
    fontWeight: "600",
    marginBottom: 2,
  },
  policyText: { ...Polish.typography.caption, color: Polish.colors.text, lineHeight: 18 },
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
  buttonDisabled: { opacity: 0.7 },
  buttonText: { ...Polish.typography.button, color: "#fff" },
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
  confirmText: { ...Polish.typography.bodyMedium, color: Polish.colors.success },
  techTags: { ...Polish.typography.body, color: Polish.colors.textSecondary, lineHeight: 22 },
});
