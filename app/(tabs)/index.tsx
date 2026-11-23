import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { getAnimePage, getHomeAnime, getHomeRailAnime } from "@/lib/anilist";
import { BANNER_W, POSTER_W, getOptimizedImageUri } from "@/lib/image-optimization";
import { nsfwFilterParam, useNsfwPreference } from "@/lib/nsfw-preference";
import { animeTitle, type Anime } from "@/lib/types";
import { hapticLight } from "@/lib/haptics";
import { usePrefetchAnime } from "@/lib/prefetch";
import { AnimeRail } from "@/components/anime-rail";
import { ErrorState } from "@/components/async-state";
import { SkeletonHero, SkeletonRail } from "@/components/skeleton";
import { NotificationSheet } from "@/components/notification-sheet";
import { AppIcon } from "@/components/app-icon";
import { InAppEpisodeAlertMonitor } from "@/hooks/use-in-app-episode-alerts";
import { useWatchHistory } from "@/hooks/use-watch-history";
import { useNotifications } from "@/hooks/use-notifications";
import { useLuckynimeAuth } from "@/providers/auth-provider";
import { useExp } from "@/providers/exp-toast-provider";
import { EXP_RULES } from "@/lib/user-level";
import { HomeTopLeaderboard } from "@/components/home-top-leaderboard";
import { HomePublicDiscussionBar } from "@/components/home-public-discussion-bar";

export const SERIES_GENRES = [
  { id: "Action", label: "Action" },
  { id: "Romance", label: "Romance" },
  { id: "Fantasy", label: "Fantasy" },
  { id: "Comedy", label: "Comedy" },
  { id: "Adventure", label: "Adventure" },
  { id: "Drama", label: "Drama" },
  { id: "Sci-Fi", label: "Sci-Fi" },
  { id: "Mystery", label: "Mystery" },
  { id: "Supernatural", label: "Supernatural" },
  { id: "Slice of Life", label: "Slice of Life" },
  { id: "Sports", label: "Sports" },
  { id: "Psychological", label: "Psychological" },
  { id: "Horror", label: "Horror" },
] as const;

const QUICK_HUBS: { label: string; sub: string; icon: string; route: string }[] = [
  {
    label: "Trending",
    sub: "Paling Ramai",
    icon: "fire",
    route: "/search?sort=TRENDING_DESC&title=Trending%20Hari%20Ini",
  },
  {
    label: "Musim Ini",
    sub: "Episode Baru",
    icon: "television-play",
    route: "/search?status=RELEASING&sort=POPULARITY_DESC&title=Tayang%20Musim%20Ini",
  },
  {
    label: "Bioskop",
    sub: "Top Movie",
    icon: "movie-open-outline",
    route: "/search?format=MOVIE&sort=SCORE_DESC&title=Film%20Anime%20Terbaik",
  },
  {
    label: "Sultan",
    sub: "Leaderboard",
    icon: "trophy-outline",
    route: "/leaderboard",
  },
];

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 4 && hour < 11) return "Selamat Pagi";
  if (hour >= 11 && hour < 15) return "Selamat Siang";
  if (hour >= 15 && hour < 19) return "Selamat Sore";
  return "Selamat Malam";
}

let memoryCachedHome: { trending: Anime[]; popular: Anime[]; upcoming: Anime[] } | null = null;

