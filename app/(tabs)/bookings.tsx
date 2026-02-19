import { Polish } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { createCalendarEvent, getValidAccessToken } from "@/lib/googleCalendar";
import { getThreadId } from "@/lib/threadId";
import { formatDateTime, getUserName } from "@/lib/utils";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import {
    collection,
    doc,
    onSnapshot,
    query,
    updateDoc,
    where,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    SectionList,
    StyleSheet,
    Text,
    TouchableOpacity,
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
  appointmentType?: string;
};

type TechAppointment = {
  id: string;
  clientId: string;
  clientName: string;
  dateTime: Date;
  note?: string;
  status: string;
  appointmentType?: string;
};

type BookingsSection = {
  title: string;
  data: (ClientAppointment | TechAppointment)[];
  type: "client" | "tech";
};


export default function BookingsScreen() {
  const { user, userProfile, loading: authLoading } = useAuth();
  const [clientUpcoming, setClientUpcoming] = useState<ClientAppointment[]>([]);
  const [clientPast, setClientPast] = useState<ClientAppointment[]>([]);
  const [techRequests, setTechRequests] = useState<TechAppointment[]>([]);
  const [techUpcoming, setTechUpcoming] = useState<TechAppointment[]>([]);
  const [loading, setLoading] = useState(true);

  const isClient = userProfile?.roles?.includes("user") ?? false;
  const isTech = userProfile?.roles?.includes("nailTech") ?? false;

  async function handleAccept(appointmentId: string, appointment: TechAppointment) {
    // Confirm the appointment
    await updateDoc(doc(db, "appointments", appointmentId), { status: "confirmed" });

    const techName = [userProfile?.firstName, userProfile?.lastName].filter(Boolean).join(" ") || "Nail Tech";

    // Create Google Calendar event for tech (if connected)
    const techToken = await getValidAccessToken(user!.uid);
    if (techToken) {
      const eventId = await createCalendarEvent(techToken, appointment, techName, appointment.clientName);
      if (eventId) {
        updateDoc(doc(db, "appointments", appointmentId), { techCalendarEventId: eventId });
      }
    }

    // Create Google Calendar event for client (if connected)
    const clientToken = await getValidAccessToken(appointment.clientId);
    if (clientToken) {
      const eventId = await createCalendarEvent(clientToken, appointment, techName, appointment.clientName);
      if (eventId) {
        updateDoc(doc(db, "appointments", appointmentId), { clientCalendarEventId: eventId });
      }
    }
  }

  async function handleDecline(appointmentId: string) {
    await updateDoc(doc(db, "appointments", appointmentId), { status: "declined" });
  }

  function handleMessage(clientId: string) {
    if (!user?.uid) return;
    const threadId = getThreadId(user.uid, clientId);
    router.push(`/(tabs)/inbox/chat/${threadId}` as any);
  }

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
          docs.map(async (a) => ({
            id: a.id,
            techId: a.techId,
            techName: await getUserName(a.techId, "Tech"),
            dateTime: a.dateTime,
            note: a.note,
            status: a.status || "pending",
            appointmentType: (a as any).appointmentType,
          }))
        );

        const upcoming = withNames
          .filter((a) => a.dateTime >= now && a.status !== "declined")
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
          docs.map(async (a) => ({
            id: a.id,
            clientId: a.clientId,
            clientName: await getUserName(a.clientId, "Customer"),
            dateTime: a.dateTime,
            note: a.note,
            status: a.status || "pending",
            appointmentType: (a as any).appointmentType,
          }))
        );

        const requests = withNames
          .filter((a) => a.status === "pending")
          .sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());
        const upcoming = withNames
          .filter((a) => a.dateTime >= now && a.status !== "pending" && a.status !== "declined")
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
          renderItem={({ item, section }) => {
            const isTechPending = section.type === "tech" && item.status === "pending";
            const appt = item as TechAppointment;
            return (
              <View style={[styles.card, isTechPending && styles.cardPending]}>
                <View style={styles.cardTopRow}>
                  <Text style={styles.name}>
                    {section.type === "client"
                      ? (item as ClientAppointment).techName
                      : appt.clientName}
                  </Text>
                  {!isTechPending && (
                    <View style={[
                      styles.statusBadge,
                      item.status === "confirmed" && styles.statusBadgeConfirmed,
                    ]}>
                      <Text style={[
                        styles.statusBadgeText,
                        item.status === "confirmed" && styles.statusBadgeTextConfirmed,
                      ]}>
                        {item.status}
                      </Text>
                    </View>
                  )}
                </View>
                <View style={styles.dateRow}>
                  <Ionicons name="calendar-outline" size={14} color={Polish.colors.textMuted} />
                  <Text style={styles.dateText}>{formatDateTime(item.dateTime)}</Text>
                </View>
                {item.appointmentType ? (
                  <Text style={styles.apptTypeText}>{item.appointmentType}</Text>
                ) : null}
                {item.note ? (
                  <Text style={styles.noteText} numberOfLines={2}>
                    "{item.note}"
                  </Text>
                ) : null}
                {isTechPending && (
                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={styles.acceptButton}
                      onPress={() => handleAccept(item.id, item as TechAppointment)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.acceptButtonText}>Accept</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.messageButton}
                      onPress={() => handleMessage(appt.clientId)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="chatbubble-outline" size={14} color={Polish.colors.primary} />
                      <Text style={styles.messageButtonText}>Message</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.declineButton}
                      onPress={() => handleDecline(item.id)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.declineButtonText}>Decline</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
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
  cardPending: {
    borderColor: Polish.colors.primary + "40",
    borderWidth: 1.5,
  },
  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  name: {
    ...Polish.typography.subtitle,
    color: Polish.colors.text,
    flex: 1,
    marginRight: Polish.spacing.sm,
  },
  statusBadge: {
    paddingHorizontal: Polish.spacing.md,
    paddingVertical: 3,
    borderRadius: Polish.radius.xl,
    backgroundColor: Polish.colors.textMuted + "20",
  },
  statusBadgeConfirmed: {
    backgroundColor: Polish.colors.success + "20",
  },
  statusBadgeText: {
    ...Polish.typography.caption,
    color: Polish.colors.textMuted,
    textTransform: "capitalize",
    fontWeight: "600",
  },
  statusBadgeTextConfirmed: {
    color: Polish.colors.success,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 2,
  },
  dateText: {
    ...Polish.typography.body,
    color: Polish.colors.textSecondary,
  },
  noteText: {
    ...Polish.typography.caption,
    color: Polish.colors.textMuted,
    marginTop: Polish.spacing.sm,
    fontStyle: "italic",
  },
  actionRow: {
    flexDirection: "row",
    gap: Polish.spacing.sm,
    marginTop: Polish.spacing.md,
  },
  acceptButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Polish.spacing.sm,
    borderRadius: Polish.radius.lg,
    backgroundColor: Polish.colors.primary,
  },
  acceptButtonText: {
    ...Polish.typography.caption,
    color: "#fff",
    fontWeight: "600",
  },
  messageButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: Polish.spacing.sm,
    borderRadius: Polish.radius.lg,
    borderWidth: 1,
    borderColor: Polish.colors.primary,
  },
  messageButtonText: {
    ...Polish.typography.caption,
    color: Polish.colors.primary,
    fontWeight: "600",
  },
  declineButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Polish.spacing.sm,
    borderRadius: Polish.radius.lg,
    borderWidth: 1,
    borderColor: Polish.colors.error,
  },
  declineButtonText: {
    ...Polish.typography.caption,
    color: Polish.colors.error,
    fontWeight: "600",
  },
  apptTypeText: {
    ...Polish.typography.caption,
    color: Polish.colors.textSecondary,
    fontWeight: "600",
    marginTop: 2,
  },
});
