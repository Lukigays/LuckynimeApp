import React, { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppIcon } from "@/components/app-icon";
import { hapticLight } from "@/lib/haptics";
import {
  getLatestGlobalMessage,
  subscribeGlobalMessages,
} from "@/lib/global-chat-service";

const HOME_DISCUSSION_CACHE_KEY = "@luckynime_latest_discussion_msg";

export function HomePublicDiscussionBar() {
  const [latestSnippet, setLatestSnippet] = useState<{
    senderName: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    let isMounted = true;

    AsyncStorage.getItem(HOME_DISCUSSION_CACHE_KEY).then((raw) => {
      if (raw && isMounted) {
        try {
          const parsed = JSON.parse(raw);
          if (
            parsed &&
            parsed.senderName &&
            parsed.message &&
            !String(parsed.senderName).includes("Kyosukee") &&
            !String(parsed.senderName).includes("AGIL")
          ) {
            setLatestSnippet(parsed);
          }
        } catch {}
      }
    });

    getLatestGlobalMessage().then((msg) => {
      if (msg && isMounted) {
        setLatestSnippet(msg);
        AsyncStorage.setItem(HOME_DISCUSSION_CACHE_KEY, JSON.stringify(msg)).catch(() => {});
      }
    });

    const unsubscribe = subscribeGlobalMessages("ngobrol_1", (newMsg) => {
      if (!isMounted) return;
      const snippet = {
        senderName: newMsg.senderName,
        message: newMsg.message,
      };
      setLatestSnippet(snippet);
      AsyncStorage.setItem(HOME_DISCUSSION_CACHE_KEY, JSON.stringify(snippet)).catch(() => {});
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const handlePress = () => {
    hapticLight();
    router.push("/chat-global" as never);
  };

  const sender = latestSnippet?.senderName || "Komunitas";
  const text = latestSnippet?.message || "Belum ada obrolan. Sapa sesama wibu sekarang!";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Ruang Obrolan Global Luckynime"
      onPress={handlePress}
      // @ts-ignore
      onClick={handlePress}
      style={({ pressed }) => [
        styles.card,
        pressed && styles.pressed,
        Platform.OS === "web" && ({ cursor: "pointer" } as any),
      ]}
    >
      <LinearGradient
        colors={["rgba(239, 68, 68, 0.16)", "rgba(18, 19, 22, 0.94)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.iconBadge}>
        <AppIcon name="chat" size={18} color="#FFFFFF" />
        <View style={styles.liveDot} />
      </View>

      <View style={styles.bodyCol}>
        <View style={styles.topRow}>
          <Text style={styles.loungeTag}>SAKURA LOUNGE • LIVE CHAT</Text>
        </View>
        <View style={styles.snippetRow}>
          <Text style={styles.senderText} numberOfLines={1}>
            {sender}
          </Text>
          <Text style={styles.separator}>•</Text>
          <Text style={styles.snippetText} numberOfLines={1} ellipsizeMode="tail">
            {text}
          </Text>
        </View>
      </View>

      <View style={styles.joinPill}>
        <Text style={styles.joinText}>Gabung</Text>
        <AppIcon name="arrow-right" size={12} color="#F3F4F6" />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 58,
    borderRadius: 18,
    backgroundColor: "#1B1D22",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.24)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
    paddingVertical: 10,
    gap: 11,
    overflow: "hidden",
  },
  pressed: {
    opacity: 0.86,
    transform: [{ scale: 0.985 }],
  },
  iconBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(239, 68, 68, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.32)",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  liveDot: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#10B981",
    borderWidth: 1.5,
    borderColor: "#1B1D22",
  },
  bodyCol: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  loungeTag: {
    fontFamily: "Nunito-Bold",
    fontSize: 9.5,
    letterSpacing: 0.9,
    color: "#FFFFFF",
  },
  snippetRow: {
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
  },
  senderText: {
    fontFamily: "Nunito-Bold",
    fontSize: 12.5,
    color: "#F5C518",
    maxWidth: 96,
    flexShrink: 0,
  },
  separator: {
    color: "#6B7280",
    marginHorizontal: 5,
    fontSize: 11,
  },
  snippetText: {
    fontFamily: "Nunito-SemiBold",
    fontSize: 12.5,
    color: "#F3F4F6",
    flex: 1,
  },
  joinPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 99,
    backgroundColor: "#EF4444",
  },
  joinText: {
    fontFamily: "Nunito-Bold",
    fontSize: 11,
    color: "#F3F4F6",
  },
});
