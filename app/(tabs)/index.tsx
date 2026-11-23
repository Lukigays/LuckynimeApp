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

  const wbMemberNo = auth.profile?.member_number ?? 1;
  const wbLevel = Number(auth.profile?.level) || 1;
  const wbAvatar = auth.profile?.avatar_url || "https://cdn-icons-png.flaticon.com/512/149/149071.png";

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.container}>
      <InAppEpisodeAlertMonitor />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#EF4444" />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* ══════════════════════════════════════════════════════════════
            1. KURO-SAKURA HEADER + INTEGRATED SEARCH PILL BAR
            ══════════════════════════════════════════════════════════════ */}
        {/* ── Wibuku-style user bar + full-width search capsule ── */}
        <View style={wbHome.headerBlock}>
          <View style={wbHome.userBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Buka profil"
              onPress={() => {
                hapticLight();
                router.push("/(tabs)/profile" as never);
              }}
              style={({ pressed }) => [pressed && styles.btnPressed]}
            >
              <Image source={{ uri: wbAvatar }} style={wbHome.avatar} contentFit="cover" />
            </Pressable>
            <View style={wbHome.userText}>
              <Text style={wbHome.userName} numberOfLines={1}>{greetingName}</Text>
              <Text style={wbHome.userSub} numberOfLines={1}>{`#${wbMemberNo} • Level ${wbLevel}`}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Top Up Crystal"
              onPress={() => {
                hapticLight();
                router.push("/topup" as never);
              }}
              style={({ pressed }) => [wbHome.crystalChip, pressed && styles.btnPressed]}
              hitSlop={8}
            >
              <Image
                source={require("@/assets/images/topup/topup-crystal.png")}
                style={styles.headerCrystalImg}
                contentFit="contain"
              />
              <Text style={wbHome.crystalText}>Crystal</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Kotak Masuk dan Notifikasi"
              onPress={() => {
                hapticLight();
                setNotifSheetVisible(true);
              }}
              style={({ pressed }) => [wbHome.bellBtn, pressed && styles.btnPressed]}
              hitSlop={8}
            >
              <AppIcon name="bell-outline" size={20} color="#F3F4F6" />
              {unreadNotifCount > 0 ? <View style={styles.notifBadgeDot} /> : null}
            </Pressable>
          </View>

          <View style={wbHome.searchRow}>
            <Pressable
              accessibilityRole="search"
              accessibilityLabel="Cari anime di sini"
              onPress={() => {
                hapticLight();
                router.push("/search" as never);
              }}
              style={({ pressed }) => [wbHome.searchCapsule, pressed && styles.btnPressed]}
            >
              <AppIcon name="magnify" size={18} color="#9CA3AF" />
              <Text style={wbHome.searchText} numberOfLines={1}>Cari Anime Di Sini</Text>
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
              style={({ pressed }) => [wbHome.diceBtn, pressed && styles.btnPressed]}
            >
              <AppIcon name="shuffle-variant" size={18} color="#F3F4F6" />
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
                  "rgba(18,19,22, 0.35)",
                  "rgba(20, 10, 16, 0.84)",
                  "rgba(18,19,22, 0.98)",
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
                <AppIcon name={hub.icon as any} size={17} color="#FFFFFF" />
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
                <View>
                  <Text style={styles.sectionTitle}>Lanjutkan Tontonan</Text>
                </View>
              </View>
              <Pressable
                onPress={() => router.push("/(tabs)/history" as never)}
                style={({ pressed }) => [styles.sectionMorePill, pressed && styles.btnPressed]}
              >
                <Text style={styles.sectionMoreText}>Jejak</Text>
                <AppIcon name="arrow-right" size={12} color="#FFFFFF" />
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
                      const savedProgress = Number(item.progress) || 0;
                      const savedDuration = Number(item.duration) || 0;
                      const canResume =
                        savedProgress > 3 &&
                        (savedDuration <= 0 || (savedProgress < savedDuration - 8 && savedProgress / savedDuration < 0.96));
                      router.push({
                        pathname: "/watch/[id]",
                        params: {
                          id: String(item.anime_id),
                          episode: String(epNum),
                          title: item.anime_title || "Anime",
                          image: item.anime_image || "",
                          ...(canResume ? { resumeTime: String(Math.floor(savedProgress)) } : {}),
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
                      colors={["rgba(18,19,22,0.20)", "rgba(18,19,22,0.92)"]}
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
              <View>
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
              <AppIcon name="arrow-right" size={12} color="#FFFFFF" />
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
                      colors={["transparent", "rgba(18,19,22,0.35)", "rgba(18,19,22,0.95)"]}
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
              <AppIcon name="arrow-right" size={12} color="#FFFFFF" />
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
    backgroundColor: "#121316",
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
    fontFamily: "Nunito-SemiBold",
    fontSize: 11,
    color: "#FFFFFF",
    letterSpacing: 0.2,
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
    borderLeftColor: "rgba(255, 255, 255, 0.22)",
    paddingLeft: 10,
  },
  greetingSub: {
    fontFamily: "Nunito-SemiBold",
    fontSize: 9.5,
    color: "#FFFFFF",
    letterSpacing: 0.2,
  },
  greetingUser: {
    fontFamily: "Nunito-Bold",
    fontSize: 13,
    color: "#F3F4F6",
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
    backgroundColor: "rgba(239, 68, 68, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.30)",
  },
  headerCrystalImg: {
    width: 20,
    height: 20,
  },
  crystalPillLabel: {
    fontFamily: "Nunito-Bold",
    fontSize: 11.5,
    color: "#F3F4F6",
  },
  headerActionCircle: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#1B1D22",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.22)",
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
    backgroundColor: "#EF4444",
    borderWidth: 1.5,
    borderColor: "#1B1D22",
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
    backgroundColor: "#1B1D22",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.20)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
    gap: 9,
  },
  searchPlaceholder: {
    flex: 1,
    fontFamily: "Nunito-SemiBold",
    fontSize: 13,
    color: "#8E93A2",
  },
  searchKbdTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 7,
    backgroundColor: "rgba(239, 68, 68, 0.16)",
  },
  searchKbdText: {
    fontFamily: "Nunito-SemiBold",
    fontSize: 9.5,
    color: "#FFFFFF",
    letterSpacing: 0.2,
  },
  diceBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#EF4444",
    borderWidth: 1,
    borderColor: "#FFFFFF",
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
    backgroundColor: "#1B1D22",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.26)",
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
    backgroundColor: "rgba(239, 68, 68, 0.88)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255, 0.45)",
  },
  spotlightPulse: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#F3F4F6",
  },
  spotlightRibbonText: {
    fontFamily: "Nunito-SemiBold",
    fontSize: 10,
    color: "#FFFFFF",
    letterSpacing: 0.2,
  },
  stageCounterPill: {
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 99,
    backgroundColor: "rgba(18,19,22, 0.72)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.24)",
  },
  stageCounterText: {
    fontFamily: "Nunito-SemiBold",
    fontSize: 10,
    color: "#D1D5DB",
    letterSpacing: 0.2,
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
    backgroundColor: "#23262F",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255, 0.40)",
  },
  stageInfoCol: {
    flex: 1,
    gap: 8,
    minWidth: 0,
  },
  stageTitle: {
    fontFamily: "Nunito-Bold",
    fontSize: 18.5,
    lineHeight: 23,
    color: "#F3F4F6",
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
    color: "#F5C518",
    fontSize: 10,
  },
  stageScoreVal: {
    fontFamily: "Nunito-SemiBold",
    fontSize: 10.5,
    color: "#F5C518",
  },
  stageEpChip: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 7,
    backgroundColor: "rgba(239, 68, 68, 0.20)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.35)",
  },
  stageEpText: {
    fontFamily: "Nunito-SemiBold",
    fontSize: 10,
    color: "#D1D5DB",
  },
  stageSubChip: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 7,
    backgroundColor: "rgba(243,244,246, 0.10)",
  },
  stageSubText: {
    fontFamily: "Nunito-SemiBold",
    fontSize: 9.5,
    color: "#F3F4F6",
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
    backgroundColor: "#EF4444",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  stagePrimaryBtnText: {
    fontFamily: "Nunito-Bold",
    fontSize: 13,
    color: "#FFFFFF",
  },
  stageSecondaryBtn: {
    height: 38,
    paddingHorizontal: 13,
    borderRadius: 11,
    backgroundColor: "rgba(243,244,246, 0.10)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.28)",
    alignItems: "center",
    justifyContent: "center",
  },
  stageSecondaryBtnText: {
    fontFamily: "Nunito-Bold",
    fontSize: 12.5,
    color: "#F3F4F6",
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
    backgroundColor: "#EF4444",
  },
  stageSegmentIdle: {
    backgroundColor: "rgba(243,244,246, 0.16)",
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
    backgroundColor: "#1B1D22",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.16)",
    paddingVertical: 11,
    paddingHorizontal: 8,
    alignItems: "center",
    gap: 3,
  },
  quickHubIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "rgba(239, 68, 68, 0.14)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  quickHubTitle: {
    fontFamily: "Nunito-Bold",
    fontSize: 12,
    color: "#F3F4F6",
  },
  quickHubSub: {
    fontFamily: "Nunito-SemiBold",
    fontSize: 9.5,
    color: "#8E93A2",
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
    backgroundColor: "rgba(239, 68, 68, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.42)",
    alignItems: "center",
    justifyContent: "center",
  },
  sakuraGemInner: {
    width: 6,
    height: 6,
    borderRadius: 2,
    backgroundColor: "#EF4444",
    transform: [{ rotate: "45deg" }],
  },
  sectionEyebrow: {
    fontFamily: "Nunito-SemiBold",
    fontSize: 9.5,
    color: "#FFFFFF",
    letterSpacing: 0.2,
  },
  sectionTitle: {
    fontFamily: "Nunito-Bold",
    fontSize: 17,
    color: "#F3F4F6",
    letterSpacing: -0.3,
  },
  sectionMorePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 99,
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.25)",
  },
  sectionMoreText: {
    fontFamily: "Nunito-Bold",
    fontSize: 11.5,
    color: "#FFFFFF",
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
    backgroundColor: "#1B1D22",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.22)",
    padding: 11,
    justifyContent: "space-between",
  },
  continuePlayCircle: {
    alignSelf: "flex-end",
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(239, 68, 68, 0.90)",
    alignItems: "center",
    justifyContent: "center",
  },
  continueMeta: {
    gap: 3,
  },
  continueEpTag: {
    fontFamily: "Nunito-SemiBold",
    fontSize: 9.5,
    color: "#D1D5DB",
    letterSpacing: 0.2,
  },
  continueAnimeTitle: {
    fontFamily: "Nunito-Bold",
    fontSize: 13,
    color: "#F3F4F6",
  },
  continueBarTrack: {
    height: 4,
    borderRadius: 99,
    backgroundColor: "rgba(243,244,246, 0.18)",
    overflow: "hidden",
    marginTop: 2,
  },
  continueBarFill: {
    height: "100%",
    borderRadius: 99,
    backgroundColor: "#EF4444",
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
    backgroundColor: "#1B1D22",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.18)",
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
    backgroundColor: "rgba(18,19,22, 0.80)",
    borderWidth: 1,
    borderColor: "rgba(251, 191, 36, 0.36)",
  },
  rankStar: {
    color: "#F5C518",
    fontSize: 9.5,
  },
  rankScoreText: {
    fontFamily: "Nunito-SemiBold",
    fontSize: 10.5,
    color: "#F3F4F6",
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
    fontFamily: "Nunito-SemiBold",
    fontSize: 34,
    lineHeight: 36,
    color: "#F3F4F6",
    fontWeight: "900",
    textShadowColor: "rgba(239, 68, 68, 0.85)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  giantRankTop3: {
    color: "#FFFFFF",
  },
  rankEpPill: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 7,
    backgroundColor: "rgba(239, 68, 68, 0.90)",
    marginBottom: 4,
  },
  rankEpText: {
    fontFamily: "Nunito-SemiBold",
    fontSize: 9.5,
    color: "#FFFFFF",
    fontWeight: "800",
  },
  rankCardTitle: {
    fontFamily: "Nunito-Bold",
    fontSize: 13,
    lineHeight: 17,
    color: "#F3F4F6",
    paddingHorizontal: 2,
  },

  // ─── 7. GENRE EXPLORER PANEL ───
  genrePanel: {
    borderRadius: 22,
    backgroundColor: "#150D12",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.16)",
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
    borderColor: "rgba(255, 255, 255, 0.16)",
  },
  genreChipActive: {
    backgroundColor: "#EF4444",
    borderColor: "#D1D5DB",
  },
  genreChipText: {
    fontFamily: "Nunito-Bold",
    fontSize: 12.5,
    color: "#9CA3AF",
  },
  genreChipTextActive: {
    color: "#FFFFFF",
    fontFamily: "Nunito-Bold",
  },
});

const wbHome = StyleSheet.create({
  headerBlock: { gap: 14, paddingTop: 6 },
  userBar: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#1B1D22" },
  userText: { flex: 1, gap: 2 },
  userName: { color: "#F3F4F6", fontFamily: "Nunito-Bold", fontSize: 15 },
  userSub: { color: "#9CA3AF", fontFamily: "Nunito-Regular", fontSize: 12 },
  crystalChip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#1B1D22", borderRadius: 999, paddingHorizontal: 10, height: 36 },
  crystalText: { color: "#F5C518", fontFamily: "Nunito-Bold", fontSize: 12.5 },
  bellBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "#1B1D22" },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  searchCapsule: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, height: 44, borderRadius: 999, paddingHorizontal: 16, backgroundColor: "#1B1D22" },
  searchText: { color: "#9CA3AF", fontFamily: "Nunito-Regular", fontSize: 14, flex: 1 },
  diceBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "#22252D" },
});
