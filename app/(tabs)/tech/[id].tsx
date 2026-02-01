import { Polish } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { doc, getDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { db } from "../../../firebase/config";

export default function TechProfile() {
  const { id, name } = useLocalSearchParams<{ id?: string; name?: string }>();
  const router = useRouter();

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
      availabilities?: {
        days: string[];
      };
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
        // Query users collection instead of tech collection
        const ref = doc(db, "users", id);
        const snap = await getDoc(ref);
        if (!mounted) return;
        if (snap.exists()) {
          const data = snap.data() as any;
          
          // Check if user has nailTech role
          const roles = data.roles || [];
          if (!roles.includes("nailTech")) {
            setError("User is not a nail tech");
            return;
          }
          
          // Build name from firstName and lastName
          const firstName = data.firstName || "";
          const lastName = data.lastName || "";
          const techName = firstName && lastName 
            ? `${firstName} ${lastName}`.trim()
            : firstName || lastName || "Unnamed Tech";
          
          setTech({ 
            id: snap.id, 
            name: techName,
            firstName: data.firstName,
            lastName: data.lastName,
            bio: data.nailTechProfile?.bio,
            location: data.nailTechProfile?.location || data.location,
            nailTechProfile: data.nailTechProfile,
          });
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
    return () => {
      mounted = false;
    };
  }, [id]);

  const techName = name ?? tech?.name ?? (id ? `Tech ${id}` : "Unknown Tech"); // prefer provided name

  function handleBookPress() {
    if (!id) return;
    // Push a full path string (including name query) to avoid param-merge issues
    const query = tech?.name ?? name ? `?name=${encodeURIComponent(tech?.name ?? name ?? "")}` : "";
    router.push(`/(tabs)/book/${encodeURIComponent(id)}${query}`);
  }

  return (
    <View style={styles.container}>
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
            <View style={styles.avatar}>
              <Ionicons name="person" size={40} color={Polish.colors.primary} />
            </View>
            <Text style={styles.title}>{techName}</Text>
          </View>

          {(tech?.location || tech?.bio || (tech?.nailTechProfile?.availabilities?.days?.length ?? 0) > 0) && (
            <View style={styles.section}>
              {tech?.location && (
                <View style={styles.row}>
                  <Ionicons name="location-outline" size={20} color={Polish.colors.textSecondary} />
                  <Text style={styles.bodyText}>{tech.location}</Text>
                </View>
              )}
              {tech?.bio ? (
                <View style={styles.bioRow}>
                  <Text style={styles.label}>About</Text>
                  <Text style={styles.bodyText}>{tech.bio}</Text>
                </View>
              ) : null}
              {tech?.nailTechProfile?.availabilities?.days && tech.nailTechProfile.availabilities.days.length > 0 && (
                <View style={styles.availRow}>
                  <Text style={styles.label}>Available</Text>
                  <View style={styles.dayChips}>
                    {tech.nailTechProfile.availabilities.days.map((day) => (
                      <View key={day} style={styles.dayChip}>
                        <Text style={styles.dayChipText}>{day.slice(0, 3)}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>
          )}

          <TouchableOpacity
            style={styles.button}
            onPress={handleBookPress}
            activeOpacity={0.85}
          >
            <Ionicons name="calendar-outline" size={20} color="#fff" />
            <Text style={styles.buttonText}>Book Appointment</Text>
          </TouchableOpacity>
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Polish.spacing.xl,
    paddingTop: 48,
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
  bioRow: {
    marginBottom: Polish.spacing.lg,
  },
  availRow: {
    marginTop: Polish.spacing.sm,
  },
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
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Polish.spacing.sm,
    paddingVertical: Polish.spacing.lg,
    paddingHorizontal: Polish.spacing.xxl,
    borderRadius: Polish.radius.lg,
    backgroundColor: Polish.colors.primary,
    ...Polish.shadow,
  },
  buttonText: {
    ...Polish.typography.button,
    color: "#fff",
  },
});
