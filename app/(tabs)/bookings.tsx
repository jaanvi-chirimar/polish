import { Polish } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import {
    collection,
    doc,
    getDoc,
    onSnapshot,
    query,
    where,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    SectionList,
    StyleSheet,
    Text,
    View
} from "react-native";
import { db } from "../../firebase/config";

type ClientAppointment = {
  id: string;
  techId: string;
  techName: string;
  dateTime: Date;
  note?: string;
  status: string;
};

type TechAppointment = {
  id: string;
  clientId: string;
  clientName: string;
  dateTime: Date;
  note?: string;
  status: string;
};

type BookingsSection = {
  title: string;
  data: (ClientAppointment | TechAppointment)[];
  type: "client" | "tech";
};

function formatDateTime(dt: Date) {
  return `${dt.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  })} at ${dt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

export default function BookingsScreen() {
  const { user, userProfile, loading: authLoading } = useAuth();
  const [clientUpcoming, setClientUpcoming] = useState<ClientAppointment[]>([]);
  const [clientPast, setClientPast] = useState<ClientAppointment[]>([]);
  const [techRequests, setTechRequests] = useState<TechAppointment[]>([]);
  const [techUpcoming, setTechUpcoming] = useState<TechAppointment[]>([]);
  const [loading, setLoading] = useState(true);

  const isClient = userProfile?.roles?.includes("user") ?? false;
  const isTech = userProfile?.roles?.includes("nailTech") ?? false;

  useEffect(() => {
    if (!user?.uid) {
      if (!authLoading) router.replace("/auth" as any);
      return;
    }

    const now = new Date();

    const clientQ = query(
      collection(db, "appointments"),
      where("clientId", "==", user.uid)
    );
    const techQ = query(
      collection(db, "appointments"),
      where("techId", "==", user.uid)
    );

    const unsubClient = onSnapshot(
      clientQ,
      async (snapshot) => {
        const docs = snapshot.docs
          .map((d) => {
            const data = d.data();
            const dt = data.dateTime?.toDate?.() ?? null;
            return { id: d.id, ...data, dateTime: dt };
          })
          .filter((a) => a.dateTime) as {
          id: string;
          techId: string;
          dateTime: Date;
          note?: string;
          status: string;
        }[];

        const withNames: ClientAppointment[] = await Promise.all(
          docs.map(async (a) => {
            let techName = `Tech`;
            try {
              const techSnap = await getDoc(doc(db, "users", a.techId));
              if (techSnap.exists()) {
                const d = techSnap.data();
                const first = d.firstName || "";
                const last = d.lastName || "";
                techName =
                  first && last ? `${first} ${last}`.trim() : first || last || techName;
              }
            } catch (_) {}
            return {
              id: a.id,
              techId: a.techId,
              techName,
              dateTime: a.dateTime,
              note: a.note,
              status: a.status || "pending",
            };
          })
        );

        const upcoming = withNames
          .filter((a) => a.dateTime >= now)
          .sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());
        const past = withNames
          .filter((a) => a.dateTime < now)
          .sort((a, b) => b.dateTime.getTime() - a.dateTime.getTime());
        setClientUpcoming(upcoming);
        setClientPast(past);
      },
      (err) => console.error("Bookings client listener:", err)
    );

    const unsubTech = onSnapshot(
      techQ,
      async (snapshot) => {
        const docs = snapshot.docs
          .map((d) => {
            const data = d.data();
            const dt = data.dateTime?.toDate?.() ?? null;
            return { id: d.id, ...data, dateTime: dt };
          })
          .filter((a) => a.dateTime) as {
          id: string;
          clientId: string;
          dateTime: Date;
          note?: string;
          status: string;
        }[];

        const withNames: TechAppointment[] = await Promise.all(
          docs.map(async (a) => {
            let clientName = "Customer";
            try {
              const clientSnap = await getDoc(doc(db, "users", a.clientId));
              if (clientSnap.exists()) {
                const d = clientSnap.data();
                const first = d.firstName || "";
                const last = d.lastName || "";
                clientName =
                  first && last ? `${first} ${last}`.trim() : first || last || clientName;
              }
            } catch (_) {}
            return {
              id: a.id,
              clientId: a.clientId,
              clientName,
              dateTime: a.dateTime,
              note: a.note,
              status: a.status || "pending",
            };
          })
        );

        const requests = withNames
          .filter((a) => a.status === "pending")
          .sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());
        const upcoming = withNames
          .filter((a) => a.dateTime >= now && a.status !== "pending")
          .sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());
        setTechRequests(requests);
        setTechUpcoming(upcoming);
        setLoading(false);
      },
      (err) => {
        console.error("Bookings tech listener:", err);
        setLoading(false);
      }
    );

    return () => {
      unsubClient();
      unsubTech();
    };
  }, [user?.uid, authLoading]);

  if (authLoading || !user) return null;

  const sections: BookingsSection[] = [];
  if (isClient) {
    if (clientUpcoming.length > 0) {
      sections.push({
        title: "Upcoming (as client)",
        data: clientUpcoming,
        type: "client",
      });
    }
    if (clientPast.length > 0) {
      sections.push({
        title: "Past bookings",
        data: clientPast,
        type: "client",
      });
    }
  }
  if (isTech) {
    if (techRequests.length > 0) {
      sections.push({
        title: "Incoming requests",
        data: techRequests,
        type: "tech",
      });
    }
    if (techUpcoming.length > 0) {
      sections.push({
        title: "Upcoming (as tech)",
        data: techUpcoming,
        type: "tech",
      });
    }
  }

  const isEmpty =
    !isClient && !isTech
      ? true
      : isClient && isTech
        ? clientUpcoming.length === 0 && clientPast.length === 0 && techRequests.length === 0 && techUpcoming.length === 0
        : isClient
          ? clientUpcoming.length === 0 && clientPast.length === 0
          : techRequests.length === 0 && techUpcoming.length === 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Bookings</Text>
        <Text style={styles.subtitle}>
          {isClient && isTech
            ? "Your bookings and requests"
            : isTech
              ? "Incoming requests and appointments"
              : "Your upcoming and past bookings"}
        </Text>
      </View>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Polish.colors.primary} />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      ) : isEmpty ? (
        <View style={styles.center}>
          <Ionicons
            name="calendar-outline"
            size={48}
            color={Polish.colors.textMuted}
          />
          <Text style={styles.emptyText}>No bookings yet</Text>
          <Text style={styles.emptySubtext}>
            {isTech
              ? "When clients book with you, they'll appear here."
              : "Book with a nail tech from Home to see them here."}
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionTitle}>{section.title}</Text>
          )}
          renderItem={({ item, section }) => (
            <View style={styles.card}>
              <Text style={styles.name}>
                {section.type === "client"
                  ? (item as ClientAppointment).techName
                  : (item as TechAppointment).clientName}
              </Text>
              <Text style={styles.dateText}>{formatDateTime(item.dateTime)}</Text>
              {item.note ? (
                <Text style={styles.noteText} numberOfLines={2}>
                  {item.note}
                </Text>
              ) : null}
              <View style={styles.statusRow}>
                <Text
                  style={[
                    styles.statusText,
                    item.status === "confirmed" && styles.statusConfirmed,
                    item.status === "pending" && styles.statusPending,
                  ]}
                >
                  {item.status}
                </Text>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Polish.colors.background,
    paddingHorizontal: Polish.spacing.xl,
    paddingTop: 56,
  },
  header: {
    marginBottom: Polish.spacing.xxl,
  },
  title: {
    ...Polish.typography.title,
    color: Polish.colors.text,
  },
  subtitle: {
    ...Polish.typography.caption,
    color: Polish.colors.textSecondary,
    marginTop: 4,
  },
  sectionTitle: {
    ...Polish.typography.subtitle,
    color: Polish.colors.text,
    marginTop: Polish.spacing.lg,
    marginBottom: Polish.spacing.sm,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: Polish.spacing.lg,
    ...Polish.typography.body,
    color: Polish.colors.textSecondary,
  },
  emptyText: {
    marginTop: Polish.spacing.lg,
    ...Polish.typography.subtitle,
    color: Polish.colors.textSecondary,
  },
  emptySubtext: {
    marginTop: Polish.spacing.sm,
    ...Polish.typography.caption,
    color: Polish.colors.textMuted,
    textAlign: "center",
  },
  listContent: {
    paddingBottom: Polish.spacing.xxxl,
  },
  card: {
    backgroundColor: Polish.colors.surface,
    borderRadius: Polish.radius.lg,
    padding: Polish.spacing.lg,
    marginBottom: Polish.spacing.md,
    borderWidth: 1,
    borderColor: Polish.colors.borderLight,
    ...Polish.shadowSm,
  },
  name: {
    ...Polish.typography.subtitle,
    color: Polish.colors.text,
    marginBottom: 4,
  },
  dateText: {
    ...Polish.typography.body,
    color: Polish.colors.textSecondary,
  },
  noteText: {
    ...Polish.typography.caption,
    color: Polish.colors.textMuted,
    marginTop: Polish.spacing.sm,
  },
  statusRow: {
    marginTop: Polish.spacing.sm,
  },
  statusText: {
    ...Polish.typography.caption,
    color: Polish.colors.textSecondary,
    textTransform: "capitalize",
  },
  statusConfirmed: {
    color: Polish.colors.success,
  },
  statusPending: {
    color: Polish.colors.primary,
  },
});
