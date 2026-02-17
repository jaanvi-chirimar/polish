/**
 * Home Screen – content depends on whether user is a customer (Revised).
 *
 * 1. Customer-only: full discovery (search, filters, "Nail techs near you", grid, inspiration).
 * 2. Technician-only: no discovery; optional status card (upcoming / pending) or "You're all set for today".
 * 3. Both: full discovery + optional tech status card at top. No role toggle.
 */
import {
  LOCATION_OPTIONS,
  NAIL_TECH_DESIGNS,
  NAIL_TECH_TOOLS,
} from "@/constants/nailTechOptions";
import { Polish } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { Ionicons } from "@expo/vector-icons";
import { Link, router } from "expo-router";
import {
  collection,
  doc,
  DocumentData,
  getDoc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { db } from "../../firebase/config";

type TechStatus = {
  nextAppointment: { clientName: string; dateTime: Date } | null;
  pendingCount: number;
};

const SERVICE_FILTER_OPTIONS = [
  "All",
  ...NAIL_TECH_TOOLS.slice(0, 5),
  ...NAIL_TECH_DESIGNS.slice(0, 4),
] as const;

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

type Tech = {
  id: string;
  name: string;
  location: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string | null;
  nailTechProfile?: {
    location?: string;
    bio?: string;
    portfolio?: string[];
    tools?: string[];
    designs?: string[];
    availabilities?: {
      days: string[];
    };
  };
};

export default function HomeScreen() {
  const { user, userProfile, loading: authLoading } = useAuth();
  const [techs, setTechs] = useState<Tech[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [filterLocation, setFilterLocation] = useState<string>("");
  const [filterService, setFilterService] = useState<string>("All");
  const [techStatus, setTechStatus] = useState<TechStatus>({
    nextAppointment: null,
    pendingCount: 0,
  });

  const isTech = userProfile?.roles?.includes("nailTech") ?? false;
  const isCustomer = userProfile?.roles?.includes("user") ?? false;
  const isTechOnly = isTech && !isCustomer;

  // Tech appointments: next upcoming or pending requests (for tech-only or both)
  useEffect(() => {
    if (!user?.uid || !isTech) {
      setTechStatus({ nextAppointment: null, pendingCount: 0 });
      return;
    }
    const q = query(
      collection(db, "appointments"),
      where("techId", "==", user.uid)
    );
    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        const now = new Date();
        const docs = snapshot.docs
          .map((d) => {
            const data = d.data();
            const dt = data.dateTime?.toDate?.() ?? null;
            return {
              id: d.id,
              clientId: data.clientId,
              dateTime: dt,
              status: data.status || "pending",
            };
          })
          .filter((a) => a.dateTime) as {
          id: string;
          clientId: string;
          dateTime: Date;
          status: string;
        }[];

        const pending = docs.filter((a) => a.status === "pending");
        const upcoming = docs
          .filter((a) => a.dateTime >= now && a.status !== "pending")
          .sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());
        const next = upcoming[0] ?? null;

        let nextAppointment: TechStatus["nextAppointment"] = null;
        if (next) {
          let clientName = "Client";
          try {
            const clientSnap = await getDoc(doc(db, "users", next.clientId));
            if (clientSnap.exists()) {
              const d = clientSnap.data();
              const first = d.firstName || "";
              const last = d.lastName || "";
              clientName =
                first && last ? `${first} ${last}`.trim() : first || last || clientName;
            }
          } catch (_) {}
          nextAppointment = { clientName, dateTime: next.dateTime };
        }
        setTechStatus({ nextAppointment, pendingCount: pending.length });
      },
      (err) => console.error("Home tech status:", err)
    );
    return () => unsubscribe();
  }, [user?.uid, isTech]);

  // Redirect if not authenticated - force redirect
  // Must have phone number (no anonymous users)
  useEffect(() => {
    if (!authLoading) {
      if (!user || !user.phoneNumber) {
        console.log('🚫 HomeScreen: No user or no phone - redirecting to /auth', {
          hasUser: !!user,
          hasPhone: !!user?.phoneNumber
        });
        router.replace('/auth' as any);
      } else {
        console.log('✅ HomeScreen: User authenticated with phone');
      }
    }
  }, [user, authLoading]);
  
  // Load techs only when user is a customer (discovery content)
  useEffect(() => {
    if (!user || !isCustomer) {
      setTechs([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, "users"),
      where("roles", "array-contains", "nailTech")
    );
    
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: Tech[] = snapshot.docs.map((doc) => {
          const data = doc.data() as DocumentData;
          
          // Build name from firstName and lastName
          const firstName = data.firstName || "";
          const lastName = data.lastName || "";
          const name = firstName && lastName 
            ? `${firstName} ${lastName}`.trim()
            : firstName || lastName || "Unnamed Tech";
          
          // Get location from nailTechProfile or user location
          const location = data.nailTechProfile?.location || data.location || "";

          return {
            id: doc.id,
            name,
            location,
            firstName: data.firstName,
            lastName: data.lastName,
            phoneNumber: data.phoneNumber,
            nailTechProfile: {
              ...data.nailTechProfile,
              tools: data.nailTechProfile?.tools ?? [],
              designs: data.nailTechProfile?.designs ?? [],
            },
          };
        });

        setTechs(list);
        setLoading(false);
      },
      (error) => {
        console.error("Error loading techs:", error);
        setLoading(false);
      }
    );

    // Clean up the listener when the component unmounts
    return unsubscribe;
  }, [user, isCustomer]);

  const filteredTechs = useMemo(() => {
    let list = techs;
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          (t.location && t.location.toLowerCase().includes(q))
      );
    }
    if (filterLocation) {
      list = list.filter((t) => t.location === filterLocation);
    }
    if (filterService && filterService !== "All") {
      list = list.filter((t) => {
        const tools = t.nailTechProfile?.tools ?? [];
        const designs = t.nailTechProfile?.designs ?? [];
        return tools.includes(filterService) || designs.includes(filterService);
      });
    }
    return list;
  }, [techs, searchQuery, filterLocation, filterService]);

  const todayWeekday = WEEKDAYS[new Date().getDay()];

  const handleProfilePress = () => {
    router.push("/(tabs)/profile" as any);
  };
  
  // Show loading or nothing if not authenticated (after all hooks)
  if (authLoading || !user) {
    return null;
  }

  // Wait for profile so we have roles before deciding discovery vs tech-only Home
  if (!userProfile) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={Polish.colors.primary} />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (loading && isCustomer) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={Polish.colors.primary} />
        <Text style={styles.loadingText}>Loading nail techs...</Text>
      </View>
    );
  }

  // Technician-only: no discovery; status card or neutral empty state
  if (isTechOnly) {
    const hasStatus = techStatus.nextAppointment || techStatus.pendingCount > 0;
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Home</Text>
          <TouchableOpacity
            onPress={handleProfilePress}
            style={styles.profileButton}
            activeOpacity={0.7}
          >
            <Ionicons
              name="person-circle-outline"
              size={32}
              color={Polish.colors.text}
            />
          </TouchableOpacity>
        </View>
        {hasStatus ? (
          <TouchableOpacity
            style={styles.statusCard}
            onPress={() => router.push("/(tabs)/bookings" as any)}
            activeOpacity={0.85}
          >
            <Ionicons
              name="calendar-outline"
              size={22}
              color={Polish.colors.primary}
              style={styles.statusCardIcon}
            />
            <View style={styles.statusCardBody}>
              {techStatus.nextAppointment ? (
                <>
                  <Text style={styles.statusCardTitle}>Next appointment</Text>
                  <Text style={styles.statusCardText} numberOfLines={1}>
                    {techStatus.nextAppointment.clientName} ·{" "}
                    {techStatus.nextAppointment.dateTime.toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}{" "}
                    at{" "}
                    {techStatus.nextAppointment.dateTime.toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.statusCardTitle}>Pending requests</Text>
                  <Text style={styles.statusCardText}>
                    {techStatus.pendingCount} booking
                    {techStatus.pendingCount !== 1 ? "s" : ""} awaiting your response
                  </Text>
                </>
              )}
            </View>
            <Ionicons name="chevron-forward" size={20} color={Polish.colors.textMuted} />
          </TouchableOpacity>
        ) : (
          <View style={styles.techOnlyEmpty}>
            <Ionicons
              name="checkmark-circle-outline"
              size={56}
              color={Polish.colors.textMuted}
            />
            <Text style={styles.techOnlyEmptyTitle}>You're all set for today</Text>
            <Text style={styles.techOnlyEmptyText}>
              Check Bookings for appointments and Inbox for messages.
            </Text>
          </View>
        )}
      </View>
    );
  }

  // Customer (or both): discovery content (loading already handled above)
  if (isCustomer && !loading && techs.length === 0) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.title}>Nail Techs Near You</Text>
        <Text style={styles.emptyText}>
          No nail techs found. Users with the "nailTech" role will appear here.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Nail Techs Near You</Text>
        <TouchableOpacity
          onPress={handleProfilePress}
          style={styles.profileButton}
          activeOpacity={0.7}
        >
          <Ionicons
            name="person-circle-outline"
            size={32}
            color={Polish.colors.text}
          />
        </TouchableOpacity>
      </View>

      <View style={styles.searchRow}>
        <Ionicons
          name="search-outline"
          size={20}
          color={Polish.colors.textMuted}
          style={styles.searchIcon}
        />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or location..."
          placeholderTextColor={Polish.colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
        />
        {searchQuery.length > 0 ? (
          <TouchableOpacity
            onPress={() => setSearchQuery("")}
            style={styles.clearButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close-circle" size={20} color={Polish.colors.textMuted} />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={[styles.filtersToggle, (filterLocation || filterService !== "All") && styles.filtersToggleActive]}
          onPress={() => setFiltersVisible(!filtersVisible)}
          activeOpacity={0.8}
        >
          <Ionicons
            name="options-outline"
            size={20}
            color={(filterLocation || filterService !== "All") ? "#fff" : Polish.colors.textSecondary}
          />
          <Text
            style={[
              styles.filtersToggleText,
              (filterLocation || filterService !== "All") && styles.filtersToggleTextActive,
            ]}
          >
            Filters
          </Text>
        </TouchableOpacity>
      </View>

      {filtersVisible && (
        <>
          <Text style={styles.filterLabel}>Location</Text>
          <View style={styles.filterRow}>
            <TouchableOpacity
              style={[styles.filterChip, !filterLocation && styles.filterChipActive]}
              onPress={() => setFilterLocation("")}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.filterChipText,
                  !filterLocation && styles.filterChipTextActive,
                ]}
              >
                All
              </Text>
            </TouchableOpacity>
            {(LOCATION_OPTIONS as readonly string[]).map((loc) => (
              <TouchableOpacity
                key={loc}
                style={[
                  styles.filterChip,
                  filterLocation === loc && styles.filterChipActive,
                ]}
                onPress={() =>
                  setFilterLocation(filterLocation === loc ? "" : loc)
                }
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    filterLocation === loc && styles.filterChipTextActive,
                  ]}
                >
                  {loc}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.filterLabel}>Service</Text>
          <View style={styles.filterRow}>
            {(SERVICE_FILTER_OPTIONS as readonly string[]).map((svc) => (
              <TouchableOpacity
                key={svc}
                style={[
                  styles.filterChip,
                  filterService === svc && styles.filterChipActive,
                ]}
                onPress={() => setFilterService(svc)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    filterService === svc && styles.filterChipTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {svc}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {/* Tech status card (when user is both customer and tech); links to Bookings */}
      {isTech && (techStatus.nextAppointment || techStatus.pendingCount > 0) && (
        <TouchableOpacity
          style={styles.statusCard}
          onPress={() => router.push("/(tabs)/bookings" as any)}
          activeOpacity={0.85}
        >
          <Ionicons
            name="calendar-outline"
            size={22}
            color={Polish.colors.primary}
            style={styles.statusCardIcon}
          />
          <View style={styles.statusCardBody}>
            {techStatus.nextAppointment ? (
              <>
                <Text style={styles.statusCardTitle}>Next appointment</Text>
                <Text style={styles.statusCardText} numberOfLines={1}>
                  {techStatus.nextAppointment.clientName} ·{" "}
                  {techStatus.nextAppointment.dateTime.toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}{" "}
                  at{" "}
                  {techStatus.nextAppointment.dateTime.toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </Text>
              </>
            ) : techStatus.pendingCount > 0 ? (
              <>
                <Text style={styles.statusCardTitle}>Pending requests</Text>
                <Text style={styles.statusCardText}>
                  {techStatus.pendingCount} booking
                  {techStatus.pendingCount !== 1 ? "s" : ""} awaiting your response
                </Text>
              </>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={20} color={Polish.colors.textMuted} />
        </TouchableOpacity>
      )}

      {/* Optional: inspiration / browse by style */}
      <View style={styles.inspirationRow}>
        <Text style={styles.inspirationLabel}>Browse by style</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.inspirationScroll}
        >
          {(NAIL_TECH_DESIGNS as readonly string[]).slice(0, 6).map((design) => (
            <TouchableOpacity
              key={design}
              style={[
                styles.inspirationChip,
                filterService === design && styles.inspirationChipActive,
              ]}
              onPress={() => {
                setFilterService(filterService === design ? "All" : design);
                if (!filtersVisible) setFiltersVisible(true);
              }}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.inspirationChipText,
                  filterService === design && styles.inspirationChipTextActive,
                ]}
                numberOfLines={1}
              >
                {design}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {filteredTechs.length === 0 ? (
        <View style={styles.emptyFiltered}>
          <Text style={styles.emptyText}>
            No techs match your search or filters. Try changing them.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredTechs}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.cardRow}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const availableToday =
              item.nailTechProfile?.availabilities?.days?.includes(
                todayWeekday
              ) ?? false;
            return (
              <Link
                href={{
                  pathname: "/tech/[id]",
                  params: { id: item.id },
                } as any}
                asChild
              >
                <TouchableOpacity style={styles.card} activeOpacity={0.85}>
                  <View style={styles.cardAvatar}>
                    <Ionicons
                      name="person"
                      size={28}
                      color={Polish.colors.primary}
                    />
                  </View>
                  <Text style={styles.cardName} numberOfLines={2}>
                    {item.name}
                  </Text>
                  {item.location ? (
                    <View style={styles.cardLocation}>
                      <Ionicons
                        name="location-outline"
                        size={12}
                        color={Polish.colors.textMuted}
                      />
                      <Text style={styles.cardLocationText} numberOfLines={1}>
                        {item.location}
                      </Text>
                    </View>
                  ) : null}
                  {availableToday ? (
                    <View style={styles.cardBadge}>
                      <Text style={styles.cardBadgeText}>Available today</Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              </Link>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: Polish.spacing.xl,
    paddingTop: 56,
    backgroundColor: Polish.colors.background,
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Polish.spacing.xxl,
  },
  title: {
    ...Polish.typography.title,
    color: Polish.colors.text,
    flex: 1,
  },
  profileButton: {
    padding: Polish.spacing.sm,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Polish.colors.surface,
    borderRadius: Polish.radius.lg,
    borderWidth: 1,
    borderColor: Polish.colors.borderLight,
    paddingHorizontal: Polish.spacing.lg,
    marginBottom: Polish.spacing.lg,
  },
  searchIcon: {
    marginRight: Polish.spacing.sm,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: Polish.spacing.md,
    ...Polish.typography.body,
    color: Polish.colors.text,
  },
  clearButton: {
    padding: Polish.spacing.sm,
  },
  filtersToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: Polish.spacing.sm,
    paddingHorizontal: Polish.spacing.md,
    borderRadius: Polish.radius.lg,
    borderWidth: 1,
    borderColor: Polish.colors.border,
    backgroundColor: Polish.colors.surface,
    marginLeft: Polish.spacing.sm,
  },
  filtersToggleActive: {
    backgroundColor: Polish.colors.primary,
    borderColor: Polish.colors.primary,
  },
  filtersToggleText: {
    ...Polish.typography.caption,
    color: Polish.colors.textSecondary,
    fontWeight: "600",
  },
  filtersToggleTextActive: {
    color: "#fff",
  },
  filterLabel: {
    ...Polish.typography.caption,
    color: Polish.colors.textMuted,
    marginBottom: Polish.spacing.sm,
  },
  statusCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Polish.colors.surface,
    borderRadius: Polish.radius.lg,
    padding: Polish.spacing.lg,
    marginBottom: Polish.spacing.lg,
    borderWidth: 1,
    borderColor: Polish.colors.borderLight,
    ...Polish.shadowSm,
  },
  statusCardIcon: {
    marginRight: Polish.spacing.md,
  },
  statusCardBody: {
    flex: 1,
  },
  statusCardTitle: {
    ...Polish.typography.caption,
    color: Polish.colors.textMuted,
    marginBottom: 2,
  },
  statusCardText: {
    ...Polish.typography.body,
    color: Polish.colors.text,
  },
  techOnlyEmpty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Polish.spacing.xxl,
  },
  techOnlyEmptyTitle: {
    ...Polish.typography.title,
    color: Polish.colors.text,
    marginTop: Polish.spacing.lg,
    textAlign: "center",
  },
  techOnlyEmptyText: {
    ...Polish.typography.body,
    color: Polish.colors.textSecondary,
    marginTop: Polish.spacing.sm,
    textAlign: "center",
  },
  inspirationRow: {
    marginBottom: Polish.spacing.lg,
  },
  inspirationLabel: {
    ...Polish.typography.caption,
    color: Polish.colors.textMuted,
    marginBottom: Polish.spacing.sm,
  },
  inspirationScroll: {
    paddingRight: Polish.spacing.xl,
    gap: Polish.spacing.sm,
  },
  inspirationChip: {
    paddingHorizontal: Polish.spacing.md,
    paddingVertical: Polish.spacing.sm,
    borderRadius: Polish.radius.xl,
    borderWidth: 1,
    borderColor: Polish.colors.border,
    backgroundColor: Polish.colors.surface,
    marginRight: Polish.spacing.sm,
  },
  inspirationChipActive: {
    backgroundColor: Polish.colors.primary,
    borderColor: Polish.colors.primary,
  },
  inspirationChipText: {
    ...Polish.typography.caption,
    color: Polish.colors.textSecondary,
    fontWeight: "500",
  },
  inspirationChipTextActive: {
    color: "#fff",
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Polish.spacing.sm,
    marginBottom: Polish.spacing.lg,
  },
  filterChip: {
    paddingHorizontal: Polish.spacing.md,
    paddingVertical: Polish.spacing.sm,
    borderRadius: Polish.radius.xl,
    borderWidth: 1,
    borderColor: Polish.colors.border,
    backgroundColor: Polish.colors.surface,
  },
  filterChipActive: {
    backgroundColor: Polish.colors.primary,
    borderColor: Polish.colors.primary,
  },
  filterChipText: {
    ...Polish.typography.caption,
    color: Polish.colors.textSecondary,
    fontWeight: "500",
  },
  filterChipTextActive: {
    color: "#fff",
  },
  emptyFiltered: {
    flex: 1,
    paddingVertical: Polish.spacing.xxl,
    alignItems: "center",
  },
  listContent: {
    paddingBottom: Polish.spacing.xxxl,
  },
  cardRow: {
    flexDirection: "row",
    gap: Polish.spacing.md,
    marginBottom: Polish.spacing.md,
  },
  card: {
    flex: 1,
    alignItems: "center",
    padding: Polish.spacing.lg,
    paddingTop: Polish.spacing.xxl,
    paddingBottom: Polish.spacing.lg,
    borderRadius: Polish.radius.lg,
    backgroundColor: Polish.colors.surface,
    borderWidth: 1,
    borderColor: Polish.colors.borderLight,
    ...Polish.shadowSm,
  },
  cardAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Polish.colors.accent + "40",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Polish.spacing.md,
  },
  cardName: {
    ...Polish.typography.subtitle,
    color: Polish.colors.text,
    textAlign: "center",
    marginBottom: Polish.spacing.xs,
  },
  cardLocation: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: Polish.spacing.sm,
  },
  cardLocationText: {
    ...Polish.typography.caption,
    color: Polish.colors.textMuted,
    fontSize: 11,
    maxWidth: 100,
  },
  cardBadge: {
    backgroundColor: Polish.colors.success + "25",
    paddingHorizontal: Polish.spacing.sm,
    paddingVertical: 4,
    borderRadius: Polish.radius.sm,
  },
  cardBadgeText: {
    ...Polish.typography.caption,
    fontSize: 10,
    color: Polish.colors.success,
    fontWeight: "600",
  },
  loadingText: {
    marginTop: Polish.spacing.lg,
    ...Polish.typography.body,
    color: Polish.colors.textSecondary,
  },
  emptyText: {
    marginTop: Polish.spacing.lg,
    ...Polish.typography.body,
    color: Polish.colors.textSecondary,
    textAlign: "center",
    paddingHorizontal: Polish.spacing.xxl,
  },
});
