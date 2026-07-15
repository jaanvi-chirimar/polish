import { Polish } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/firebase/config";
import { getThreadId } from "@/lib/threadId";
import { buildFullName, getUserName } from "@/lib/utils";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { collection, doc, getDocs, getDocFromServer, query, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import { Image } from "expo-image";
import {
  ActivityIndicator,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const SCREEN_WIDTH = Dimensions.get("window").width;
import { useSafeAreaInsets } from "react-native-safe-area-context";

function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons
          key={i}
          name={i <= Math.round(rating) ? "star" : "star-outline"}
          size={size}
          color="#F5A623"
        />
      ))}
    </View>
  );
}

export default function TechProfile() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { id, name } = useLocalSearchParams<{ id?: string; name?: string }>();
  const router = useRouter();

  const [techReviews, setTechReviews] = useState<
    Array<{ id: string; clientName: string; rating: number; comment: string; createdAt: Date }>
  >([]);
  const [avgRating, setAvgRating] = useState<number | null>(null);

  const [tech, setTech] = useState<{
    id: string;
    name?: string;
    bio?: string;
    location?: string;
    firstName?: string;
    lastName?: string;
    nailTechProfile?: {
      bio?: string;
      location?: string;
      portfolio?: string[];
      tools?: string[];
      designs?: string[];
      availabilities?: { schedule: Record<string, Array<{ start: string; end: string }>> };
      pricingTiers?: {
        tier1?: { name: string; description?: string; price: number; enabled: boolean };
        tier2?: { name: string; description?: string; price: number; enabled: boolean };
        tier3?: { name: string; description?: string; price: number; enabled: boolean };
      };
      policies?: { reschedule?: string; late?: string };
      paymentMethods?: string[];
    };
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!id) {
        setError("No ID provided");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const ref = doc(db, "users", id);
        const snap = await getDocFromServer(ref);
        if (!mounted) return;
        if (snap.exists()) {
          const data = snap.data() as any;
          const roles = data.roles || [];
          if (!roles.includes("nailTech")) {
            setError("User is not a nail tech");
            return;
          }
          const techName = buildFullName(data.firstName, data.lastName, "Unnamed Tech");
          setTech({
            id: snap.id,
            name: techName,
            firstName: data.firstName,
            lastName: data.lastName,
            bio: data.nailTechProfile?.bio,
            location: data.nailTechProfile?.location || data.location,
            nailTechProfile: data.nailTechProfile,
          });

          // Load reviews
          const reviewsSnap = await getDocs(
            query(collection(db, "reviews"), where("techId", "==", id))
          );
          if (!mounted) return;
          const sorted = reviewsSnap.docs.sort((a, b) => {
            const at = a.data().createdAt?.toDate?.()?.getTime() ?? 0;
            const bt = b.data().createdAt?.toDate?.()?.getTime() ?? 0;
            return bt - at;
          });
          const reviewsList = await Promise.all(
            sorted.slice(0, 10).map(async (d) => {
              const rd = d.data();
              return {
                id: d.id,
                clientName: await getUserName(rd.clientId, "Client"),
                rating: rd.rating as number,
                comment: (rd.comment as string) || "",
                createdAt: rd.createdAt?.toDate?.() ?? new Date(),
              };
            })
          );
          if (!mounted) return;
          setTechReviews(reviewsList);
          if (reviewsList.length > 0) {
            setAvgRating(reviewsList.reduce((s, r) => s + r.rating, 0) / reviewsList.length);
          }
        } else {
          setError("Tech not found");
        }
      } catch (e: any) {
        if (!mounted) return;
        setError(String(e));
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, [id]);

  const techName = name ?? tech?.name ?? (id ? `Tech ${id}` : "Unknown Tech");
  const isOwnProfile = user?.uid === id;

  function handleEditPress() {
    if (isOwnProfile) {
      router.push("/(tabs)/profile" as any);
    }
  }

  function handleBookPress() {
    if (!id) return;
    const query = tech?.name ?? name ? `?name=${encodeURIComponent(tech?.name ?? name ?? "")}` : "";
    router.push(`/book/${encodeURIComponent(id)}${query}` as any);
  }

  function handleMessagePress() {
    if (!id || !user?.uid) return;
    const threadId = getThreadId(user.uid, id);
    router.push(`/(tabs)/inbox/chat/${threadId}` as any);
  }

  const topPadding = insets.top + 24;

  return (
    <View style={[styles.container, { paddingTop: topPadding }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color={Polish.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        {isOwnProfile ? (
          <TouchableOpacity
            onPress={handleEditPress}
            style={styles.editButton}
            activeOpacity={0.7}
          >
            <Text style={styles.editButtonText}>Edit</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Polish.colors.primary} />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={48} color={Polish.colors.error} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <Text style={styles.title}>{techName}</Text>
            {avgRating !== null && (
              <View style={styles.ratingRow}>
                <Stars rating={avgRating} size={16} />
                <Text style={styles.ratingText}>
                  {avgRating.toFixed(1)} ({techReviews.length} review{techReviews.length !== 1 ? "s" : ""})
                </Text>
              </View>
            )}
          </View>

          {tech?.nailTechProfile?.portfolio && tech.nailTechProfile.portfolio.length > 0 && (
            <View style={styles.portfolioSection}>
              <Text style={styles.label}>Portfolio</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.portfolioScroll}>
                {tech.nailTechProfile.portfolio.map((url, idx) => (
                  <Image
                    key={idx}
                    source={{ uri: url }}
                    style={[styles.portfolioPhoto, { width: SCREEN_WIDTH * 0.55 }]}
                    contentFit="cover"
                  />
                ))}
              </ScrollView>
            </View>
          )}

          <View style={styles.section}>
            {tech?.location ? (
              <View style={styles.row}>
                <Ionicons name="location-outline" size={20} color={Polish.colors.textSecondary} />
                <Text style={styles.bodyText}>{tech.location}</Text>
              </View>
            ) : null}
            {tech?.bio ? (
              <View style={styles.bioRow}>
                <Text style={styles.label}>About</Text>
                <Text style={styles.bodyText}>{tech.bio}</Text>
              </View>
            ) : null}
            <View style={styles.availRow}>
              <Text style={styles.label}>Tools / Techniques</Text>
              {tech?.nailTechProfile?.tools?.length ? (
                <Text style={styles.bodyText}>{tech.nailTechProfile.tools.join(", ")}</Text>
              ) : (
                <Text style={styles.mutedText}>Not specified</Text>
              )}
            </View>
            <View style={styles.availRow}>
              <Text style={styles.label}>Designs</Text>
              {tech?.nailTechProfile?.designs?.length ? (
                <Text style={styles.bodyText}>{tech.nailTechProfile.designs.join(", ")}</Text>
              ) : (
                <Text style={styles.mutedText}>Not specified</Text>
              )}
            </View>
            {(() => {
              const schedule = tech?.nailTechProfile?.availabilities?.schedule;
              if (!schedule || Object.keys(schedule).length === 0) return null;
              const summary = Object.entries(schedule).map(([day, blocks]) => {
                const times = blocks.map(b => {
                  const fmt = (hhmm: string) => {
                    const [h, m] = hhmm.split(':').map(Number);
                    const period = h >= 12 ? 'PM' : 'AM';
                    const hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
                    return m === 0 ? `${hour} ${period}` : `${hour}:${m.toString().padStart(2,'0')} ${period}`;
                  };
                  return `${fmt(b.start)}–${fmt(b.end)}`;
                }).join(', ');
                return `${day.slice(0, 3)} ${times}`;
              }).join(' · ');
              return (
                <View style={styles.availRow}>
                  <Text style={styles.label}>Available</Text>
                  <Text style={styles.bodyText}>{summary}</Text>
                </View>
              );
            })()}
          </View>

          {/* Pricing */}
          {(() => {
            const tiers = tech?.nailTechProfile?.pricingTiers;
            const tierEntries = [
              { key: 'tier1', label: 'Tier 1 — Solid Color', tier: tiers?.tier1 },
              { key: 'tier2', label: 'Tier 2 — Minimal', tier: tiers?.tier2 },
              { key: 'tier3', label: 'Tier 3 — Full Design', tier: tiers?.tier3 },
            ].filter(e => e.tier?.enabled);
            if (!tierEntries.length) return null;
            return (
              <View style={styles.section}>
                <Text style={styles.label}>Pricing Tiers</Text>
                {tierEntries.map(({ key, label, tier }) => (
                  <View key={key} style={styles.pricingRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pricingTierName}>{label}</Text>
                      {tier!.description ? (
                        <Text style={styles.mutedText}>{tier!.description}</Text>
                      ) : null}
                    </View>
                    {tier!.price > 0 ? (
                      <Text style={styles.pricingAmount}>${tier!.price}</Text>
                    ) : null}
                  </View>
                ))}
              </View>
            );
          })()}

          {/* Payment Methods */}
          {tech?.nailTechProfile?.paymentMethods?.length ? (
            <View style={styles.section}>
              <Text style={styles.label}>Accepted Payment</Text>
              <View style={styles.dayChips}>
                {tech.nailTechProfile.paymentMethods.map((m) => (
                  <View key={m} style={styles.dayChip}>
                    <Text style={styles.dayChipText}>{m}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {/* Policies */}
          {(tech?.nailTechProfile?.policies?.reschedule || tech?.nailTechProfile?.policies?.late) ? (
            <View style={styles.section}>
              <Text style={styles.label}>Policies</Text>
              {tech.nailTechProfile!.policies!.reschedule ? (
                <View style={styles.policyBlock}>
                  <Text style={styles.policyLabel}>Reschedule</Text>
                  <Text style={styles.bodyText}>{tech.nailTechProfile!.policies!.reschedule}</Text>
                </View>
              ) : null}
              {tech.nailTechProfile!.policies!.late ? (
                <View style={styles.policyBlock}>
                  <Text style={styles.policyLabel}>Late</Text>
                  <Text style={styles.bodyText}>{tech.nailTechProfile!.policies!.late}</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.label}>Reviews</Text>
            {techReviews.length > 0 ? techReviews.map((r) => (
              <View key={r.id} style={styles.reviewCard}>
                <View style={styles.reviewHeader}>
                  <Text style={styles.reviewAuthor}>{r.clientName}</Text>
                  <Stars rating={r.rating} size={13} />
                </View>
                {r.comment ? <Text style={styles.reviewComment}>{r.comment}</Text> : null}
              </View>
            )) : (
              <Text style={styles.reviewComment}>No reviews yet.</Text>
            )}
          </View>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.button, styles.buttonPrimary]}
              onPress={handleBookPress}
              activeOpacity={0.85}
            >
              <Ionicons name="calendar-outline" size={20} color="#fff" />
              <Text style={styles.buttonText}>Book</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.buttonSecondary]}
              onPress={handleMessagePress}
              activeOpacity={0.85}
              disabled={!user?.uid}
            >
              <Ionicons name="chatbubble-outline" size={20} color={Polish.colors.primary} />
              <Text style={[styles.buttonText, styles.buttonTextSecondary]}>Message</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Polish.colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Polish.spacing.lg,
    paddingHorizontal: Polish.spacing.sm,
  },
  backButton: {
    padding: Polish.spacing.sm,
    marginRight: Polish.spacing.sm,
  },
  headerTitle: {
    ...Polish.typography.title,
    color: Polish.colors.text,
    flex: 1,
    textAlign: "center",
  },
  headerSpacer: { width: 44 },
  editButton: { padding: Polish.spacing.sm },
  editButtonText: {
    ...Polish.typography.button,
    color: Polish.colors.primary,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Polish.spacing.xxl,
  },
  loadingText: {
    ...Polish.typography.body,
    color: Polish.colors.textSecondary,
    marginTop: Polish.spacing.lg,
  },
  errorText: {
    ...Polish.typography.body,
    color: Polish.colors.error,
    marginTop: Polish.spacing.lg,
    textAlign: "center",
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Polish.spacing.xl,
    paddingTop: Polish.spacing.xl,
    paddingBottom: Polish.spacing.xxxl,
  },
  hero: {
    alignItems: "center",
    marginBottom: Polish.spacing.xxl,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
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
    backgroundColor: Polish.colors.surface,
    borderRadius: Polish.radius.lg,
    padding: Polish.spacing.xl,
    marginBottom: Polish.spacing.xxl,
    borderWidth: 1,
    borderColor: Polish.colors.borderLight,
    ...Polish.shadowSm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Polish.spacing.md,
    marginBottom: Polish.spacing.md,
  },
  bioRow: { marginBottom: Polish.spacing.lg },
  availRow: { marginTop: Polish.spacing.sm },
  label: {
    ...Polish.typography.label,
    color: Polish.colors.textSecondary,
    marginBottom: Polish.spacing.sm,
  },
  bodyText: {
    ...Polish.typography.body,
    color: Polish.colors.text,
    lineHeight: 22,
  },
  mutedText: {
    ...Polish.typography.body,
    color: Polish.colors.textMuted,
    lineHeight: 22,
  },
  dayChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Polish.spacing.sm,
  },
  dayChip: {
    paddingHorizontal: Polish.spacing.md,
    paddingVertical: Polish.spacing.sm,
    borderRadius: Polish.radius.full,
    backgroundColor: Polish.colors.accent + "40",
  },
  dayChipText: {
    ...Polish.typography.caption,
    fontWeight: "600",
    color: Polish.colors.text,
  },
  buttonRow: {
    flexDirection: "row",
    gap: Polish.spacing.md,
    marginBottom: Polish.spacing.lg,
  },
  button: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Polish.spacing.sm,
    paddingVertical: Polish.spacing.lg,
    paddingHorizontal: Polish.spacing.lg,
    borderRadius: Polish.radius.lg,
    ...Polish.shadow,
  },
  buttonPrimary: { backgroundColor: Polish.colors.primary },
  buttonSecondary: {
    backgroundColor: Polish.colors.surface,
    borderWidth: 2,
    borderColor: Polish.colors.primary,
  },
  buttonText: {
    ...Polish.typography.button,
    color: "#fff",
  },
  buttonTextSecondary: { color: Polish.colors.primary },
  pricingRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: Polish.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Polish.colors.borderLight,
  },
  pricingTierName: {
    ...Polish.typography.bodyMedium,
    color: Polish.colors.text,
    marginBottom: 2,
  },
  pricingAmount: {
    ...Polish.typography.bodyMedium,
    color: Polish.colors.primary,
    fontWeight: "700",
  },
  policyBlock: {
    marginBottom: Polish.spacing.md,
  },
  policyLabel: {
    ...Polish.typography.caption,
    color: Polish.colors.textMuted,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Polish.spacing.sm,
    marginTop: Polish.spacing.sm,
  },
  ratingText: {
    ...Polish.typography.caption,
    color: Polish.colors.textSecondary,
    fontWeight: "600",
  },
  reviewCard: {
    paddingVertical: Polish.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Polish.colors.borderLight,
  },
  reviewHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  reviewAuthor: {
    ...Polish.typography.caption,
    color: Polish.colors.text,
    fontWeight: "600",
  },
  reviewComment: {
    ...Polish.typography.caption,
    color: Polish.colors.textSecondary,
    lineHeight: 18,
  },
  portfolioSection: {
    paddingHorizontal: Polish.spacing.xl,
    marginBottom: Polish.spacing.lg,
  },
  portfolioScroll: {
    marginTop: Polish.spacing.sm,
  },
  portfolioPhoto: {
    height: 200,
    borderRadius: Polish.radius.md,
    marginRight: Polish.spacing.sm,
    backgroundColor: Polish.colors.surface,
  },
});
