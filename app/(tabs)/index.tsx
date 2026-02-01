// app/(tabs)/index.tsx
import { Ionicons } from "@expo/vector-icons";
import { Link, router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

import { Polish } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { collection, DocumentData, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../firebase/config";

// Type for a nail tech document in Firestore
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
    availabilities?: {
      days: string[];
    };
  };
};

export default function HomeScreen() {
  const { user, userProfile, loading: authLoading } = useAuth();
  const [techs, setTechs] = useState<Tech[]>([]);
  const [loading, setLoading] = useState(true);
  
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
  
  // Load techs - must be called before any conditional returns
  useEffect(() => {
    if (!user) return; // Don't load if no user
    
    // Query users collection for users with 'nailTech' in their roles array
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
            nailTechProfile: data.nailTechProfile,
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
  }, [user]);
  
  const handleProfilePress = () => {
    router.push('/profile' as any);
  };
  
  // Show loading or nothing if not authenticated (after all hooks)
  if (authLoading || !user) {
    return null;
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={Polish.colors.primary} />
        <Text style={styles.loadingText}>Loading nail techs...</Text>
      </View>
    );
  }

  if (!loading && techs.length === 0) {
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
        <TouchableOpacity onPress={handleProfilePress} style={styles.profileButton} activeOpacity={0.7}>
          <Ionicons name="person-circle-outline" size={32} color={Polish.colors.text} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={techs}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <Link
            href={{
              pathname: "/(tabs)/tech/[id]",
              params: { id: item.id },
            } as any}
            asChild
          >
            <TouchableOpacity style={styles.card} activeOpacity={0.8}>
              <View style={styles.cardIcon}>
                <Ionicons name="sparkles-outline" size={24} color={Polish.colors.primary} />
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.name}>{item.name}</Text>
                {item.location ? (
                  <View style={styles.locationRow}>
                    <Ionicons name="location-outline" size={14} color={Polish.colors.textSecondary} />
                    <Text style={styles.text}>{item.location}</Text>
                  </View>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={20} color={Polish.colors.textMuted} />
            </TouchableOpacity>
          </Link>
        )}
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
  listContent: {
    paddingBottom: Polish.spacing.xxxl,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: Polish.spacing.lg,
    borderRadius: Polish.radius.lg,
    marginBottom: Polish.spacing.md,
    backgroundColor: Polish.colors.surface,
    borderWidth: 1,
    borderColor: Polish.colors.borderLight,
    ...Polish.shadowSm,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: Polish.radius.md,
    backgroundColor: Polish.colors.accent + "30",
    alignItems: "center",
    justifyContent: "center",
    marginRight: Polish.spacing.lg,
  },
  cardBody: {
    flex: 1,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  name: {
    ...Polish.typography.subtitle,
    color: Polish.colors.text,
    marginBottom: 2,
  },
  text: {
    ...Polish.typography.caption,
    color: Polish.colors.textSecondary,
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
