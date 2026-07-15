import { APPOINTMENT_TYPES } from "@/constants/nailTechOptions";
import { Polish } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/firebase/config";
import { Ionicons } from "@expo/vector-icons";
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
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type PricingTier = { name: string; description?: string; price: number; enabled: boolean };
type TimeBlock = { start: string; end: string };

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour}:${m.toString().padStart(2, '0')} ${period}`;
}

function generateSlots(blocks: TimeBlock[]): string[] {
  const slots: string[] = [];
  for (const block of blocks) {
    const [sh, sm] = block.start.split(':').map(Number);
    const [eh, em] = block.end.split(':').map(Number);
    let cur = sh * 60 + sm;
    const end = eh * 60 + em;
    while (cur < end) {
      const h = Math.floor(cur / 60);
      const m = cur % 60;
      slots.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
      cur += 30;
    }
  }
  return slots;
}

function getUpcomingDates(count: number): Date[] {
  const dates: Date[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < count; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    dates.push(d);
  }
  return dates;
}

export default function BookScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { id, name } = useLocalSearchParams<{ id?: string; name?: string }>();
  const router = useRouter();

  const [note, setNote] = useState("");
  const [altTimeRequest, setAltTimeRequest] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [techName, setTechName] = useState<string | null>(name ?? null);
  const [techTools, setTechTools] = useState<string[]>([]);
  const [techDesigns, setTechDesigns] = useState<string[]>([]);
  const [techUsePricingTiers, setTechUsePricingTiers] = useState(true);
  const [techPricingTiers, setTechPricingTiers] = useState<PricingTier[]>([]);
  const [techPricingDescription, setTechPricingDescription] = useState('');
  const [techReschedulePolicy, setTechReschedulePolicy] = useState("");
  const [techLatePolicy, setTechLatePolicy] = useState("");
  const [techMaxPerWeek, setTechMaxPerWeek] = useState(0);
  const [techRemovalAddOn, setTechRemovalAddOn] = useState<{ enabled: boolean; price: number } | null>(null);
  const [addRemoval, setAddRemoval] = useState(false);
  const [techSchedule, setTechSchedule] = useState<Record<string, TimeBlock[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [appointmentType, setAppointmentType] = useState<string>("");
  const [selectedTierKey, setSelectedTierKey] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  const upcomingDates = useMemo(() => getUpcomingDates(21), []);

  useEffect(() => {
    let mounted = true;
    async function loadTech() {
      if (!id) { setTechName(name ?? null); return; }
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
            const usesTiers = np.usePricingTiers !== false;
            setTechUsePricingTiers(usesTiers);
            setTechPricingDescription((np.pricingDescription as string) ?? '');
            const pt = np.pricingTiers as Record<string, PricingTier> | undefined;
            if (usesTiers && pt) {
              const enabled = (['tier1', 'tier2', 'tier3'] as const)
                .map(k => pt[k])
                .filter((t): t is PricingTier => !!t?.enabled);
              setTechPricingTiers(enabled);
            }
            const pol = np.policies as { reschedule?: string; late?: string } | undefined;
            setTechReschedulePolicy(pol?.reschedule ?? '');
            setTechLatePolicy(pol?.late ?? '');
            setTechMaxPerWeek((np.maxAppointmentsPerWeek as number) || 0);
            const ra = np.removalAddOn as { enabled: boolean; price: number } | undefined;
            setTechRemovalAddOn(ra?.enabled ? ra : null);
            const avail = np.availabilities as { schedule?: Record<string, TimeBlock[]> } | undefined;
            setTechSchedule(avail?.schedule ?? {});
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

  const availableSlots = useMemo(() => {
    if (!selectedDate) return [];
    const dayName = DAY_NAMES[selectedDate.getDay()];
    const blocks = techSchedule[dayName];
    if (!blocks || blocks.length === 0) return [];
    return generateSlots(blocks);
  }, [selectedDate, techSchedule]);

  function buildDateTime(date: Date, slot: string): Date {
    const [h, m] = slot.split(':').map(Number);
    const dt = new Date(date);
    dt.setHours(h, m, 0, 0);
    return dt;
  }

  async function handleConfirm() {
    if (!id) { Alert.alert("Error", "No nail tech selected."); return; }
    if (!appointmentType) { Alert.alert("Select service", "Please choose an appointment type."); return; }
    if (!selectedDate || !selectedSlot) { Alert.alert("Select time", "Please choose a date and time slot."); return; }
    if (!user?.uid) { Alert.alert("Sign in required", "Please sign in to book."); return; }

    const dateTime = buildDateTime(selectedDate, selectedSlot);

    try {
      setSubmitting(true);

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
            `${techName ?? "This tech"} is fully booked for this week. Try the week of ${nextWeek.toLocaleDateString(undefined, { month: "short", day: "numeric" })}.`
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
        ...(altTimeRequest.trim() ? { altTimeRequest: altTimeRequest.trim() } : {}),
        ...(addRemoval ? { addOns: ['removal'], removalPrice: techRemovalAddOn?.price } : {}),
        createdAt: Timestamp.now(),
      });

      setConfirmed(true);
      setNote("");
      setAltTimeRequest("");
      setSelectedDate(null);
      setSelectedSlot(null);
      setAppointmentType("");
      setSelectedTierKey("");
      setAddRemoval(false);
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
  const hasSchedule = Object.keys(techSchedule).length > 0;

  return (
    <View style={[styles.container, { paddingTop: topPadding }]}>
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.7}>
        <Ionicons name="chevron-back" size={24} color={Polish.colors.text} />
      </TouchableOpacity>
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

        {/* Pricing */}
        {techUsePricingTiers ? (
          techPricingTiers.length > 0 && (
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
                      {tier.description ? <Text style={styles.tierDesc}>{tier.description}</Text> : null}
                    </View>
                    <Text style={[styles.tierPrice, selectedTierKey === key && styles.tierPriceSelected]}>
                      ${tier.price}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )
        ) : (
          techPricingDescription ? (
            <View style={styles.section}>
              <Text style={styles.label}>Pricing</Text>
              <Text style={styles.techTags}>{techPricingDescription}</Text>
            </View>
          ) : null
        )}

        {/* Gel removal add-on */}
        {techRemovalAddOn && (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.removalRow}
              onPress={() => setAddRemoval(!addRemoval)}
              activeOpacity={0.8}
            >
              <View style={[styles.removalCheckbox, addRemoval && styles.removalCheckboxChecked]}>
                {addRemoval && <Ionicons name="checkmark" size={14} color="#fff" />}
              </View>
              <Text style={styles.removalLabel}>Add gel removal</Text>
              <Text style={styles.removalPrice}>+${techRemovalAddOn.price}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Date & Time */}
        <View style={styles.section}>
          <Text style={styles.label}>Select a date</Text>
          {!hasSchedule ? (
            <Text style={styles.noScheduleText}>This tech hasn't set their availability yet.</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dateScroll}>
              {upcomingDates.map((date, i) => {
                const dayName = DAY_NAMES[date.getDay()];
                const available = !!techSchedule[dayName];
                const isSelected = selectedDate?.toDateString() === date.toDateString();
                const isToday = i === 0;
                return (
                  <TouchableOpacity
                    key={i}
                    style={[
                      styles.dateChip,
                      isSelected && styles.dateChipSelected,
                      !available && styles.dateChipDisabled,
                    ]}
                    onPress={() => {
                      if (!available) return;
                      setSelectedDate(date);
                      setSelectedSlot(null);
                    }}
                    activeOpacity={available ? 0.8 : 1}
                  >
                    <Text style={[
                      styles.dateChipDay,
                      isSelected && styles.dateChipTextSelected,
                      !available && styles.dateChipTextDisabled,
                    ]}>
                      {isToday ? 'Today' : dayName.slice(0, 3)}
                    </Text>
                    <Text style={[
                      styles.dateChipNum,
                      isSelected && styles.dateChipTextSelected,
                      !available && styles.dateChipTextDisabled,
                    ]}>
                      {date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {selectedDate && availableSlots.length > 0 && (
            <View style={{ marginTop: Polish.spacing.lg }}>
              <Text style={[styles.label, { marginBottom: Polish.spacing.md }]}>Select a time</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.slotRow}>
                  {availableSlots.map((slot) => (
                    <TouchableOpacity
                      key={slot}
                      style={[styles.slotChip, selectedSlot === slot && styles.slotChipSelected]}
                      onPress={() => setSelectedSlot(slot)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.slotText, selectedSlot === slot && styles.slotTextSelected]}>
                        {formatTime(slot)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>
          )}
        </View>

        {/* Notes */}
        <View style={styles.section}>
          <Text style={styles.label}>Notes (optional)</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Design, color, inspo, etc."
            placeholderTextColor={Polish.colors.textMuted}
            onSubmitEditing={() => Keyboard.dismiss()}
            submitBehavior="blurAndSubmit"
            style={styles.textArea}
            multiline
          />
        </View>

        {/* Alternative time request */}
        <View style={styles.section}>
          <Text style={styles.label}>Can't find the right time?</Text>
          <TextInput
            value={altTimeRequest}
            onChangeText={setAltTimeRequest}
            placeholder="Describe when you're free (e.g. 'weekday evenings after 6pm')"
            placeholderTextColor={Polish.colors.textMuted}
            style={styles.textArea}
            multiline
            numberOfLines={2}
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
  backButton: { paddingHorizontal: Polish.spacing.lg, paddingVertical: Polish.spacing.sm, alignSelf: 'flex-start' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: Polish.spacing.xl, paddingTop: Polish.spacing.xl, paddingBottom: Polish.spacing.xxxl },
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
  typeButtonSelected: { backgroundColor: Polish.colors.primary, borderColor: Polish.colors.primary },
  typeButtonText: { ...Polish.typography.caption, color: Polish.colors.textSecondary, fontWeight: "600" },
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
  tierOptionSelected: { borderColor: Polish.colors.primary, borderWidth: 2, backgroundColor: Polish.colors.primary + "08" },
  tierName: { ...Polish.typography.bodyMedium, color: Polish.colors.text },
  tierNameSelected: { color: Polish.colors.primary },
  tierDesc: { ...Polish.typography.caption, color: Polish.colors.textMuted, marginTop: 2 },
  tierPrice: { ...Polish.typography.bodyMedium, color: Polish.colors.textSecondary, fontWeight: "700" },
  tierPriceSelected: { color: Polish.colors.primary },
  noScheduleText: { ...Polish.typography.body, color: Polish.colors.textMuted, fontStyle: 'italic' },
  dateScroll: { marginBottom: Polish.spacing.sm },
  dateChip: {
    alignItems: 'center',
    paddingHorizontal: Polish.spacing.md,
    paddingVertical: Polish.spacing.md,
    borderRadius: Polish.radius.md,
    borderWidth: 1,
    borderColor: Polish.colors.border,
    backgroundColor: Polish.colors.surface,
    marginRight: Polish.spacing.sm,
    minWidth: 64,
  },
  dateChipSelected: { backgroundColor: Polish.colors.primary, borderColor: Polish.colors.primary },
  dateChipDisabled: { backgroundColor: Polish.colors.borderLight, borderColor: Polish.colors.borderLight },
  dateChipDay: { ...Polish.typography.caption, fontWeight: '600', color: Polish.colors.text, marginBottom: 2 },
  dateChipNum: { ...Polish.typography.caption, color: Polish.colors.textSecondary },
  dateChipTextSelected: { color: '#fff' },
  dateChipTextDisabled: { color: Polish.colors.textMuted },
  slotRow: { flexDirection: 'row', gap: Polish.spacing.sm },
  slotChip: {
    paddingHorizontal: Polish.spacing.md,
    paddingVertical: Polish.spacing.sm,
    borderRadius: Polish.radius.xl,
    borderWidth: 1,
    borderColor: Polish.colors.border,
    backgroundColor: Polish.colors.surface,
  },
  slotChipSelected: { backgroundColor: Polish.colors.primary, borderColor: Polish.colors.primary },
  slotText: { ...Polish.typography.caption, color: Polish.colors.text, fontWeight: '500' },
  slotTextSelected: { color: '#fff' },
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
  policyLabel: { ...Polish.typography.caption, color: Polish.colors.textSecondary, fontWeight: "600", marginBottom: 2 },
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
  removalRow: { flexDirection: 'row', alignItems: 'center', gap: Polish.spacing.md },
  removalCheckbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: Polish.colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: Polish.colors.surface },
  removalCheckboxChecked: { backgroundColor: Polish.colors.primary, borderColor: Polish.colors.primary },
  removalLabel: { ...Polish.typography.body, color: Polish.colors.text, flex: 1 },
  removalPrice: { ...Polish.typography.bodyMedium, color: Polish.colors.primary, fontWeight: '700' },
});
