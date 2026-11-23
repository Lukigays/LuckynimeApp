import React, { useEffect, useMemo } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppIcon } from "@/components/app-icon";
import { BorderAvatar } from "@/components/border-avatar";
import { SystemRoleBadge, UserVerificationBadge } from "@/components/user-verification-badge";
import { ProfileCityPlaque } from "@/components/profile-city-plaque";
import { getTierForLevel } from "@/components/level-progress-modal";
import { getLeaderboard, formatXp, type LeaderboardEntry } from "@/lib/leaderboard-service";
import { supabase } from "@/lib/supabase";
import { hapticLight } from "@/lib/haptics";

const GOLD = "#FBBF24";
const SILVER = "#F1D4DE";
const BRONZE = "#FB7185";

const NAME_COLORS = [
  "#FB7185",
  "#FBBF24",
  "#F43F5E",
  "#C084FC",
  "#34D399",
  "#FDA4AF",
  "#F472B6",
  "#F59E0B",
];

function getUsernameColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % NAME_COLORS.length;
  return NAME_COLORS[index];
}

function rankColor(rank: number): string {
  if (rank === 1) return GOLD;
  if (rank === 2) return SILVER;
  if (rank === 3) return BRONZE;
  return "#8F727F";
}

function crownIcon(rank: number): string | null {
  if (rank === 1) return "👑";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return null;
}

const HomePodiumItem = React.memo(function HomePodiumItem({ entry }: { entry: LeaderboardEntry }) {
  const isFirst = entry.rank === 1;
  const clr = rankColor(entry.rank);
  const avatarSize = isFirst ? 54 : 42;
  const { currentTier, isInfinity } = getTierForLevel(entry.level, (entry as any).role);
  const nameColor = useMemo(() => getUsernameColor(entry.displayName), [entry.displayName]);

  return (
    <View
      style={[
        styles.podiumItem,
        isFirst ? styles.podiumItemFirst : styles.podiumItemOther,
      ]}
    >
      <View style={styles.crownWrapper}>
        <Text style={[styles.crownText, isFirst && styles.crownTextFirst]}>
          {crownIcon(entry.rank)}
        </Text>
      </View>

      <View style={styles.avatarContainer}>
        <BorderAvatar
          avatarUrl={entry.avatarUrl}
          borderId={entry.equippedBorder}
          fallbackText={entry.displayName}
          avatarSize={avatarSize}
        />

        <View
          style={[
            styles.nearAvatarBadge,
            {
              backgroundColor: clr,
              bottom: isFirst ? -2 : -4,
              right: isFirst ? -2 : -4,
            },
          ]}
        >
          <Text style={styles.nearAvatarText}>{entry.rank}</Text>
        </View>
      </View>

      <View style={styles.nameRow}>
        <Text style={[styles.userName, { color: nameColor }]} numberOfLines={1}>
          {entry.displayName}
        </Text>
        <UserVerificationBadge role={entry.role} isVip={entry.isVip} size={10} />
      </View>

      <SystemRoleBadge role={entry.role} compact />

      <View style={styles.homeCityClanRow}>
        <ProfileCityPlaque userId={entry.userId} podium />
      </View>

      <View
        style={[
          styles.tierPill,
          {
            borderColor: `${currentTier.color}40`,
            backgroundColor: `${currentTier.color}16`,
          },
        ]}
      >
        <Image
          source={{ uri: currentTier.imageUrl }}
          style={styles.tierIcon}
          contentFit="contain"
          transition={150}
        />
        <Text style={[styles.tierText, { color: currentTier.color }]}>
          {isInfinity ? "∞" : `Lv.${entry.level}`}
        </Text>
      </View>

      <Text style={[styles.xpText, { color: clr }]}>
        {formatXp(entry.xpGained)}
      </Text>
    </View>
  );
});