export default function HomeScreen() {
  useWindowDimensions();
  const prefetch = usePrefetchAnime();
  const nsfw = useNsfwPreference();
  const auth = useLuckynimeAuth();
  const watchHistory = useWatchHistory();
  const { grantXp } = useExp();
  const dailyLoginChecked = useRef(false);

  useEffect(() => {
    if (!auth.user || dailyLoginChecked.current) return;
    dailyLoginChecked.current = true;
    const today = new Date().toISOString().split("T")[0];
    void grantXp({
      activityType: EXP_RULES.DAILY_LOGIN.type,
      targetId: today,
      baseXp: EXP_RULES.DAILY_LOGIN.xp,
      description: EXP_RULES.DAILY_LOGIN.label,
      metadata: { date: today },
    });
  }, [auth.user, grantXp]);

  const isAdultParam = nsfwFilterParam(nsfw.enabled);
  const { notifications } = useNotifications();
  const unreadNotifCount = notifications.data?.filter((n) => !n.read).length || 0;
  const params = useLocalSearchParams<{ openMailbox?: string; giftId?: string }>();
  const [notifSheetVisible, setNotifSheetVisible] = useState(false);
  const [activeBannerIndex, setActiveBannerIndex] = useState(0);
  const [selectedGenre, setSelectedGenre] = useState<string>("Action");
  const [cachedHome, setCachedHome] = useState<{
    trending: Anime[];
    popular: Anime[];
    upcoming: Anime[];
  } | null>(memoryCachedHome);

  useEffect(() => {
    if (params?.openMailbox === "true") {
      setNotifSheetVisible(true);
    }
  }, [params?.openMailbox]);

  useEffect(() => {
    void AsyncStorage.getItem(`luckynime.cache.home.${isAdultParam}`).then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.trending) && parsed.trending.length > 0) {
            memoryCachedHome = parsed;
            setCachedHome(parsed);
          }
        } catch {}
      }
    });
  }, [isAdultParam]);

  const home = useQuery({
    queryKey: ["home-anime", isAdultParam],
    queryFn: () => getHomeAnime(isAdultParam),
    placeholderData: cachedHome ?? undefined,
    staleTime: 10 * 60_000,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
  });

  useEffect(() => {
    if (home.data && home.data.trending && home.data.trending.length > 0) {
      memoryCachedHome = home.data;
      void AsyncStorage.setItem(
        `luckynime.cache.home.${isAdultParam}`,
        JSON.stringify(home.data)
      ).catch(() => {});
    }
  }, [home.data, isAdultParam]);

  const rails = useQuery({
    queryKey: ["home-rails", isAdultParam],
    queryFn: () => getHomeRailAnime(isAdultParam),
    enabled: Boolean(home.data),
    staleTime: 10 * 60_000,
    retry: 2,
    retryDelay: 1_500,
  });

  const genreAnime = useQuery({
    queryKey: ["home-genre-rail", selectedGenre, isAdultParam],
    queryFn: () =>
      getAnimePage({
        genre: selectedGenre,
        format: "TV",
        sort: ["POPULARITY_DESC"],
        perPage: 12,
        isAdult: isAdultParam,
      }).then((res) => res.media),
    enabled: Boolean(home.data),
    staleTime: 10 * 60_000,
  });

  const latestAnime = useQuery({
    queryKey: ["home-latest-anime", isAdultParam],
    queryFn: () =>
      getAnimePage({
        status: "RELEASING",
        sort: ["TRENDING_DESC", "POPULARITY_DESC"],
        perPage: 12,
        isAdult: isAdultParam,
      }).then((res) => res.media),
    enabled: Boolean(home.data),
    staleTime: 10 * 60_000,
  });

  const continueWatchingItems = useMemo(() => {
    const rows = watchHistory.displayRows ?? [];
    const seen = new Set<number>();
    const unique: typeof rows = [];
    for (const r of rows) {
      const aid = Number(r?.anime_id);
      if (!aid || seen.has(aid)) continue;
      seen.add(aid);
      unique.push(r);
      if (unique.length >= 8) break;
    }
    return unique;
  }, [watchHistory.displayRows]);

  const [refreshing, setRefreshing] = useState(false);

  const trendingList: Anime[] = home.data?.trending || [];
  const heroCount = Math.min(trendingList.length, 5);
  const touchStartX = useRef<number>(0);

  useEffect(() => {
    if (heroCount <= 1) return;
    const timer = setInterval(() => {
      setActiveBannerIndex((prev) => (prev + 1) % heroCount);
    }, 5500);
    return () => clearInterval(timer);
  }, [heroCount, activeBannerIndex]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([home.refetch(), rails.refetch(), latestAnime.refetch()]);
    setRefreshing(false);
  };

  if (home.isPending) {
    return (
      <SafeAreaView edges={["top", "left", "right"]} style={styles.container}>
        <InAppEpisodeAlertMonitor />
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <SkeletonHero />
          <Text style={styles.skeletonRailLabel}>MENYIAPKAN PANGGUNG LUCKYNIME...</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.skeletonRailRow}>
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonRail key={i} />
            ))}
          </ScrollView>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (home.isError || !home.data) {
    return (
      <SafeAreaView edges={["top", "left", "right"]} style={styles.container}>
        <InAppEpisodeAlertMonitor />
        <ErrorState
          message={home.error?.message ?? "Gagal memuat katalog anime saat ini."}
          onRetry={() => void home.refetch()}
        />
      </SafeAreaView>
    );
  }

  const heroList = trendingList.slice(0, 5);
  const safeHeroIdx = activeBannerIndex % (heroList.length || 1);
  const currentHero = heroList[safeHeroIdx] || trendingList[0];
  const top10Popular = trendingList.slice(0, 10);

  const greetingName =
    auth.profile?.display_name ||
    auth.profile?.username ||
    auth.user?.user_metadata?.full_name ||
    auth.user?.user_metadata?.name ||
    auth.user?.email?.split("@")[0] ||
    "Sobat Luckynime";

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.container}>
      <InAppEpisodeAlertMonitor />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#F43F5E" />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* ══════════════════════════════════════════════════════════════
            1. KURO-SAKURA HEADER + INTEGRATED SEARCH PILL BAR
            ══════════════════════════════════════════════════════════════ */}
        <View style={styles.headerBlock}>
          <View style={styles.topHeaderBar}>
            <View style={styles.brandCluster}>
              <Image
                source={require("@/assets/images/luckynime-logo.png")}
                style={styles.brandLogoImg}
                contentFit="contain"
              />
              <View style={styles.greetingWrap}>
                <Text style={styles.greetingSub}>{getTimeGreeting()}</Text>
                <Text style={styles.greetingUser} numberOfLines={1}>
                  {greetingName}
                </Text>
              </View>
            </View>

            <View style={styles.topHeaderActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Top Up Crystal"
                onPress={() => {
                  hapticLight();
                  router.push("/topup" as never);
                }}
                style={({ pressed }) => [styles.crystalPillBtn, pressed && styles.btnPressed]}
                hitSlop={10}
              >
                <Image
                  source={require("@/assets/images/topup/topup-crystal.png")}
                  style={styles.headerCrystalImg}
                  contentFit="contain"
                />
                <Text style={styles.crystalPillLabel}>Crystal</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Kotak Masuk dan Notifikasi"
                onPress={() => {
                  hapticLight();
                  setNotifSheetVisible(true);
                }}
                style={({ pressed }) => [styles.headerActionCircle, pressed && styles.btnPressed]}
                hitSlop={10}
              >
                <AppIcon name="bell" size={19} color="#FFF5F7" />
                {unreadNotifCount > 0 ? <View style={styles.notifBadgeDot} /> : null}
              </Pressable>
            </View>
          </View>

          {/* Integrated Search Capsule + Quick Random Pick */}
          <View style={styles.searchStripRow}>
            <Pressable
              accessibilityRole="search"
              accessibilityLabel="Cari judul anime, genre, atau studio"
              onPress={() => {
                hapticLight();
                router.push("/search" as never);
              }}
              style={({ pressed }) => [styles.searchCapsule, pressed && styles.btnPressed]}
            >
              <AppIcon name="magnify" size={18} color="#FB7185" />
              <Text style={styles.searchPlaceholder} numberOfLines={1}>
                Cari anime, genre, atau musim...
              </Text>
              <View style={styles.searchKbdTag}>
                <Text style={styles.searchKbdText}>CARI</Text>
              </View>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Pilih anime acak dari trending"
              onPress={() => {
                hapticLight();
                if (trendingList.length > 0) {
                  const pick = trendingList[Math.floor(Math.random() * trendingList.length)];
                  prefetch(pick.id);
                  router.push(`/anime/${pick.id}` as never);
                } else {
                  router.push("/(tabs)/random" as never);
                }
              }}
              style={({ pressed }) => [styles.diceBtn, pressed && styles.btnPressed]}
            >
              <AppIcon name="shuffle-variant" size={18} color="#FFF5F7" />
            </Pressable>
          </View>
        </View>

        {/* ══════════════════════════════════════════════════════════════
            2. SAKURA CINEMA STAGE — SPLIT-POSTER SPOTLIGHT HERO
            ══════════════════════════════════════════════════════════════ */}
        {currentHero ? (
          <View
            style={styles.heroWrapper}
            onTouchStart={(e) => {
              touchStartX.current = e.nativeEvent.pageX;
            }}
            onTouchEnd={(e) => {
              if (heroCount <= 1) return;
              const dx = e.nativeEvent.pageX - touchStartX.current;
              if (dx > 45) {
                hapticLight();
                setActiveBannerIndex((prev) => (prev - 1 + heroCount) % heroCount);
              } else if (dx < -45) {
                hapticLight();
                setActiveBannerIndex((prev) => (prev + 1) % heroCount);
              }
            }}
          >
            <Pressable
              onPress={() => {
                hapticLight();
                prefetch(currentHero.id);
                router.push(`/anime/${currentHero.id}` as never);
              }}
              style={({ pressed }) => [styles.heroStageCard, pressed && styles.btnPressed]}
            >
              <Image
                source={{
                  uri: currentHero.bannerImage
                    ? getOptimizedImageUri(currentHero.bannerImage, BANNER_W)
                    : currentHero.coverImage?.extraLarge
                      ? getOptimizedImageUri(currentHero.coverImage.extraLarge, BANNER_W)
                      : currentHero.coverImage?.large || "",
                }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                transition={350}
              />
              <LinearGradient
                colors={[
                  "rgba(13, 8, 11, 0.35)",
                  "rgba(20, 10, 16, 0.84)",
                  "rgba(13, 8, 11, 0.98)",
                ]}
                locations={[0, 0.52, 1]}
                style={StyleSheet.absoluteFill}
              />

              <View style={styles.stageTopBar}>
                <View style={styles.spotlightRibbon}>
                  <View style={styles.spotlightPulse} />
                  <Text style={styles.spotlightRibbonText}>
                    SPOTLIGHT #{safeHeroIdx + 1}
                  </Text>
                </View>

                <View style={styles.stageCounterPill}>
                  <Text style={styles.stageCounterText}>
                    0{safeHeroIdx + 1} / 0{heroList.length}
                  </Text>
                </View>
              </View>

              <View style={styles.stageBodyRow}>
                <View style={styles.stagePosterFrame}>
                  <Image
                    source={{
                      uri: getOptimizedImageUri(
                        currentHero.coverImage?.extraLarge || currentHero.coverImage?.large || "",
                        POSTER_W
                      ),
                    }}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    transition={220}
                  />
                </View>

                <View style={styles.stageInfoCol}>
                  <Text style={styles.stageTitle} numberOfLines={2}>
                    {animeTitle(currentHero)}
                  </Text>

                  <View style={styles.stageChipsRow}>
                    <View style={styles.stageScoreChip}>
                      <Text style={styles.stageStar}>★</Text>
                      <Text style={styles.stageScoreVal}>
                        {currentHero.averageScore
                          ? (currentHero.averageScore / 10).toFixed(1)
                          : "8.5"}
                      </Text>
                    </View>
                    <View style={styles.stageEpChip}>
                      <Text style={styles.stageEpText}>
                        {currentHero.episodes ? `${currentHero.episodes} EP` : "ONGOING"}
                      </Text>
                    </View>
                    <View style={styles.stageSubChip}>
                      <Text style={styles.stageSubText}>SUB INDO</Text>
                    </View>
                  </View>

                  {currentHero.genres?.length ? (
                    <Text style={styles.stageGenresLine} numberOfLines={1}>
                      {currentHero.genres.slice(0, 3).join(" • ")}
                    </Text>
                  ) : null}

                  <View style={styles.stageActionsRow}>
                    <Pressable
                      onPress={() => {
                        hapticLight();
                        prefetch(currentHero.id);
                        router.push(`/anime/${currentHero.id}` as never);
                      }}
                      style={({ pressed }) => [
                        styles.stagePrimaryBtn,
                        pressed && styles.btnPressed,
                      ]}
                    >
                      <AppIcon name="play" size={14} color="#FFFFFF" />
                      <Text style={styles.stagePrimaryBtnText}>Putar</Text>
                    </Pressable>

                    <Pressable
                      onPress={() => {
                        hapticLight();
                        prefetch(currentHero.id);
                        router.push(`/anime/${currentHero.id}` as never);
                      }}
                      style={({ pressed }) => [
                        styles.stageSecondaryBtn,
                        pressed && styles.btnPressed,
                      ]}
                    >
                      <Text style={styles.stageSecondaryBtnText}>Sinopsis</Text>
                    </Pressable>
                  </View>
                </View>
              </View>

              <View style={styles.stageSegmentsRow}>
                {heroList.map((_: Anime, idx: number) => {
                  const active = idx === safeHeroIdx;
                  return (
                    <Pressable
                      key={idx}
                      onPress={() => {
                        hapticLight();
                        setActiveBannerIndex(idx);
                      }}
                      hitSlop={8}
                      style={[
                        styles.stageSegment,
                        active ? styles.stageSegmentActive : styles.stageSegmentIdle,
                      ]}
                    />
                  );
                })}
              </View>
            </Pressable>
          </View>
        ) : null}

        {/* ══════════════════════════════════════════════════════════════
            3. BENTO QUICK HUBS (4 AKSES CEPAT)
            ══════════════════════════════════════════════════════════════ */}
        <View style={styles.quickHubGrid}>
          {QUICK_HUBS.map((hub) => (
            <Pressable
              key={hub.label}
              accessibilityRole="button"
              accessibilityLabel={hub.label}
              onPress={() => {
                hapticLight();
                router.push(hub.route as never);
              }}
              style={({ pressed }) => [styles.quickHubCard, pressed && styles.btnPressed]}
            >
              <View style={styles.quickHubIconWrap}>
                <AppIcon name={hub.icon as any} size={17} color="#FB7185" />
              </View>
              <Text style={styles.quickHubTitle} numberOfLines={1}>
                {hub.label}
              </Text>
              <Text style={styles.quickHubSub} numberOfLines={1}>
                {hub.sub}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* ══════════════════════════════════════════════════════════════
            4. LANJUTKAN TONTONANMU (CONTINUE WATCHING STRIP)
            ══════════════════════════════════════════════════════════════ */}
        {continueWatchingItems.length > 0 ? (
          <View style={styles.sectionBlock}>
            <View style={styles.sectionHead}>
              <View style={styles.sectionHeadLeft}>
                <View style={styles.sakuraGem}>
                  <View style={styles.sakuraGemInner} />
                </View>
                <View>
                  <Text style={styles.sectionEyebrow}>TERAKHIR DIPUTAR</Text>
                  <Text style={styles.sectionTitle}>Lanjutkan Tontonan</Text>
                </View>
              </View>
              <Pressable
                onPress={() => router.push("/(tabs)/history" as never)}
                style={({ pressed }) => [styles.sectionMorePill, pressed && styles.btnPressed]}
              >
                <Text style={styles.sectionMoreText}>Jejak</Text>
                <AppIcon name="arrow-right" size={12} color="#FB7185" />
              </Pressable>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.continueRail}
            >
              {continueWatchingItems.map((item: any) => {
                const prog = Number(item.progress) || 0;
                const dur = Math.max(Number(item.duration) || 1440, 1);
                const pct = Math.min(100, Math.max(6, Math.round((prog / dur) * 100)));
                const epNum = Number(item.episode_number ?? item.episode ?? 1);
                return (
                  <Pressable
                    key={`${item.anime_id}-${epNum}`}
                    onPress={() => {
                      hapticLight();
                      router.push({
                        pathname: "/watch/[id]",
                        params: {
                          id: String(item.anime_id),
                          ep: String(epNum),
                          title: item.episode_title ?? `Episode ${epNum}`,
                        },
                      } as never);
                    }}
                    style={({ pressed }) => [styles.continueCard, pressed && styles.btnPressed]}
                  >
                    <Image
                      source={{ uri: item.anime_image || "" }}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                    />
                    <LinearGradient
                      colors={["rgba(13,8,11,0.20)", "rgba(13,8,11,0.92)"]}
                      style={StyleSheet.absoluteFill}
                    />
                    <View style={styles.continuePlayCircle}>
                      <AppIcon name="play" size={14} color="#FFFFFF" />
                    </View>
                    <View style={styles.continueMeta}>
                      <Text style={styles.continueEpTag}>EPISODE {epNum}</Text>
                      <Text style={styles.continueAnimeTitle} numberOfLines={1}>
                        {item.anime_title || "Anime"}
                      </Text>
                      <View style={styles.continueBarTrack}>
                        <View style={[styles.continueBarFill, { width: `${pct}%` }]} />
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        {/* ══════════════════════════════════════════════════════════════
            5. SAKURA LOUNGE (LIVE CHAT) & HALL OF FAME (TOP SULTAN)
            ══════════════════════════════════════════════════════════════ */}
        <HomePublicDiscussionBar />
        <HomeTopLeaderboard />

        {/* ══════════════════════════════════════════════════════════════
            6. TOP 10 PERINGKAT ANIME (JAPANESE GIANT RANK NUMBERS)
            ══════════════════════════════════════════════════════════════ */}
        <View style={styles.sectionBlock}>
          <View style={styles.sectionHead}>
            <View style={styles.sectionHeadLeft}>
              <View style={styles.sakuraGem}>
                <View style={styles.sakuraGemInner} />
              </View>
              <View>
                <Text style={styles.sectionEyebrow}>CHART HARIAN</Text>
                <Text style={styles.sectionTitle}>Top 10 Paling Dicari</Text>
              </View>
            </View>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/search",
                  params: { sort: "POPULARITY_DESC", title: "Top Peringkat Anime" },
                } as never)
              }
              style={({ pressed }) => [styles.sectionMorePill, pressed && styles.btnPressed]}
            >
              <Text style={styles.sectionMoreText}>Semua</Text>
              <AppIcon name="arrow-right" size={12} color="#FB7185" />
            </Pressable>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.top10Rail}
          >
            {top10Popular.map((item: Anime, idx: number) => {
              const rankStr = String(idx + 1).padStart(2, "0");
              const isFinished =
                item.status?.toUpperCase() === "FINISHED" ||
                item.status?.toUpperCase() === "COMPLETED";
              const epBadge = isFinished
                ? "TAMAT"
                : item.nextAiringEpisode?.episode
                  ? `EP ${item.nextAiringEpisode.episode}`
                  : typeof item.episodes === "number" && item.episodes > 0
                    ? `EP ${item.episodes}`
                    : "ONGOING";

              return (
                <Pressable
                  key={item.id}
                  onPress={() => {
                    hapticLight();
                    prefetch(item.id);
                    router.push(`/anime/${item.id}` as never);
                  }}
                  style={({ pressed }) => [styles.rankCard, pressed && styles.btnPressed]}
                >
                  <View style={styles.rankPosterBox}>
                    <Image
                      source={{
                        uri: getOptimizedImageUri(
                          item.coverImage?.extraLarge || item.coverImage?.large || "",
                          POSTER_W
                        ),
                      }}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                      transition={150}
                      cachePolicy="memory-disk"
                    />
                    <LinearGradient
                      colors={["transparent", "rgba(13,8,11,0.35)", "rgba(13,8,11,0.95)"]}
                      locations={[0.35, 0.68, 1]}
                      style={StyleSheet.absoluteFill}
                    />

                    <View style={styles.rankScorePill}>
                      <Text style={styles.rankStar}>★</Text>
                      <Text style={styles.rankScoreText}>
                        {item.averageScore ? (item.averageScore / 10).toFixed(1) : "8.5"}
                      </Text>
                    </View>

                    <View style={styles.rankBottomOverlay}>
                      <Text style={[styles.giantRankNum, idx < 3 && styles.giantRankTop3]}>
                        {rankStr}
                      </Text>
                      <View style={styles.rankEpPill}>
                        <Text style={styles.rankEpText}>{epBadge}</Text>
                      </View>
                    </View>
                  </View>

                  <Text style={styles.rankCardTitle} numberOfLines={2}>
                    {animeTitle(item)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* ══════════════════════════════════════════════════════════════
            7. EKSPLORASI GENRE HORIZONTAL PILLS + RAIL DINAMIS
            ══════════════════════════════════════════════════════════════ */}
        <View style={styles.genrePanel}>
          <View style={styles.genreHeaderRow}>
            <View>
              <Text style={styles.sectionEyebrow}>KURASI KATEGORI</Text>
              <Text style={styles.sectionTitle}>Jelajah Genre Pilihan</Text>
            </View>
            <Pressable
              onPress={() => {
                hapticLight();
                router.push(
                  `/search?genre=${selectedGenre}&format=TV&title=${encodeURIComponent(
                    "Anime " + selectedGenre
                  )}` as never
                );
              }}
              style={({ pressed }) => [styles.sectionMorePill, pressed && styles.btnPressed]}
            >
              <Text style={styles.sectionMoreText}>{selectedGenre}</Text>
              <AppIcon name="arrow-right" size={12} color="#FB7185" />
            </Pressable>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.genrePillsRow}
          >
            {SERIES_GENRES.map((g) => {
              const active = g.id === selectedGenre;
              return (
                <Pressable
                  key={g.id}
                  onPress={() => {
                    hapticLight();
                    setSelectedGenre(g.id);
                  }}
                  style={({ pressed }) => [
                    styles.genreChip,
                    active && styles.genreChipActive,
                    pressed && styles.btnPressed,
                  ]}
                >
                  <Text style={[styles.genreChipText, active && styles.genreChipTextActive]}>
                    {g.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {genreAnime.isLoading ? (
            <SkeletonRail />
          ) : genreAnime.data?.length ? (
            <AnimeRail
              title={`Pilihan ${selectedGenre} Terbaik`}
              items={genreAnime.data}
              seeAllParams={{
                genre: selectedGenre,
                format: "TV",
                sort: "POPULARITY_DESC",
                title: `${selectedGenre} Series`,
              }}
            />
          ) : null}
        </View>

        {/* ══════════════════════════════════════════════════════════════
            8. CURATED CATALOG RAILS
            ══════════════════════════════════════════════════════════════ */}
        {(latestAnime.data?.length || rails.data?.ongoing?.length) ? (
          <AnimeRail
            label="UPDATE SEGAR"
            title="Rilis Episode Terbaru"
            items={latestAnime.data?.length ? latestAnime.data : (rails.data?.ongoing ?? [])}
            seeAllParams={{ status: "RELEASING", sort: "TRENDING_DESC", title: "Rilis Terbaru" }}
          />
        ) : null}

        {rails.data?.ongoing?.length ? (
          <AnimeRail
            label="MUSIM AKTIF"
            title="Sedang Tayang Musim Ini"
            items={rails.data.ongoing}
            seeAllParams={{ status: "RELEASING", sort: "POPULARITY_DESC", title: "Tayang Musim Ini" }}
          />
        ) : null}

        {home.data.popular?.length ? (
          <AnimeRail
            label="KLASIK & IKONIK"
            title="Legendaris Sepanjang Masa"
            items={home.data.popular}
            seeAllParams={{ sort: "POPULARITY_DESC", title: "Legendaris Sepanjang Masa" }}
          />
        ) : null}

        {rails.data?.topMovies?.length ? (
          <AnimeRail
            label="SINEMA JEPANG"
            title="Film Anime Skor Tertinggi"
            items={rails.data.topMovies}
            seeAllParams={{ format: "MOVIE", sort: "SCORE_DESC", title: "Film Anime Terbaik" }}
          />
        ) : null}

        <View style={{ height: 96 }} />
      </ScrollView>

      <NotificationSheet
        visible={notifSheetVisible}
        onClose={() => setNotifSheetVisible(false)}
        initialTab={params?.openMailbox === "true" ? "gifts" : undefined}
        initialGiftId={params?.giftId || null}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0D080B",
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 18,
  },
  btnPressed: {
    opacity: 0.84,
    transform: [{ scale: 0.98 }],
  },
  skeletonRailLabel: {
    fontFamily: "SpaceGrotesk-SemiBold",
    fontSize: 11,
    color: "#FB7185",
    letterSpacing: 1.2,
    marginTop: 12,
  },
  skeletonRailRow: {
    gap: 12,
    paddingVertical: 8,
  },

  // ─── 1. HEADER + INTEGRATED SEARCH ───
  headerBlock: {
    gap: 11,
  },
  topHeaderBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brandCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  brandLogoImg: {
    width: 96,
    height: 34,
  },
  greetingWrap: {
    flex: 1,
    minWidth: 0,
    borderLeftWidth: 1,
    borderLeftColor: "rgba(251, 113, 133, 0.22)",
    paddingLeft: 10,
  },
  greetingSub: {
    fontFamily: "SpaceGrotesk-SemiBold",
    fontSize: 9.5,
    color: "#FB7185",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  greetingUser: {
    fontFamily: "Nunito-ExtraBold",
    fontSize: 13,
    color: "#FFF5F7",
  },
  topHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  crystalPillBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 99,
    backgroundColor: "rgba(244, 63, 94, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(251, 113, 133, 0.30)",
  },
  headerCrystalImg: {
    width: 20,
    height: 20,
  },
  crystalPillLabel: {
    fontFamily: "Nunito-ExtraBold",
    fontSize: 11.5,
    color: "#FFF5F7",
  },
  headerActionCircle: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#191016",
    borderWidth: 1,
    borderColor: "rgba(251, 113, 133, 0.22)",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  notifBadgeDot: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#F43F5E",
    borderWidth: 1.5,
    borderColor: "#191016",
  },
  searchStripRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  searchCapsule: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#180F15",
    borderWidth: 1,
    borderColor: "rgba(251, 113, 133, 0.20)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
    gap: 9,
  },
  searchPlaceholder: {
    flex: 1,
    fontFamily: "Nunito-SemiBold",
    fontSize: 13,
    color: "#9A7D8A",
  },
  searchKbdTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 7,
    backgroundColor: "rgba(244, 63, 94, 0.16)",
  },
  searchKbdText: {
    fontFamily: "SpaceGrotesk-SemiBold",
    fontSize: 9.5,
    color: "#FB7185",
    letterSpacing: 0.7,
  },
  diceBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#E11D48",
    borderWidth: 1,
    borderColor: "#FB7185",
    alignItems: "center",
    justifyContent: "center",
  },

  // ─── 2. SAKURA CINEMA STAGE HERO ───
  heroWrapper: {
    width: "100%",
  },
  heroStageCard: {
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "#191016",
    borderWidth: 1,
    borderColor: "rgba(251, 113, 133, 0.26)",
    padding: 15,
    gap: 13,
  },
  stageTopBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  spotlightRibbon: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 99,
    backgroundColor: "rgba(225, 29, 72, 0.88)",
    borderWidth: 1,
    borderColor: "rgba(253, 164, 175, 0.45)",
  },
  spotlightPulse: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FFF5F7",
  },
  spotlightRibbonText: {
    fontFamily: "SpaceGrotesk-SemiBold",
    fontSize: 10,
    color: "#FFFFFF",
    letterSpacing: 0.9,
  },
  stageCounterPill: {
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 99,
    backgroundColor: "rgba(13, 8, 11, 0.72)",
    borderWidth: 1,
    borderColor: "rgba(251, 113, 133, 0.24)",
  },
  stageCounterText: {
    fontFamily: "SpaceGrotesk-SemiBold",
    fontSize: 10,
    color: "#FDA4AF",
    letterSpacing: 0.6,
  },
  stageBodyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  stagePosterFrame: {
    width: 104,
    height: 150,
    borderRadius: 15,
    overflow: "hidden",
    backgroundColor: "#23161F",
    borderWidth: 1.5,
    borderColor: "rgba(253, 164, 175, 0.40)",
  },
  stageInfoCol: {
    flex: 1,
    gap: 8,
    minWidth: 0,
  },
  stageTitle: {
    fontFamily: "Nunito-Black",
    fontSize: 18.5,
    lineHeight: 23,
    color: "#FFF5F7",
    letterSpacing: -0.3,
  },
  stageChipsRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  stageScoreChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 7,
    backgroundColor: "rgba(251, 191, 36, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(251, 191, 36, 0.38)",
  },
  stageStar: {
    color: "#FBBF24",
    fontSize: 10,
  },
  stageScoreVal: {
    fontFamily: "SpaceGrotesk-SemiBold",
    fontSize: 10.5,
    color: "#FDE68A",
  },
  stageEpChip: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 7,
    backgroundColor: "rgba(244, 63, 94, 0.20)",
    borderWidth: 1,
    borderColor: "rgba(251, 113, 133, 0.35)",
  },
  stageEpText: {
    fontFamily: "SpaceGrotesk-SemiBold",
    fontSize: 10,
    color: "#FDA4AF",
  },
  stageSubChip: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 7,
    backgroundColor: "rgba(255, 245, 247, 0.10)",
  },
  stageSubText: {
    fontFamily: "SpaceGrotesk-SemiBold",
    fontSize: 9.5,
    color: "#FFF5F7",
  },
  stageGenresLine: {
    fontFamily: "Nunito-SemiBold",
    fontSize: 11.5,
    color: "#D9BECA",
  },
  stageActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  stagePrimaryBtn: {
    flex: 1,
    height: 38,
    borderRadius: 11,
    backgroundColor: "#F43F5E",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  stagePrimaryBtnText: {
    fontFamily: "Nunito-ExtraBold",
    fontSize: 13,
    color: "#FFFFFF",
  },
  stageSecondaryBtn: {
    height: 38,
    paddingHorizontal: 13,
    borderRadius: 11,
    backgroundColor: "rgba(255, 245, 247, 0.10)",
    borderWidth: 1,
    borderColor: "rgba(251, 113, 133, 0.28)",
    alignItems: "center",
    justifyContent: "center",
  },
  stageSecondaryBtnText: {
    fontFamily: "Nunito-Bold",
    fontSize: 12.5,
    color: "#FFF5F7",
  },
  stageSegmentsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 2,
  },
  stageSegment: {
    flex: 1,
    height: 3.5,
    borderRadius: 99,
  },
  stageSegmentActive: {
    backgroundColor: "#F43F5E",
  },
  stageSegmentIdle: {
    backgroundColor: "rgba(255, 245, 247, 0.16)",
  },

  // ─── 3. BENTO QUICK HUBS ───
  quickHubGrid: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 9,
  },
  quickHubCard: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: "#180F15",
    borderWidth: 1,
    borderColor: "rgba(251, 113, 133, 0.16)",
    paddingVertical: 11,
    paddingHorizontal: 8,
    alignItems: "center",
    gap: 3,
  },
  quickHubIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "rgba(244, 63, 94, 0.14)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  quickHubTitle: {
    fontFamily: "Nunito-ExtraBold",
    fontSize: 12,
    color: "#FFF5F7",
  },
  quickHubSub: {
    fontFamily: "Nunito-SemiBold",
    fontSize: 9.5,
    color: "#9A7D8A",
  },

  // ─── SHARED SECTION HEADERS ───
  sectionBlock: {
    gap: 12,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionHeadLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  sakuraGem: {
    width: 18,
    height: 18,
    borderRadius: 6,
    backgroundColor: "rgba(244, 63, 94, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(251, 113, 133, 0.42)",
    alignItems: "center",
    justifyContent: "center",
  },
  sakuraGemInner: {
    width: 6,
    height: 6,
    borderRadius: 2,
    backgroundColor: "#F43F5E",
    transform: [{ rotate: "45deg" }],
  },
  sectionEyebrow: {
    fontFamily: "SpaceGrotesk-SemiBold",
    fontSize: 9.5,
    color: "#FB7185",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  sectionTitle: {
    fontFamily: "Nunito-ExtraBold",
    fontSize: 17,
    color: "#FFF5F7",
    letterSpacing: -0.3,
  },
  sectionMorePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 99,
    backgroundColor: "rgba(244, 63, 94, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(251, 113, 133, 0.25)",
  },
  sectionMoreText: {
    fontFamily: "Nunito-Bold",
    fontSize: 11.5,
    color: "#FB7185",
  },

  // ─── 4. CONTINUE WATCHING ───
  continueRail: {
    gap: 12,
    paddingRight: 8,
  },
  continueCard: {
    width: 214,
    height: 116,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#191016",
    borderWidth: 1,
    borderColor: "rgba(251, 113, 133, 0.22)",
    padding: 11,
    justifyContent: "space-between",
  },
  continuePlayCircle: {
    alignSelf: "flex-end",
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(244, 63, 94, 0.90)",
    alignItems: "center",
    justifyContent: "center",
  },
  continueMeta: {
    gap: 3,
  },
  continueEpTag: {
    fontFamily: "SpaceGrotesk-SemiBold",
    fontSize: 9.5,
    color: "#FDA4AF",
    letterSpacing: 0.7,
  },
  continueAnimeTitle: {
    fontFamily: "Nunito-ExtraBold",
    fontSize: 13,
    color: "#FFF5F7",
  },
  continueBarTrack: {
    height: 4,
    borderRadius: 99,
    backgroundColor: "rgba(255, 245, 247, 0.18)",
    overflow: "hidden",
    marginTop: 2,
  },
  continueBarFill: {
    height: "100%",
    borderRadius: 99,
    backgroundColor: "#F43F5E",
  },

  // ─── 6. TOP 10 GIANT RANK CARDS ───
  top10Rail: {
    gap: 13,
    paddingRight: 12,
  },
  rankCard: {
    width: 148,
    gap: 7,
  },
  rankPosterBox: {
    height: 206,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#191016",
    borderWidth: 1,
    borderColor: "rgba(251, 113, 133, 0.18)",
  },
  rankScorePill: {
    position: "absolute",
    top: 7,
    right: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6.5,
    paddingVertical: 2.5,
    borderRadius: 99,
    backgroundColor: "rgba(13, 8, 11, 0.80)",
    borderWidth: 1,
    borderColor: "rgba(251, 191, 36, 0.36)",
  },
  rankStar: {
    color: "#FBBF24",
    fontSize: 9.5,
  },
  rankScoreText: {
    fontFamily: "SpaceGrotesk-SemiBold",
    fontSize: 10.5,
    color: "#FFF5F7",
  },
  rankBottomOverlay: {
    position: "absolute",
    left: 8,
    right: 8,
    bottom: 6,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  giantRankNum: {
    fontFamily: "SpaceGrotesk-SemiBold",
    fontSize: 34,
    lineHeight: 36,
    color: "#FFF5F7",
    fontWeight: "900",
    textShadowColor: "rgba(225, 29, 72, 0.85)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  giantRankTop3: {
    color: "#FB7185",
  },
  rankEpPill: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 7,
    backgroundColor: "rgba(225, 29, 72, 0.90)",
    marginBottom: 4,
  },
  rankEpText: {
    fontFamily: "SpaceGrotesk-SemiBold",
    fontSize: 9.5,
    color: "#FFFFFF",
    fontWeight: "800",
  },
  rankCardTitle: {
    fontFamily: "Nunito-Bold",
    fontSize: 13,
    lineHeight: 17,
    color: "#FFF5F7",
    paddingHorizontal: 2,
  },

  // ─── 7. GENRE EXPLORER PANEL ───
  genrePanel: {
    borderRadius: 22,
    backgroundColor: "#150D12",
    borderWidth: 1,
    borderColor: "rgba(251, 113, 133, 0.16)",
    padding: 15,
    gap: 14,
  },
  genreHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  genrePillsRow: {
    gap: 8,
    paddingRight: 6,
  },
  genreChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 99,
    backgroundColor: "#21141C",
    borderWidth: 1,
    borderColor: "rgba(251, 113, 133, 0.16)",
  },
  genreChipActive: {
    backgroundColor: "#F43F5E",
    borderColor: "#FDA4AF",
  },
  genreChipText: {
    fontFamily: "Nunito-Bold",
    fontSize: 12.5,
    color: "#C4A6B3",
  },
  genreChipTextActive: {
    color: "#FFFFFF",
    fontFamily: "Nunito-ExtraBold",
  },
});
