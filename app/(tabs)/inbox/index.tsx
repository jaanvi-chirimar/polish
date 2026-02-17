import { Polish } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/firebase/config";
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
    FlatList,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

type Thread = {
  id: string;
  otherUserId: string;
  otherUserName: string;
  lastMessage: string;
  lastMessageAt: Date | null;
};

export default function InboxListScreen() {
  const { user, loading: authLoading } = useAuth();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) {
      if (!authLoading) router.replace("/auth" as any);
      return;
    }

    const q = query(
      collection(db, "threads"),
      where("participantIds", "array-contains", user.uid)
    );

    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        const now = new Date();
        const list: Thread[] = await Promise.all(
          snapshot.docs.map(async (d) => {
            const data = d.data();
            const participantIds = (data.participantIds as string[]) || [];
            const otherId =
              participantIds[0] === user.uid ? participantIds[1] : participantIds[0];
            let otherName = "Unknown";
            try {
              const otherSnap = await getDoc(doc(db, "users", otherId));
              if (otherSnap.exists()) {
                const o = otherSnap.data();
                const first = o.firstName || "";
                const last = o.lastName || "";
                otherName =
                  first && last ? `${first} ${last}`.trim() : first || last || otherName;
              }
            } catch (_) {}
            const lastAt = data.lastMessageAt?.toDate?.() ?? null;
            return {
              id: d.id,
              otherUserId: otherId,
              otherUserName: otherName,
              lastMessage: (data.lastMessage as string) || "",
              lastMessageAt: lastAt,
            };
          })
        );
        list.sort((a, b) => {
          const ta = a.lastMessageAt?.getTime() ?? 0;
          const tb = b.lastMessageAt?.getTime() ?? 0;
          return tb - ta;
        });
        setThreads(list);
        setLoading(false);
      },
      (err) => {
        console.error("Inbox threads listener:", err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user?.uid, authLoading]);

  if (authLoading || !user) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Inbox</Text>
        <Text style={styles.subtitle}>Messages</Text>
      </View>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Polish.colors.primary} />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      ) : threads.length === 0 ? (
        <View style={styles.center}>
          <Ionicons
            name="chatbubbles-outline"
            size={48}
            color={Polish.colors.textMuted}
          />
          <Text style={styles.emptyText}>No conversations yet</Text>
          <Text style={styles.emptySubtext}>
            Message a nail tech from their profile or start a chat after booking.
          </Text>
        </View>
      ) : (
        <FlatList
          data={threads}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.7}
              onPress={() => router.push(`/(tabs)/inbox/chat/${item.id}` as any)}
            >
              <Text style={styles.name}>{item.otherUserName}</Text>
              {item.lastMessage ? (
                <Text style={styles.preview} numberOfLines={2}>
                  {item.lastMessage}
                </Text>
              ) : null}
              {item.lastMessageAt ? (
                <Text style={styles.time}>
                  {item.lastMessageAt.toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}{" "}
                  {item.lastMessageAt.toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </Text>
              ) : null}
            </TouchableOpacity>
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
    textAlign: "center",
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
  preview: {
    ...Polish.typography.body,
    color: Polish.colors.textSecondary,
    marginBottom: 4,
  },
  time: {
    ...Polish.typography.caption,
    color: Polish.colors.textMuted,
  },
});