export function HomeTopLeaderboard() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["home-top-leaderboard"],
    queryFn: () => getLeaderboard("alltime", 3),
    staleTime: 30_000,
    retry: 2,
  });

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const channelName = `home-top-leaderboard-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    try {
      channel = supabase
        .channel(channelName)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "profiles" },
          () => {
            queryClient.invalidateQueries({ queryKey: ["home-top-leaderboard"] });
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "user_xp_transactions" },
          () => {
            queryClient.invalidateQueries({ queryKey: ["home-top-leaderboard"] });
          }
        )
        .subscribe();
    } catch (err) {
      console.warn("[home-leaderboard] Supabase realtime subscription warning:", err);
    }

    return () => {
      if (channel) {
        try {
          supabase.removeChannel(channel).catch(() => {});
        } catch {}
      }
    };
  }, [queryClient]);

  const entries = useMemo(() => data ?? [], [data]);
  const top3 = entries.slice(0, 3);

  const podiumOrder =
    top3.length >= 3
      ? [top3[1], top3[0], top3[2]]
      : top3.length === 2
      ? [top3[1], top3[0], null]
      : top3.length === 1
      ? [null, top3[0], null]
      : [];

  const handleOpenLeaderboard = () => {
    hapticLight();
    router.push("/leaderboard" as never);
  };

  return (
    <View style={styles.cardContainer}>
      <LinearGradient
        colors={["rgba(244, 63, 94, 0.14)", "rgba(251, 191, 36, 0.04)", "rgba(25, 16, 22, 0.96)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <View style={styles.trophyBadge}>
            <AppIcon name="trophy" size={14} color="#FBBF24" />
          </View>
          <View>
            <Text style={styles.headerEyebrow}>HALL OF FAME</Text>
            <View style={styles.titleLine}>
              <Text style={styles.headerTitle}>Top Sultan & Sepuh</Text>
              <View style={styles.livePulseDot} />
            </View>
          </View>
        </View>

        <Pressable
          onPress={handleOpenLeaderboard}
          style={({ pressed }) => [styles.seeAllBtn, pressed && { opacity: 0.75 }]}
          hitSlop={8}
        >
          <Text style={styles.seeAllText}>Peringkat</Text>
          <AppIcon name="arrow-right" size={12} color="#FB7185" />
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color="#F43F5E" />
        </View>
      ) : top3.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>Panggung Kehormatan Menunggu</Text>
          <Text style={styles.emptySubtitle}>
            Tonton anime & raih XP untuk menjadi pemuncak Hall of Fame!
          </Text>
        </View>
      ) : (
        <Pressable onPress={handleOpenLeaderboard} style={styles.podiumRow}>
          {podiumOrder.map((entry, idx) =>
            entry ? (
              <HomePodiumItem key={entry.userId} entry={entry} />
            ) : (
              <View key={`empty-${idx}`} style={styles.podiumItemEmpty} />
            )
          )}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    width: "100%",
    borderRadius: 22,
    backgroundColor: "#191016",
    borderWidth: 1,
    borderColor: "rgba(251, 113, 133, 0.22)",
    padding: 15,
    gap: 10,
    overflow: "hidden",
    ...(Platform.OS === "web"
      ? ({
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
        } as any)
      : {}),
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  trophyBadge: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: "rgba(251, 191, 36, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(251, 191, 36, 0.34)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerEyebrow: {
    fontFamily: "SpaceGrotesk-Bold",
    color: "#FB7185",
    fontSize: 9.5,
    letterSpacing: 1.1,
  },
  titleLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  headerTitle: {
    fontFamily: "Nunito-ExtraBold",
    color: "#FFF5F7",
    fontSize: 14.5,
    letterSpacing: -0.2,
  },
  livePulseDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#F43F5E",
  },
  seeAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 99,
    backgroundColor: "rgba(244, 63, 94, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(251, 113, 133, 0.26)",
  },
  seeAllText: {
    fontFamily: "Nunito-Bold",
    color: "#FB7185",
    fontSize: 11.5,
  },
  loadingBox: {
    height: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyBox: {
    paddingVertical: 20,
    alignItems: "center",
    gap: 4,
  },
  emptyTitle: {
    fontFamily: "Nunito-Bold",
    color: "#FFF5F7",
    fontSize: 13,
  },
  emptySubtitle: {
    fontFamily: "Nunito-Regular",
    color: "#9A7D8A",
    fontSize: 11.5,
    textAlign: "center",
  },
  podiumRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 8,
    paddingTop: 4,
  },
  podiumItem: {
    flex: 1,
    alignItems: "center",
    borderRadius: 16,
    paddingHorizontal: 6,
    paddingVertical: 10,
    gap: 4,
  },
  podiumItemFirst: {
    backgroundColor: "rgba(244, 63, 94, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(251, 191, 36, 0.36)",
    paddingVertical: 12,
  },
  podiumItemOther: {
    backgroundColor: "rgba(255, 245, 247, 0.035)",
    borderWidth: 1,
    borderColor: "rgba(251, 113, 133, 0.14)",
  },
  podiumItemEmpty: {
    flex: 1,
  },
  crownWrapper: {
    minHeight: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  crownText: {
    fontSize: 13,
  },
  crownTextFirst: {
    fontSize: 16,
  },
  avatarContainer: {
    position: "relative",
    marginVertical: 2,
  },
  nearAvatarBadge: {
    position: "absolute",
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#191016",
  },
  nearAvatarText: {
    fontFamily: "SpaceGrotesk-Bold",
    fontSize: 9.5,
    color: "#0D080B",
    fontWeight: "900",
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    maxWidth: "100%",
    marginTop: 2,
  },
  userName: {
    fontFamily: "Nunito-ExtraBold",
    fontSize: 11.5,
    flexShrink: 1,
  },
  homeCityClanRow: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 16,
  },
  tierPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 99,
    borderWidth: 1,
    marginTop: 1,
  },
  tierIcon: {
    width: 12,
    height: 12,
  },
  tierText: {
    fontFamily: "SpaceGrotesk-Bold",
    fontSize: 9.5,
    fontWeight: "800",
  },
  xpText: {
    fontFamily: "SpaceGrotesk-Bold",
    fontSize: 10.5,
    fontWeight: "700",
    marginTop: 1,
  },
});
