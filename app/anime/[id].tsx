import { useEffect, useMemo, useState } from "react";
import { useWindowDimensions } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getAnimeById, getRecommendations, getSeededAnimeById } from "@/lib/anilist";
import { BANNER_W, POSTER_W, getOptimizedImageUri } from "@/lib/image-optimization";
import { parseRouteId } from "@/lib/route-params";
import { getEpisodes } from "@/lib/luckynime-api";
import { enrichEpisodesWithTmdb } from "@/lib/tmdb-episodes";
import { groupAnimeRelations } from "@/lib/anime-relations";
import { animeTitle } from "@/lib/types";
import { chooseResumeEpisode } from "@/lib/watch-progress";
import { episodePageCount, episodePageSlice, isConfirmedFutureRelease } from "@/lib/watch-engine";
import { isWideLayout } from "@/lib/up-next";
import { useLuckynimeAuth } from "@/providers/auth-provider";
import { useBookmarks } from "@/hooks/use-bookmarks";
import { useEpisodeRatings } from "@/hooks/use-episode-ratings";
import { useNotifyMe } from "@/hooks/use-notify-me";
import { useWatchHistory } from "@/hooks/use-watch-history";
import { AnimeComments } from "@/components/anime-comments";
import { ErrorState, LoadingState } from "@/components/async-state";
import { AppIcon } from "@/components/app-icon";
import { AiringSchedule } from "@/components/airing-schedule";
import { hapticLight, hapticSuccess } from "@/lib/haptics";

function cleanSynopsisText(raw?: string | null): string {
  if (!raw) return "Tidak ada sinopsis tersedia.";
  const cleaned = raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(
      /\(\s*(?:source|sumber|written\s+by|ditulis\s+oleh|translated\s+by|diterjemahkan\s+oleh|credit|courtesy\s+of)\s*:?[^)]*\)/gi,
      ""
    )
    .replace(
      /\[\s*(?:source|sumber|written\s+by|ditulis\s+oleh|translated\s+by|diterjemahkan\s+oleh|credit)\s*:?[^\]]*\]/gi,
      ""
    )
    .replace(
      /^[ \t]*(?:source|sumber|written\s+by|ditulis\s+oleh|translated\s+by|diterjemahkan\s+oleh)\s*:\s*[^\n]+$/gim,
      ""
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned || "Tidak ada sinopsis tersedia.";
}

