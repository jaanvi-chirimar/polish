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
import { buildFullName, formatDateTime, getUserName } from "@/lib/utils";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Link, router } from "expo-router";
import {
  collection,
  DocumentData,
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
  confirmedCount: number;
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
      schedule: Record<string, Array<{ start: string; end: string }>>;
    };
  };
};

function TechStatusCard({ techStatus }: { techStatus: TechStatus }) {
  return (
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
              {formatDateTime(techStatus.nextAppointment.dateTime)}
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
  );
}

export default function HomeScreen() {
  const { user, userProfile, loading: authLoading } = useAuth();
  const [techs, setTechs] = useState<Tech[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [filterLocation, setFilterLocation] = useState<string>("");
  const [filterService, setFilterService] = useState<string>("All");
  const [filterAvailableToday, setFilterAvailableToday] = useState(false);
  const [techStatus, setTechStatus] = useState<TechStatus>({
    nextAppointment: null,
    pendingCount: 0,
    confirmedCount: 0,
  });

  const isTech = userProfile?.roles?.includes("nailTech") ?? false;
  const isCustomer = userProfile?.roles?.includes("user") ?? false;
  const isTechOnly = isTech && !isCustomer;

  // Tech appointments: next upcoming or pending requests (for tech-only or both)
  useEffect(() => {
    if (!user?.uid || !isTech) {
      setTechStatus({ nextAppointment: null, pendingCount: 0, confirmedCount: 0 });
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
        const confirmed = docs.filter(
          (a) => a.dateTime >= now && a.status === "confirmed"
        );
        const upcoming = confirmed.sort(
          (a, b) => a.dateTime.getTime() - b.dateTime.getTime()
        );
        const next = upcoming[0] ?? null;

        let nextAppointment: TechStatus["nextAppointment"] = null;
        if (next) {
          const clientName = await getUserName(next.clientId, "Client");
          nextAppointment = { clientName, dateTime: next.dateTime };
        }
        setTechStatus({ nextAppointment, pendingCount: pending.length, confirmedCount: confirmed.length });
      },
      (err) => console.error("Home tech status:", err)
    );
    return () => unsubscribe();
  }, [user?.uid, isTech]);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/auth' as any);
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
          
          const name = buildFullName(data.firstName, data.lastName, "Unnamed Tech");
          
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

  const todayWeekday = WEEKDAYS[new Date().getDay()];

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
    if (filterAvailableToday) {
      list = list.filter((t) =>
        Object.keys(t.nailTechProfile?.availabilities?.schedule ?? {}).includes(todayWeekday)
      );
    }
    return list;
  }, [techs, searchQuery, filterLocation, filterService, filterAvailableToday]);

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

  // Technician-only: dashboard
  if (isTechOnly) {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    const firstName = userProfile?.firstName || "there";
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.techDashContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.techGreeting}>{greeting}, {firstName} 👋</Text>
            <Text style={styles.techGreetingSub}>Here's your overview</Text>
          </View>
          <TouchableOpacity onPress={handleProfilePress} style={styles.profileButton} activeOpacity={0.7}>
            <Ionicons name="person-circle-outline" size={32} color={Polish.colors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.statsRow}>
          <TouchableOpacity style={styles.statCard} onPress={() => router.push("/(tabs)/bookings" as any)} activeOpacity={0.85}>
            <Text style={styles.statNumber}>{techStatus.pendingCount}</Text>
            <Text style={styles.statLabel}>Pending{"\n"}Requests</Text>
            <Ionicons name="time-outline" size={18} color={Polish.colors.primary} style={styles.statIcon} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.statCard} onPress={() => router.push("/(tabs)/bookings" as any)} activeOpacity={0.85}>
            <Text style={styles.statNumber}>{techStatus.confirmedCount}</Text>
            <Text style={styles.statLabel}>Upcoming{"\n"}Confirmed</Text>
            <Ionicons name="checkmark-circle-outline" size={18} color={Polish.colors.success} style={styles.statIcon} />
          </TouchableOpacity>
        </View>

        {techStatus.nextAppointment ? (
          <TechStatusCard techStatus={techStatus} />
        ) : (
          <View style={styles.techAllSetCard}>
            <Ionicons name="checkmark-circle-outline" size={24} color={Polish.colors.success} />
            <Text style={styles.techAllSetText}>No upcoming appointments — you're all clear!</Text>
          </View>
        )}

        <Text style={styles.quickActionsLabel}>Quick Actions</Text>
        <View style={styles.quickActionsRow}>
          <TouchableOpacity style={styles.quickAction} onPress={() => router.push("/(tabs)/bookings" as any)} activeOpacity={0.85}>
            <Ionicons name="calendar-outline" size={22} color={Polish.colors.primary} />
            <Text style={styles.quickActionText}>Bookings</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickAction} onPress={() => router.push("/(tabs)/inbox" as any)} activeOpacity={0.85}>
            <Ionicons name="mail-outline" size={22} color={Polish.colors.primary} />
            <Text style={styles.quickActionText}>Messages</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickAction} onPress={handleProfilePress} activeOpacity={0.85}>
            <Ionicons name="person-outline" size={22} color={Polish.colors.primary} />
            <Text style={styles.quickActionText}>My Profile</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
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

  const hasActiveFilters = !!(filterLocation || filterService !== "All" || filterAvailableToday);

  const listHeader = (
    <>
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
          style={[styles.filtersToggle, hasActiveFilters && styles.filtersToggleActive]}
          onPress={() => setFiltersVisible(!filtersVisible)}
          activeOpacity={0.8}
        >
          <Ionicons
            name="options-outline"
            size={20}
            color={hasActiveFilters ? "#fff" : Polish.colors.textSecondary}
          />
          <Text
            style={[
              styles.filtersToggleText,
              hasActiveFilters && styles.filtersToggleTextActive,
            ]}
          >
            Filters
          </Text>
        </TouchableOpacity>
      </View>

      {filtersVisible && (
        <View style={styles.filterPanel}>
          <Text style={styles.filterLabel}>Availability</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
            <TouchableOpacity
              style={[styles.filterChip, filterAvailableToday && styles.filterChipActive]}
              onPress={() => setFilterAvailableToday(!filterAvailableToday)}
              activeOpacity={0.8}
            >
              <Text style={[styles.filterChipText, filterAvailableToday && styles.filterChipTextActive]}>
                Available today
              </Text>
            </TouchableOpacity>
          </ScrollView>

          <Text style={styles.filterLabel}>Location</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
            <TouchableOpacity
              style={[styles.filterChip, !filterLocation && styles.filterChipActive]}
              onPress={() => setFilterLocation("")}
              activeOpacity={0.8}
            >
              <Text style={[styles.filterChipText, !filterLocation && styles.filterChipTextActive]}>All</Text>
            </TouchableOpacity>
            {(LOCATION_OPTIONS as readonly string[]).map((loc) => (
              <TouchableOpacity
                key={loc}
                style={[styles.filterChip, filterLocation === loc && styles.filterChipActive]}
                onPress={() => setFilterLocation(filterLocation === loc ? "" : loc)}
                activeOpacity={0.8}
              >
                <Text style={[styles.filterChipText, filterLocation === loc && styles.filterChipTextActive]}>
                  {loc}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.filterLabel}>Service</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
            {(SERVICE_FILTER_OPTIONS as readonly string[]).map((svc) => (
              <TouchableOpacity
                key={svc}
                style={[styles.filterChip, filterService === svc && styles.filterChipActive]}
                onPress={() => setFilterService(svc)}
                activeOpacity={0.8}
              >
                <Text style={[styles.filterChipText, filterService === svc && styles.filterChipTextActive]}>
                  {svc}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {hasActiveFilters && (
            <TouchableOpacity
              style={styles.clearFiltersBtn}
              onPress={() => {
                setFilterLocation("");
                setFilterService("All");
                setFilterAvailableToday(false);
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.clearFiltersBtnText}>Clear all filters</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Tech status card (when user is both customer and tech); links to Bookings */}
      {isTech && (techStatus.nextAppointment || techStatus.pendingCount > 0) && (
        <TechStatusCard techStatus={techStatus} />
      )}

      {/* Browse by style */}
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
              onPress={() => setFilterService(filterService === design ? "All" : design)}
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
    </>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={filteredTechs}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={filteredTechs.length > 0 ? styles.cardRow : undefined}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          <View style={styles.emptyFiltered}>
            <Text style={styles.emptyText}>
              No techs match your search or filters.{hasActiveFilters ? " Try clearing some filters." : ""}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const availableToday =
            Object.keys(item.nailTechProfile?.availabilities?.schedule ?? {}).includes(todayWeekday);
          return (
            <Link
              href={{
                pathname: "/tech/[id]",
                params: { id: item.id },
              } as any}
              asChild
            >
              <TouchableOpacity style={styles.card} activeOpacity={0.85}>
                {item.nailTechProfile?.portfolio?.[0] ? (
                  <Image
                    source={{ uri: item.nailTechProfile.portfolio[0] }}
                    style={styles.cardImage}
                    contentFit="cover"
                  />
                ) : (
                  <View style={styles.cardImagePlaceholder}>
                    <Ionicons name="person" size={28} color={Polish.colors.primary} />
                  </View>
                )}
                <View style={styles.cardBody}>
                  <Text style={styles.cardName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {item.location ? (
                    <View style={styles.cardLocation}>
                      <Ionicons name="location-outline" size={12} color={Polish.colors.textMuted} />
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
                </View>
              </TouchableOpacity>
            </Link>
          );
        }}
      />
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
  filterPanel: {
    marginBottom: Polish.spacing.md,
  },
  filterScroll: {
    flexDirection: "row",
    gap: Polish.spacing.sm,
    paddingBottom: Polish.spacing.md,
    paddingRight: Polish.spacing.xl,
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Polish.spacing.sm,
    marginBottom: Polish.spacing.lg,
  },
  clearFiltersBtn: {
    alignSelf: "flex-start",
    marginTop: Polish.spacing.xs,
    marginBottom: Polish.spacing.sm,
    paddingHorizontal: Polish.spacing.md,
    paddingVertical: Polish.spacing.sm,
    borderRadius: Polish.radius.xl,
    borderWidth: 1,
    borderColor: Polish.colors.primary,
  },
  clearFiltersBtnText: {
    ...Polish.typography.caption,
    color: Polish.colors.primary,
    fontWeight: "600",
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
    borderRadius: Polish.radius.lg,
    backgroundColor: Polish.colors.surface,
    borderWidth: 1,
    borderColor: Polish.colors.borderLight,
    overflow: "hidden",
    ...Polish.shadowSm,
  },
  cardImage: {
    width: "100%",
    height: 140,
  },
  cardImagePlaceholder: {
    width: "100%",
    height: 140,
    backgroundColor: Polish.colors.accent + "40",
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: {
    padding: Polish.spacing.md,
  },
  cardName: {
    ...Polish.typography.bodyMedium,
    color: Polish.colors.text,
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
  techDashContent: {
    paddingHorizontal: Polish.spacing.xl,
    paddingTop: 56,
    paddingBottom: Polish.spacing.xxxl,
  },
  techGreeting: {
    ...Polish.typography.title,
    color: Polish.colors.text,
  },
  techGreetingSub: {
    ...Polish.typography.caption,
    color: Polish.colors.textSecondary,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: "row",
    gap: Polish.spacing.md,
    marginBottom: Polish.spacing.lg,
  },
  statCard: {
    flex: 1,
    backgroundColor: Polish.colors.surface,
    borderRadius: Polish.radius.lg,
    padding: Polish.spacing.lg,
    borderWidth: 1,
    borderColor: Polish.colors.borderLight,
    ...Polish.shadowSm,
  },
  statNumber: {
    ...Polish.typography.title,
    color: Polish.colors.text,
    fontSize: 32,
    lineHeight: 36,
  },
  statLabel: {
    ...Polish.typography.caption,
    color: Polish.colors.textSecondary,
    marginTop: Polish.spacing.xs,
  },
  statIcon: {
    position: "absolute",
    top: Polish.spacing.md,
    right: Polish.spacing.md,
  },
  techAllSetCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Polish.spacing.md,
    backgroundColor: Polish.colors.surface,
    borderRadius: Polish.radius.lg,
    padding: Polish.spacing.lg,
    marginBottom: Polish.spacing.lg,
    borderWidth: 1,
    borderColor: Polish.colors.borderLight,
  },
  techAllSetText: {
    ...Polish.typography.body,
    color: Polish.colors.textSecondary,
    flex: 1,
  },
  quickActionsLabel: {
    ...Polish.typography.caption,
    color: Polish.colors.textMuted,
    marginBottom: Polish.spacing.sm,
    marginTop: Polish.spacing.sm,
  },
  quickActionsRow: {
    flexDirection: "row",
    gap: Polish.spacing.md,
  },
  quickAction: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Polish.spacing.sm,
    backgroundColor: Polish.colors.surface,
    borderRadius: Polish.radius.lg,
    paddingVertical: Polish.spacing.lg,
    borderWidth: 1,
    borderColor: Polish.colors.borderLight,
    ...Polish.shadowSm,
  },
  quickActionText: {
    ...Polish.typography.caption,
    color: Polish.colors.text,
    fontWeight: "600",
  },
});