function formatAiringDate(airingAt?: number | null): string {
  if (!airingAt) return "Segera Tayang";
  const date = new Date(airingAt * 1000);
  const now = new Date();
  const diffHours = (date.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (diffHours > 0 && diffHours < 24) {
    return "Tayang Hari Ini";
  } else if (diffHours >= 24 && diffHours < 48) {
    return "Tayang Besok";
  }
  return `Tayang ${date.toLocaleDateString("id-ID", { day: "numeric", month: "short" })}`;
}

function getStatusDisplay(status?: string | null): string {
  if (!status) return "-";
  const s = status.toUpperCase();
  if (s === "RELEASING") return "Ongoing";
  if (s === "FINISHED" || s === "COMPLETED") return "Completed";
  if (s === "NOT_YET_RELEASED") return "Upcoming";
  if (s === "CANCELLED") return "Cancelled";
  if (s === "HIATUS") return "Hiatus";
  return status;
}

function getSourceDisplay(source?: string | null): string {
  if (!source) return "Manga";
  return source
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function getSeasonDisplay(season?: string | null, seasonYear?: number | null): string {
  if (season && seasonYear) {
    const sName = season.charAt(0).toUpperCase() + season.slice(1).toLowerCase();
    return `${sName} ${seasonYear}`;
  }
  if (seasonYear) return String(seasonYear);
  return "-";
}

function getStudioDisplay(studios?: any): string {
  const mainStudio =
    studios?.edges?.find((e: any) => e.isMain)?.node?.name ||
    studios?.nodes?.[0]?.name;
  return mainStudio || "-";
}

function getProducersDisplay(studios?: any, studioDisplay?: string): string {
  const nonMain = studios?.edges
    ?.filter((e: any) => !e.isMain && e.node?.name)
    .map((e: any) => e.node?.name)
    .filter(Boolean);
  if (nonMain && nonMain.length > 0) {
    return nonMain.slice(0, 2).join(", ");
  }
  return studioDisplay && studioDisplay !== "-" ? studioDisplay : "-";
}

function getReleasedDisplay(startDate?: any, endDate?: any): string {
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const formatD = (d?: { year?: number | null; month?: number | null; day?: number | null } | null) => {
    if (!d?.year) return null;
    const m = d.month ? `${months[d.month - 1]} ` : "";
    const day = d.day ? `${d.day}, ` : "";
    return `${m}${day}${d.year}`;
  };
  const s = formatD(startDate);
  const e = formatD(endDate);
  if (s && e) return `${s} to ${e}`;
  if (s) return `${s} to ?`;
  return "-";
}

export default function AnimeDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = parseRouteId(params.id) ?? -1;
  const invalidId = id <= 0;
  const auth = useLuckynimeAuth();

  const anime = useQuery({
    queryKey: ["anime", id],
    queryFn: () => getAnimeById(id),
    placeholderData: () => getSeededAnimeById(id),
    enabled: !invalidId,
    staleTime: 15 * 60_000,
  });
  const episodes = useQuery({
    queryKey: ["episodes", id],
    queryFn: () => getEpisodes(id),
    enabled: !invalidId,
    staleTime: 10 * 60_000,
  });
  const canonicalEpisodeRows = useMemo(() => episodes.data ?? [], [episodes.data]);
  const episodeSignature = useMemo(
    () =>
      canonicalEpisodeRows
        .map((item) => `${item.number}:${item.title ?? ""}:${item.thumbnail ?? ""}`)
        .join("|"),
    [canonicalEpisodeRows]
  );
  const fallbackThumbnail =
    anime.data?.bannerImage ||
    anime.data?.coverImage?.extraLarge ||
    anime.data?.coverImage?.large ||
    "";
  const fallbackTitle = anime.data ? animeTitle(anime.data) : "";
  const tmdbEpisodes = useQuery({
    queryKey: [
      "tmdb-episode-display",
      id,
      episodeSignature,
      fallbackThumbnail,
      fallbackTitle,
      anime.data?.format,
    ],
    queryFn: () =>
      enrichEpisodesWithTmdb(id, canonicalEpisodeRows, {
        fallbackThumbnail,
        fallbackTitle,
        isMovie: anime.data?.format === "MOVIE",
      }),
    enabled:
      Number.isFinite(id) &&
      id > 0 &&
      episodes.isSuccess &&
      canonicalEpisodeRows.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const history = useWatchHistory();
  const bookmarks = useBookmarks();
  const ratings = useEpisodeRatings(id);
  const notifyMe = useNotifyMe(id);
  const [episodePage, setEpisodePage] = useState(0);
  const [episodeSearch, setEpisodeSearch] = useState("");
  const [isSynopsisExpanded, setIsSynopsisExpanded] = useState(false);
  const { width } = useWindowDimensions();
  const recommendations = useQuery({
    queryKey: ["recommendations", id],
    queryFn: () => getRecommendations(id),
    enabled: Number.isFinite(id) && id > 0,
    staleTime: 10 * 60_000,
  });

  const twoPane = isWideLayout(width);

  const episodeRows = useMemo(() => {
    const base = tmdbEpisodes.data ?? canonicalEpisodeRows;
    const term = episodeSearch.trim().toLowerCase();
    if (!term) return base;
    return base.filter(
      (ep) =>
        String(ep.number).includes(term) ||
        (ep.title || "").toLowerCase().includes(term)
    );
  }, [canonicalEpisodeRows, tmdbEpisodes.data, episodeSearch]);

  const totalEpisodePages = episodePageCount(episodeRows.length);
  const safeEpisodePage = Math.min(episodePage, totalEpisodePages - 1);
  const pagedEpisodeRows = useMemo(
    () => episodePageSlice(episodeRows, safeEpisodePage),
    [episodeRows, safeEpisodePage]
  );
  const episodePageStart = episodeRows.length ? safeEpisodePage * 50 + 1 : 0;
  const episodePageEnd = Math.min(episodeRows.length, (safeEpisodePage + 1) * 50);
  const animeHistory = useMemo(
    () => history.history.data?.filter((entry) => entry.anime_id === id) ?? [],
    [history.history.data, id]
  );
  const resumeEpisode = useMemo(
    () => chooseResumeEpisode(animeHistory),
    [animeHistory]
  );
  const relationGroups = useMemo(
    () => groupAnimeRelations(anime.data?.relations?.edges),
    [anime.data?.relations?.edges]
  );

  // MUST be before early returns to avoid Rules of Hooks violation
  const cleanedSynopsis = useMemo(
    () => cleanSynopsisText(anime.data?.description),
    [anime.data?.description]
  );

  useEffect(() => {
    setEpisodePage((current) => Math.min(current, totalEpisodePages - 1));
  }, [totalEpisodePages]);

  useEffect(() => {
    setIsSynopsisExpanded(false);
  }, [id]);

  if (invalidId) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.topNav}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.btnPressed]}
          >
            <AppIcon name="arrow-left" size={20} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.navTitle}>Detail Anime</Text>
          <View style={{ width: 40 }} />
        </View>
        <ErrorState
          message="Tautan anime ini tidak valid."
          onRetry={() => router.back()}
          retryLabel="KEMBALI"
        />
      </SafeAreaView>
    );
  }

  if (anime.isPending) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.topNav}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.btnPressed]}
          >
            <AppIcon name="arrow-left" size={20} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.navTitle}>Detail Anime</Text>
          <View style={{ width: 40 }} />
        </View>
        <LoadingState label="Memuat informasi anime..." />
      </SafeAreaView>
    );
  }

  if (anime.isError || !anime.data) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.topNav}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.btnPressed]}
          >
            <AppIcon name="arrow-left" size={20} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.navTitle}>Detail Anime</Text>
          <View style={{ width: 40 }} />
        </View>
        <ErrorState
          message={anime.error?.message ?? "Gagal memuat informasi anime ini."}
          onRetry={() => void anime.refetch()}
        />
      </SafeAreaView>
    );
  }

  const data = anime.data;
  const title = animeTitle(data);
  const isSynopsisLong = cleanedSynopsis.length > 200 || cleanedSynopsis.includes("\n\n");

  // Metadata Details Helper (Japanese, English, Status, Type, Source, Duration, Season, Studio, Producers, Released)
  const statusDisplay = getStatusDisplay(data?.status);
  const sourceDisplay = getSourceDisplay(data?.source);
  const seasonDisplay = getSeasonDisplay(data?.season, data?.seasonYear);
  const studioDisplay = getStudioDisplay(data?.studios);
  const producersDisplay = getProducersDisplay(data?.studios, studioDisplay);
  const releasedDisplay = getReleasedDisplay(data?.startDate, data?.endDate);
  const openEpisode = (episodeNumber: number) => {
    const isFuture = isConfirmedFutureRelease({
      episodeNumber,
      episodes: canonicalEpisodeRows,
      status: data.status,
      nextAiringEpisode: data.nextAiringEpisode,
      hasConfirmedEpisodeList: episodes.isSuccess && canonicalEpisodeRows.length > 0,
    });

    if (isFuture) {
      hapticLight();
      let msg = `Episode ${episodeNumber} belum resmi ditayangkan.`;
      if (data.nextAiringEpisode?.episode === episodeNumber && data.nextAiringEpisode?.airingAt) {
        const dateStr = new Date(data.nextAiringEpisode.airingAt * 1000).toLocaleDateString("id-ID", {
          day: "numeric",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
        msg = `Episode ${episodeNumber} dijadwalkan tayang pada ${dateStr} WIB. Silakan nantikan penayangannya ya!`;
      } else {
        msg = `Episode ${episodeNumber} belum resmi ditayangkan. Nantikan tanggal rilis resminya ya!`;
      }
      Alert.alert("Episode Belum Tayang", msg, [{ text: "Mengerti" }]);
      return;
    }

    hapticLight();
    const matchedHistory = history.displayRows?.find(
      (entry: any) => Number(entry?.anime_id) === id && Number(entry?.episode_number) === episodeNumber,
    );
    const savedProgress = Number(matchedHistory?.progress ?? 0);
    const savedDuration = Number(matchedHistory?.duration ?? 0);
    const canResume =
      Number.isFinite(savedProgress) &&
      savedProgress > 3 &&
      (!Number.isFinite(savedDuration) || savedDuration <= 0 || (savedProgress < savedDuration - 8 && savedProgress / savedDuration < 0.96));
    router.push({
      pathname: "/watch/[id]",
      params: {
        id: String(id),
        episode: String(episodeNumber),
        title,
        image: data.coverImage?.extraLarge || data.coverImage?.large || "",
        ...(canResume ? { resumeTime: String(Math.floor(savedProgress)) } : {}),
      },
    } as never);
  };
  const lastAvailableEpisode =
    episodeRows.at(-1)?.number ?? Math.max(data.episodes ?? 1, 1);
  const displayedResume = Math.min(resumeEpisode, lastAvailableEpisode);

  const isSaved = bookmarks.isBookmarked(id);
  const bannerUri = data.bannerImage
    ? getOptimizedImageUri(data.bannerImage, BANNER_W)
    : data.coverImage?.extraLarge
    ? getOptimizedImageUri(data.coverImage.extraLarge, BANNER_W)
    : data.coverImage?.large || "";
  const posterUri = data.coverImage?.extraLarge
    ? getOptimizedImageUri(data.coverImage.extraLarge, POSTER_W)
    : data.coverImage?.large || "";

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.container}>
      {/* Top Floating App Bar */}
      <View style={styles.topNav}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Kembali"
          onPress={() => {
            hapticLight();
            router.back();
          }}
          style={({ pressed }) => [styles.iconBtn, pressed && styles.btnPressed]}
        >
          <AppIcon name="arrow-left" size={20} color="#FFFFFF" />
        </Pressable>

        <Text style={styles.navTitle} numberOfLines={1}>
          {title}
        </Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Bagikan Anime"
          onPress={() => {
            hapticLight();
            const deepLink = `luckynime://anime/${id}`;
            const webUrl = `https://luckynime.tech/anime/${id}`;
            Share.share({
              title,
              message: `Tonton ${title} di Luckynime\n${deepLink}`,
              url: Platform.OS === "ios" ? deepLink : webUrl,
            }).catch(() => {});
          }}
          style={({ pressed }) => [styles.iconBtn, pressed && styles.btnPressed]}
        >
          <AppIcon name="share-variant" size={18} color="#FFFFFF" />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Wibuku-style hero: small poster + clean meta, no heavy backdrop */}
        <View style={wb.hero}>
          {posterUri ? (
            <Image
              source={{ uri: posterUri }}
              style={wb.poster}
              contentFit="cover"
              transition={200}
              cachePolicy="memory-disk"
            />
          ) : (
            <View style={[wb.poster, styles.posterFallback]}>
              <AppIcon name="image-outline" size={28} color="#8E93A2" />
            </View>
          )}
          <View style={wb.heroMeta}>
            <Text style={wb.title} numberOfLines={3}>{title}</Text>
            <Text style={wb.sub} numberOfLines={1}>
              {[data.format, data.seasonYear ? String(data.seasonYear) : null, data.episodes ? `${data.episodes} Eps` : null]
                .filter(Boolean)
                .join(" • ") || "Sub Indo"}
            </Text>
            <View style={wb.chipRow}>
              <View style={wb.chip}>
                <Text style={wb.chipText}>{statusDisplay || (data.status === "RELEASING" ? "Tayang" : data.status === "FINISHED" ? "Selesai" : "Anime")}</Text>
              </View>
              {data.averageScore ? (
                <View style={wb.scoreChip}>
                  <AppIcon name="star" size={12} color="#F5C518" />
                  <Text style={wb.scoreText}>{(data.averageScore / 10).toFixed(1)}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {/* Buttons Row Matching Image 2: Dark Capsule Glass Pills (NO BLUE!) */}
        <View style={styles.image2ButtonRow}>
          {/* Main Play Button: ▶ Tonton Sekarang / Lanjutkan */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tonton Sekarang"
            onPress={() => openEpisode(displayedResume)}
            style={({ pressed }) => [
              styles.capsuleBtnPrimary,
              pressed && styles.btnPressed,
            ]}
          >
            <AppIcon name="play" size={16} color="#121316" />
            <Text style={styles.capsuleBtnPrimaryText} numberOfLines={1}>
              {animeHistory.length
                ? `Lanjut Ep ${displayedResume}`
                : "Tonton Sekarang"}
            </Text>
          </Pressable>

          {/* Simpan / Bookmark Button */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isSaved ? "Tersimpan" : "Simpan"}
            onPress={() => {
              if (!auth.user) {
                router.push("/auth" as never);
                return;
              }
              hapticSuccess();
              bookmarks.toggle.mutate(data);
            }}
            style={({ pressed }) => [
              styles.capsuleBtnSecondary,
              isSaved && styles.capsuleBtnSaved,
              pressed && styles.btnPressed,
            ]}
          >
            <AppIcon
              name={isSaved ? "bookmark" : "bookmark-outline"}
              size={16}
              color={isSaved ? "#F5C518" : "#FFFFFF"}
            />
            <Text
              style={[
                styles.capsuleBtnSecondaryText,
                isSaved && styles.capsuleBtnSavedText,
              ]}
            >
              {isSaved ? "Tersimpan" : "Simpan"}
            </Text>
          </Pressable>

          {/* Notifikasi Bell Button */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Notifikasi"
            onPress={() => {
              if (!auth.user) {
                router.push("/auth" as never);
                return;
              }
              hapticLight();
              notifyMe.toggle();
            }}
            style={({ pressed }) => [
              styles.capsuleBtnIconOnly,
              notifyMe.enabled && styles.capsuleBtnNotifyActive,
              pressed && styles.btnPressed,
            ]}
          >
            <AppIcon
              name={notifyMe.enabled ? "bell" : "bell-outline"}
              size={18}
              color={notifyMe.enabled ? "#EF4444" : "#FFFFFF"}
            />
          </Pressable>
        </View>

        {/* Airing Schedule countdown if ongoing */}
        <AiringSchedule
          nextAiringEpisode={data.nextAiringEpisode}
          totalEpisodes={data.episodes}
        />

        {/* Watch Progress Alert banner */}
        {animeHistory.length ? (
          <View style={styles.historyAlertCard}>
            <AppIcon name="history" size={16} color="#FFFFFF" />
            <Text style={styles.historyAlertText}>
              Kamu terakhir menonton hingga Episode {displayedResume}.
            </Text>
          </View>
        ) : null}

        {/* Anime Details Card (DI ATAS SINOPSIS) */}
        <View style={styles.sectionCard}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeaderIndicator} />
            <Text style={styles.cardSectionTitle}>Detail Anime</Text>
          </View>

          <View style={styles.detailTable}>
            {/* Row 1: Japanese & English */}
            <View style={styles.detailRow}>
              <View style={styles.detailColLeft}>
                <Text style={styles.detailKey}>Japanese</Text>
                <Text style={styles.detailVal} numberOfLines={1}>
                  {data.title.native || "-"}
                </Text>
              </View>
              <View style={styles.detailColRight}>
                <Text style={styles.detailKey}>English</Text>
                <Text style={styles.detailVal} numberOfLines={1}>
                  {data.title.english || data.title.romaji || "-"}
                </Text>
              </View>
            </View>

            {/* Row 2: Status & Type */}
            <View style={styles.detailRow}>
              <View style={styles.detailColLeft}>
                <Text style={styles.detailKey}>Status</Text>
                <Text style={styles.detailVal} numberOfLines={1}>
                  {statusDisplay}
                </Text>
              </View>
              <View style={styles.detailColRight}>
                <Text style={styles.detailKey}>Type</Text>
                <Text style={styles.detailVal} numberOfLines={1}>
                  {data.format || "TV"}
                </Text>
              </View>
            </View>

            {/* Row 3: Source & Duration */}
            <View style={styles.detailRow}>
              <View style={styles.detailColLeft}>
                <Text style={styles.detailKey}>Source</Text>
                <Text style={styles.detailVal} numberOfLines={1}>
                  {sourceDisplay}
                </Text>
              </View>
              <View style={styles.detailColRight}>
                <Text style={styles.detailKey}>Duration</Text>
                <Text style={styles.detailVal} numberOfLines={1}>
                  {data.duration ? `${data.duration} min.` : "24 min."}
                </Text>
              </View>
            </View>

            {/* Row 4: Season & Studio */}
            <View style={styles.detailRow}>
              <View style={styles.detailColLeft}>
                <Text style={styles.detailKey}>Season</Text>
                <Text style={styles.detailVal} numberOfLines={1}>
                  {seasonDisplay}
                </Text>
              </View>
              <View style={styles.detailColRight}>
                <Text style={styles.detailKey}>Studio</Text>
                <Text style={styles.detailVal} numberOfLines={1}>
                  {studioDisplay}
                </Text>
              </View>
            </View>

            {/* Row 5: Producers & Released */}
            <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
              <View style={styles.detailColLeft}>
                <Text style={styles.detailKey}>Producers</Text>
                <Text style={styles.detailVal} numberOfLines={1}>
                  {producersDisplay}
                </Text>
              </View>
              <View style={styles.detailColRight}>
                <Text style={styles.detailKey}>Released</Text>
                <Text style={styles.detailVal} numberOfLines={1}>
                  {releasedDisplay}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Synopsis & Genres Card */}
        <View style={styles.sectionCard}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeaderIndicator} />
            <Text style={styles.cardSectionTitle}>Sinopsis</Text>
          </View>
          <Text
            style={styles.synopsisText}
            numberOfLines={isSynopsisExpanded || !isSynopsisLong ? undefined : 4}
            selectable
          >
            {cleanedSynopsis}
          </Text>

          {isSynopsisLong ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isSynopsisExpanded ? "Sembunyikan sinopsis" : "Lihat sinopsis selengkapnya"}
              onPress={() => {
                hapticLight();
                setIsSynopsisExpanded((prev) => !prev);
              }}
              style={({ pressed }) => [
                styles.synopsisToggleBtn,
                pressed && styles.btnPressed,
              ]}
            >
              <Text style={styles.synopsisToggleText}>
                {isSynopsisExpanded ? "Sembunyikan" : "Lihat selengkapnya"}
              </Text>
              <AppIcon
                name={isSynopsisExpanded ? "chevron-up" : "chevron-down"}
                size={16}
                color="#FFFFFF"
              />
            </Pressable>
          ) : null}

          {data.genres?.length ? (
            <View style={styles.genreList}>
              {data.genres.map((genre) => (
                <Pressable
                  key={genre}
                  accessibilityRole="button"
                  accessibilityLabel={`Filter genre ${genre}`}
                  onPress={() => {
                    hapticLight();
                    router.push({
                      pathname: "/search",
                      params: { genre },
                    } as never);
                  }}
                  style={({ pressed }) => [
                    styles.genreChip,
                    pressed && styles.btnPressed,
                  ]}
                >
                  <Text style={styles.genreChipText}>{genre}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>

        {/* Relationships / Semesta Terkait */}
        {relationGroups.length ? (
          <View style={styles.sectionCard}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.cardHeaderIndicator} />
              <View style={{ flex: 1 }}>
                <Text style={styles.cardSectionTitle}>Hubungan Semesta</Text>
                <Text style={styles.cardSectionSubtitle}>
                  Jelajahi alur cerita & judul terkait
                </Text>
              </View>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>
                  {String(
                    relationGroups.reduce(
                      (count, group) => count + group.relations.length,
                      0
                    )
                  ).padStart(2, "0")}
                </Text>
              </View>
            </View>

            {relationGroups.map((group) => (
              <View key={group.key} style={styles.relationGroupBlock}>
                <View style={styles.relationGroupHeader}>
                  <Text style={styles.relationGroupTitle}>{group.title}</Text>
                  <Text style={styles.relationGroupSubtitle}>{group.subtitle}</Text>
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.relationRailContent}
                >
                  {group.relations.map((relation) => {
                    const relationTitle = animeTitle(relation.anime);
                    const rawCover =
                      relation.anime.coverImage?.large ||
                      relation.anime.coverImage?.extraLarge ||
                      "";
                    const cover = rawCover
                      ? getOptimizedImageUri(rawCover, POSTER_W)
                      : "";
                    return (
                      <Pressable
                        key={relation.id}
                        accessibilityRole="button"
                        accessibilityLabel={`Buka ${relation.label}: ${relationTitle}`}
                        onPress={() => {
                          hapticLight();
                          router.push({
                            pathname: "/anime/[id]",
                            params: { id: String(relation.id) },
                          } as never);
                        }}
                        style={({ pressed }) => [
                          styles.relationCard,
                          pressed && styles.btnPressed,
                        ]}
                      >
                        <View style={styles.relationPosterWrap}>
                          {cover ? (
                            <Image
                              source={{ uri: cover }}
                              style={StyleSheet.absoluteFill}
                              contentFit="cover"
                              transition={150}
                              cachePolicy="memory-disk"
                            />
                          ) : (
                            <Text style={styles.fallbackPosterLabel}>ANIME</Text>
                          )}
                          <View style={styles.relationBadgePill}>
                            <Text style={styles.relationBadgeText}>
                              {relation.label}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.relationAnimeTitle} numberOfLines={2}>
                          {relationTitle}
                        </Text>
                        <Text style={styles.relationMetaText} numberOfLines={1}>
                          {[
                            relation.anime.format,
                            relation.anime.episodes
                              ? `${relation.anime.episodes} EP`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "Detail"}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            ))}
          </View>
        ) : null}

        {/* Recommendations / Rekomendasi Serupa */}
        {recommendations.data?.length ? (
          <View style={styles.sectionCard}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.cardHeaderIndicator} />
              <View style={{ flex: 1 }}>
                <Text style={styles.cardSectionTitle}>Rekomendasi Serupa</Text>
                <Text style={styles.cardSectionSubtitle}>
                  Penggemar anime ini juga menyukai
                </Text>
              </View>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>
                  {String(recommendations.data.length).padStart(2, "0")}
                </Text>
              </View>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.recommendationsRail}
            >
              {recommendations.data.map((rec) => {
                const recTitle = animeTitle(rec);
                const rawCover =
                  rec.coverImage?.extraLarge || rec.coverImage?.large || "";
                const cover = rawCover
                  ? getOptimizedImageUri(rawCover, POSTER_W)
                  : "";
                return (
                  <Pressable
                    key={rec.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Buka rekomendasi: ${recTitle}`}
                    onPress={() => {
                      hapticLight();
                      router.push({
                        pathname: "/anime/[id]",
                        params: { id: String(rec.id) },
                      } as never);
                    }}
                    style={({ pressed }) => [
                      styles.recCard,
                      pressed && styles.btnPressed,
                    ]}
                  >
                    <View style={styles.recPosterWrap}>
                      {cover ? (
                        <Image
                          source={{ uri: cover }}
                          style={StyleSheet.absoluteFill}
                          contentFit="cover"
                          transition={150}
                          cachePolicy="memory-disk"
                        />
                      ) : (
                        <Text style={styles.fallbackPosterLabel}>ANIME</Text>
                      )}
                      {rec.averageScore ? (
                        <View style={styles.recScoreBadge}>
                          <AppIcon name="star" size={10} color="#F5C518" />
                          <Text style={styles.recScoreText}>
                            {(rec.averageScore / 10).toFixed(1)}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.recCardTitle} numberOfLines={2}>
                      {recTitle}
                    </Text>
                    <Text style={styles.recMetaText} numberOfLines={1}>
                      {[
                        rec.format,
                        rec.episodes ? `${rec.episodes} Ep` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        {/* Episodes Section */}
        <View style={styles.sectionCard}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeaderIndicator} />
            <View style={{ flex: 1 }}>
              <Text style={styles.cardSectionTitle}>Daftar Episode</Text>
              <Text style={styles.cardSectionSubtitle}>
                Pilih episode untuk ditonton
              </Text>
            </View>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>
                {episodes.isPending
                  ? "…"
                  : `${String(episodeRows.length).padStart(2, "0")} Ep`}
              </Text>
            </View>
          </View>

          {/* Episode Search Bar */}
          <View style={styles.searchBarContainer}>
            <AppIcon name="magnify" size={18} color="#8E93A2" />
            <TextInput
              value={episodeSearch}
              onChangeText={setEpisodeSearch}
              placeholder="Cari nomor atau judul episode..."
              placeholderTextColor="#8E93A2"
              style={styles.searchBarInput}
              returnKeyType="done"
            />
            {episodeSearch ? (
              <Pressable
                onPress={() => setEpisodeSearch("")}
                style={styles.clearSearchBtn}
              >
                <AppIcon name="close-circle" size={16} color="#9CA3AF" />
              </Pressable>
            ) : null}
          </View>

          {episodes.isPending ? (
            <LoadingState label="Menemukan episode yang tersedia..." />
          ) : episodes.isError ? (
            <ErrorState
              message={
                episodes.error?.message ||
                "Gagal memuat daftar episode saat ini."
              }
              onRetry={() => void episodes.refetch()}
            />
          ) : !episodeRows.length ? (
            <View style={styles.emptyEpisodesBox}>
              <AppIcon name="movie-open-off-outline" size={32} color="#8E93A2" />
              <Text style={styles.emptyEpisodesTitle}>
                Belum Ada Episode Tersedia
              </Text>
              <Text style={styles.emptyEpisodesDesc}>
                {episodeSearch
                  ? "Tidak ada episode yang cocok dengan pencarianmu."
                  : "Episode belum diunggah. Silakan cek kembali nanti."}
              </Text>
            </View>
          ) : (
            <>
              {/* Pagination controls if > 50 episodes */}
              {totalEpisodePages > 1 ? (
                <View style={styles.paginationBar}>
                  <Text style={styles.paginationText}>
                    {`Episode ${episodePageStart}–${episodePageEnd} · Halaman ${
                      safeEpisodePage + 1
                    }/${totalEpisodePages}`}
                  </Text>
                  <View style={styles.pagerButtonsRow}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Halaman sebelumnya"
                      disabled={safeEpisodePage === 0}
                      onPress={() => {
                        hapticLight();
                        setEpisodePage((v) => Math.max(0, v - 1));
                      }}
                      style={[
                        styles.pagerBtn,
                        safeEpisodePage === 0 && styles.pagerBtnDisabled,
                      ]}
                    >
                      <AppIcon
                        name="chevron-left"
                        size={16}
                        color={safeEpisodePage === 0 ? "#6B7280" : "#FFFFFF"}
                      />
                      <Text
                        style={[
                          styles.pagerBtnText,
                          safeEpisodePage === 0 && styles.pagerBtnTextDisabled,
                        ]}
                      >
                        Prev
                      </Text>
                    </Pressable>

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Halaman berikutnya"
                      disabled={safeEpisodePage >= totalEpisodePages - 1}
                      onPress={() => {
                        hapticLight();
                        setEpisodePage((v) =>
                          Math.min(totalEpisodePages - 1, v + 1)
                        );
                      }}
                      style={[
                        styles.pagerBtn,
                        safeEpisodePage >= totalEpisodePages - 1 &&
                          styles.pagerBtnDisabled,
                      ]}
                    >
                      <Text
                        style={[
                          styles.pagerBtnText,
                          safeEpisodePage >= totalEpisodePages - 1 &&
                            styles.pagerBtnTextDisabled,
                        ]}
                      >
                        Next
                      </Text>
                      <AppIcon
                        name="chevron-right"
                        size={16}
                        color={
                          safeEpisodePage >= totalEpisodePages - 1
                            ? "#6B7280"
                            : "#FFFFFF"
                        }
                      />
                    </Pressable>
                  </View>
                </View>
              ) : null}

              {/* Episode Card Grid */}
              <View
                style={[
                  styles.episodeCardList,
                  twoPane && styles.episodeCardListWide,
                ]}
              >
                {pagedEpisodeRows.map((episode) => {
                  const score = ratings.scoreFor(episode.number);
                  const seen = animeHistory.find(
                    (entry) => entry.episode_number === episode.number
                  );
                  const progress = seen
                    ? Math.min(
                        100,
                        Math.round(
                          (seen.progress / Math.max(seen.duration, 1)) * 100
                        )
                      )
                    : 0;

                  const isFuture = isConfirmedFutureRelease({
                    episodeNumber: episode.number,
                    episodes: canonicalEpisodeRows,
                    status: data.status,
                    nextAiringEpisode: data.nextAiringEpisode,
                    hasConfirmedEpisodeList: episodes.isSuccess && canonicalEpisodeRows.length > 0,
                  });

                  const airingLabel = isFuture
                    ? (data.nextAiringEpisode?.episode === episode.number && data.nextAiringEpisode?.airingAt
                        ? formatAiringDate(data.nextAiringEpisode.airingAt)
                        : "Segera Tayang")
                    : null;

                  return (
                    <View
                      key={episode.number}
                      style={[
                        styles.episodeItemRow,
                        twoPane && styles.episodeItemRowWide,
                      ]}
                    >
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Tonton episode ${episode.number}: ${
                          episode.title || "Episode " + episode.number
                        }`}
                        onPress={() => openEpisode(episode.number)}
                        style={({ pressed }) => [
                          styles.episodeItemPressable,
                          pressed && styles.btnPressed,
                        ]}
                      >
                        {/* 16:9 Thumbnail Box */}
                        <View style={[styles.episodeThumbnailWrap, isFuture && { opacity: 0.65 }]}>
                          {episode.thumbnail ? (
                            <Image
                              source={{ uri: episode.thumbnail }}
                              style={StyleSheet.absoluteFill}
                              contentFit="cover"
                              transition={150}
                              cachePolicy="memory-disk"
                            />
                          ) : (
                            <View
                              style={[
                                StyleSheet.absoluteFill,
                                styles.thumbnailFallback,
                              ]}
                            >
                              <AppIcon
                                name="movie-play-outline"
                                size={22}
                                color="#8E93A2"
                              />
                            </View>
                          )}
                          <View style={styles.episodeThumbnailOverlay} />
                          <View style={styles.episodeNumberBadge}>
                            <Text style={styles.episodeNumberText}>
                              {String(episode.number).padStart(2, "0")}
                            </Text>
                          </View>
                          <View style={[styles.thumbPlayIconWrap, isFuture && styles.thumbPlayIconWrapUpcoming]}>
                            <AppIcon name={isFuture ? "clock-outline" : "play"} size={13} color="#FFFFFF" />
                          </View>
                          {seen ? (
                            <View style={styles.thumbnailProgressTrack}>
                              <View
                                style={[
                                  styles.thumbnailProgressFill,
                                  { width: `${progress}%` },
                                ]}
                              />
                            </View>
                          ) : null}
                        </View>

                        {/* Title and metadata */}
                        <View style={styles.episodeInfoCol}>
                          <Text
                            style={styles.episodeTitleText}
                            numberOfLines={2}
                          >
                            {episode.title || `Episode ${episode.number}`}
                          </Text>

                          <View style={styles.episodeBadgeStatusRow}>
                            {isFuture ? (
                              <View style={styles.upcomingPill}>
                                <AppIcon name="clock-outline" size={10} color="#C0C0C0" />
                                <Text style={styles.upcomingPillText}>
                                  {airingLabel}
                                </Text>
                              </View>
                            ) : seen ? (
                              <View style={styles.watchedPill}>
                                <Text style={styles.watchedPillText}>
                                  {progress}% Ditonton
                                </Text>
                              </View>
                            ) : (
                              <View style={styles.readyPill}>
                                <Text style={styles.readyPillText}>
                                  Siap Nonton
                                </Text>
                              </View>
                            )}

                            {episode.isFiller ? (
                              <View style={styles.fillerPill}>
                                <Text style={styles.fillerPillText}>
                                  FILLER
                                </Text>
                              </View>
                            ) : null}
                          </View>
                        </View>
                      </Pressable>

                      {/* Episode rating button */}
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Beri nilai episode ${episode.number}`}
                        onPress={(event) => {
                          event.stopPropagation();
                          if (!auth.user) {
                            router.push("/auth" as never);
                            return;
                          }
                          hapticLight();
                          ratings.setRating.mutate({
                            episode: episode.number,
                            score: score ? (score % 10) + 1 : 8,
                          });
                        }}
                        style={({ pressed }) => [
                          styles.ratingPillBtn,
                          score ? styles.ratingPillBtnActive : null,
                          pressed && styles.btnPressed,
                        ]}
                      >
                        <AppIcon
                          name={score ? "star" : "star-outline"}
                          size={13}
                          color={score ? "#F5C518" : "#9CA3AF"}
                        />
                        <Text
                          style={[
                            styles.ratingPillText,
                            score ? styles.ratingPillTextActive : null,
                          ]}
                        >
                          {score ? `${score}` : "Nilai"}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            </>
          )}
        </View>

        {/* Community Comments */}
        <AnimeComments animeId={id} />

        {/* Space on bottom */}
        <View style={{ height: 40 }} />
      </ScrollView>
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
    paddingTop: 10,
    gap: 16,
  },
  btnPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },

  // ─── 1. TOP APP BAR ───
  topNav: {
    height: 56,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#121316",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.14)",
    zIndex: 10,
  },
  navTitle: {
    flex: 1,
    marginHorizontal: 12,
    fontFamily: "Nunito-Bold",
    fontSize: 16,
    color: "#F3F4F6",
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: "#1B1D22",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.22)",
    alignItems: "center",
    justifyContent: "center",
  },

  // ─── 2. BACKDROP HERO ───
  backdropWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: 320,
    overflow: "hidden",
  },
  backdropOverlay: {
    ...StyleSheet.absoluteFillObject,
  },

  // ─── 3. HERO CONTENT ROW ───
  heroSection: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 16,
    marginTop: 62,
  },
  posterContainer: {
    width: 124,
    height: 182,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255, 0.38)",
    backgroundColor: "#1B1D22",
    elevation: 10,
    ...(Platform.OS === "web"
      ? ({
          boxShadow: "0 10px 25px rgba(0, 0, 0, 0.7)",
        } as any)
      : {}),
  },
  posterImage: {
    width: "100%",
    height: "100%",
  },
  posterFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  posterFormatBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: "rgba(239, 68, 68, 0.90)",
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "rgba(255,255,255, 0.45)",
  },
  posterFormatText: {
    fontFamily: "Nunito-Bold",
    fontSize: 9.5,
    color: "#FFFFFF",
  },
  heroDetails: {
    flex: 1,
    gap: 8,
    paddingBottom: 4,
  },
  heroBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(18, 19, 22, 0.86)",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.24)",
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusDotLive: {
    backgroundColor: "#10B981",
  },
  statusDotDone: {
    backgroundColor: "#FFFFFF",
  },
  statusText: {
    fontFamily: "Nunito-Bold",
    fontSize: 11,
    color: "#F3F4F6",
  },
  scorePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(251, 191, 36, 0.16)",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: "rgba(251, 191, 36, 0.36)",
  },
  scoreText: {
    fontFamily: "Nunito-Bold",
    fontSize: 11,
    color: "#F5C518",
  },
  animeTitle: {
    fontFamily: "Nunito-Bold",
    fontSize: 20,
    color: "#F3F4F6",
    lineHeight: 25,
    letterSpacing: -0.3,
  },

  // ─── 4. HERO META BADGES ───
  image2BadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 2,
  },
  capsuleBadge: {
    backgroundColor: "rgba(239, 68, 68, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.30)",
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 8,
  },
  capsuleBadgeText: {
    fontFamily: "Nunito-Bold",
    fontSize: 11,
    color: "#D1D5DB",
  },
  subIndoText: {
    fontFamily: "Nunito-Bold",
    fontSize: 12,
    color: "#D9BECA",
  },
  hdBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.40)",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  hdBadgeText: {
    fontFamily: "Nunito-Bold",
    fontSize: 10,
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },

  // ─── 5. CRIMSON-SAKURA ACTION BUTTONS ───
  image2ButtonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 6,
  },
  capsuleBtnPrimary: {
    flex: 1.8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FFFFFF",
    height: 46,
    borderRadius: 999,
    paddingHorizontal: 16,
  },
  capsuleBtnPrimaryText: {
    fontFamily: "Nunito-Bold",
    fontSize: 14,
    color: "#121316",
  },
  capsuleBtnSecondary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#1B1D22",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.25)",
    height: 46,
    borderRadius: 14,
    paddingHorizontal: 16,
  },
  capsuleBtnSaved: {
    backgroundColor: "rgba(251, 191, 36, 0.16)",
    borderColor: "rgba(251, 191, 36, 0.42)",
  },
  capsuleBtnSecondaryText: {
    fontFamily: "Nunito-Bold",
    fontSize: 13,
    color: "#F3F4F6",
  },
  capsuleBtnSavedText: {
    color: "#F5C518",
  },
  capsuleBtnIconOnly: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: "#1B1D22",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  capsuleBtnNotifyActive: {
    backgroundColor: "rgba(239, 68, 68, 0.22)",
    borderColor: "#FFFFFF",
  },

  // ─── 6. HISTORY ALERT BANNER ───
  historyAlertCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.28)",
  },
  historyAlertText: {
    flex: 1,
    fontFamily: "Nunito-Bold",
    fontSize: 13,
    color: "#D1D5DB",
    lineHeight: 18,
  },

  // ─── 7. SECTION CARDS ───
  sectionCard: {
    backgroundColor: "#1B1D22",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.16)",
    gap: 14,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  cardHeaderIndicator: {
    width: 4,
    height: 20,
    borderRadius: 99,
    backgroundColor: "#EF4444",
  },
  cardSectionTitle: {
    fontFamily: "Nunito-Bold",
    fontSize: 17,
    color: "#F3F4F6",
    letterSpacing: -0.2,
  },
  cardSectionSubtitle: {
    fontFamily: "Nunito-Regular",
    fontSize: 11,
    color: "#8E93A2",
    marginTop: 1,
  },
  countBadge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 99,
    backgroundColor: "rgba(239, 68, 68, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.30)",
  },
  countBadgeText: {
    fontFamily: "Nunito-Bold",
    fontSize: 11,
    color: "#D1D5DB",
  },

  detailTable: {
    width: "100%",
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.10)",
    gap: 12,
  },
  detailColLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  detailColRight: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  detailKey: {
    width: 68,
    fontFamily: "Nunito-SemiBold",
    fontSize: 12.5,
    color: "#8E93A2",
  },
  detailVal: {
    flex: 1,
    fontFamily: "Nunito-Bold",
    fontSize: 12.5,
    color: "#F3F4F6",
  },

  synopsisText: {
    fontFamily: "Nunito-Regular",
    fontSize: 14,
    color: "#D9BECA",
    lineHeight: 22,
  },
  synopsisToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    marginTop: 6,
    marginBottom: 4,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  synopsisToggleText: {
    fontFamily: "Nunito-Bold",
    fontSize: 13,
    color: "#FFFFFF",
  },
  genreList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
  },
  genreChip: {
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: 99,
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.25)",
  },
  genreChipText: {
    fontFamily: "Nunito-Bold",
    fontSize: 12,
    color: "#D1D5DB",
  },

  // ─── 8. RELATIONSHIPS & RECOMMENDATIONS ───
  relationGroupBlock: {
    gap: 10,
    marginTop: 4,
  },
  relationGroupHeader: {
    gap: 2,
  },
  relationGroupTitle: {
    fontFamily: "Nunito-Bold",
    fontSize: 14,
    color: "#F3F4F6",
  },
  relationGroupSubtitle: {
    fontFamily: "Nunito-Regular",
    fontSize: 11,
    color: "#8E93A2",
  },
  relationRailContent: {
    gap: 12,
    paddingRight: 8,
  },
  relationCard: {
    width: 124,
    gap: 6,
  },
  relationPosterWrap: {
    width: "100%",
    height: 168,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#23262F",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.18)",
  },
  relationBadgePill: {
    position: "absolute",
    top: 6,
    left: 6,
    backgroundColor: "rgba(239, 68, 68, 0.90)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255, 0.45)",
    paddingHorizontal: 6.5,
    paddingVertical: 2,
    borderRadius: 6,
  },
  relationBadgeText: {
    fontFamily: "Nunito-Bold",
    fontSize: 9,
    color: "#FFFFFF",
    textTransform: "uppercase",
  },
  relationAnimeTitle: {
    fontFamily: "Nunito-Bold",
    fontSize: 13,
    color: "#F3F4F6",
    lineHeight: 17,
  },
  relationMetaText: {
    fontFamily: "Nunito-SemiBold",
    fontSize: 11,
    color: "#8E93A2",
  },

  recommendationsRail: {
    gap: 12,
    paddingRight: 8,
  },
  recCard: {
    width: 122,
    gap: 6,
  },
  recPosterWrap: {
    width: "100%",
    height: 168,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#23262F",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.18)",
  },
  recScoreBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(18,19,22, 0.84)",
    paddingHorizontal: 6.5,
    paddingVertical: 2,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: "rgba(251, 191, 36, 0.36)",
  },
  recScoreText: {
    fontFamily: "Nunito-Bold",
    fontSize: 10,
    color: "#F5C518",
  },
  recCardTitle: {
    fontFamily: "Nunito-Bold",
    fontSize: 13,
    color: "#F3F4F6",
    lineHeight: 17,
  },
  recMetaText: {
    fontFamily: "Nunito-SemiBold",
    fontSize: 11,
    color: "#8E93A2",
  },
  fallbackPosterLabel: {
    fontFamily: "Nunito-Bold",
    fontSize: 12,
    color: "#8E93A2",
    alignSelf: "center",
    marginTop: 70,
  },

  // ─── 9. EPISODE SECTION ───
  searchBarContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#21141C",
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.20)",
    paddingHorizontal: 12,
    height: 43,
  },
  searchBarInput: {
    flex: 1,
    fontFamily: "Nunito-Regular",
    fontSize: 13,
    color: "#F3F4F6",
  },
  clearSearchBtn: {
    padding: 4,
  },
  emptyEpisodesBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 32,
    gap: 8,
  },
  emptyEpisodesTitle: {
    fontFamily: "Nunito-Bold",
    fontSize: 15,
    color: "#F3F4F6",
  },
  emptyEpisodesDesc: {
    fontFamily: "Nunito-Regular",
    fontSize: 13,
    color: "#8E93A2",
    textAlign: "center",
  },
  paginationBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  paginationText: {
    fontFamily: "Nunito-SemiBold",
    fontSize: 11,
    color: "#8E93A2",
  },
  pagerButtonsRow: {
    flexDirection: "row",
    gap: 8,
  },
  pagerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 9,
    backgroundColor: "rgba(239, 68, 68, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.26)",
  },
  pagerBtnDisabled: {
    opacity: 0.35,
  },
  pagerBtnText: {
    fontFamily: "Nunito-Bold",
    fontSize: 11,
    color: "#F3F4F6",
  },
  pagerBtnTextDisabled: {
    color: "#6B7280",
  },

  episodeCardList: {
    gap: 10,
  },
  episodeCardListWide: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  episodeItemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#21141C",
    borderRadius: 15,
    padding: 10,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.16)",
    gap: 10,
  },
  episodeItemRowWide: {
    flexBasis: "48%",
    flexGrow: 1,
  },
  episodeItemPressable: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  episodeThumbnailWrap: {
    width: 106,
    height: 64,
    borderRadius: 11,
    overflow: "hidden",
    backgroundColor: "#140C11",
    position: "relative",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.20)",
  },
  thumbnailFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  episodeThumbnailOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(18,19,22, 0.22)",
  },
  episodeNumberBadge: {
    position: "absolute",
    bottom: 6,
    left: 6,
    backgroundColor: "rgba(239, 68, 68, 0.92)",
    paddingHorizontal: 6.5,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255, 0.42)",
  },
  episodeNumberText: {
    fontFamily: "Nunito-Bold",
    fontSize: 10.5,
    color: "#FFFFFF",
  },
  thumbPlayIconWrap: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(239, 68, 68, 0.85)",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbnailProgressTrack: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 3.5,
    backgroundColor: "rgba(243,244,246, 0.22)",
  },
  thumbnailProgressFill: {
    height: "100%",
    backgroundColor: "#EF4444",
  },

  episodeInfoCol: {
    flex: 1,
    gap: 6,
  },
  episodeTitleText: {
    fontFamily: "Nunito-Bold",
    fontSize: 13,
    color: "#F3F4F6",
    lineHeight: 18,
  },
  episodeBadgeStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  watchedPill: {
    backgroundColor: "rgba(251, 191, 36, 0.14)",
    paddingHorizontal: 6.5,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(251, 191, 36, 0.34)",
  },
  watchedPillText: {
    fontFamily: "Nunito-Bold",
    fontSize: 10,
    color: "#F5C518",
  },
  readyPill: {
    backgroundColor: "rgba(239, 68, 68, 0.14)",
    paddingHorizontal: 6.5,
    paddingVertical: 2,
    borderRadius: 6,
  },
  readyPillText: {
    fontFamily: "Nunito-SemiBold",
    fontSize: 10,
    color: "#D1D5DB",
  },
  upcomingPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 1,
  },
  upcomingPillText: {
    fontFamily: "Nunito-Bold",
    fontSize: 10.5,
    color: "#9CA3AF",
  },
  thumbPlayIconWrapUpcoming: {
    backgroundColor: "rgba(18,19,22, 0.78)",
  },
  fillerPill: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  fillerPillText: {
    fontFamily: "Nunito-Bold",
    fontSize: 9,
    color: "#F87171",
  },

  ratingPillBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8.5,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "#1B1D22",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.18)",
  },
  ratingPillBtnActive: {
    backgroundColor: "rgba(251, 191, 36, 0.14)",
    borderColor: "rgba(251, 191, 36, 0.35)",
  },
  ratingPillText: {
    fontFamily: "Nunito-Bold",
    fontSize: 11,
    color: "#9CA3AF",
  },
  ratingPillTextActive: {
    color: "#F5C518",
  },
});

const wb = StyleSheet.create({
  hero: { flexDirection: "row", gap: 14, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 },
  poster: { width: 104, height: 148, borderRadius: 10, backgroundColor: "#1B1D22" },
  heroMeta: { flex: 1, gap: 6, justifyContent: "flex-end", paddingBottom: 2 },
  title: { color: "#F3F4F6", fontFamily: "Nunito-Bold", fontSize: 18, lineHeight: 24 },
  sub: { color: "#9CA3AF", fontFamily: "Nunito-Regular", fontSize: 12.5 },
  chipRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  chip: { backgroundColor: "#22252D", borderRadius: 999, paddingHorizontal: 11, paddingVertical: 5 },
  chipText: { color: "#F3F4F6", fontFamily: "Nunito-SemiBold", fontSize: 12 },
  scoreChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#22252D", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  scoreText: { color: "#F5C518", fontFamily: "Nunito-Bold", fontSize: 12 },
});
