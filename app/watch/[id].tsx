import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocalSearchParams, router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { parseRouteEpisode, parseRouteId } from "@/lib/route-params";
import { ActivityIndicator, Alert, Animated, AppState, BackHandler, Dimensions, FlatList, LayoutChangeEvent, Linking, Modal, PanResponder, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { UniversalVideo as Video } from "@/components/universal-video";
import type { OnProgressData, OnLoadData, OnBufferData, VideoRef } from "react-native-video";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { StatusBar } from "expo-status-bar";
import * as ScreenOrientation from "expo-screen-orientation";
import { applyAndroidImmersiveBars, useImmersiveSystemBars } from "@/lib/immersive-mode";
import * as Brightness from "expo-brightness";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import * as Network from "expo-network";
import {
  ArrowLeft, Gear, Speedometer, Subtitles, SpeakerHigh, SpeakerNone,
  SkipBack, SkipForward, Play, Pause, ArrowsOut, ArrowsIn, Check, X,
  Lock, Rewind, FastForward, Download, DownloadSimple, CaretRight,
  Sun, PictureInPicture, ThumbsUp, ThumbsDown, ShareNetwork, PlayCircle,
  Flag, Diamond, Sparkle, Info, SlidersHorizontal, Eye, CaretDown
} from "phosphor-react-native";
import { luckynimeHlsRenditionUrl, luckynimeProxyUrl, getAnimeMetadata, getEpisodes, getServers, getStream, getPlaybackType, isLuckynimeProxyUrl, nativePlaybackHeaders, CHROME_ANDROID_UA } from "@/lib/luckynime-api";
import { getAnimeById, getKnownMalId, getMalIdByAnimeId } from "@/lib/anilist";
import { enrichEpisodesWithTmdb } from "@/lib/tmdb-episodes";
import {
  activeSkipKind,
  autoQualityLine,
  chapterTrackSegments,
  directSources,
  episodePageCount,
  episodePageFor,
  episodePageSlice,
  hasConfirmedPlaybackStart,
  humanPlayerError,
  isAutoQuality,
  isOfflinePlaybackSource,
  isProxySource,
  isResumablePosition,
  liveRenditionHeight,
  resolveHistoryResume,
  resolveResumeOnSwitch,
  resolveSkipFetchStatus,
  FUTURE_RELEASE_MESSAGE,
  isConfirmedFutureRelease,
  mergeSkipSegments,
  nativeSources,
  normalizeAniSkipSegments,
  providerSkipSegments,
  proxySources,
  shouldRefreshSameProvider,
  shouldRetryProxiedSourceAfterDirect,
  shouldApplyInitialHistoryResume,
  shouldMountReplacementSource,
  shouldHoldRebufferWatermark,
  streamCacheKey,
  type Language,
  type RetryReason,
  type SkipFetchStatus,
  type SkipKind,
  type SkipSegments,
} from "@/lib/watch-engine";
import { animeTitle, type Episode, type Server, type StreamResponse, type StreamSource } from "@/lib/types";
import { useWatchHistory, listLocalWatchEntries } from "@/hooks/use-watch-history";
import { useEpisodeRatings } from "@/hooks/use-episode-ratings";
import { AnimeComments } from "@/components/anime-comments";
import { useProviderSync } from "@/hooks/use-provider-sync";
import { useMiniPlayer } from "@/providers/mini-player-provider";
import { markMissionProgress } from "@/lib/lelang-service";
import { useLuckynimeAuth } from "@/providers/auth-provider";
import { useExp } from "@/providers/exp-toast-provider";
import { EXP_RULES } from "@/lib/user-level";
import { findOfflineDownload, removeOfflineDownload, selectDownloadSourceForQuality, selectMaximumQualityDownload, startMaximumQualityDownload, buildBackendDownloadOptions, hasQualityBackendDownloads, sortBackendDownloadOptions, type BackendDownloadOption, type OfflineDownload } from "@/lib/downloads";
import { adaptiveBitrateCapOptions, selectedWatchQuality, watchQualityOptions, type WatchQualityOption } from "@/lib/watch-quality";
import { buildDashQualityOptions, buildHlsQualityOptions, hlsVariantsCacheKey, originalStreamUrl, parseDashRepresentations, parseHlsMasterVariants, shouldRefetchVariants, shouldRefreshMasterOnVariantError, variantUrlForHeight, type HlsVariant, type VariantsCacheScope } from "@/lib/hls-variants";
import { AppIcon } from "@/components/app-icon";
import { DotLabel, NothingButton, NothingCard, nothing } from "@/components/nothing-ui";
import { NativeScreen } from "@/components/screen";
import { SubtitleRenderer } from "@/components/subtitle-renderer";
import { SleepTimerPill } from "@/components/sleep-timer";
import { chrome } from "@/components/player/chrome-styles";
import { parseSubtitle, detectSubtitleFormat, detectSubtitleFormatFromContent, findActiveCues, matchSubtitleTrack, isActualSubtitleTrack, normalizeSubtitleLang, type SubtitleCue } from "@/lib/subtitle-parser";
import { loadSubtitlePreferences, saveSubtitlePreferences, getSubtitlePreferencesSync, SUBTITLE_FONTS, BG_OPACITY_PRESETS, OUTLINE_PRESETS, clampSubtitleOffset, formatSubtitleOffset, SUBTITLE_OFFSET_MIN, SUBTITLE_OFFSET_MAX, SUBTITLE_OFFSET_STEP, type SubtitlePreferences } from "@/lib/subtitle-preferences";
import { loadPlaybackSettings, savePlaybackSetting } from "@/lib/user-settings";
import { resolveNextEpisode, resolvePrevEpisode } from "@/lib/up-next";
import { SAWERIA_URL } from "@/lib/support";
import { t } from "@/lib/i18n";
import Svg, { Path, Rect } from "react-native-svg";
import { ReportStreamModal } from "@/components/report-stream-modal";

const TOPUP_CRYSTAL = require("@/assets/images/topup/topup-crystal.png");

const EPISODE_PAGE_SIZE = 50;
const RESUME_MIN_TIME = 30;
const DOUBLE_TAP_WINDOW_MS = 200;
const TRIPLE_TAP_WINDOW_MS = 350;
const SKIP_HOLD_MS = 400;
// ── Gesture boundaries: each gesture owns its zone, no overlaps ──
const TAP_SLOP_PX = 14; // max move to still count as a tap
const SWIPE_ACTIVATE_PX = 22; // vertical travel before brightness/volume engages
const SWIPE_DIRECTION_RATIO = 1.4; // |dy| must dominate |dx| or swipe is ignored
const HORIZONTAL_CANCEL_PX = 22; // horizontal drift kills pending/hold
const LONG_PRESS_MS = 550; // still-finger delay before center-hold → 2x
const HOLD_SEEK_MS = 350; // still-finger delay before double/triple-tap-hold → continuous skip
const TAP_ACTION_COOLDOWN_MS = 150; // min gap between any action (seek/toggle) and the next
const EDGE_ZONE = 0.35; // x < 35% = brightness · x > 65% = volume · middle = 2x zone
const SEEK_ZONE = 0.4; // x < 40% = rewind · x > 60% = forward · middle = play/pause
const STREAM_CACHE_TTL_MS = 10 * 60_000;
const STARTUP_WATCHDOG_MS = 7_500;
const SKIP_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const ANISKIP_TIMEOUT_MS = 8_000;
const UP_NEXT_AUTOPLAY_SECONDS = 5;
const EMPTY_EPISODES: Episode[] = [];
const MEMORY_WATCH_PROGRESS = new Map<string, { progress: number; duration: number }>();

function sanitizeResumeSeconds(progress?: number | null, total?: number | null): number | null {
  const p = Number(progress);
  const d = Number(total);
  if (!Number.isFinite(p) || p <= 3) return null;
  if (Number.isFinite(d) && d > 0) {
    if (p >= d - 8 || p / d >= 0.96) return null;
  }
  return p;
}

function isLikelyNetworkError(detail: string): boolean {
  return /network|unable to resolve host|unknownhost|connectexception|sockettimeout|timeout|enetunreach|econn|no address associated|2001|2002|io_network|internet|offline|unreachable|failed to connect|broken pipe|connection reset/i.test(
    detail,
  );
}

type CachedStream = { savedAt: number; data: StreamResponse };
type WatchPreferences = { speed?: number; autoPlayNext?: boolean };

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const rounded = Math.floor(seconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const secs = rounded % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function formatClockTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const rounded = Math.floor(seconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const secs = rounded % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function cleanSynopsisText(raw?: string | null): string {
  if (!raw) return "Tidak ada deskripsi tersedia.";
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
  return cleaned || "Tidak ada deskripsi tersedia.";
}

function formatCount(num?: number | null, fallback = "0"): string {
  if (!num || num <= 0) return fallback;
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (num >= 1_000) return (num / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return num.toLocaleString();
}

function formatReleaseDate(anime?: any): string {
  if (!anime) return "2024";
  if (anime.startDate) {
    const { year, month, day } = anime.startDate;
    if (year && month && day) {
      const date = new Date(year, month - 1, day);
      return date.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
    }
    if (year) return `${year}`;
  }
  if (anime.seasonYear) return `${anime.seasonYear}`;
  return "2024";
}

function skipCacheKey(malId: number, episode: number) {
  return `luckynime-skip-v2:${malId}:${episode}`;
}

type ProviderQualityMap = Record<string, string>;
const PROVIDER_QUALITY_KEY = "luckynime.provider-quality.v1";

async function readProviderQualityMap(): Promise<ProviderQualityMap> {
  try {
    const raw = await AsyncStorage.getItem(PROVIDER_QUALITY_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed as ProviderQualityMap : {};
  } catch { return {}; }
}

/** Remembers a manual per-server quality ("1080p") so Auto can re-apply it. */
async function rememberProviderQuality(providerId: string | undefined, quality: string | null) {
  if (!providerId) return;
  try {
    const map = await readProviderQualityMap();
    if (quality) map[providerId] = quality;
    else delete map[providerId];
    await AsyncStorage.setItem(PROVIDER_QUALITY_KEY, JSON.stringify(map));
  } catch { /* preference loss is acceptable */ }
}

export default function WatchScreen() {
  const screenMountTime = useRef(Date.now()).current;
  const params = useLocalSearchParams<{ id?: string | string[]; episode?: string | string[]; title?: string; image?: string; resumeTime?: string; fromMini?: string }>();
  const { playerData, minimizePlayer } = useMiniPlayer();
  const animeId = parseRouteId(params.id) ?? -1;
  const invalidId = animeId <= 0;
  const episode = parseRouteEpisode(params.episode);
  const isReturningFromMini = Boolean(
    playerData &&
    playerData.animeId === animeId &&
    playerData.episode === episode &&
    playerData.cachedSource
  );
  const animeQuery = useQuery({
    queryKey: ["watch-anime", animeId],
    queryFn: async () => { try { return await getAnimeMetadata(animeId); } catch { return getAnimeById(animeId); } },
    enabled: Number.isFinite(animeId) && animeId > 0,
    staleTime: 10 * 60_000,
    retry: 1,
  });
  const title = params.title || (animeQuery.data ? animeTitle(animeQuery.data) : "Luckynime stream");
  const image = params.image || animeQuery.data?.coverImage?.extraLarge || animeQuery.data?.coverImage?.large || "";
  const watchBackdrop = animeQuery.data?.bannerImage || image;
  const auth = useLuckynimeAuth();
  const { grantXp } = useExp();
  const history = useWatchHistory();
  const ratings = useEpisodeRatings(animeId);
  const providerSync = useProviderSync();
  const episodeQuery = useQuery({ queryKey: ["watch-episodes", animeId], queryFn: () => getEpisodes(animeId), enabled: Number.isFinite(animeId) && animeId > 0, staleTime: 60_000 });
  const canonicalEpisodes = episodeQuery.data ?? EMPTY_EPISODES;
  const episodeSignature = useMemo(() => canonicalEpisodes.map((item) => `${item.number}:${item.title ?? ""}:${item.thumbnail ?? ""}`).join("|"), [canonicalEpisodes]);
  const tmdbEpisodes = useQuery({
    queryKey: ["tmdb-episode-display", animeId, episodeSignature, watchBackdrop, title, animeQuery.data?.format],
    queryFn: () => enrichEpisodesWithTmdb(animeId, canonicalEpisodes, { fallbackThumbnail: watchBackdrop, fallbackTitle: title, isMovie: animeQuery.data?.format === "MOVIE" }),
    enabled: Number.isFinite(animeId) && animeId > 0 && episodeQuery.isSuccess && canonicalEpisodes.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const displayEpisodes = tmdbEpisodes.data ?? canonicalEpisodes;
  const selectedEpisode = displayEpisodes.find((item) => item.number === episode);
  const episodeIsKnown = useMemo(() => canonicalEpisodes.some((item) => item.number === episode), [canonicalEpisodes, episode]);
  const invalidEpisode = Boolean(episodeQuery.isSuccess && canonicalEpisodes.length && !episodeIsKnown);
  const futureRelease = isConfirmedFutureRelease({
    episodeNumber: episode,
    episodes: canonicalEpisodes,
    status: animeQuery.data?.status,
    nextAiringEpisode: animeQuery.data?.nextAiringEpisode,
    hasConfirmedEpisodeList: episodeQuery.isSuccess && canonicalEpisodes.length > 0,
  });
  // Safe WakeLock lifecycle (mencegah NotAllowedError di web saat tab tidak terlihat / background)
  useEffect(() => {
    let active = true;
    if (Platform.OS === "web") {
      if (typeof document !== "undefined" && "wakeLock" in navigator) {
        let sentinel: any = null;
        const requestWakeLock = async () => {
          try {
            if (document.visibilityState === "visible" && active) {
              sentinel = await (navigator as any).wakeLock?.request("screen");
            }
          } catch {
            // Tangani NotAllowedError secara aman tanpa unhandled promise rejection
          }
        };

        const handleVisibilityChange = () => {
          if (document.visibilityState === "visible") {
            void requestWakeLock();
          } else {
            try {
              sentinel?.release?.().catch?.(() => {});
            } catch {}
          }
        };

        void requestWakeLock();
        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
          active = false;
          document.removeEventListener("visibilitychange", handleVisibilityChange);
          try {
            sentinel?.release?.().catch?.(() => {});
          } catch {}
        };
      }
    } else {
      activateKeepAwakeAsync("luckynime-watch").catch(() => {});
      return () => {
        try {
          void deactivateKeepAwake("luckynime-watch").catch(() => {});
        } catch {}
      };
    }
  }, []);

  // ── Player state (react-native-video) ──
  const syncInitialResumeSec = useMemo(() => {
    if (isReturningFromMini && playerData) {
      return playerData.currentTime > 0 ? playerData.currentTime : 0;
    }
    const paramTime = sanitizeResumeSeconds(Number(params.resumeTime), null) ?? 0;
    const memEntry = MEMORY_WATCH_PROGRESS.get(`${animeId}:${episode}`);
    const memTime = memEntry ? (sanitizeResumeSeconds(memEntry.progress, memEntry.duration) ?? 0) : 0;
    const histRow = history.displayRows?.find(
      (r: any) => Number(r?.anime_id) === animeId && Number(r?.episode_number) === episode,
    );
    const histTime = histRow ? (sanitizeResumeSeconds(histRow.progress, histRow.duration) ?? 0) : 0;
    return Math.max(paramTime, memTime, histTime);
  }, [animeId, episode]);

  const videoRef = useRef<VideoRef>(null);
  const userPausedRef = useRef(false);
  const episodeTargetResumeRef = useRef<number>(syncInitialResumeSec);
  const [playerStatus, setPlayerStatus] = useState<"idle" | "loading" | "playing" | "paused" | "error">(() => (isReturningFromMini ? "playing" : "loading"));
  const [currentTime, setCurrentTime] = useState(() => syncInitialResumeSec);
  const [duration, setDuration] = useState(() => (isReturningFromMini ? playerData!.duration : 0));
  const [isPlaying, setIsPlaying] = useState(() => (isReturningFromMini ? playerData!.isPlaying : true));
  const [muted, setMuted] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [playableDuration, setPlayableDuration] = useState(0);
  const [videoTracks, setVideoTracks] = useState<any[]>([]);
  const [audioTracks, setAudioTracks] = useState<any[]>([]);
  // Real renditions parsed out of the provider's Auto URL (HLS master or DASH
  // manifest) — kept around while a parsed variant is mounted so the menu can
  // offer Auto + siblings without re-fetching.
  const [parsedQualityOptions, setParsedQualityOptions] = useState<WatchQualityOption[] | null>(null);
  const [parsedQualityNote, setParsedQualityNote] = useState<string | null>(null);

  // ── App state ──
  const [language, setLanguage] = useState<Language>(() => (isReturningFromMini && playerData?.cachedLanguage ? playerData.cachedLanguage : "sub"));

  const [providers, setProviders] = useState<Record<Language, Server[]>>(() => (isReturningFromMini && playerData?.cachedProviders ? playerData.cachedProviders : { sub: [], dub: [] }));
  const [serverIndex, setServerIndex] = useState(() => (isReturningFromMini && typeof playerData?.cachedServerIndex === "number" ? playerData.cachedServerIndex : 0));
  const [stream, setStream] = useState<StreamResponse | null>(() => (isReturningFromMini && playerData?.cachedStream ? playerData.cachedStream : null));
  const [source, setSource] = useState<StreamSource | null>(() => (isReturningFromMini && playerData?.cachedSource ? playerData.cachedSource : null));
  const [isDeviceOffline, setIsDeviceOffline] = useState(false);
  const [waitingNetworkRecovery, setWaitingNetworkRecovery] = useState(false);
  const [serverRecoveryNonce, setServerRecoveryNonce] = useState(0);
  const isDeviceOfflineRef = useRef(false);
  const waitingNetworkRecoveryRef = useRef(false);
  const [useSourceProxy, setUseSourceProxy] = useState(false);
  const [playbackHeaders, setPlaybackHeaders] = useState<Record<string, string> | undefined>(() => (isReturningFromMini && playerData?.cachedStream?.headers ? playerData.cachedStream.headers : undefined));
  const [loadingServers, setLoadingServers] = useState(() => !isReturningFromMini);
  const [serverAttempt, setServerAttempt] = useState(0);
  const [loadingStream, setLoadingStream] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [sourceRevision, setSourceRevision] = useState(0);
  const [speed, setSpeed] = useState(1);
  // Video fit: "contain" letterboxes (16:9 normal), "cover" zoom-fills the entire screen.
  const [fillMode, setFillMode] = useState<"contain" | "cover">("contain");
  const [fillModeToast, setFillModeToast] = useState<string | null>(null);
  const fillModeToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fillModeRef = useRef<"contain" | "cover">("contain");
  useEffect(() => { fillModeRef.current = fillMode; }, [fillMode]);
  const showFillToast = useCallback((mode: "contain" | "cover") => {
    if (fillModeToastTimer.current) clearTimeout(fillModeToastTimer.current);
    setFillModeToast(mode === "cover" ? "Full Semua Layar" : "Layar Normal (16:9)");
    fillModeToastTimer.current = setTimeout(() => {
      setFillModeToast(null);
      fillModeToastTimer.current = null;
    }, 1300);
  }, []);
  const applyFillMode = useCallback((nextMode: "contain" | "cover", silent = false) => {
    setFillMode(nextMode);
    fillModeRef.current = nextMode;
    void AsyncStorage.setItem("luckynime.watch.fillMode.v1", nextMode).catch(() => {});
    if (!silent) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      showFillToast(nextMode);
    }
  }, [showFillToast]);
  const toggleFillMode = useCallback(() => {
    const next = fillModeRef.current === "cover" ? "contain" : "cover";
    applyFillMode(next);
  }, [applyFillMode]);
  const applyFillModeRef = useRef(applyFillMode);
  useEffect(() => { applyFillModeRef.current = applyFillMode; }, [applyFillMode]);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [showControls, setShowControls] = useState(true);
  type ActivePanel = "settings" | "subtitles" | "speed" | "server" | "chapters" | "source" | "quality" | "download" | "language" | null;
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [manualFullscreen, setManualFullscreen] = useState(false);
  const [episodeSearch, setEpisodeSearch] = useState("");
  const [episodePage, setEpisodePage] = useState(0);
  const [progressWidth, setProgressWidth] = useState(0);
  const progressBarRef = useRef<View>(null);
  const barPageXRef = useRef<number>(0);
  const [dragPct, setDragPct] = useState<number | null>(null);
  const [skipSegments, setSkipSegments] = useState<SkipSegments>({ intro: null, outro: null });
  // AniSkip telemetry (Track 4): distinguishes "no skip data" (empty) from
  // "request timed out" (timeout) in the error-card diagnostic line.
  const [skipFetchStatus, setSkipFetchStatus] = useState<SkipFetchStatus>("idle");
  const [resumePosition, setResumePosition] = useState<number | null>(null);
  const [offlineDownload, setOfflineDownload] = useState<OfflineDownload | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null);
  const [requestedQuality, setRequestedQuality] = useState("auto");
  const [adaptiveBitrateCap, setAdaptiveBitrateCap] = useState<number | null>(null);
  const [subtitlePrefs, setSubtitlePrefs] = useState<SubtitlePreferences>(() => getSubtitlePreferencesSync());
  const [selectedTrackUrl, setSelectedTrackUrl] = useState<string | null>(null);
  const [activeSubtitles, setActiveSubtitles] = useState<SubtitleCue[]>([]);
  const [playerLocked, setPlayerLocked] = useState(false);
  const [lastPlayerError, setLastPlayerError] = useState<string | null>(null);
  const [userLiked, setUserLiked] = useState<boolean | null>(null);
  const [isDescExpanded, setIsDescExpanded] = useState(false);
  const [gesturesEnabled, setGesturesEnabled] = useState(true);
  const [skipIntroEnabled, setSkipIntroEnabled] = useState(true);
  const [configuredIntroDuration, setConfiguredIntroDuration] = useState(85);
  const [reportModalVisible, setReportModalVisible] = useState(false);

  const handleShare = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void Share.share({
      title: title,
      message: `Nonton ${title} Episode ${episode} di Luckynime!`,
    }).catch(() => {});
  }, [title, episode]);

  const toggleLike = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setUserLiked((prev) => (prev === true ? null : true));
  }, []);

  const toggleDislike = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setUserLiked((prev) => (prev === false ? null : false));
  }, []);
  const [sleepRemaining, setSleepRemaining] = useState<number | null>(null);
  const [is2xSeeking, setIs2xSeeking] = useState(false);
  const [doubleTapSide, setDoubleTapSide] = useState<"left" | "right" | null>(null);
  const [doubleTapSeconds, setDoubleTapSeconds] = useState(10);
  const doubleTapAnim = useRef(new Animated.Value(0)).current;
  const doubleTapGen = useRef(0);
  const skipHoldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipHoldSide = useRef<"left" | "right" | null>(null);
  const doubleTapTouch = useRef(false);
  // Triple-tap tracking
  const tapCountRef = useRef(0);
  const tapCountTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Multi-tap seek: the pending jump fires on touch-UP; a held 2nd/3rd touch
  // fires it on the hold timer instead and keeps skipping while held.
  const lastActionTimeRef = useRef(0);
  const pendingMultiSeekRef = useRef<{ side: "left" | "right"; seconds: number } | null>(null);
  const holdSeekTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdSeekFiredRef = useRef(false);
  const chainSeekAppliedRef = useRef<{ side: "left" | "right"; seconds: number } | null>(null);
  // PiP entry: probed on first use — the button hides where the device
  // reports no enterPictureInPicture API. Status tracking below keeps
  // refs (not state) current while the system owns the frame.
  const [pipAvailable, setPipAvailable] = useState(true);
  // PiP status: while the system owns the frame, activity pauses UI updates.
  const [, setPipActive] = useState(false);
  const pipActiveRef = useRef(false);
  // Live ExoPlayer rendition feeding the `Auto · 720p` line.
  const [liveHeight, setLiveHeight] = useState<number | null>(null);
  // Up-next card: appears near the finish line, waits for the user — never
  // auto-plays. Manual PLAY NOW or dismiss.
  const [upNextVisible, setUpNextVisible] = useState(false);
  const upNextShownFor = useRef<string | null>(null);
  // Auto-play next episode preference (default ON = matches Autonext toggle in player).
  const [autoPlayNext, setAutoPlayNext] = useState(true);
  // Seconds left on the Up Next auto-play countdown; null = not counting.
  const [upNextCountdown, setUpNextCountdown] = useState<number | null>(null);
  const [volumeHud, setVolumeHud] = useState<number | null>(null);
  const [brightnessHud, setBrightnessHud] = useState<number | null>(null);
  const [volume, setVolume] = useState(1.0);
  const [brightness, setBrightness] = useState(0.5);
  const lockedSpeed = useRef(1);
  const holdSpeedRestore = useRef<number | null>(null);
  const markedComplete = useRef(false);
  const awarded5MinXp = useRef(false);
  const sleepFired = useRef(false);

  // Do NOT force landscape on load — the inline player must stay inline until
  // the user taps fullscreen. Forcing LANDSCAPE here rotated the whole
  // activity on first frame, which looked like "tap opens fullscreen with no UI"
  // (controls start hidden, so the rotated video showed nothing).
  // Fullscreen is entered explicitly via enterFullscreen() only.
  useEffect(() => () => { if (Platform.OS !== "web") void ScreenOrientation.unlockAsync().catch(() => {}); }, []);

  // Fullscreen entry forces landscape even with system auto-rotate OFF (a
  // sensor lock alone keeps portrait when the user holds the phone upright,
  // which read as "fullscreen does nothing"). Fixed normal landscape;
  // exiting fullscreen unlocks again.
  const lockForceLandscape = useCallback(() => {
    if (Platform.OS === "web") return;
    if (Platform.OS === "android") {
      void ScreenOrientation.lockPlatformAsync({ screenOrientationConstantAndroid: 0 }).catch(() => {
        void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
      });
      return;
    }
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
  }, []);

  const streamCache = useRef(new Map<string, CachedStream>());
  const blockedProviders = useRef(new Set<string>());
  const refreshAttempted = useRef(new Set<string>());
  const forceRefresh = useRef(false);
  const sourceStarted = useRef(false);
  const sourceFirstFrame = useRef(false);
  const sourceMounted = useRef(false);
  const sourceAttempt = useRef(0);
  const sourceFailureHandled = useRef<string | null>(null);
  const lastHistorySync = useRef(0);
  const lastProviderSync = useRef(0);
  const skipSegmentsRef = useRef(skipSegments);
  const pendingResume = useRef<number | null>(syncInitialResumeSec > 3 ? syncInitialResumeSec : null);
  const historyResumeRequestedFor = useRef<string | null>(null);
  const initialHistoryResumeApplied = useRef(false);
  const activeProviderId = useRef<string | null>(null);
  const lastStablePlaybackTime = useRef(0);
  const rebufferSeen = useRef(false);
  const intentionalSeekUntil = useRef(0);
  const adaptiveCapSourceUrl = useRef<string | null>(null);
  // One cache entry per master playback URL. Entries are dropped only when the
  // variants scope rotates (provider / episode / refresh / master) — opening
  // the settings sheet changes none of those, so it never re-fetches.
  const hlsVariantsCache = useRef(new Map<string, { options: WatchQualityOption[]; variants: HlsVariant[] }>());
  const parsedOptionsRef = useRef<{ key: string; options: WatchQualityOption[] } | null>(null);
  // Raw parsed renditions for the current master: downloads fetch the exact
  // variant URL for the chosen height, and the token guard re-resolves the
  // same height after a master refresh.
  const parsedVariantsRef = useRef<{ key: string; variants: HlsVariant[] } | null>(null);
  const variantsScopeRef = useRef<VariantsCacheScope | null>(null);
  // Single-refresh flag for the variant token-expiry guard: the mounted
  // variant URL that already earned its one master refresh. Reset on every
  // provider / episode / language / retry switch so a fresh mount retries once.
  const variantTokenRefreshAttempted = useRef<string | null>(null);
  const autoQualityAppliedFor = useRef<string | null>(null);

  const activeProviders = providers[language] ?? [];
  const activeProvider = activeProviders[serverIndex];

  // Real-time connectivity monitor: preserves buffered playback when WiFi/data
  // drops and seamlessly resumes from the exact second once signal returns.
  const sourcePresentRef = useRef(false);
  sourcePresentRef.current = Boolean(source);
  useEffect(() => {
    let mounted = true;
    const applyNetworkState = (offline: boolean) => {
      if (!mounted) return;
      const wasOffline = isDeviceOfflineRef.current;
      isDeviceOfflineRef.current = offline;
      setIsDeviceOffline(offline);
      if (!offline && (wasOffline || waitingNetworkRecoveryRef.current)) {
        const neededRecovery = waitingNetworkRecoveryRef.current;
        waitingNetworkRecoveryRef.current = false;
        setWaitingNetworkRecovery(false);
        setLastPlayerError(null);
        if (neededRecovery) {
          setError(null);
          if (sourcePresentRef.current) {
            const resumeSec = Math.max(currentTimeRef.current, episodeTargetResumeRef.current);
            if (resumeSec > 2) {
              pendingResume.current = resumeSec;
              episodeTargetResumeRef.current = resumeSec;
              initialHistoryResumeApplied.current = false;
            }
            sourceFailureHandled.current = null;
            setPlayerStatus("playing");
            if (!userPausedRef.current) setIsPlaying(true);
            setSourceRevision((v) => v + 1);
          } else {
            setServerRecoveryNonce((v) => v + 1);
          }
        }
      }
    };

    const checkNow = () => {
      void Network.getNetworkStateAsync()
        .then((state) => {
          const offline = !(state.isConnected && state.isInternetReachable !== false);
          applyNetworkState(offline);
        })
        .catch(() => {});
    };

    checkNow();
    const sub = Network.addNetworkStateListener((state) => {
      const offline = !(state.isConnected && state.isInternetReachable !== false);
      applyNetworkState(offline);
    });
    const poll = setInterval(() => {
      if (isDeviceOfflineRef.current || waitingNetworkRecoveryRef.current) {
        checkNow();
      }
    }, 3_000);

    return () => {
      mounted = false;
      sub.remove();
      clearInterval(poll);
    };
  }, []);

  const [localHistoryMap, setLocalHistoryMap] = useState<Record<number, number>>({});

  useEffect(() => {
    let active = true;
    void listLocalWatchEntries().then((entries) => {
      if (!active) return;
      const map: Record<number, number> = {};
      for (const entry of entries) {
        if (entry.animeId === animeId && entry.duration > 0) {
          const pct = Math.min(100, Math.max(0, Math.round((entry.progress / entry.duration) * 100)));
          map[entry.episode] = pct;
        }
      }
      setLocalHistoryMap(map);
    }).catch(() => {});
    return () => { active = false; };
  }, [animeId, episode]);

  const episodeProgressMap = useMemo(() => {
    const map: Record<number, number> = { ...localHistoryMap };
    const serverEntries = history.history.data?.filter((e) => e.anime_id === animeId) ?? [];
    for (const entry of serverEntries) {
      if (entry.duration > 0) {
        const pct = Math.min(100, Math.max(0, Math.round((entry.progress / entry.duration) * 100)));
        map[entry.episode_number] = pct;
      }
    }
    if (duration > 0 && currentTime > 0) {
      const livePct = Math.min(100, Math.max(0, Math.round((currentTime / duration) * 100)));
      map[episode] = Math.max(map[episode] ?? 0, livePct);
    }
    return map;
  }, [animeId, history.history.data, localHistoryMap, episode, currentTime, duration]);

  const playableEpisodes = useMemo(() => {
    const released = displayEpisodes.filter((item) => {
      const isFuture = isConfirmedFutureRelease({
        episodeNumber: item.number,
        episodes: canonicalEpisodes,
        status: animeQuery.data?.status,
        nextAiringEpisode: animeQuery.data?.nextAiringEpisode,
        hasConfirmedEpisodeList: episodeQuery.isSuccess && canonicalEpisodes.length > 0,
      });
      return !isFuture;
    });
    return released.length > 0 ? released : displayEpisodes;
  }, [displayEpisodes, canonicalEpisodes, animeQuery.data?.status, animeQuery.data?.nextAiringEpisode, episodeQuery.isSuccess]);

  const { filteredEpisodes, totalEpisodePages, safeEpisodePage, pagedEpisodes } = useMemo(() => {
    const term = episodeSearch.trim().toLowerCase();
    let filtered = term
      ? playableEpisodes.filter((item) => String(item.number).includes(term) || String(item.title || "").toLowerCase().includes(term))
      : playableEpisodes;
    const pageCount = episodePageCount(filtered.length);
    const safePage = Math.max(0, Math.min(episodePage, pageCount - 1));
    return { filteredEpisodes: filtered, totalEpisodePages: pageCount, safeEpisodePage: safePage, pagedEpisodes: episodePageSlice(filtered, safePage) };
  }, [playableEpisodes, episodePage, episodeSearch]);

  const sourceQualityOptions = useMemo(() => watchQualityOptions(stream, source), [source, stream]);
  const adaptiveCapOptions = useMemo(() => adaptiveBitrateCapOptions(source, videoTracks), [videoTracks, source]);
  const activeAdaptiveCap = adaptiveCapOptions.find((option) => option.maxVideoBitrate === adaptiveBitrateCap);
  const displayedQuality = activeAdaptiveCap?.label ?? selectedWatchQuality(source, requestedQuality);
  const maximumDownloadSource = useMemo(() => selectMaximumQualityDownload(stream?.sources ?? activeProvider?.sources ?? []), [activeProvider?.sources, stream?.sources]);
  // Backend per-quality file links, collected across ALL providers for the
  // current language — SUB and DUB option lists stay separate because
  // activeProviders is already language-filtered. Labels with a quality
  // ("Kiwi 1080p") become picker rows; plain labels ("Zoko") become the
  // single default option.
  const backendDownloadOptions = useMemo(() => sortBackendDownloadOptions(buildBackendDownloadOptions(activeProviders)), [activeProviders]);
  const currentRating = ratings.scoreFor(episode) ?? 0;
  const skipKind = activeSkipKind(skipSegments, currentTime);

  // ── Subtitle loading ──
  useEffect(() => { loadSubtitlePreferences().then(setSubtitlePrefs).catch(() => {}); }, []);

  const parsedCuesRef = useRef<SubtitleCue[]>([]);
  const currentTimeRef = useRef(0);
  currentTimeRef.current = currentTime;
  const durationRef = useRef(0);
  durationRef.current = duration;
  const lastLocalHistorySave = useRef(0);
  // Timing-offset mirror: the subtitle fetch effect reads it without
  // re-running whenever the user nudges the value, while the active-cue
  // effect below re-runs on every offset change.
  const subtitleOffsetRef = useRef(0);
  subtitleOffsetRef.current = subtitlePrefs?.timeOffset ?? 0;
  // Mirrors for the quality effect: it depends on scalar snapshots (url, type,
  // serialized headers) instead of these objects, so unrelated identity churn
  // never re-fetches the master — only real scope changes do.
  const sourceMirrorRef = useRef(source);
  sourceMirrorRef.current = source;
  const playbackHeadersMirrorRef = useRef(playbackHeaders);
  playbackHeadersMirrorRef.current = playbackHeaders;
  // PiP-safe mirrors: refs keep tracking while setState is paused in PiP.
  const playableDurationRef = useRef(0);

  const updateSubtitlePrefs = useCallback((patch: Partial<SubtitlePreferences>) => {
    setSubtitlePrefs((prev) => {
      const merged: SubtitlePreferences = {
        enabled: prev?.enabled ?? true,
        preferredLanguage: prev?.preferredLanguage ?? "id",
        fontSize: prev?.fontSize ?? 15,
        bgOpacity: prev?.bgOpacity ?? 0,
        outlineThickness: prev?.outlineThickness ?? 2,
        fontFamily: prev?.fontFamily ?? "default",
        timeOffset: prev?.timeOffset ?? 0,
        ...patch,
      };
      const next: SubtitlePreferences = { ...merged, timeOffset: clampSubtitleOffset(merged.timeOffset) };
      void saveSubtitlePreferences(next).catch(() => {});
      return next;
    });
  }, []);

  const availableSubtitles = useMemo(() => {
    const raw = source?.subtitles?.length
      ? source.subtitles
      : stream?.subtitles?.length
        ? stream.subtitles
        : activeProvider?.subtitles ?? [];
    return raw.filter(isActualSubtitleTrack);
  }, [source?.subtitles, stream?.subtitles, activeProvider?.subtitles]);

  // Reset explicit per-track URL override when changing episode, server, or dub/sub mode.
  useEffect(() => {
    setSelectedTrackUrl(null);
  }, [animeId, episode, serverIndex, language]);

  const activeSubtitleTrack = useMemo(() => {
    if (!availableSubtitles.length) return null;
    if (selectedTrackUrl) {
      const explicit = availableSubtitles.find((item) => item.url === selectedTrackUrl);
      if (explicit) return explicit;
    }
    return matchSubtitleTrack(availableSubtitles, subtitlePrefs?.preferredLanguage ?? "id");
  }, [availableSubtitles, selectedTrackUrl, subtitlePrefs?.preferredLanguage]);

  useEffect(() => {
    if (!activeSubtitleTrack?.url || subtitlePrefs?.enabled === false) {
      parsedCuesRef.current = [];
      setActiveSubtitles([]);
      return;
    }
    const rawTrackUrl = activeSubtitleTrack.url;
    const urlFormat = detectSubtitleFormat(rawTrackUrl);
    const isAlreadyProxied =
      rawTrackUrl.includes("/api/v1/proxy?") || rawTrackUrl.includes("/api/v1/subtitle");
    const baseSubtitleUrl = isAlreadyProxied
      ? luckynimeProxyUrl(rawTrackUrl)
      : luckynimeProxyUrl(rawTrackUrl, nativePlaybackHeaders(playbackHeadersMirrorRef.current));

    // Pastikan otomatis terjemah ke Bahasa Indonesia apabila preferensi adalah "id"
    // dan track sumber dari server belum berbahasa Indonesia / belum memiliki translate=id.
    const wantsIndonesian = normalizeSubtitleLang(subtitlePrefs?.preferredLanguage ?? "id") === "id";
    const trackIsIndonesian =
      normalizeSubtitleLang(activeSubtitleTrack.lang) === "id" ||
      normalizeSubtitleLang(activeSubtitleTrack.label) === "id" ||
      baseSubtitleUrl.includes("translate=id");
    const versionedBaseUrl =
      baseSubtitleUrl.includes("/api/v1/proxy?") && !baseSubtitleUrl.includes("sv=")
        ? `${baseSubtitleUrl}&sv=2`
        : baseSubtitleUrl;
    const subtitleUrl =
      wantsIndonesian && !trackIsIndonesian && !selectedTrackUrl && versionedBaseUrl.includes("/api/v1/proxy?")
        ? `${versionedBaseUrl}&translate=id`
        : versionedBaseUrl;

    let cancelled = false;
    const loadTrack = async () => {
      const attemptFetch = async (targetUrl: string) => {
        const res = await fetch(targetUrl, {
          headers: { Accept: "text/vtt, text/plain, */*" },
        });
        if (!res.ok) throw new Error(`subtitle ${res.status}`);
        return res.text();
      };

      let text = "";
      try {
        text = await attemptFetch(subtitleUrl);
      } catch {
        // Retry once cleanly in case a serverless cold-start or transient network hiccup occurred.
        if (cancelled) return;
        await new Promise((r) => setTimeout(r, 400));
        if (cancelled) return;
        text = await attemptFetch(subtitleUrl);
      }

      if (cancelled || !text.trim()) {
        if (!cancelled) {
          parsedCuesRef.current = [];
          setActiveSubtitles([]);
        }
        return;
      }
      const format = urlFormat ?? detectSubtitleFormatFromContent(text);
      const parsed = parseSubtitle(text, format);
      if (cancelled) return;
      parsedCuesRef.current = parsed.cues;
      setActiveSubtitles(findActiveCues(parsed.cues, currentTimeRef.current - subtitleOffsetRef.current));
    };

    void loadTrack().catch(() => {
      if (!cancelled) {
        parsedCuesRef.current = [];
        setActiveSubtitles([]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [activeSubtitleTrack?.url, subtitlePrefs?.enabled]);

  // Positive offset = subs appear later (evaluate an earlier cue time),
  // negative = subs appear earlier. Re-selects immediately when it changes
  // so a paused player shows the shift without waiting for the next tick.
  const subtitleTimeOffset = clampSubtitleOffset(subtitlePrefs?.timeOffset ?? 0);
  useEffect(() => {
    if (parsedCuesRef.current.length) {
      setActiveSubtitles(findActiveCues(parsedCuesRef.current, currentTime - subtitleTimeOffset));
    } else if (currentTimeRef.current !== currentTime) {
      // Keep ref in sync even before cues load.
    }
  }, [currentTime, subtitleTimeOffset]);

  // ── Effects ──
  useEffect(() => {
    let active = true;
    void findOfflineDownload(animeId, episode, language).then((entry) => { if (active) setOfflineDownload(entry); }).catch(() => { if (active) setOfflineDownload(null); });
    return () => { active = false; };
  }, [animeId, episode, language]);

  useEffect(() => {
    if (episodeSearch.trim()) { setEpisodePage(0); return; }
    setEpisodePage(episodePageFor(episode));
  }, [episode, episodeSearch]);

  useEffect(() => {
    lastStablePlaybackTime.current = 0;
    rebufferSeen.current = false;
    intentionalSeekUntil.current = 0;
    initialHistoryResumeApplied.current = false;
    setLiveHeight(null);
  }, [source?.url, sourceRevision]);

  useEffect(() => {
    const reportedTime = currentTime;
    const intentionalSeek = Date.now() < intentionalSeekUntil.current;
    if (buffering) rebufferSeen.current = true;
    if (shouldHoldRebufferWatermark({ lastStableTime: lastStablePlaybackTime.current, reportedTime, wasBuffering: rebufferSeen.current, playbackStarted: sourceStarted.current, intentionalSeek })) return;
    if (intentionalSeek || reportedTime >= lastStablePlaybackTime.current - 0.05) {
      lastStablePlaybackTime.current = reportedTime;
      if (!buffering) rebufferSeen.current = false;
    }
  }, [buffering, currentTime]);

  useEffect(() => { skipSegmentsRef.current = skipSegments; }, [skipSegments]);

  const applySkipSegments = useCallback((incoming: SkipSegments) => {
    setSkipSegments((current) => mergeSkipSegments(current, incoming));
  }, []);

  const clearEpisodePlayback = useCallback(() => {
    videoRef.current?.pause();
    setStream(null);
    setSource(null);
    setLastPlayerError(null);
    waitingNetworkRecoveryRef.current = false;
    setWaitingNetworkRecovery(false);
    markedComplete.current = false;
    awarded5MinXp.current = false;
    setUseSourceProxy(false);
    setPlaybackHeaders(undefined);
    setSkipSegments({ intro: null, outro: null });
    blockedProviders.current.clear();
    refreshAttempted.current.clear();
    variantTokenRefreshAttempted.current = null;
    sourceStarted.current = false;
    sourceFirstFrame.current = false;
    sourceMounted.current = false;
    sourceFailureHandled.current = null;
    lastStablePlaybackTime.current = 0;
    rebufferSeen.current = false;
    intentionalSeekUntil.current = 0;
    pendingResume.current = null;
    episodeTargetResumeRef.current = 0;
    userPausedRef.current = false;
    setIsPlaying(true);
    initialHistoryResumeApplied.current = false;
    historyResumeRequestedFor.current = null;
    setResumePosition(null);
  }, []);

  const handleProviderBlocked = useCallback((reason: RetryReason = "player") => {
    // When WiFi/mobile data is down, keep the current <Video> mounted so the
    // user can finish watching buffered segments and auto-resume when back online.
    if (isDeviceOfflineRef.current) {
      waitingNetworkRecoveryRef.current = true;
      setWaitingNetworkRecovery(true);
      setLoadingStream(false);
      if (!sourcePresentRef.current) {
        setError("Koneksi internet terputus. Video akan dimuat otomatis saat sinyal kembali.");
      }
      return;
    }
    const current = activeProviders[serverIndex];
    if (!current) return;
    // Retry honesty: the same provider is re-fetched ONCE with refresh:true;
    // afterwards we move to the next unblocked provider. The same dead URL
    // is never looped without the refresh flag (see shouldRefreshSameProvider).
    if (shouldRefreshSameProvider(reason, refreshAttempted.current.has(current.id))) {
      refreshAttempted.current.add(current.id);
      forceRefresh.current = true;
      sourceStarted.current = false;
      sourceFirstFrame.current = false;
      sourceMounted.current = false;
      sourceFailureHandled.current = null;
      setLoadingStream(true);
      setRefreshNonce((value) => value + 1);
      return;
    }
    // No direct / proxy sources from this provider — try the next server.
    blockedProviders.current.add(current.id);
    const next = activeProviders.findIndex((p, i) => i !== serverIndex && !blockedProviders.current.has(p.id));
    if (next >= 0) {
      sourceStarted.current = false;
      sourceFirstFrame.current = false;
      sourceMounted.current = false;
      sourceFailureHandled.current = null;
      setLoadingStream(true);
      setServerIndex(next);
      return;
    }
    setLoadingStream(false);
    setError("Server streaming belum merespons untuk episode ini. Silakan coba lagi sebentar lagi.");
  }, [activeProviders, serverIndex]);

  const handleProviderBlockedRef = useRef(handleProviderBlocked);
  useEffect(() => { handleProviderBlockedRef.current = handleProviderBlocked; }, [handleProviderBlocked]);

  useEffect(() => {
    let active = true;
    void Promise.all([
      AsyncStorage.getItem("luckynime.watch.preferences"),
      AsyncStorage.getItem("luckynime.watch.autonext.v2"),
      AsyncStorage.getItem("luckynime.watch.fillMode.v1"),
      loadPlaybackSettings(),
    ]).then(([stored, storedAutoNextV2, storedFillMode, pb]) => {
      if (!active) return;
      if (stored) {
        try {
          const preferences = JSON.parse(stored) as WatchPreferences;
          if (typeof preferences.speed === "number" && [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].includes(preferences.speed)) setSpeed(preferences.speed);
        } catch { /* ignore malformed */ }
      }
      if (storedAutoNextV2 === "true" || storedAutoNextV2 === "false") {
        setAutoPlayNext(storedAutoNextV2 === "true");
      } else {
        setAutoPlayNext(true);
      }
      if (storedFillMode === "cover" || storedFillMode === "contain") {
        setFillMode(storedFillMode);
        fillModeRef.current = storedFillMode;
      }
      if (pb) {
        setGesturesEnabled(pb.gestures);
        setSkipIntroEnabled(pb.skipIntro);
        const dur = parseInt(pb.introDuration.replace("s", ""), 10);
        if (dur > 0) setConfiguredIntroDuration(dur);
        if (pb.quality && pb.quality.toLowerCase() !== "auto") {
          setRequestedQuality(pb.quality.toLowerCase());
        }
      }
    }).catch(() => {}).finally(() => { if (active) setPreferencesReady(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!preferencesReady) return;
    void AsyncStorage.setItem("luckynime.watch.preferences", JSON.stringify({ speed, autoPlayNext })).catch(() => {});
    void AsyncStorage.setItem("luckynime.watch.autonext.v2", String(autoPlayNext)).catch(() => {});
    void savePlaybackSetting("autoPlay", autoPlayNext);
  }, [preferencesReady, speed, autoPlayNext]);

  // ── Server discovery ──
  const isReturningFromMiniRef = useRef(isReturningFromMini);
  const lastClearedEpisodeKeyRef = useRef<string>("");
  useEffect(() => {
    if (!Number.isFinite(animeId) || animeId <= 0) return;
    if (isReturningFromMiniRef.current && source) {
      isReturningFromMiniRef.current = false;
      return;
    }
    let cancelled = false;
    const epKey = `${animeId}:${episode}`;
    if (lastClearedEpisodeKeyRef.current !== epKey) {
      lastClearedEpisodeKeyRef.current = epKey;
      clearEpisodePlayback();
      setProviders({ sub: [], dub: [] });
      setLanguage("sub");
      setServerIndex(0);
    }
    setLoadingServers(true);
    setServerAttempt(0);
    setLoadingStream(false);
    setError(null);

    // Start server discovery immediately on episode mount without waiting for
    // animeQuery / episodeQuery metadata so playback starts ~500-900ms faster
    // and clearEpisodePlayback() never re-fires mid-boot.
    const SERVER_RETRY_DELAYS_MS = [2000, 5000, 10000];
    const fetchServers = async (attempt: number) => {
      setServerAttempt(attempt + 1);
      const langKey = `luckynime.lang.${animeId}`;
      const preferred = await AsyncStorage.getItem(langKey).catch(() => null) as Language | null;
      if (cancelled) return;

      const primaryLang: Language = preferred === "dub" ? "dub" : "sub";
      const secondaryLang: Language = primaryLang === "dub" ? "sub" : "dub";

      // Fire both requests concurrently so backend starts scraping immediately
      const primaryPromise = getServers(animeId, episode, primaryLang).catch(() => [] as Server[]);
      const secondaryPromise = getServers(animeId, episode, secondaryLang).catch(() => [] as Server[]);

      // Await primary language first for instant playback mount
      const primaryServers = await primaryPromise;
      if (cancelled) return;

      if (primaryServers.length > 0) {
        setProviders((prev) => ({ ...prev, [primaryLang]: primaryServers }));
        setLanguage(primaryLang);
        setLoadingServers(false);

        // Merge secondary language asynchronously in background without blocking player
        void secondaryPromise.then((secServers) => {
          if (cancelled || !secServers.length) return;
          setProviders((prev) => ({ ...prev, [secondaryLang]: secServers }));
        });
        return;
      }

      // If primary language was empty, check secondary language
      const secondaryServers = await secondaryPromise;
      if (cancelled) return;

      if (secondaryServers.length > 0) {
        setProviders({ [primaryLang]: [], [secondaryLang]: secondaryServers } as { sub: Server[]; dub: Server[] });
        setLanguage(secondaryLang);
        setLoadingServers(false);
        return;
      }

      if (isDeviceOfflineRef.current) {
        waitingNetworkRecoveryRef.current = true;
        setWaitingNetworkRecovery(true);
        setLoadingServers(false);
        setError("Koneksi internet terputus. Video akan dimuat otomatis saat sinyal kembali.");
        return;
      }

      // Both languages empty: retry with backoff if attempts remain
      if (attempt < SERVER_RETRY_DELAYS_MS.length) {
        await new Promise((resolve) => setTimeout(resolve, SERVER_RETRY_DELAYS_MS[attempt]));
        if (cancelled) return;
        return fetchServers(attempt + 1);
      }

      setLoadingServers(false);
      setError("Server streaming belum tersedia untuk episode ini.");
    };
    void fetchServers(0);
    return () => { cancelled = true; };
  }, [animeId, clearEpisodePlayback, episode, serverRecoveryNonce]);

  useEffect(() => {
    if (episodeQuery.isPending || animeQuery.isPending) return;
    if (futureRelease) {
      videoRef.current?.pause();
      setSource(null);
      setLoadingServers(false);
      setLoadingStream(false);
      setError(FUTURE_RELEASE_MESSAGE);
      return;
    }
    if (invalidEpisode && !source && !loadingServers && !loadingStream) {
      setError(`Episode ${episode} is not available.`);
    }
  }, [animeQuery.isPending, episode, episodeQuery.isPending, futureRelease, invalidEpisode, loadingServers, loadingStream, source]);

  // ── Stream loading (Native HLS/MP4/DASH only — Embed completely removed) ──
  useEffect(() => {
    if (futureRelease || !activeProvider) return;
    let cancelled = false;
    const providerId = activeProvider.id;
    activeProviderId.current = providerId;
    const initial: StreamResponse = { sources: activeProvider.sources ?? [], headers: activeProvider.headers };
    const initialDirect = directSources(initial);
    const initialProxies = proxySources(initial);
    // Capture mount state at effect start to avoid stale reads across async boundary
    const alreadyMounted = sourceMounted.current;
    const forceThisRequest = forceRefresh.current;
    forceRefresh.current = false;
    const hasInitial = initialDirect.length > 0 || initialProxies.length > 0;

    setError(null);
    if (hasInitial && !alreadyMounted && !forceThisRequest) {
      setStream(initial);
      setPlaybackHeaders(activeProvider.headers);
      if (initialDirect.length) {
        sourceMounted.current = true;
        setSource(initialDirect[0]);
        setUseSourceProxy(false);
        setSourceRevision((v) => v + 1);
      } else if (initialProxies.length) {
        sourceMounted.current = true;
        setSource(initialProxies[0]);
        setUseSourceProxy(true);
        setSourceRevision((v) => v + 1);
      }
      applySkipSegments(providerSkipSegments(initial));
      setLoadingStream(false);
    } else if (!hasInitial) {
      setLoadingStream(true);
    }

    // Cache is keyed by provider identity + language + episode (see
    // streamCacheKey in lib/watch-engine): a sub stream must never be
    // reused for a dub request, nor Momo's for Niko's.
    const cacheKey = streamCacheKey(activeProvider, episode, language);
    const cached = streamCache.current.get(cacheKey);
    if (!forceThisRequest && cached && Date.now() - cached.savedAt < STREAM_CACHE_TTL_MS) {
      const cachedDirect = directSources(cached.data);
      const cachedProxies = proxySources(cached.data);
      if (!alreadyMounted && (cachedDirect.length || cachedProxies.length)) {
        setStream(cached.data);
        setPlaybackHeaders(cached.data.headers ?? activeProvider.headers);
        if (cachedDirect.length) {
          sourceMounted.current = true;
          setSource(cachedDirect[0]);
          setUseSourceProxy(false);
          setSourceRevision((v) => v + 1);
        } else if (cachedProxies.length) {
          sourceMounted.current = true;
          setSource(cachedProxies[0]);
          setUseSourceProxy(true);
          setSourceRevision((v) => v + 1);
        }
        applySkipSegments(providerSkipSegments(cached.data));
        setLoadingStream(false);
      }
    }

    const urlFetchStart = Date.now();
    if (__DEV__) {
      console.log(`[PlaybackMetrics] Requesting Stream URL: animeId=${animeId} ep=${episode} provider=${activeProvider.provider} lang=${language} t=${Date.now() - screenMountTime}ms`);
    }

    void getStream({ animeId, episode, provider: activeProvider.provider, lang: language, refresh: forceThisRequest })
      .then((response) => {
        if (cancelled || activeProviderId.current !== providerId) return;
        if (__DEV__) {
          console.log(`[PlaybackMetrics] Stream URL Acquired: provider=${activeProvider.provider} fetchDuration=${Date.now() - urlFetchStart}ms t=${Date.now() - screenMountTime}ms`);
        }
        const refreshedDirect = directSources(response);
        const refreshedProxies = proxySources(response);
        const hasNative = refreshedDirect.length > 0 || refreshedProxies.length > 0;
        if (!hasNative) {
          streamCache.current.set(cacheKey, { savedAt: Date.now(), data: response });
          setStream(response);
          setPlaybackHeaders(response.headers ?? activeProvider.headers);
          applySkipSegments(providerSkipSegments(response));
          if (!sourceMounted.current) {
            handleProviderBlockedRef.current("stream");
          }
          return;
        }
        streamCache.current.set(cacheKey, { savedAt: Date.now(), data: response });
        setStream(response);
        applySkipSegments(providerSkipSegments(response));
        if (shouldMountReplacementSource(sourceMounted.current, forceThisRequest)) {
          sourceMounted.current = true;
          setPlaybackHeaders(response.headers ?? activeProvider.headers);
          if (refreshedDirect.length) {
            setSource(refreshedDirect[0]);
            setUseSourceProxy(false);
          } else {
            setSource(refreshedProxies[0]);
            setUseSourceProxy(true);
          }
          setSourceRevision((v) => v + 1);
        }
        setLoadingStream(false);
      })
      .catch(() => {
        if (cancelled || activeProviderId.current !== providerId) return;
        if (isDeviceOfflineRef.current) {
          waitingNetworkRecoveryRef.current = true;
          setWaitingNetworkRecovery(true);
          setLoadingStream(false);
          if (!sourceMounted.current) {
            setError("Koneksi internet terputus. Video akan dimuat otomatis saat sinyal kembali.");
          }
          return;
        }
        if (!hasInitial || forceThisRequest) handleProviderBlockedRef.current("stream");
      });
    return () => { cancelled = true; };
  }, [activeProvider, animeId, applySkipSegments, episode, futureRelease, language, refreshNonce]);

  // ── Source loading with direct → proxy fallback ──
  // Offline saved copies never touch the stream path: no watchdog, no
  // proxy, no headers. Local files either load or surface a player error;
  // failing over to a network server would be the wrong next step.
  useEffect(() => {
    if (!source || isOfflinePlaybackSource(source)) return;
    sourceFailureHandled.current = null;
    sourceStarted.current = false;
    sourceFirstFrame.current = false;
    const attempt = ++sourceAttempt.current;
    // Video source: try direct, proxy already handled by useSourceProxy state
    const watchdog = setTimeout(() => {
      if (sourceAttempt.current !== attempt || sourceStarted.current) return;
      if (isDeviceOfflineRef.current) {
        waitingNetworkRecoveryRef.current = true;
        setWaitingNetworkRecovery(true);
        return;
      }
      if (shouldRetryProxiedSourceAfterDirect(useSourceProxy, sourceStarted.current)) {
        setUseSourceProxy(true);
        setSourceRevision((v) => v + 1);
        return;
      }
      handleProviderBlockedRef.current("startup");
    }, STARTUP_WATCHDOG_MS);
    return () => clearTimeout(watchdog);
  }, [source?.url, sourceRevision, useSourceProxy]);

  useEffect(() => {
    const sourceUrl = source?.url ?? null;
    if (adaptiveCapSourceUrl.current !== sourceUrl) {
      adaptiveCapSourceUrl.current = sourceUrl;
      if (adaptiveBitrateCap !== null) setAdaptiveBitrateCap(null);
      return;
    }
  }, [adaptiveBitrateCap, source]);

  const tryApplyAutoResume = useCallback((knownDuration?: number, actualCurrentTime?: number) => {
    if (initialHistoryResumeApplied.current) return;
    const target = pendingResume.current;
    if (typeof target !== "number" || !Number.isFinite(target) || target <= 2) return;
    const dur = knownDuration && knownDuration > 0 ? knownDuration : durationRef.current;
    if (!sourceStarted.current && dur <= 0) return;
    if (dur > 0 && (target >= dur - 8 || target / dur >= 0.96)) {
      pendingResume.current = null;
      episodeTargetResumeRef.current = 0;
      initialHistoryResumeApplied.current = true;
      setResumePosition(null);
      return;
    }
    initialHistoryResumeApplied.current = true;
    pendingResume.current = null;
    setResumePosition(null);
    intentionalSeekUntil.current = Date.now() + 2_200;
    lastStablePlaybackTime.current = target;
    currentTimeRef.current = target;
    setCurrentTime(target);
    // If native startPosition already landed within 2.5s of target, skip redundant JS seek so ExoPlayer never rebuffers twice.
    if (typeof actualCurrentTime !== "number" || !Number.isFinite(actualCurrentTime) || Math.abs(actualCurrentTime - target) > 2.5) {
      videoRef.current?.seek(target);
    }
  }, []);

  useEffect(() => {
    if (hasConfirmedPlaybackStart({ isPlaying, currentTime, firstFrameRendered: sourceFirstFrame.current })) {
      sourceStarted.current = true;
      void markMissionProgress("misi-anime");
    }
    if (!initialHistoryResumeApplied.current && pendingResume.current !== null && (sourceStarted.current || isPlaying || playerStatus === "playing")) {
      tryApplyAutoResume();
    }
  }, [currentTime, isPlaying, playerStatus, tryApplyAutoResume]);

  useEffect(() => {
    if (playerStatus !== "error" || !source?.url || sourceFailureHandled.current === source.url) return;
    if (isDeviceOfflineRef.current || waitingNetworkRecoveryRef.current) return;
    // Offline files stay offline: surface the player error, never proxy or
    // fail over to a network server.
    if (isOfflinePlaybackSource(source)) {
      sourceFailureHandled.current = source.url;
      setLoadingStream(false);
      setError("The saved copy could not play. Remove it and download again.");
      return;
    }
    if (!useSourceProxy) { setUseSourceProxy(true); setSourceRevision((v) => v + 1); return; }
    sourceFailureHandled.current = source.url;
    handleProviderBlockedRef.current("player");
  }, [source?.url, playerStatus, useSourceProxy]);

  // ── Skip segments (AniSkip) ──
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const resolveMalId = async () => {
      const metadataMalId = getKnownMalId(animeQuery.data);
      if (metadataMalId) return metadataMalId;
      const cacheKey = `luckynime-watch-mal:${animeId}`;
      const stored = await AsyncStorage.getItem(cacheKey).catch(() => null);
      const cached = Number(stored);
      if (Number.isFinite(cached) && cached > 0) return cached;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const resolved = await getMalIdByAnimeId(animeId);
          if (resolved) { void AsyncStorage.setItem(cacheKey, String(resolved)).catch(() => {}); return resolved; }
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 1_500 * (attempt + 1)));
      }
      return null;
    };
    void resolveMalId().then(async (malId) => {
      if (!malId || cancelled) return;
      const key = skipCacheKey(malId, episode);
      const stored = await AsyncStorage.getItem(key).catch(() => null);
      if (stored) {
        const cached = JSON.parse(stored) as { savedAt?: number; segments?: SkipSegments | null };
        if (cached.savedAt && Date.now() - cached.savedAt < SKIP_CACHE_TTL_MS) {
          if (!cancelled && cached.segments) applySkipSegments(cached.segments);
          if (!cancelled) setSkipFetchStatus(resolveSkipFetchStatus({ fromCache: true }));
          return;
        }
      }
      const timeout = setTimeout(() => controller.abort(), ANISKIP_TIMEOUT_MS);
      // Pass the real runtime when known — episodeLength=0 makes AniSkip miss
      // entries it would otherwise return (then 404, handled below).
      const runtime = duration > 0 ? Math.round(duration) : 0;
      let timedOut = false;
      try {
        const response = await fetch(`https://api.aniskip.com/v2/skip-times/${malId}/${episode}?types%5B%5D=op&types%5B%5D=ed&episodeLength=${runtime}`, { headers: { Accept: "application/json" }, signal: controller.signal, cache: "no-store" });
        clearTimeout(timeout);
        if (!response.ok) {
          void AsyncStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), segments: null })).catch(() => {});
          if (!cancelled) setSkipFetchStatus(resolveSkipFetchStatus({ ok: true, hasSegments: false }));
          return;
        }
        const segments = normalizeAniSkipSegments(await response.json());
        if (cancelled) return;
        applySkipSegments(segments);
        if (!cancelled) setSkipFetchStatus(resolveSkipFetchStatus({ ok: true, hasSegments: Boolean(segments.intro || segments.outro) }));
        void AsyncStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), segments: segments.intro || segments.outro ? segments : null })).catch(() => {});
      } catch (cause) {
        clearTimeout(timeout);
        timedOut = cause instanceof Error && cause.name === "AbortError";
        void AsyncStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), segments: null })).catch(() => {});
        if (!cancelled) setSkipFetchStatus(resolveSkipFetchStatus({ timedOut, ok: false }));
      }
    }).catch(() => { if (!cancelled) setSkipFetchStatus(resolveSkipFetchStatus({ ok: false })); });
    return () => { cancelled = true; controller.abort(); };
  }, [animeId, animeQuery.data, applySkipSegments, duration, episode]);

  // ── Instant Automatic History Resume (Local + Supabase, zero button click needed) ──
  const pickValidResume = useCallback((progress?: number | null, total?: number | null): number | null => {
    const p = Number(progress);
    const d = Number(total);
    if (!Number.isFinite(p) || p <= 3) return null;
    if (Number.isFinite(d) && d > 0) {
      if (p >= d - 8 || p / d >= 0.96) return null;
    }
    return p;
  }, []);

  // 1) Read local AsyncStorage + memory + cached history immediately on episode mount
  useEffect(() => {
    if (!Number.isFinite(animeId) || animeId <= 0) return;
    let cancelled = false;
    const paramCandidate = pickValidResume(Number(params.resumeTime), null);
    const memEntry = MEMORY_WATCH_PROGRESS.get(`${animeId}:${episode}`);
    const memCandidate = memEntry ? pickValidResume(memEntry.progress, memEntry.duration) : null;
    const cachedRow = history.displayRows?.find(
      (item: any) => Number(item?.anime_id) === animeId && Number(item?.episode_number) === episode,
    );
    const cachedCandidate = cachedRow ? pickValidResume(cachedRow.progress, cachedRow.duration) : null;
    const syncBest = Math.max(
      pendingResume.current ?? 0,
      paramCandidate ?? 0,
      memCandidate ?? 0,
      cachedCandidate ?? 0,
    );
    if (syncBest > 3 && !initialHistoryResumeApplied.current) {
      pendingResume.current = syncBest;
      episodeTargetResumeRef.current = syncBest;
      if (!sourceStarted.current) {
        currentTimeRef.current = syncBest;
        setCurrentTime(syncBest);
      }
    } else if (!sourceStarted.current && !isReturningFromMini) {
      currentTimeRef.current = 0;
      setCurrentTime(0);
    }

    void AsyncStorage.getItem(`luckynime-watch-local:${animeId}:${episode}`)
      .then((stored) => {
        if (cancelled || !stored) return;
        try {
          const parsed = JSON.parse(stored) as { progress?: number; duration?: number };
          if (Number.isFinite(Number(parsed.progress)) && Number.isFinite(Number(parsed.duration))) {
            MEMORY_WATCH_PROGRESS.set(`${animeId}:${episode}`, {
              progress: Number(parsed.progress),
              duration: Number(parsed.duration),
            });
          }
          const candidate = pickValidResume(parsed.progress, parsed.duration);
          if (candidate !== null && !initialHistoryResumeApplied.current) {
            const best = Math.max(pendingResume.current ?? 0, candidate);
            pendingResume.current = best;
            episodeTargetResumeRef.current = best;
            if (!sourceStarted.current) {
              currentTimeRef.current = best;
              setCurrentTime(best);
            }
            tryApplyAutoResume();
          }
        } catch {
          /* ignore malformed */
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [animeId, episode, pickValidResume, tryApplyAutoResume]);

  // 2) Merge with Supabase watch_history / offline cache when available — prefer max(local, server)
  useEffect(() => {
    if (!Number.isFinite(animeId) || animeId <= 0) return;
    const rows = history.displayRows ?? history.history.data;
    if (!rows?.length) return;
    const serverEntry = rows.find((item: any) => Number(item?.anime_id) === animeId && Number(item?.episode_number) === episode);
    const serverCandidate = serverEntry ? pickValidResume(serverEntry.progress, serverEntry.duration) : null;
    if (serverCandidate === null) return;
    const historyKey = `${animeId}:${episode}:${Math.floor(serverCandidate)}`;
    if (historyResumeRequestedFor.current === historyKey) return;
    historyResumeRequestedFor.current = historyKey;

    if (!initialHistoryResumeApplied.current) {
      const best = Math.max(pendingResume.current ?? 0, serverCandidate);
      pendingResume.current = best;
      episodeTargetResumeRef.current = best;
      if (!sourceStarted.current) {
        currentTimeRef.current = best;
        setCurrentTime(best);
      }
      tryApplyAutoResume();
    } else if (currentTimeRef.current < 8 && serverCandidate > currentTimeRef.current + 5) {
      // Server history arrived slightly after video started from 0s — jump right to saved minute
      pendingResume.current = serverCandidate;
      episodeTargetResumeRef.current = serverCandidate;
      initialHistoryResumeApplied.current = false;
      tryApplyAutoResume();
    }
  }, [animeId, episode, history.displayRows, history.history.data, pickValidResume, tryApplyAutoResume]);

  const flushWatchProgress = useCallback((forceServer = false) => {
    const pos = currentTimeRef.current;
    const dur = durationRef.current;
    if (!Number.isFinite(animeId) || animeId <= 0 || !Number.isFinite(pos) || pos < 3 || !Number.isFinite(dur) || dur <= 0) {
      return;
    }
    MEMORY_WATCH_PROGRESS.set(`${animeId}:${episode}`, { progress: pos, duration: dur });
    void AsyncStorage.setItem(
      `luckynime-watch-local:${animeId}:${episode}`,
      JSON.stringify({ progress: pos, duration: dur, savedAt: Date.now() }),
    ).catch(() => {});
    if (auth.user && (forceServer || Math.abs(pos - lastHistorySync.current) >= 8)) {
      lastHistorySync.current = pos;
      history.save.mutate({
        animeId,
        animeTitle: title,
        animeImage: image || null,
        episode,
        episodeTitle: selectedEpisode?.title || null,
        episodeThumbnail: selectedEpisode?.thumbnail || null,
        progress: pos,
        duration: dur,
      });
    }
  }, [animeId, auth.user, episode, history.save, image, selectedEpisode?.thumbnail, selectedEpisode?.title, title]);

  const flushWatchProgressRef = useRef(flushWatchProgress);
  useEffect(() => { flushWatchProgressRef.current = flushWatchProgress; }, [flushWatchProgress]);

  // Save locally every 3s for ALL users (logged-in + guest) and sync to Supabase every 8s
  useEffect(() => {
    if (!source || currentTime < 3 || duration <= 0) return;
    if (Math.abs(currentTime - lastLocalHistorySave.current) >= 3) {
      lastLocalHistorySave.current = currentTime;
      flushWatchProgress(false);
    }
  }, [currentTime, duration, flushWatchProgress, source]);

  // Flush exact last-watched timestamp on backgrounding or leaving the watch screen
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        flushWatchProgressRef.current(true);
      }
    });
    return () => {
      sub.remove();
      flushWatchProgressRef.current(true);
    };
  }, [animeId, episode]);

  useEffect(() => {
    if (!auth.user || !source || currentTime < 1 || duration <= 0 || providerSync.connected.length === 0 || currentTime - lastProviderSync.current < 90) return;
    lastProviderSync.current = currentTime;
    providerSync.pushProgress.mutate({ animeId, episode, progress: Math.floor(currentTime), status: "watching" });
  }, [animeId, auth.user, currentTime, duration, episode, providerSync.connected.length, providerSync.pushProgress, source]);

  // Sleep countdown owned by the screen so it survives settings close. The
  // boolean deps keep a single interval alive instead of recreating it per tick.
  const sleepIdle = sleepRemaining === null;
  const sleepDone = sleepRemaining === 0;
  useEffect(() => {
    if (sleepIdle || sleepDone) {
      if (sleepDone && !sleepFired.current) {
        sleepFired.current = true;
        setIsPlaying(false);
        videoRef.current?.pause();
      }
      return;
    }
    sleepFired.current = false;
    const id = setInterval(() => {
      setSleepRemaining((prev) => (prev === null || prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [sleepIdle, sleepDone]);

  // ── 5-Minute Watch EXP Reward ──
  useEffect(() => {
    if (!auth.user || !source || currentTime < 300 || duration <= 0 || awarded5MinXp.current) return;
    awarded5MinXp.current = true;
    void grantXp({
      activityType: EXP_RULES.WATCH_5MIN.type,
      targetId: `${animeId}:${episode}`,
      baseXp: EXP_RULES.WATCH_5MIN.xp,
      description: `${EXP_RULES.WATCH_5MIN.label} (${title} Ep ${episode})`,
      metadata: { anime_id: animeId, episode },
    });
  }, [animeId, auth.user, currentTime, duration, episode, grantXp, source, title]);

  // 90% auto-mark-as-completed (Anilab parity): exiting at 95% without
  // reaching onEnd previously recorded nothing.
  useEffect(() => {
    if (!source || duration <= 0 || currentTime <= 0 || markedComplete.current) return;
    if (currentTime / duration < 0.9) return;
    markedComplete.current = true;
    if (auth.user) {
      history.save.mutate({ animeId, animeTitle: title, animeImage: image || null, episode, episodeTitle: selectedEpisode?.title || null, episodeThumbnail: selectedEpisode?.thumbnail || null, progress: currentTime, duration });
      if (providerSync.connected.length) providerSync.pushProgress.mutate({ animeId, episode, progress: Math.floor(currentTime), status: "completed" });

      const isMovie = animeQuery.data?.format === "MOVIE";
      if (isMovie) {
        void grantXp({
          activityType: EXP_RULES.COMPLETE_MOVIE.type,
          targetId: String(animeId),
          baseXp: EXP_RULES.COMPLETE_MOVIE.xp,
          description: `${EXP_RULES.COMPLETE_MOVIE.label} - ${title}`,
          metadata: { anime_id: animeId },
        });
      } else {
        void grantXp({
          activityType: EXP_RULES.COMPLETE_EPISODE.type,
          targetId: `${animeId}:${episode}`,
          baseXp: EXP_RULES.COMPLETE_EPISODE.xp,
          description: `${EXP_RULES.COMPLETE_EPISODE.label} (${title} Ep ${episode})`,
          metadata: { anime_id: animeId, episode },
        });
      }
    } else {
      void AsyncStorage.setItem(`luckynime-watch-local:${animeId}:${episode}`, JSON.stringify({ progress: currentTime, duration, completed: true, savedAt: Date.now() })).catch(() => {});
    }
  }, [animeId, animeQuery.data?.format, auth.user, currentTime, duration, episode, grantXp, history.save, image, providerSync.connected.length, providerSync.pushProgress, source, title]);

  // ── Video source URL ──
  // Backend stream URLs are already proxied (/api/v1/proxy?...). Those must
  // play as-is — re-wrapping yields a proxy-of-proxy URL the backend rejects
  // with 403 ("proxy target not allowed") → Exo BAD_HTTP_STATUS.
  const videoSourceUri = useMemo(() => {
    if (!source) return undefined;
    if (isLuckynimeProxyUrl(source.url)) return luckynimeProxyUrl(source.url);
    const directHeaders = nativePlaybackHeaders(playbackHeaders);
    if (useSourceProxy || Platform.OS === "web") return luckynimeProxyUrl(source.url, directHeaders);
    return source.url;
  }, [source?.url, useSourceProxy, playbackHeaders]);

  const videoSourceHeaders = useMemo(() => {
    const directHeaders = nativePlaybackHeaders(playbackHeaders);
    const proxyHeaders: Record<string, string> = {
      "User-Agent": CHROME_ANDROID_UA,
      Referer: "https://luckynime.tech/",
    };
    if (useSourceProxy || (source && isLuckynimeProxyUrl(source.url))) {
      return proxyHeaders;
    }
    return {
      "User-Agent": CHROME_ANDROID_UA,
      ...(directHeaders ?? {}),
    };
  }, [useSourceProxy, playbackHeaders, source?.url]);

  // ── Quality from the provider's Auto URL ──
  // Fetch the manifest the player is actually using and enumerate its real
  // renditions: HLS variant playlists mount by URL; DASH representations
  // become bitrate caps. Picking one mounts that rendition; Auto remounts the
  // master. A remembered per-server quality re-applies itself once here.
  //
  // Cache audit: the effect re-runs only on scalar scope signals (master URL,
  // provider id, episode, language, refresh, proxy/headers content). Object
  // identity churn and settings-sheet opens change none of those, so the
  // master is never re-fetched from them — the held menu or the per-master
  // cache entry answers instead.
  const qualitySourceUrl = source?.url ?? null;
  const qualitySourceType = source?.type ?? null;
  const qualityHeadersKey = JSON.stringify(playbackHeaders ?? null);
  const qualityProviderId = activeProvider?.id ?? null;
  useEffect(() => {
    const current = sourceMirrorRef.current;
    const currentUrl = current?.url ?? null;
    if (!current || !currentUrl) {
      setParsedQualityOptions(null);
      setParsedQualityNote(null);
      parsedOptionsRef.current = null;
      parsedVariantsRef.current = null;
      return;
    }
    const playbackType = getPlaybackType({ url: currentUrl, type: current?.type ?? undefined } as StreamSource);
    if (playbackType !== "hls" && playbackType !== "dash") {
      setParsedQualityOptions(null);
      setParsedQualityNote(null);
      parsedOptionsRef.current = null;
      parsedVariantsRef.current = null;
      return;
    }

    // Master identity: Auto mounts the master itself; a mounted variant
    // reuses the master key captured at parse time (variant URLs rot faster
    // than masters, so they are never used as fetch keys).
    const masterPlaybackUri = hlsVariantsCacheKey(isAutoQuality(current) ? videoSourceUri : parsedOptionsRef.current?.key);
    if (!masterPlaybackUri) {
      const held = parsedOptionsRef.current;
      if (held && !isAutoQuality(current) && held.options.some((option) => option.source?.url === currentUrl)) {
        setParsedQualityOptions(held.options);
        return;
      }
      setParsedQualityOptions(null);
      setParsedQualityNote(null);
      parsedOptionsRef.current = null;
      parsedVariantsRef.current = null;
      return;
    }

    // Invalidate on scope rotation only: same scope (e.g. settings opened)
    // reuses the held menu / cache without a fetch; a rotated scope on the
    // same master drops the stale parse so the refresh below re-resolves.
    const nextScope: VariantsCacheScope = { masterUrl: masterPlaybackUri, providerId: qualityProviderId, episode, refreshNonce };
    const prevScope = variantsScopeRef.current;
    variantsScopeRef.current = nextScope;
    if (prevScope && !shouldRefetchVariants(prevScope, nextScope)) {
      const held = parsedOptionsRef.current;
      if (held && held.key === masterPlaybackUri) { setParsedQualityOptions(held.options); return; }
      const cached = hlsVariantsCache.current.get(masterPlaybackUri);
      if (cached) {
        setParsedQualityOptions(cached.options);
        parsedOptionsRef.current = { key: masterPlaybackUri, options: cached.options };
        parsedVariantsRef.current = { key: masterPlaybackUri, variants: cached.variants };
        return;
      }
    } else if (prevScope && (prevScope.masterUrl ?? null) === (nextScope.masterUrl ?? null)) {
      hlsVariantsCache.current.delete(masterPlaybackUri);
      parsedOptionsRef.current = null;
      parsedVariantsRef.current = null;
    }

    // A parsed variant is currently mounted — keep its menu alive.
    const held = parsedOptionsRef.current;
    if (!isAutoQuality(current) && held && held.key === masterPlaybackUri && held.options.some((option) => option.source?.url === currentUrl)) {
      setParsedQualityOptions(held.options);
      return;
    }

    const cached = hlsVariantsCache.current.get(masterPlaybackUri);
    if (cached) {
      setParsedQualityOptions(cached.options);
      parsedOptionsRef.current = { key: masterPlaybackUri, options: cached.options };
      parsedVariantsRef.current = { key: masterPlaybackUri, variants: cached.variants };
      return;
    }

    let cancelled = false;
    const directHeaders = nativePlaybackHeaders(playbackHeadersMirrorRef.current);
    const proxied = useSourceProxy || isLuckynimeProxyUrl(currentUrl) || isLuckynimeProxyUrl(masterPlaybackUri);
    const providerId = qualityProviderId;
    const activeSource = current;
    const applyRemembered = async (options: WatchQualityOption[], variants: HlsVariant[]) => {
      const remembered = providerId ? (await readProviderQualityMap())[providerId] : undefined;
      if (cancelled) return;
      if (remembered) {
        setParsedQualityNote(`${remembered} · saved for this server`);
        const match = options.find((option) => option.requestQuality === remembered);
        const applyKey = `${providerId}:${remembered}`;
        if (match?.source && autoQualityAppliedFor.current !== applyKey) {
          autoQualityAppliedFor.current = applyKey;
          setParsedQualityOptions(options);
          parsedOptionsRef.current = { key: masterPlaybackUri, options };
          parsedVariantsRef.current = { key: masterPlaybackUri, variants };
          selectQualityRef.current(match.source);
          return;
        }
      } else {
        setParsedQualityNote(null);
      }
      setParsedQualityOptions(options);
      parsedOptionsRef.current = { key: masterPlaybackUri, options };
      parsedVariantsRef.current = { key: masterPlaybackUri, variants };
    };

    const manifestHeaders: Record<string, string> = {
      "User-Agent": CHROME_ANDROID_UA,
      Referer: "https://luckynime.tech/",
      Accept: "*/*",
      ...(directHeaders && !proxied ? directHeaders : {}),
    };
    fetch(masterPlaybackUri, { headers: manifestHeaders })
      .then((response) => {
        if (!response.ok) throw new Error(`manifest ${response.status}`);
        return response.text();
      })
      .then(async (text) => {
        if (cancelled) return;
        const variants = playbackType === "dash"
          ? parseDashRepresentations(text)
          : parseHlsMasterVariants(text, originalStreamUrl(masterPlaybackUri));
        const options = playbackType === "dash"
          ? buildDashQualityOptions(activeSource, variants)
          : buildHlsQualityOptions(activeSource, variants, { proxied, headers: directHeaders, lang: language });
        if (!options.length) { setParsedQualityOptions(null); parsedOptionsRef.current = null; parsedVariantsRef.current = null; return; }
        hlsVariantsCache.current.set(masterPlaybackUri, { options, variants });
        await applyRemembered(options, variants);
      })
      .catch(() => { if (!cancelled) { setParsedQualityOptions(null); parsedOptionsRef.current = null; parsedVariantsRef.current = null; } });
    return () => { cancelled = true; };
  }, [qualitySourceUrl, qualitySourceType, videoSourceUri, useSourceProxy, qualityHeadersKey, qualityProviderId, episode, language, refreshNonce]);

  const videoContentType = useMemo(() => {
    if (!source) return undefined;
    const t = getPlaybackType(source);
    return t === "hls" ? "m3u8" : t === "dash" ? "mpd" : undefined;
  }, [source?.url]);

  // Real ExoPlayer LoadControl — tuned for fast resume & steady playback
  // Real ExoPlayer LoadControl + RNVSimpleCache — pre-renders up to 10 minutes
  // ahead in memory, keeps 3 minutes of back-buffer, and caches segments in an
  // automatic 300 MB LRU app-cache (not a manual download) so playback keeps
  // running smoothly if WiFi/mobile signal drops mid-episode.
  const videoBufferConfig = useMemo(() => ({
    minBufferMs: 45_000,
    maxBufferMs: 600_000,
    bufferForPlaybackMs: 1_500,
    bufferForPlaybackAfterRebufferMs: 3_000,
    backBufferDurationMs: 180_000,
    cacheSizeMB: 300,
    maxHeapAllocationPercent: 0.45,
  }), []);

  // Native startPosition (ms) tells ExoPlayer / AVPlayer to seek BEFORE
  // downloading segment 0, eliminating the "plays from 00:00 for a few seconds
  // before jumping to saved position" delay.
  const videoSourceObject = useMemo(() => {
    const resumeTarget = Math.max(pendingResume.current ?? 0, episodeTargetResumeRef.current);
    const startPosition = resumeTarget > 2 ? Math.round(resumeTarget * 1000) : undefined;
    return {
      uri: videoSourceUri,
      headers: videoSourceHeaders,
      type: videoContentType,
      bufferConfig: videoBufferConfig,
      minLoadRetryCount: 120,
      ...(startPosition ? { startPosition } : {}),
    };
  }, [videoSourceUri, videoSourceHeaders, videoContentType, videoBufferConfig, sourceRevision]);

  // ── Actions ──
  const selectLanguage = (next: Language) => {
    if (!providers[next].length || next === language) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    // Save per-anime language preference
    void AsyncStorage.setItem(`luckynime.lang.${animeId}`, next).catch(() => {});
    // Server-switch preserves position (Track 4): stash via the tested
    // resolveResumeOnSwitch helper so sub↔dub keeps the seek target.
    const stashed = resolveResumeOnSwitch(currentTime, duration);
    if (stashed !== null) pendingResume.current = stashed;
    videoRef.current?.pause();
    blockedProviders.current.clear();
    refreshAttempted.current.clear();
    variantTokenRefreshAttempted.current = null;
    sourceStarted.current = false;
    sourceFirstFrame.current = false;
    sourceMounted.current = false;
    markedComplete.current = false;
    sourceFailureHandled.current = null;
    activeProviderId.current = null;
    setStream(null);
    setSource(null);
    setLastPlayerError(null);
    setUseSourceProxy(false);
    setPlaybackHeaders(undefined);
    setLoadingStream(true);
    setLanguage(next);
    setServerIndex(0);
    setError(null);
  };

  const selectServer = (index: number) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    // Server-switch preserves position (Track 4): stash via the tested
    // resolveResumeOnSwitch helper so the new source re-seeks here.
    const stashed = Math.max(
      resolveResumeOnSwitch(currentTime, duration) ?? 0,
      pendingResume.current ?? 0,
      episodeTargetResumeRef.current,
    );
    if (stashed > 2) {
      pendingResume.current = stashed;
      episodeTargetResumeRef.current = stashed;
    }
    // Reset the mount flag or the new provider's stream resolves but never
    // mounts (permanent spinner) — this stalled every manual server switch.
    sourceStarted.current = false;
    sourceFirstFrame.current = false;
    sourceMounted.current = false;
    markedComplete.current = false;
    sourceFailureHandled.current = null;
    variantTokenRefreshAttempted.current = null;
    videoRef.current?.pause();
    setSource(null);
    setLastPlayerError(null);
    setUseSourceProxy(false);
    setAdaptiveBitrateCap(null);
    setLoadingStream(true);
    setActivePanel(null);
    if (index === serverIndex) {
      forceRefresh.current = true;
      setRefreshNonce((v) => v + 1);
    } else {
      setServerIndex(index);
    }
    setError(null);
  };

  const selectQuality = (next: StreamSource, explicitLabel?: string) => {
    // Quality switch preserves position even if watched < 30s (or while initial
    // resume is still settling during applyRemembered) so switching resolution
    // never restarts the episode from 00:00.
    const stashed = Math.max(
      currentTimeRef.current > 1 ? currentTimeRef.current : 0,
      pendingResume.current ?? 0,
      episodeTargetResumeRef.current,
      resolveResumeOnSwitch(currentTime, duration) ?? 0,
    );
    if (stashed > 1) {
      pendingResume.current = stashed;
      episodeTargetResumeRef.current = stashed;
      initialHistoryResumeApplied.current = false;
    }
    sourceMounted.current = true;
    setAdaptiveBitrateCap(null);
    setSource(next);
    setUseSourceProxy(isProxySource(next));
    setSourceRevision((v) => v + 1);
    setPlaybackHeaders(stream?.headers ?? activeProvider?.headers);
    setRequestedQuality(explicitLabel || (isAutoQuality(next) ? "auto" : next.quality || "auto"));
    setActivePanel(null);
    // Remember manual quality per server; picking Auto (or a saved offline
    // copy) clears it. The parse effect re-applies it on the next Auto mount.
    const rememberedLabel = (explicitLabel || next.quality || "").split("·")[0].trim().toLowerCase();
    const persistable = rememberedLabel && rememberedLabel !== "auto" && !/saved/i.test(next.quality || "") ? rememberedLabel : null;
    void rememberProviderQuality(activeProvider?.id, persistable);
  };
  const selectQualityRef = useRef(selectQuality);
  selectQualityRef.current = selectQuality;

  const selectAdaptiveQuality = async (choice: WatchQualityOption) => {
    if (!activeProvider || !source) return;
    if (choice.isAdaptiveCap) {
      if (!isAutoQuality(source)) return;
      setAdaptiveBitrateCap(choice.maxVideoBitrate ?? null);
      setRequestedQuality("auto");
      setActivePanel(null);
      return;
    }
    if (choice.source) { selectQuality(choice.source); return; }
    if (choice.requestQuality === "auto" && isAutoQuality(source)) { setRequestedQuality("auto"); setActivePanel(null); return; }
    try {
      setLoadingStream(true);
      const response = await getStream({ animeId, episode, provider: activeProvider.provider, lang: language, quality: choice.requestQuality });
      const replacement = nativeSources(response)[0];
      if (!replacement) throw new Error("This provider did not return that quality.");
      setStream((prev) => ({
        ...response,
        subtitles: response.subtitles?.length ? response.subtitles : prev?.subtitles ?? [],
      }));
      applySkipSegments(providerSkipSegments(response));
      setPlaybackHeaders(response.headers ?? activeProvider.headers);
      setRequestedQuality(choice.requestQuality);
      selectQuality(replacement);
    } catch (cause) {
      setDownloadMessage(cause instanceof Error ? cause.message.toUpperCase() : "QUALITY COULD NOT BE CHANGED.");
      setLoadingStream(false);
    }
  };

  // Token-expiry guard: a mounted variant URL 403s with a rotted embedded
  // timestamp → refresh the master once and re-resolve the same height before
  // failing over to the next server. Variant URLs rot faster than masters, so
  // a failover without this step burns a healthy provider. The
  // single-refresh flag lives on the mounted URL itself: a fresh token means
  // a fresh URL, which earns its own single attempt — no loops possible.
  const refreshVariantFromMaster = async () => {
    const stale = sourceMirrorRef.current;
    const staleUrl = stale?.url ?? null;
    const masterKey = parsedOptionsRef.current?.key ?? null;
    if (!stale || !staleUrl || !masterKey) { handleProviderBlockedRef.current("player"); return; }
    try {
      const directHeaders = nativePlaybackHeaders(playbackHeadersMirrorRef.current);
      const proxied = useSourceProxy || isLuckynimeProxyUrl(staleUrl) || isLuckynimeProxyUrl(masterKey);
      const manifestHeaders: Record<string, string> = {
        "User-Agent": CHROME_ANDROID_UA,
        Referer: "https://luckynime.tech/",
        Accept: "*/*",
        ...(directHeaders && !proxied ? directHeaders : {}),
      };
      const response = await fetch(masterKey, { headers: manifestHeaders });
      if (!response.ok) throw new Error(`manifest ${response.status}`);
      const text = await response.text();
      const variants = parseHlsMasterVariants(text, originalStreamUrl(masterKey));
      if (!variants.length) throw new Error("empty variants");
      const wantedHeight = Number.parseInt(String(stale.quality ?? ""), 10);
      const targetCdn = (Number.isFinite(wantedHeight) ? variantUrlForHeight(variants, wantedHeight) : null) ?? variants[0]?.url ?? null;
      if (!targetCdn) throw new Error("no variant");
      const freshOptions = buildHlsQualityOptions(stale, variants, { proxied, headers: directHeaders, lang: language });
      if (freshOptions.length) {
        hlsVariantsCache.current.set(masterKey, { options: freshOptions, variants });
        setParsedQualityOptions(freshOptions);
        parsedOptionsRef.current = { key: masterKey, options: freshOptions };
        parsedVariantsRef.current = { key: masterKey, variants };
      }
      sourceMounted.current = true;
      sourceFailureHandled.current = null;
      const nextVariantUrl = variants[0]?.detachedAudio
        ? luckynimeHlsRenditionUrl(
            originalStreamUrl(masterKey),
            Number.isFinite(wantedHeight) && wantedHeight > 0 ? wantedHeight : variants[0].height,
            language,
            proxied,
            directHeaders,
          )
        : proxied
          ? luckynimeProxyUrl(targetCdn, directHeaders)
          : targetCdn;
      setSource({ ...stale, url: nextVariantUrl });
      setSourceRevision((value) => value + 1);
    } catch {
      handleProviderBlockedRef.current("player");
    }
  };

  const markIntentionalSeek = (target?: number) => {
    intentionalSeekUntil.current = Date.now() + 1_500;
    if (typeof target === "number" && Number.isFinite(target)) lastStablePlaybackTime.current = target;
  };

  const seekBy = useCallback((seconds: number) => {
    const next = Math.max(0, Math.min(duration, currentTime + seconds));
    episodeTargetResumeRef.current = 0;
    pendingResume.current = null;
    intentionalSeekUntil.current = Date.now() + 1000;
    videoRef.current?.seek(next);
    setCurrentTime(next);
  }, [currentTime, duration]);

  const seekTo = useCallback((targetSeconds: number) => {
    episodeTargetResumeRef.current = 0;
    pendingResume.current = null;
    if (duration > 0) {
      const target = Math.max(0, Math.min(duration, targetSeconds));
      markIntentionalSeek(target);
      videoRef.current?.seek(target);
    } else {
      markIntentionalSeek(Math.max(0, targetSeconds));
      videoRef.current?.seek(Math.max(0, targetSeconds));
    }
  }, [duration]);

  const handleVideoProgress = useCallback((data: OnProgressData) => {
    // Once ExoPlayer reaches the resumed minute, release the initial resume floor
    // so the user can freely scrub anywhere (including 00:00) afterwards.
    if (episodeTargetResumeRef.current > 3 && data.currentTime >= episodeTargetResumeRef.current - 2.5) {
      episodeTargetResumeRef.current = 0;
    }
    // Suppress transient 0.0s ticks while an initial resume seek is still settling
    // so the seekbar and time label never flicker to 0:00.
    if (
      episodeTargetResumeRef.current > 5 &&
      data.currentTime < 2 &&
      (pendingResume.current !== null || Date.now() < intentionalSeekUntil.current)
    ) {
      playableDurationRef.current = data.playableDuration;
      if (!pipActiveRef.current) setPlayableDuration(data.playableDuration);
      return;
    }
    currentTimeRef.current = data.currentTime;
    playableDurationRef.current = data.playableDuration;
    // While PiP is active the system owns the frame — refs keep tracking and
    // state flushes once, on exit, instead of re-rendering per tick.
    if (pipActiveRef.current) return;
    setCurrentTime(data.currentTime);
    setPlayableDuration(data.playableDuration);
  }, []);

  const handleVideoTracks = useCallback((event: { videoTracks?: { height?: number; selected?: boolean }[] }) => {
    const tracks = event?.videoTracks ?? [];
    setVideoTracks(tracks);
    const height = liveRenditionHeight(tracks);
    if (height) setLiveHeight(height);
  }, []);

  const handleBandwidthUpdate = useCallback((event: { height?: number }) => {
    const height = Math.round(Number(event?.height));
    if (Number.isFinite(height) && height > 0) setLiveHeight(height);
  }, []);
  // th3-anime style hold-for-2x: remember the pre-hold speed and restore it.
  const beginHoldSpeed = useCallback(() => {
    if (holdSpeedRestore.current === null) {
      holdSpeedRestore.current = speed;
      setSpeed(2);
    }
  }, [speed]);
  const endHoldSpeed = useCallback(() => {
    if (holdSpeedRestore.current !== null) {
      setSpeed(holdSpeedRestore.current);
      holdSpeedRestore.current = null;
    }
  }, []);

  // ── PanResponder gesture handler — zoned state machine ──
  // Each gesture owns a screen zone so they can never fire together:
  //   outer-left  (x < 35%)  → vertical swipe = brightness (never 2x, never seek-hold)
  //   outer-right (x > 65%)  → vertical swipe = volume     (never 2x, never seek-hold)
  //   center      (35–65%)   → hold still 550ms = 2x speed  (never brightness/volume)
  //   left 40% double/triple → -10s / -20s · right 40% → +10s / +30s · center double → play/pause
  // Modes are exclusive: pending → swiping | holding | released-as-tap. Moving
  // cancels holding, holding ignores swipes, taps require <10px movement.
  type GestureMode = "idle" | "pending" | "swiping" | "holding" | "pinching";
  type GestureZone = "left" | "center" | "right";
  const gestureModeRef = useRef<GestureMode>("idle");
  const pinchStartDistRef = useRef(0);
  const pinchTriggeredRef = useRef(false);
  const manualFullscreenRef = useRef(manualFullscreen);
  useEffect(() => { manualFullscreenRef.current = manualFullscreen; }, [manualFullscreen]);
  const enterFullscreenRef = useRef<() => void>(() => {});
  const touchDist = (touches: readonly { pageX: number; pageY: number }[]) => {
    if (!touches || touches.length < 2) return 0;
    const dx = touches[0].pageX - touches[1].pageX;
    const dy = touches[0].pageY - touches[1].pageY;
    return Math.hypot(dx, dy);
  };
  const gestureStartX = useRef(0);
  const gestureStartY = useRef(0);
  const gestureStartTime = useRef(0);
  const gestureZoneRef = useRef<GestureZone>("center");
  const lastTapRef = useRef<{ time: number; x: number } | null>(null);
  const singleTapTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const brightnessRef = useRef(brightness);
  const volumeRef = useRef(volume);
  useEffect(() => { brightnessRef.current = brightness; }, [brightness]);
  useEffect(() => { volumeRef.current = volume; }, [volume]);
  const swipeAnchorY = useRef(0);
  const swipeStartVal = useRef(0.5);
  const lastBrightnessSysCallTime = useRef(0);

  const zoneForX = (x: number): GestureZone => {
    const w = Dimensions.get("window").width || 1;
    if (x < w * EDGE_ZONE) return "left";
    if (x > w * (1 - EDGE_ZONE)) return "right";
    return "center";
  };

  const seekZoneForX = (x: number): "left" | "center" | "right" => {
    const w = Dimensions.get("window").width || 1;
    if (x < w * SEEK_ZONE) return "left";
    if (x > w * (1 - SEEK_ZONE)) return "right";
    return "center";
  };

  const cancelLongPress = () => {
    if (longPressTimeout.current) { clearTimeout(longPressTimeout.current); longPressTimeout.current = null; }
  };

  const stopHoldSpeed = useCallback(() => {
    if (is2xSeeking) { setIs2xSeeking(false); endHoldSpeed(); }
  }, [is2xSeeking, endHoldSpeed]);

  useEffect(() => {
    return () => {
      if (singleTapTimeout.current) clearTimeout(singleTapTimeout.current);
      if (longPressTimeout.current) clearTimeout(longPressTimeout.current);
      if (skipHoldTimer.current) clearTimeout(skipHoldTimer.current);
      if (unlockArmTimer.current) clearTimeout(unlockArmTimer.current);
      if (tapCountTimer.current) clearTimeout(tapCountTimer.current);
      if (holdSeekTimeout.current) clearTimeout(holdSeekTimeout.current);
      if (fillModeToastTimer.current) clearTimeout(fillModeToastTimer.current);
      pendingMultiSeekRef.current = null;
    };
  }, []);

  const triggerDoubleTapAnimation = useCallback((side: "left" | "right", seconds = 10) => {
    const gen = ++doubleTapGen.current;
    setDoubleTapSide(side);
    setDoubleTapSeconds(seconds);
    doubleTapAnim.stopAnimation();
    doubleTapAnim.setValue(1);
    Animated.timing(doubleTapAnim, { toValue: 0, duration: 600, useNativeDriver: Platform.OS !== "web" }).start(() => {
      if (doubleTapGen.current === gen) setDoubleTapSide(null);
    });
  }, [doubleTapAnim]);

  const seekRelative = useCallback((deltaSeconds: number) => {
    // Before onLoad the duration is unknown — skip rather than seeking against
    // a fake 999999s ceiling (it poked state and could jump an unloaded video).
    if (duration <= 0) return;
    setCurrentTime((curr) => {
      const next = Math.max(0, Math.min(duration, curr + deltaSeconds));
      markIntentionalSeek(next);
      videoRef.current?.seek(next);
      return next;
    });
  }, [duration, markIntentionalSeek]);

  const seekRelativeRef = useRef(seekRelative);
  useEffect(() => { seekRelativeRef.current = seekRelative; }, [seekRelative]);
  const flashRef = useRef(triggerDoubleTapAnimation);
  useEffect(() => { flashRef.current = triggerDoubleTapAnimation; }, [triggerDoubleTapAnimation]);

  const clearSkipHold = useCallback(() => {
    if (skipHoldTimer.current) { clearTimeout(skipHoldTimer.current); skipHoldTimer.current = null; }
    skipHoldSide.current = null;
  }, []);

  const armSkipHold = useCallback((side: "left" | "right", seconds = 10) => {
    clearSkipHold();
    skipHoldSide.current = side;
    const delta = side === "left" ? -seconds : seconds;
    const tick = () => {
      if (!skipHoldSide.current) return;
      seekRelativeRef.current(delta);
      flashRef.current(side, seconds);
      skipHoldTimer.current = setTimeout(tick, SKIP_HOLD_MS);
    };
    skipHoldTimer.current = setTimeout(tick, SKIP_HOLD_MS);
  }, [clearSkipHold]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !playerLocked,
        onMoveShouldSetPanResponder: () => !playerLocked,

        onPanResponderGrant: (evt, gesture) => {
          if (playerLocked) { gestureModeRef.current = "idle"; return; }
          if (evt.nativeEvent.touches && evt.nativeEvent.touches.length >= 2) {
            if (singleTapTimeout.current) { clearTimeout(singleTapTimeout.current); singleTapTimeout.current = null; }
            if (holdSeekTimeout.current) { clearTimeout(holdSeekTimeout.current); holdSeekTimeout.current = null; }
            pendingMultiSeekRef.current = null;
            cancelLongPress();
            stopHoldSpeed();
            clearSkipHold();
            gestureModeRef.current = "pinching";
            pinchStartDistRef.current = touchDist(evt.nativeEvent.touches);
            pinchTriggeredRef.current = false;
            return;
          }
          const now = Date.now();
          gestureStartX.current = gesture.x0;
          gestureStartY.current = gesture.y0;
          gestureStartTime.current = now;
          gestureZoneRef.current = zoneForX(gesture.x0);
          swipeAnchorY.current = gesture.y0;
          swipeStartVal.current = gestureZoneRef.current === "left" ? brightnessRef.current : volumeRef.current;
          doubleTapTouch.current = false;
          cancelLongPress();
          // Stale multi-tap state from a previous gesture must never leak in.
          if (holdSeekTimeout.current) { clearTimeout(holdSeekTimeout.current); holdSeekTimeout.current = null; }
          holdSeekFiredRef.current = false;
          pendingMultiSeekRef.current = null;

          // Fires the pending jump when a 2nd/3rd touch is HELD: the jump
          // lands once, then the skip loop keeps ticking while held.
          const fireHeldSeek = (side: "left" | "right", tickSeconds: number) => {
            if (gestureModeRef.current !== "pending") return;
            holdSeekFiredRef.current = true;
            const pending = pendingMultiSeekRef.current;
            if (pending && pending.side === side && pending.seconds > 0) {
              pendingMultiSeekRef.current = null;
              const delta = side === "left" ? -pending.seconds : pending.seconds;
              seekRelativeRef.current(delta);
              flashRef.current(side, pending.seconds);
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
              const already = chainSeekAppliedRef.current?.side === side ? chainSeekAppliedRef.current.seconds : 0;
              chainSeekAppliedRef.current = { side, seconds: already + pending.seconds };
            }
            armSkipHold(side, tickSeconds);
          };
          const armHoldSeek = (side: "left" | "right", tickSeconds: number) => {
            if (holdSeekTimeout.current) clearTimeout(holdSeekTimeout.current);
            holdSeekTimeout.current = setTimeout(() => fireHeldSeek(side, tickSeconds), HOLD_SEEK_MS);
          };

          const prior = lastTapRef.current;
          const isFollowUp = Boolean(prior && (now - prior.time) < TRIPLE_TAP_WINDOW_MS && Math.abs(gesture.x0 - prior.x) < 80 && tapCountRef.current > 0);

          if (isFollowUp) {
            // Second tap down kills the pending single-tap toggle immediately —
            // otherwise controls flash on every double-tap.
            if (singleTapTimeout.current) { clearTimeout(singleTapTimeout.current); singleTapTimeout.current = null; }
            if (tapCountTimer.current) clearTimeout(tapCountTimer.current);
            tapCountRef.current += 1;
            const zone = seekZoneForX(gesture.x0);

            if (zone === "center") {
              // Center multi-tap = play/pause. The 2nd tap toggles; a 3rd is
              // already answered so it only resets the chain.
              const isTriple = tapCountRef.current >= 3;
              lastTapRef.current = null;
              tapCountRef.current = 0;
              doubleTapTouch.current = true;
              gestureModeRef.current = "pending";
              if (!isTriple) {
                setIsPlaying((p) => {
                  userPausedRef.current = p;
                  return !p;
                });
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              }
              return;
            }

            if (tapCountRef.current >= 3) {
              // ── Triple tap: land exactly on the labeled totals (-20s left /
              // +30s right), minus whatever this chain already applied when
              // the 2nd touch released. Executes on release; a hold keeps
              // skipping while the finger stays down. ──
              const total = zone === "left" ? 20 : 30;
              const applied = chainSeekAppliedRef.current?.side === zone ? chainSeekAppliedRef.current.seconds : 0;
              lastTapRef.current = null;
              tapCountRef.current = 0;
              doubleTapTouch.current = true;
              gestureModeRef.current = "pending";
              pendingMultiSeekRef.current = { side: zone, seconds: Math.max(0, total - applied) };
              armHoldSeek(zone, 10);
              tapCountTimer.current = setTimeout(() => { tapCountRef.current = 0; chainSeekAppliedRef.current = null; }, TRIPLE_TAP_WINDOW_MS);
              return;
            }

            // ── Double tap: ±10s on RELEASE (never on touch-down, so taps
            // meant to toggle controls can't trigger a seek), hold to keep
            // skipping while the finger stays down. ──
            doubleTapTouch.current = true;
            gestureModeRef.current = "pending";
            pendingMultiSeekRef.current = { side: zone, seconds: 10 };
            armHoldSeek(zone, 10);
            tapCountTimer.current = setTimeout(() => { tapCountRef.current = 0; chainSeekAppliedRef.current = null; }, TRIPLE_TAP_WINDOW_MS);
            return;
          }

          // ── First touch: this IS tap #1 — enter PENDING, arm center-only
          // long-press for 2x. Outer zones never arm 2x — a brightness/volume
          // swipe can never trigger speed, and a center hold can never touch
          // brightness.
          chainSeekAppliedRef.current = null;
          if (singleTapTimeout.current) { clearTimeout(singleTapTimeout.current); singleTapTimeout.current = null; }
          tapCountRef.current = 1;
          gestureModeRef.current = "pending";
          if (gestureZoneRef.current === "center") {
            longPressTimeout.current = setTimeout(() => {
              if (gestureModeRef.current !== "pending") return;
              gestureModeRef.current = "holding";
              setIs2xSeeking(true);
              beginHoldSpeed();
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            }, LONG_PRESS_MS);
          }
        },

        onPanResponderMove: (evt, gesture) => {
          if (playerLocked || gestureModeRef.current === "idle") return;
          if (evt.nativeEvent.touches && evt.nativeEvent.touches.length >= 2) {
            if (gestureModeRef.current !== "pinching") {
              if (singleTapTimeout.current) { clearTimeout(singleTapTimeout.current); singleTapTimeout.current = null; }
              if (holdSeekTimeout.current) { clearTimeout(holdSeekTimeout.current); holdSeekTimeout.current = null; }
              pendingMultiSeekRef.current = null;
              cancelLongPress();
              stopHoldSpeed();
              clearSkipHold();
              gestureModeRef.current = "pinching";
              pinchStartDistRef.current = touchDist(evt.nativeEvent.touches);
              pinchTriggeredRef.current = false;
              return;
            }
            const dist = touchDist(evt.nativeEvent.touches);
            if (!pinchTriggeredRef.current && pinchStartDistRef.current > 10 && dist > 10) {
              const deltaDist = dist - pinchStartDistRef.current;
              if (deltaDist > 34) {
                pinchTriggeredRef.current = true;
                if (!manualFullscreenRef.current) enterFullscreenRef.current();
                applyFillModeRef.current("cover");
              } else if (deltaDist < -34) {
                pinchTriggeredRef.current = true;
                applyFillModeRef.current("contain");
              }
            }
            return;
          }
          if (gestureModeRef.current === "pinching") return;
          const mode = gestureModeRef.current;
          const absDx = Math.abs(gesture.dx);
          const absDy = Math.abs(gesture.dy);

          // Any drift kills a pending multi-tap seek — a swipe must never jump.
          const cancelHoldSeek = () => {
            if (holdSeekTimeout.current) { clearTimeout(holdSeekTimeout.current); holdSeekTimeout.current = null; }
            pendingMultiSeekRef.current = null;
          };
          if (mode === "pending" && (absDx > TAP_SLOP_PX || absDy > TAP_SLOP_PX)) {
            cancelLongPress();
            cancelHoldSeek();
          }
          if (mode === "holding" && (absDx > TAP_SLOP_PX || absDy > TAP_SLOP_PX)) {
            gestureModeRef.current = "idle";
            stopHoldSpeed();
            clearSkipHold();
            return;
          }

          if (mode === "pending" && absDx > HORIZONTAL_CANCEL_PX && absDy < SWIPE_ACTIVATE_PX) {
            gestureModeRef.current = "idle";
            cancelLongPress();
            cancelHoldSeek();
            clearSkipHold();
            return;
          }

          if (mode === "pending") {
            const startZone = gestureZoneRef.current;
            const verticalDominant = absDy > SWIPE_ACTIVATE_PX && absDy > absDx * SWIPE_DIRECTION_RATIO;
            if (!verticalDominant) return;
            if (startZone === "center") return;
            if (!gesturesEnabled) return;
            gestureModeRef.current = "swiping";
            swipeAnchorY.current = gesture.moveY;
            swipeStartVal.current = startZone === "left" ? brightnessRef.current : volumeRef.current;
            cancelLongPress();
            cancelHoldSeek();
            stopHoldSpeed();
            clearSkipHold();
          }

          if (gestureModeRef.current === "swiping") {
            if (!gesturesEnabled) {
              gestureModeRef.current = "idle";
              return;
            }
            const startZone = gestureZoneRef.current;
            if (startZone === "center") return;

            // Dragging UP (moveY < anchor) increases, Dragging DOWN (moveY > anchor) decreases
            const dyFromAnchor = swipeAnchorY.current - gesture.moveY;
            const totalTravelPx = 220; // 220px vertical travel for full 0% to 100% range
            const delta = dyFromAnchor / totalTravelPx;
            const rawVal = swipeStartVal.current + delta;
            const clamped = Math.max(0, Math.min(1, Math.round(rawVal * 100) / 100));

            if (startZone === "left") {
              setBrightnessHud(Math.round(clamped * 100));
              brightnessRef.current = clamped;
              const now = Date.now();
              if (now - lastBrightnessSysCallTime.current > 80) {
                lastBrightnessSysCallTime.current = now;
                if (Platform.OS !== "web") Brightness.setBrightnessAsync(clamped).catch(() => {});
              }
            } else {
              setVolumeHud(Math.round(clamped * 100));
              volumeRef.current = clamped;
              setVolume(clamped);
            }
          }
        },

        onPanResponderRelease: (_evt, gesture) => {
          const mode = gestureModeRef.current;
          gestureModeRef.current = "idle";
          cancelLongPress();

          if (mode === "pinching") {
            pinchStartDistRef.current = 0;
            pinchTriggeredRef.current = false;
            return;
          }
          if (mode === "holding") {
            stopHoldSpeed();
            clearSkipHold();
            setTimeout(() => { setVolumeHud(null); setBrightnessHud(null); }, 800);
            return;
          }
          if (mode === "swiping") {
            stopHoldSpeed();
            clearSkipHold();
            if (gestureZoneRef.current === "left") {
              setBrightness(brightnessRef.current);
              if (Platform.OS !== "web") Brightness.setBrightnessAsync(brightnessRef.current).catch(() => {});
            }
            setTimeout(() => { setVolumeHud(null); setBrightnessHud(null); }, 800);
            return;
          }
          if (mode !== "pending") return;

          // ── Multi-tap release: fire the pending jump (double ±10s, triple
          // to the labeled totals). Chained seeks always execute — no
          // cooldown — so a fast triple-tap never eats its third jump.
          if (doubleTapTouch.current) {
            doubleTapTouch.current = false;
            const holdFired = holdSeekFiredRef.current;
            holdSeekFiredRef.current = false;
            if (holdSeekTimeout.current) { clearTimeout(holdSeekTimeout.current); holdSeekTimeout.current = null; }
            if (holdFired) {
              // The held touch already jumped + looped; lifting stops the loop.
              clearSkipHold();
              return;
            }
            const pending = pendingMultiSeekRef.current;
            pendingMultiSeekRef.current = null;
            const drifted = Math.abs(gesture.dx) >= TAP_SLOP_PX || Math.abs(gesture.dy) >= TAP_SLOP_PX;
            if (pending && pending.seconds > 0 && !drifted) {
              const delta = pending.side === "left" ? -pending.seconds : pending.seconds;
              seekRelativeRef.current(delta);
              flashRef.current(pending.side, pending.seconds);
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              const already = chainSeekAppliedRef.current?.side === pending.side ? chainSeekAppliedRef.current.seconds : 0;
              chainSeekAppliedRef.current = { side: pending.side, seconds: already + pending.seconds };
              // Window the 3rd tap from THIS release, not the first one.
              lastTapRef.current = { time: Date.now(), x: gestureStartX.current };
              if (tapCountTimer.current) clearTimeout(tapCountTimer.current);
              tapCountTimer.current = setTimeout(() => { tapCountRef.current = 0; chainSeekAppliedRef.current = null; }, TRIPLE_TAP_WINDOW_MS);
            } else {
              // Center multi-tap already toggled play/pause on touch-down.
              lastTapRef.current = null;
            }
            clearSkipHold();
            return;
          }

          clearSkipHold();

          // Single tap: tiny movement + quick lift
          const quick = Date.now() - gestureStartTime.current < 400;
          if (Math.abs(gesture.dx) < TAP_SLOP_PX && Math.abs(gesture.dy) < TAP_SLOP_PX && quick) {
            const now = Date.now();
            if (singleTapTimeout.current) clearTimeout(singleTapTimeout.current);
            lastTapRef.current = { time: now, x: gestureStartX.current };
            if (tapCountTimer.current) clearTimeout(tapCountTimer.current);
            tapCountTimer.current = setTimeout(() => { tapCountRef.current = 0; chainSeekAppliedRef.current = null; }, TRIPLE_TAP_WINDOW_MS);
            // Delayed past the double-tap window so a 2nd tap can cancel it
            singleTapTimeout.current = setTimeout(() => {
              const firedAt = Date.now();
              if (firedAt - lastActionTimeRef.current < TAP_ACTION_COOLDOWN_MS) return;
              lastActionTimeRef.current = firedAt;
              setShowControls((prev) => !prev);
              lastTapRef.current = null;
            }, DOUBLE_TAP_WINDOW_MS);
          } else {
            lastTapRef.current = null;
          }
        },

        onPanResponderTerminate: () => {
          gestureModeRef.current = "idle";
          cancelLongPress();
          stopHoldSpeed();
          clearSkipHold();
          doubleTapTouch.current = false;
          holdSeekFiredRef.current = false;
          if (holdSeekTimeout.current) { clearTimeout(holdSeekTimeout.current); holdSeekTimeout.current = null; }
          pendingMultiSeekRef.current = null;
        },
      }),
    [armSkipHold, clearSkipHold, playerLocked, beginHoldSpeed, stopHoldSpeed, triggerDoubleTapAnimation, gesturesEnabled],
  );

  const skip = (kind: SkipKind) => {
    const target = skipSegments[kind]?.endTime;
    if (target) { markIntentionalSeek(target); videoRef.current?.seek(target); }
  };

  // Retry honesty (Track 4): TRY AGAIN re-fetches the SAME provider once
  // with refresh:true. If that provider already had its one refresh, TRY
  // AGAIN advances to the next unblocked provider instead of looping the
  // same dead URL. SWITCH SERVER always skips the refresh and moves on.
  const retry = () => {
    if (!activeProvider) return;
    if (refreshAttempted.current.has(activeProvider.id)) {
      handleProviderBlockedRef.current("permanent");
      return;
    }
    refreshAttempted.current.add(activeProvider.id);
    blockedProviders.current.delete(activeProvider.id);
    variantTokenRefreshAttempted.current = null;
    forceRefresh.current = true;
    sourceMounted.current = false;
    setLastPlayerError(null);
    setError(null);
    setRefreshNonce((v) => v + 1);
  };

  // Backend `downloads[]` links are external download pages (e.g. provider
  // file hosts), not direct files — they open in the external browser, never
  // through the in-app proxy saver. Every tap confirms with a "leaving the
  // app" popup first. SUB and DUB option lists stay separate because they are
  // built from the language-filtered provider list.
  const openBackendDownload = (option: BackendDownloadOption) => {
    setActivePanel(null);
    const quality = String(option.quality ?? option.label).toUpperCase();
    // Second gate beside buildBackendDownloadOptions' https-only filter:
    // never hand a non-https URL to the OS browser, even if backend data
    // changed shape.
    let safeUrl: string | null = null;
    try {
      const parsed = new URL(String(option.url ?? "").trim());
      if (parsed.protocol === "https:") safeUrl = parsed.toString();
    } catch {
      safeUrl = null;
    }
    if (!safeUrl) {
      setDownloadMessage("THIS DOWNLOAD LINK IS NOT SUPPORTED.");
      return;
    }
    Alert.alert("You're leaving Luckynime", `Open the external ${quality} download page in your browser?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Continue",
        onPress: () => {
          void (async () => {
            try {
              if (!(await Linking.canOpenURL(safeUrl))) throw new Error("unsupported");
              await Linking.openURL(safeUrl);
              setDownloadMessage(`OPENING ${quality} DOWNLOAD…`);
            } catch {
              setDownloadMessage("COULD NOT OPEN DOWNLOAD LINK.");
            }
          })();
        },
      },
    ]);
  };

  // Download icon behavior: quality options → picker modal; exactly one
  // default-label link → open it directly; nothing from the backend → legacy
  // in-app save of the playing stream source below.
  const onDownloadPress = () => {
    if (backendDownloadOptions.length === 0) { void startDownload(); return; }
    if (hasQualityBackendDownloads(backendDownloadOptions)) { setActivePanel("download"); return; }
    void openBackendDownload(backendDownloadOptions[0]);
  };

  const startDownload = async () => {
    try {
      setDownloadMessage(null);
      setDownloadProgress(0);
      const headers = stream?.headers ?? activeProvider?.headers;
      // The chosen rendition wins over the master's highest guess: a parsed
      // HLS variant URL for the selected height is fetched exactly. Without
      // parsed variants the native match-or-max fallback applies.
      const wantedHeight = Number.parseInt(String(requestedQuality ?? ""), 10);
      const variantUrl = Number.isFinite(wantedHeight)
        ? variantUrlForHeight(parsedVariantsRef.current?.variants ?? [], wantedHeight)
        : null;
      if (variantUrl) {
        const base = maximumDownloadSource ?? source;
        if (!base) { setDownloadMessage("DIRECT SOURCE REQUIRED FOR DOWNLOAD."); return; }
        const entry = await startMaximumQualityDownload({ animeId, episode, language, title, source: base, variantUrl, variantQuality: `${Math.round(wantedHeight)}p`, headers, onProgress: setDownloadProgress });
        setOfflineDownload(entry);
        setDownloadMessage(`${entry.quality.toUpperCase()} SAVED.`);
        return;
      }
      const matched = selectDownloadSourceForQuality(stream?.sources ?? activeProvider?.sources ?? [], requestedQuality);
      if (!matched) { setDownloadMessage("DIRECT SOURCE REQUIRED FOR DOWNLOAD."); return; }
      const entry = await startMaximumQualityDownload({ animeId, episode, language, title, source: matched, headers, onProgress: setDownloadProgress });
      setOfflineDownload(entry);
      setDownloadMessage(`${entry.quality.toUpperCase()} SAVED.`);
    } catch (cause) {
      setDownloadMessage(cause instanceof Error ? cause.message.toUpperCase() : "DOWNLOAD FAILED.");
    } finally { setDownloadProgress(null); }
  };

  const playOffline = () => {
    if (!offlineDownload) return;
    videoRef.current?.pause();
    sourceMounted.current = true;
    setPlaybackHeaders(undefined);
    setUseSourceProxy(false);
    setSource({ url: offlineDownload.uri, quality: `${offlineDownload.quality} · SAVED`, type: "native" });
    setSourceRevision((v) => v + 1);
    setActivePanel(null);
    setDownloadMessage("PLAYING SAVED COPY.");
  };

  const removeDownload = async () => {
    if (!offlineDownload) return;
    await removeOfflineDownload(offlineDownload);
    setOfflineDownload(null);
    setDownloadMessage("SAVED COPY REMOVED.");
  };

  const goToEpisode = useCallback((targetEpisode: number) => {
    if (!canonicalEpisodes.some((item) => item.number === targetEpisode)) return;
    flushWatchProgressRef.current(true);

    const isFuture = isConfirmedFutureRelease({
      episodeNumber: targetEpisode,
      episodes: canonicalEpisodes,
      status: animeQuery.data?.status,
      nextAiringEpisode: animeQuery.data?.nextAiringEpisode,
      hasConfirmedEpisodeList: episodeQuery.isSuccess && canonicalEpisodes.length > 0,
    });

    if (isFuture) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      let msg = `Episode ${targetEpisode} belum resmi ditayangkan.`;
      if (animeQuery.data?.nextAiringEpisode?.episode === targetEpisode && animeQuery.data?.nextAiringEpisode?.airingAt) {
        const dateStr = new Date(animeQuery.data.nextAiringEpisode.airingAt * 1000).toLocaleDateString("id-ID", {
          day: "numeric",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
        msg = `Episode ${targetEpisode} dijadwalkan tayang pada ${dateStr} WIB. Silakan nantikan rilis resminya ya!`;
      } else {
        msg = `Episode ${targetEpisode} belum resmi dirilis. Nantikan tanggal rilis resminya ya!`;
      }
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.alert(msg);
      } else {
        Alert.alert("Episode Belum Tayang", msg, [{ text: "Mengerti" }]);
      }
      return;
    }

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    router.replace({ pathname: "/watch/[id]", params: { id: String(animeId), episode: String(targetEpisode), title, image } } as never);
  }, [animeId, canonicalEpisodes, image, title, animeQuery.data?.status, animeQuery.data?.nextAiringEpisode, episodeQuery.isSuccess]);

  const openEpisodeInfo = useCallback((targetEpisode = episode) => {
    const selected = displayEpisodes.find((item) => item.number === targetEpisode);
    router.push({ pathname: "/episode/[id]", params: { id: String(animeId), episode: String(targetEpisode), title, image, episodeTitle: selected?.title || "" } } as never);
  }, [animeId, displayEpisodes, episode, image, title]);

  const { nextKnownEpisode, previousKnownEpisode } = useMemo(() => {
    const list = playableEpisodes.length ? playableEpisodes : canonicalEpisodes;
    const next = resolveNextEpisode(episode, list) ?? undefined;
    const previous = resolvePrevEpisode(episode, list) ?? undefined;
    return { nextKnownEpisode: next, previousKnownEpisode: previous };
  }, [canonicalEpisodes, playableEpisodes, episode]);

  const nextEpisode = useCallback(() => { if (nextKnownEpisode) goToEpisode(nextKnownEpisode); }, [goToEpisode, nextKnownEpisode]);

  // ── Up-next card: surfaces near the finish line (or at the end). With the
  // auto-play preference OFF it waits indefinitely for the user — PLAY NOW or
  // dismiss. ON runs a 5s countdown that plays the next episode at zero.
  const upNextKey = `${animeId}:${episode}`;
  const nextEpisodeDisplay = nextKnownEpisode ? displayEpisodes.find((item) => item.number === nextKnownEpisode) : undefined;

  const showUpNext = useCallback(() => {
    if (!nextKnownEpisode) return;
    if (upNextShownFor.current === upNextKey) return;
    upNextShownFor.current = upNextKey;
    setUpNextVisible(true);
  }, [nextKnownEpisode, upNextKey]);

  const dismissUpNext = useCallback(() => { setUpNextVisible(false); }, []);

  // Fire action lives in a ref so the countdown effect never restarts just
  // because goToEpisode's identity churned (episode list/title updates).
  const upNextFireRef = useRef<() => void>(() => {});
  upNextFireRef.current = () => {
    setUpNextVisible(false);
    if (nextKnownEpisode) goToEpisode(nextKnownEpisode);
  };

  // ── Auto-play countdown: ticks only while the preference is on, the card
  // is visible and playback is still running. Pause stops it (it re-arms on
  // resume), scrubbing below 85% hides the card and kills it, and Dismiss
  // unmounts the card — all handled by this effect's condition + cleanup.
  useEffect(() => {
    if (!autoPlayNext || !upNextVisible || !source?.url || !nextKnownEpisode || !isPlaying || playerLocked) {
      setUpNextCountdown(null);
      return;
    }
    const startedAt = Date.now();
    setUpNextCountdown(UP_NEXT_AUTOPLAY_SECONDS);
    const timer = setInterval(() => {
      const remaining = UP_NEXT_AUTOPLAY_SECONDS - Math.floor((Date.now() - startedAt) / 1000);
      if (remaining > 0) { setUpNextCountdown(remaining); return; }
      clearInterval(timer);
      setUpNextCountdown(null);
      upNextFireRef.current();
    }, 250);
    return () => clearInterval(timer);
  }, [autoPlayNext, upNextVisible, source?.url, nextKnownEpisode, isPlaying, playerLocked]);

  // ── Report broken source: the confirmation spells out exactly what the
  // report contains, then hands it to the OS share sheet (no account data
  // attached). The server's notifyOwner endpoint is admin-gated, so the
  // client channel is Share — falling back to a prefilled email draft that
  // points at the existing support URL where Share is unavailable.
  const buildSourceReport = useCallback(() => [
    "Luckynime broken source report",
    `Title: ${title}`,
    `Episode: ${episode} (${language === "sub" ? "Subtitled" : "Dubbed"})`,
    `Provider: ${activeProvider?.provider || "unknown"}`,
    `Server: ${activeProvider?.label || "unknown"}`,
    `Route: ${useSourceProxy ? "PROXY" : "DIRECT"} · ${source?.type?.toUpperCase() || "HLS"}`,
    `Error: ${lastPlayerError || error || "playback failed"}`,
    `Support: ${SAWERIA_URL}`,
  ].join("\n"), [activeProvider?.label, activeProvider?.provider, episode, error, language, lastPlayerError, source?.type, title, useSourceProxy]);

  const reportBrokenSource = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setReportModalVisible(true);
  }, []);

  useEffect(() => {
    if (!source || duration <= 0) return;
    // Scrubbing back out of the end zone cancels the card and re-arms it, so
    // the natural onEnded can still surface it.
    if (currentTime / duration < 0.85) {
      if (upNextShownFor.current === upNextKey) upNextShownFor.current = null;
      if (upNextVisible) setUpNextVisible(false);
      return;
    }
    if (currentTime > 0 && currentTime / duration >= 0.9) showUpNext();
  }, [currentTime, duration, showUpNext, source, upNextKey, upNextVisible]);

  useEffect(() => { setUpNextVisible(false); }, [animeId, episode]);

  // ── Swipe between episodes ──
  const swipeOffsetX = useRef(new Animated.Value(0)).current;
  const swipeAnimating = useRef(false);

  const episodeSwipeResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dx) > 20 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.2,
        onPanResponderMove: (_, gestureState) => {
          if (swipeAnimating.current) return;
          const clamped = Math.max(-120, Math.min(120, gestureState.dx));
          swipeOffsetX.setValue(clamped);
        },
        onPanResponderRelease: (_, gestureState) => {
          if (swipeAnimating.current) return;
          const dx = gestureState.dx;
          const shouldAdvance = dx < -50 && Boolean(nextKnownEpisode);
          const shouldGoBack = dx > 50 && Boolean(previousKnownEpisode);
          if (!shouldAdvance && !shouldGoBack) {
            Animated.spring(swipeOffsetX, { toValue: 0, useNativeDriver: Platform.OS !== "web" }).start();
            return;
          }
          swipeAnimating.current = true;
          const offscreen = dx < 0 ? -Dimensions.get("window").width : Dimensions.get("window").width;
          Animated.timing(swipeOffsetX, { toValue: offscreen, duration: 180, useNativeDriver: Platform.OS !== "web" }).start(() => {
            swipeOffsetX.setValue(0);
            swipeAnimating.current = false;
            if (shouldAdvance && nextKnownEpisode) {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              goToEpisode(nextKnownEpisode);
            } else if (shouldGoBack && previousKnownEpisode) {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              goToEpisode(previousKnownEpisode);
            }
          });
        },
        onPanResponderTerminate: () => {
          // A stolen touch (call, notification, scroll) must never leave the
          // episode grid parked mid-swipe with no release to spring it back.
          if (swipeAnimating.current) return;
          Animated.spring(swipeOffsetX, { toValue: 0, useNativeDriver: Platform.OS !== "web" }).start();
        },
      }),
    [nextKnownEpisode, previousKnownEpisode, goToEpisode, swipeOffsetX],
  );

  const swipeDirectionHint = useMemo(() => {
    if (!nextKnownEpisode && !previousKnownEpisode) return null;
    if (nextKnownEpisode && !previousKnownEpisode) return `Next: EP ${nextKnownEpisode}`;
    if (!nextKnownEpisode && previousKnownEpisode) return `Prev: EP ${previousKnownEpisode}`;
    return `EP ${previousKnownEpisode} ← → EP ${nextKnownEpisode}`;
  }, [nextKnownEpisode, previousKnownEpisode]);

  const calcProgressFromEvent = (event: any): number => {
    if (duration <= 0 || progressWidth <= 0) return 0;
    const native = event?.nativeEvent;
    if (!native) return 0;

    let localX = native.locationX;
    // Jika pageX tersedia dan posisi bar sudah terukur, gunakan pageX (kebal terhadap child target glitch)
    if (typeof native.pageX === "number" && barPageXRef.current > 0) {
      localX = native.pageX - barPageXRef.current;
    }

    const clampedX = Math.max(0, Math.min(progressWidth, localX));
    return clampedX / progressWidth;
  };

  const seekFromBar = (event: any) => {
    if (duration > 0 && progressWidth > 0) {
      const ratio = calcProgressFromEvent(event);
      const target = Math.max(0, Math.min(duration, ratio * duration));
      markIntentionalSeek(target);
      videoRef.current?.seek(target);
    }
    setDragPct(null);
  };

  const onBarTouchMove = (event: any) => {
    if (duration > 0 && progressWidth > 0) {
      const ratio = calcProgressFromEvent(event);
      setDragPct(Math.max(0, Math.min(100, ratio * 100)));
    }
  };

  const onBarTouchStart = (event: any) => {
    progressBarRef.current?.measure((_x, _y, width, _height, pageX) => {
      if (typeof width === "number" && width > 0) setProgressWidth(width);
      if (typeof pageX === "number" && !isNaN(pageX)) barPageXRef.current = pageX;
    });
    if (duration > 0 && progressWidth > 0) {
      const ratio = calcProgressFromEvent(event);
      setDragPct(Math.max(0, Math.min(100, ratio * 100)));
    } else {
      setDragPct(progressPct);
    }
  };

  const enterFullscreen = useCallback(() => {
    // Close every overlay so fullscreen never opens with a hidden-behind-modal
    // state, and force chrome visible — opening with showControls=false looked
    // like "fullscreen has no controls".
    setActivePanel(null);
    setShowControls(true);
    setManualFullscreen(true);
    if (Platform.OS !== "web") {
      lockForceLandscape();
      void applyAndroidImmersiveBars(true);
    }
  }, [lockForceLandscape]);

  const exitFullscreen = useCallback(() => {
    setManualFullscreen(false);
    // Keep chrome visible on exit so the inline player never looks dead.
    setShowControls(true);
    if (Platform.OS !== "web") {
      void applyAndroidImmersiveBars(false);
      // Lock portrait briefly before unlocking so Android doesn't stay stuck
      // in the last forced landscape when auto-rotate is OFF.
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT).catch(() => {}).finally(() => {
        void ScreenOrientation.unlockAsync().catch(() => {});
      });
    }
  }, []);

  const enterPiP = useCallback(() => {
    if (Platform.OS === "web") return;
    const ref = videoRef.current as unknown as { enterPictureInPicture?: () => void } | null;
    if (typeof ref?.enterPictureInPicture !== "function") { setPipAvailable(false); return; }
    try {
      ref.enterPictureInPicture();
    } catch {
      // Device throws where PiP is unsupported — hide the button for good.
      setPipAvailable(false);
    }
  }, []);

  const onPipStatusChanged = useCallback((event: { isActive?: boolean }) => {
    const active = event?.isActive === true;
    pipActiveRef.current = active;
    setPipActive(active);
    if (!active) {
      // Flush time held in refs while the system owned the frame.
      setCurrentTime(currentTimeRef.current);
      setPlayableDuration(playableDurationRef.current);
    }
  }, []);

  // Rail lock button: freezing chrome AND hiding it is what makes the lock
  // real — previously playerLocked could never be set to true at all.
  const engagePlayerLock = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setPlayerLocked(true);
    setShowControls(false);
  }, []);

  // Lock requires a second tap within 1.6s — pocket touches and accidental
  // taps on the pill stop unlocking the whole player.
  const [unlockArmed, setUnlockArmed] = useState(false);
  const unlockArmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestUnlock = useCallback(() => {
    if (unlockArmTimer.current) { clearTimeout(unlockArmTimer.current); unlockArmTimer.current = null; }
    if (unlockArmed) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      setPlayerLocked(false);
      setShowControls(true);
      setUnlockArmed(false);
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setUnlockArmed(true);
    unlockArmTimer.current = setTimeout(() => setUnlockArmed(false), 1_600);
  }, [unlockArmed]);

  // Download status toasts self-dismiss so "SAVED." never lingers forever.
  useEffect(() => {
    if (!downloadMessage) return;
    const timer = setTimeout(() => setDownloadMessage(null), 4_000);
    return () => clearTimeout(timer);
  }, [downloadMessage]);

  useEffect(() => {
    const rTime = Number(params.resumeTime);
    if (Number.isFinite(rTime) && rTime > 0) {
      pendingResume.current = rTime;
    }
  }, [params.resumeTime]);

  const handleBackPress = useCallback(() => {
    if (manualFullscreen) {
      exitFullscreen();
      return;
    }
    flushWatchProgressRef.current(true);
    const activeUri = videoSourceUri || source?.url;
    if (activeUri && animeId > 0 && Number.isFinite(currentTimeRef.current || currentTime)) {
      minimizePlayer({
        animeId,
        episode,
        animeTitle: title || (animeQuery.data ? animeTitle(animeQuery.data) : "Anime"),
        episodeTitle: selectedEpisode?.title ? `Episode ${episode} • ${selectedEpisode.title}` : `Episode ${episode}`,
        thumbnail: selectedEpisode?.thumbnail || image || animeQuery.data?.bannerImage || "",
        videoSourceUri: videoSourceUri || (source?.url ? luckynimeProxyUrl(source.url, nativePlaybackHeaders(playbackHeaders)) : ""),
        videoSourceHeaders: videoSourceHeaders,
        videoContentType: videoContentType,
        currentTime: currentTimeRef.current || currentTime,
        duration: duration || 0,
        isPlaying: isPlaying,
        cachedStream: stream,
        cachedSource: source,
        cachedProvider: activeProvider,
        cachedProviders: providers,
        cachedServerIndex: serverIndex,
        cachedLanguage: language,
      });
    }
    router.back();
  }, [
    manualFullscreen,
    exitFullscreen,
    videoSourceUri,
    source,
    animeId,
    episode,
    title,
    animeQuery.data,
    selectedEpisode,
    image,
    playbackHeaders,
    videoSourceHeaders,
    videoContentType,
    currentTime,
    duration,
    isPlaying,
    minimizePlayer,
    stream,
    activeProvider,
    providers,
    serverIndex,
    language,
  ]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (manualFullscreen) {
        exitFullscreen();
        return true;
      }
      handleBackPress();
      return true;
    });
    return () => subscription.remove();
  }, [manualFullscreen, exitFullscreen, handleBackPress]);

  useEffect(() => {
    const hasPlayable = Boolean(source);
    if (!hasPlayable || !showControls || activePanel) return;
    if (dragPct !== null) return; // never hide the chrome out from under a scrub
    // NOTE: currentTime is deliberately NOT a dep — progress ticks every
    // second and would reset this timer forever, so chrome could never hide.
    const timer = setTimeout(() => setShowControls(false), 3_500);
    return () => clearTimeout(timer);
  }, [showControls, activePanel, manualFullscreen, source?.url, dragPct]);

  // Controls fade instead of popping — 180ms opacity, cause → effect only.
  const controlsOpacity = useRef(new Animated.Value(0)).current;
  const [controlsRendered, setControlsRendered] = useState(true);
  const controlsFadeJob = useRef<Animated.CompositeAnimation | null>(null);
  useEffect(() => {
    if (controlsFadeJob.current) { controlsFadeJob.current.stop(); controlsFadeJob.current = null; }
    if (showControls && !playerLocked) {
      setControlsRendered(true);
      controlsOpacity.setValue(0);
      const job = Animated.timing(controlsOpacity, { toValue: 1, duration: 180, useNativeDriver: Platform.OS !== "web" });
      controlsFadeJob.current = job;
      job.start(() => { controlsFadeJob.current = null; });
    } else {
      const job = Animated.timing(controlsOpacity, { toValue: 0, duration: 180, useNativeDriver: Platform.OS !== "web" });
      controlsFadeJob.current = job;
      job.start(({ finished }) => { controlsFadeJob.current = null; if (finished) setControlsRendered(false); });
    }
  }, [controlsOpacity, playerLocked, showControls]);

  const onProgressLayout = (event: LayoutChangeEvent) => {
    const w = event.nativeEvent.layout.width;
    setProgressWidth(w);
    progressBarRef.current?.measure((_x, _y, width, _height, pageX) => {
      if (typeof width === "number" && width > 0) setProgressWidth(width);
      if (typeof pageX === "number" && !isNaN(pageX)) barPageXRef.current = pageX;
    });
  };

  // Priority: renditions parsed from the Auto manifest → ExoPlayer
  // bitrate caps (Android) → provider-claimed labels.
  const displayedQualityOptions: WatchQualityOption[] = parsedQualityOptions
    ? parsedQualityOptions
    : source
      ? (adaptiveCapOptions.length ? adaptiveCapOptions : sourceQualityOptions)
      : sourceQualityOptions.map((item) => ({ id: item.id, label: item.label, requestQuality: item.requestQuality, source: item.source }));

  const selectedSubtitleUrl = useMemo(
    () => (subtitlePrefs?.enabled !== false ? activeSubtitleTrack?.url ?? null : null),
    [activeSubtitleTrack?.url, subtitlePrefs?.enabled],
  );

  const progressPct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const bufferPct = duration > 0 && playableDuration > 0 ? Math.min(100, (playableDuration / duration) * 100) : 0;
  // Segmented track tint from real OP/ED ranges (provider + AniSkip merged).
  const chapterTrack = useMemo(() => chapterTrackSegments(skipSegments, duration), [skipSegments, duration]);
  const activeQualityTierHeight = useMemo<360 | 480 | 720 | 1080>(() => {
    const parseHeight = (raw?: string | null): number | null => {
      if (!raw) return null;
      const m = String(raw).match(/(2160|1440|1080|720|480|360)/);
      return m ? Number(m[1]) : null;
    };
    const h =
      parseHeight(requestedQuality !== "auto" ? requestedQuality : null) ??
      parseHeight(displayedQuality !== "Auto" ? displayedQuality : null) ??
      (liveHeight && liveHeight > 0 ? liveHeight : null) ??
      parseHeight(displayedQualityOptions.find((o) => o.label.toLowerCase() !== "auto")?.label) ??
      720;
    if (h <= 360) return 360;
    if (h <= 480) return 480;
    if (h <= 720) return 720;
    return 1080;
  }, [requestedQuality, displayedQuality, liveHeight, displayedQualityOptions]);

  const playerQualityBadge = useMemo(() => `${activeQualityTierHeight}p`, [activeQualityTierHeight]);

  const handleSelectWibukuQuality = useCallback(
    (tier: { height: 360 | 480 | 720 | 1080; code: string; bitrateCap: number | null }) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      setActivePanel(null);
      setRequestedQuality(tier.code);
      void savePlaybackSetting("quality", tier.code);

      const heightOf = (opt: WatchQualityOption): number | null => {
        const m = String(opt.label || opt.requestQuality || "").match(/(2160|1440|1080|720|480|360)/);
        return m ? Number(m[1]) : null;
      };

      const nonAuto = displayedQualityOptions.filter((opt) => opt.label.toLowerCase() !== "auto");
      const exact = nonAuto.find((opt) => heightOf(opt) === tier.height);
      if (exact) {
        if (exact.isAdaptiveCap) {
          setAdaptiveBitrateCap(exact.maxVideoBitrate ?? tier.bitrateCap);
          return;
        }
        if (exact.source) {
          selectQuality(exact.source, tier.code);
          return;
        }
        if (source) {
          void selectAdaptiveQuality(exact);
          return;
        }
      }

      // Closest available rendition at or below requested height (or highest if 1080p)
      const withSource = nonAuto
        .map((opt) => ({ opt, h: heightOf(opt) ?? 0 }))
        .filter((x) => x.h > 0 && Boolean(x.opt.source))
        .sort((a, b) => b.h - a.h);
      if (withSource.length > 0) {
        const bestBelow = withSource.find((x) => x.h <= tier.height) ?? withSource[withSource.length - 1];
        if (bestBelow?.opt.source) {
          selectQuality(bestBelow.opt.source, tier.code);
          return;
        }
      }

      // Master adaptive HLS/DASH fallback: apply smooth ExoPlayer bitrate cap
      setAdaptiveBitrateCap(tier.bitrateCap);
      void rememberProviderQuality(activeProvider?.id, tier.code);
    },
    [activeProvider?.id, displayedQualityOptions, selectAdaptiveQuality, selectQuality, source],
  );

  const speedBadge = useMemo(() => `${Number.isInteger(speed) ? speed : speed}x`, [speed]);

  useEffect(() => {
    setAudioTracks([]);
  }, [source?.url]);

  const resolvedAudioTrack = useMemo(() => {
    if (!audioTracks || audioTracks.length === 0) return undefined;
    const matchIndex = audioTracks.findIndex((tr) => {
      const meta = `${tr?.language ?? ""} ${tr?.title ?? ""}`.toLowerCase();
      return language === "dub"
        ? /\b(en|eng|english)\b/.test(meta)
        : /\b(ja|jpn|jp|japanese)\b/.test(meta);
    });
    if (matchIndex >= 0) {
      const tr = audioTracks[matchIndex];
      const idx = typeof tr?.index === "number" ? tr.index : matchIndex;
      return { type: "index", value: idx } as any;
    }
    const selectedIdx = audioTracks.findIndex((tr) => Boolean(tr?.selected));
    if (selectedIdx >= 0) return undefined;
    const first = audioTracks[0];
    return { type: "index", value: typeof first?.index === "number" ? first.index : 0 } as any;
  }, [audioTracks, language]);

  useImmersiveSystemBars(manualFullscreen, [showControls, activePanel, reportModalVisible]);

  if (invalidId) {
    return <NativeScreen scroll={false} style={styles.fill}>
      <View style={styles.invalidWrap}>
        <DotLabel tone="signal">COULDN’T LOAD THIS</DotLabel>
        <Text style={styles.invalidTitle}>This watch link is invalid.</Text>
        <NothingButton label="GO BACK" onPress={() => router.back()} variant="outline" />
      </View>
    </NativeScreen>;
  }

  return <NativeScreen scroll={false} fullscreen={manualFullscreen} style={styles.fill}>
    <StatusBar hidden={manualFullscreen} />

    {/* ── Video Container + Gesture Layer ── */}
    {/* NOTE: panHandlers live on the sibling overlay below, NOT on this parent.
        Parent-level onStartShouldSetPanResponder stole Pressable touches and the
        native Video SurfaceView eats touches aimed behind it. */}
    <View style={[styles.videoShell, manualFullscreen && ps.videoShellFullscreen]}>
      {source ? <Video key={activeProvider?.id ?? "default"} ref={videoRef} style={StyleSheet.absoluteFill} useTextureView={Platform.OS === "android"} source={videoSourceObject}
        disableDisconnectError={true}
        selectedTextTrack={{ type: "disabled" } as any}
        selectedAudioTrack={resolvedAudioTrack}
        ignoreSilentSwitch="ignore"
        paused={!isPlaying} rate={is2xSeeking ? 2.0 : speed} resizeMode={manualFullscreen ? fillMode : "contain"} muted={muted} volume={volume}
        maxBitRate={adaptiveBitrateCap ?? undefined}
        onAudioTracks={(data: any) => {
          if (Array.isArray(data?.audioTracks)) {
            setAudioTracks(data.audioTracks);
          }
        }}
        onLoad={(data: OnLoadData) => {
          if (__DEV__) {
            console.log(`[PlaybackMetrics] Metadata Loaded (onLoad): duration=${data.duration}s currentTime=${data.currentTime}s t=${Date.now() - screenMountTime}ms provider=${activeProvider?.provider ?? activeProvider?.id ?? "?"}`);
          }
          durationRef.current = data.duration;
          setDuration(data.duration);
          sourceStarted.current = true;
          waitingNetworkRecoveryRef.current = false;
          setWaitingNetworkRecovery(false);
          setLastPlayerError(null);
          if (!userPausedRef.current) {
            setPlayerStatus("playing");
            setIsPlaying(true);
          }
          tryApplyAutoResume(data.duration, data.currentTime);
        }}
        onReadyForDisplay={() => {
          if (!sourceFirstFrame.current) {
            sourceFirstFrame.current = true;
            if (__DEV__) {
              console.log(`[PlaybackMetrics] First Frame Displayed (onReadyForDisplay): totalTimeToFirstFrame=${Date.now() - screenMountTime}ms provider=${activeProvider?.provider ?? activeProvider?.id ?? "?"}`);
            }
            if (!userPausedRef.current) {
              setPlayerStatus("playing");
              setIsPlaying(true);
            }
            tryApplyAutoResume(durationRef.current);
          }
        }}
        onProgress={handleVideoProgress}
        onBuffer={(data: OnBufferData) => { setBuffering(data.isBuffering); }}
        onVideoTracks={handleVideoTracks}
        onBandwidthUpdate={handleBandwidthUpdate}
        onPictureInPictureStatusChanged={onPipStatusChanged}
        onError={(event: any) => {
          const detail = String(event?.error?.errorString || event?.error?.errorCode || "Unknown player error");
          // If signal/WiFi/data dropped, NEVER unmount <Video> or destroy buffered segments!
          // Keep <Video> alive so buffered minutes stay playable and auto-resume when back online.
          if (isDeviceOfflineRef.current || isLikelyNetworkError(detail)) {
            void Network.getNetworkStateAsync()
              .then((net) => {
                const offlineNow = !(net.isConnected && net.isInternetReachable !== false);
                if (offlineNow || sourceStarted.current) {
                  isDeviceOfflineRef.current = offlineNow;
                  setIsDeviceOffline(offlineNow);
                  waitingNetworkRecoveryRef.current = true;
                  setWaitingNetworkRecovery(true);
                  const safePos = Math.max(currentTimeRef.current, episodeTargetResumeRef.current);
                  if (safePos > 2) {
                    pendingResume.current = safePos;
                    episodeTargetResumeRef.current = safePos;
                  }
                  return;
                }
                setLastPlayerError(detail);
                setPlayerStatus("error");
                if (!useSourceProxy) {
                  setUseSourceProxy(true);
                  setSourceRevision((v) => v + 1);
                  return;
                }
                handleProviderBlockedRef.current("player");
              })
              .catch(() => {
                waitingNetworkRecoveryRef.current = true;
                setWaitingNetworkRecovery(true);
              });
            return;
          }
          const mountedUrl = source?.url ?? null;
          if (shouldRefreshMasterOnVariantError({ errorDetail: detail, variantUrl: mountedUrl, refreshedAlready: variantTokenRefreshAttempted.current === mountedUrl })) {
            variantTokenRefreshAttempted.current = mountedUrl;
            void refreshVariantFromMaster();
            return;
          }
          setLastPlayerError(detail);
          setPlayerStatus("error");
          if (!useSourceProxy) {
            setUseSourceProxy(true);
            setSourceRevision((v) => v + 1);
            return;
          }
          handleProviderBlockedRef.current("player");
        }}
        onEnd={() => {
          const reachedEnd = duration > 30 && currentTime >= Math.max(1, duration - 2);
          if (!sourceStarted.current || !reachedEnd) return;
          if (auth.user) {
            history.save.mutate({ animeId, animeTitle: title, animeImage: image || null, episode, episodeTitle: selectedEpisode?.title || null, episodeThumbnail: selectedEpisode?.thumbnail || null, progress: duration || currentTime, duration: duration || currentTime });
            if (providerSync.connected.length) providerSync.pushProgress.mutate({ animeId, episode, progress: Math.floor(duration || currentTime), status: "completed" });
          }
          if (autoPlayNext && nextKnownEpisode) {
            setUpNextVisible(false);
            goToEpisode(nextKnownEpisode);
            return;
          }
          showUpNext();
        }}
      /> : <View style={styles.videoPlaceholder}>
        {loadingServers ? <ProviderDiscoveryLoader attempt={serverAttempt} /> : error ? <Text style={styles.errorText}>{error}</Text> : <View style={styles.thumbnailLoading}>
          <Image source={{ uri: selectedEpisode?.thumbnail || watchBackdrop || image || "" }} style={StyleSheet.absoluteFillObject} contentFit="cover" cachePolicy="memory-disk" />
          <View style={styles.thumbnailLoadingShade} />
          <View style={styles.thumbnailLoadingContent}><View style={styles.thumbnailPlay}><Play size={18} color={nothing.black} weight="fill" /></View><Text style={styles.thumbnailEpisode}>EPISODE {episode}</Text><Text numberOfLines={2} style={styles.thumbnailTitle}>{selectedEpisode?.title || title}</Text><Text style={styles.thumbnailStatus}>STARTING VIDEO</Text></View>
        </View>}
      </View>}

      {/* ── Subtitle Layer: crisp white text with black outline at bottom-center ── */}
      {subtitlePrefs && source ? (
        <View
          style={[
            styles.subtitleWrapper,
            showControls && !manualFullscreen ? styles.subtitleWrapperWithControls : null,
            manualFullscreen ? styles.subtitleWrapperFullscreen : null,
            manualFullscreen && showControls ? styles.subtitleWrapperFullscreenControls : null,
          ]}
          pointerEvents="none"
        >
          <SubtitleRenderer
            cues={activeSubtitles}
            preferences={subtitlePrefs}
            fullscreen={manualFullscreen}
          />
        </View>
      ) : null}

      {/* ── Gesture overlay: sits ABOVE native Video, BELOW chrome.
          This is what makes tap-to-toggle reliable — touches no longer have to
          bubble through the ExoPlayer SurfaceView to the parent. Sibling
          chrome above (zIndex 3) still wins hit-test on buttons. */}
      {source && !playerLocked ? <View style={styles.gestureOverlay} {...panResponder.panHandlers} /> : null}

      {/* Center buffering veil — visible with chrome hidden too, so buffering
          never reads as "frozen". */}
      {source && buffering ? (
        <View pointerEvents="none" style={styles.bufferingVeil}>
          <ActivityIndicator size="large" color="#FFF" />
        </View>
      ) : null}

      {/* Subtle offline-buffer indicator when WiFi/data drops while watching */}
      {source && (isDeviceOffline || waitingNetworkRecovery) ? (
        <View style={styles.statusToast} pointerEvents="none">
          <Text style={styles.statusToastText}>
            {playableDuration > currentTime + 1.5
              ? `TANPA SINYAL • MEMUTAR BUFFER (${Math.max(1, Math.floor(playableDuration - currentTime))}s)`
              : "SINYAL HILANG • OTOMATIS LANJUT SAAT TERSAMBUNG"}
          </Text>
        </View>
      ) : null}

      {/* ── Download / status toast (auto-dismisses) ── */}
      {downloadMessage ? (
        <View style={styles.statusToast} pointerEvents="none">
          <Download size={13} color={nothing.white} weight="bold" />
          <Text style={styles.statusToastText}>{downloadMessage}</Text>
        </View>
      ) : null}

      {/* ── PLAYER CHROME ── */}

      {/* Double-tap feedback */}
      {doubleTapSide ? (
        <Animated.View style={[styles.doubleTapOverlay, { left: doubleTapSide === "left" ? "12%" : undefined, right: doubleTapSide === "right" ? "12%" : undefined, opacity: doubleTapAnim }]} pointerEvents="none">
          {doubleTapSide === "left" ? <Rewind size={36} color="#FFF" weight="bold" /> : <FastForward size={36} color="#FFF" weight="bold" />}
          <Text style={styles.doubleTapText}>{doubleTapSide === "left" ? `-${doubleTapSeconds}s` : `+${doubleTapSeconds}s`}</Text>
        </Animated.View>
      ) : null}

      {/* Main controls — Wibuku-identical overlay:
          1) Subtle top back + CC button
          2) Centered 5-button row: Prev Episode | -10s | White Circle Play | +10s | Next Episode
          3) Bottom status row: 00:06 / 24:12  ...  Autonext | 360p/720p | 1x | Fullscreen
          4) Edge-to-edge red seekbar with red thumb pinned to bottom edge */}
      {source && controlsRendered ? (
        <Animated.View
          style={[
            styles.controlsBackdrop,
            manualFullscreen && styles.controlsBackdropFullscreen,
            { opacity: controlsOpacity },
          ]}
          pointerEvents={showControls && !playerLocked ? "box-none" : "none"}
        >
          {/* TOP BAR (clean & minimal — right-side subtitle & settings icons removed) */}
          <View style={[styles.topBar, manualFullscreen && styles.topBarFullscreen]} pointerEvents="box-none">
            <Pressable
              onPress={handleBackPress}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              style={styles.iconButton}
              hitSlop={10}
            >
              <ArrowLeft size={21} color="rgba(255,255,255,0.92)" weight="bold" />
            </Pressable>
            {manualFullscreen ? (
              <Text style={styles.playerTitle} numberOfLines={1} ellipsizeMode="tail">
                {`${title} · Episode ${episode}`}
              </Text>
            ) : (
              <View pointerEvents="none" style={{ flex: 1 }} />
            )}
          </View>

          {/* CENTER 5-BUTTON TRANSPORT ROW */}
          <View style={[styles.centerTransportRow, manualFullscreen && styles.centerTransportRowFullscreen]} pointerEvents="box-none">
            {/* 1. Previous Episode */}
            <Pressable
              disabled={!previousKnownEpisode}
              onPress={() => previousKnownEpisode && goToEpisode(previousKnownEpisode)}
              accessibilityRole="button"
              accessibilityLabel="Episode sebelumnya"
              style={[styles.epNavBtn, !previousKnownEpisode && styles.epNavBtnDisabled]}
              hitSlop={10}
            >
              <SkipBack size={manualFullscreen ? 32 : 28} color="#FFFFFF" weight="fill" />
              <Text style={styles.epNavLabel} numberOfLines={1}>
                {previousKnownEpisode
                  ? `Episode ${previousKnownEpisode}`
                  : episode > 1
                    ? `Episode ${episode - 1}`
                    : "Episode 1"}
              </Text>
            </Pressable>

            {/* 2. Rewind 10s */}
            <Pressable
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                seekBy(-10);
              }}
              accessibilityRole="button"
              accessibilityLabel="Mundur 10 detik"
              style={styles.seek10Btn}
              hitSlop={10}
            >
              <Seek10Icon direction="back" size={manualFullscreen ? 40 : 35} />
            </Pressable>

            {/* 3. Big White Circle Play / Pause */}
            <Pressable
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                setIsPlaying((p) => {
                  userPausedRef.current = p;
                  return !p;
                });
              }}
              onLongPress={beginHoldSpeed}
              onPressOut={endHoldSpeed}
              delayLongPress={400}
              accessibilityRole="button"
              accessibilityLabel={isPlaying ? "Pause" : "Play"}
              accessibilityHint="Tahan untuk kecepatan 2x"
              style={[styles.bigPlayButton, manualFullscreen && styles.bigPlayButtonFullscreen]}
            >
              {isPlaying ? (
                <Pause size={manualFullscreen ? 30 : 26} color="#52525B" weight="fill" />
              ) : (
                <Play
                  size={manualFullscreen ? 30 : 26}
                  color="#52525B"
                  weight="fill"
                  style={{ marginLeft: 3 }}
                />
              )}
            </Pressable>

            {/* 4. Forward 10s */}
            <Pressable
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                seekBy(10);
              }}
              accessibilityRole="button"
              accessibilityLabel="Maju 10 detik"
              style={styles.seek10Btn}
              hitSlop={10}
            >
              <Seek10Icon direction="forward" size={manualFullscreen ? 40 : 35} />
            </Pressable>

            {/* 5. Next Episode */}
            <Pressable
              disabled={!nextKnownEpisode}
              onPress={nextEpisode}
              accessibilityRole="button"
              accessibilityLabel="Episode selanjutnya"
              style={[styles.epNavBtn, !nextKnownEpisode && styles.epNavBtnDisabled]}
              hitSlop={10}
            >
              <SkipForward size={manualFullscreen ? 32 : 28} color="#FFFFFF" weight="fill" />
              <Text style={styles.epNavLabel} numberOfLines={1}>
                {`Episode ${nextKnownEpisode ?? episode + 1}`}
              </Text>
            </Pressable>
          </View>

          {/* BOTTOM CONTROLS + EDGE-TO-EDGE RED SEEKBAR */}
          <View style={styles.bottomDeck} pointerEvents="box-none">
            {/* Bottom info & action row: 00:06 / 24:12  |  Autonext  360p  1x  [ ] */}
            <View
              style={[
                styles.wibukuBottomBar,
                manualFullscreen && styles.wibukuBottomBarFullscreen,
              ]}
              pointerEvents="box-none"
            >
              <Text style={styles.wibukuTimeText}>
                {`${formatClockTime(dragPct !== null ? (dragPct / 100) * duration : currentTime)} / ${formatClockTime(duration)}`}
              </Text>

              <View style={styles.wibukuRightControls} pointerEvents="box-none">
                {/* Autonext toggle */}
                <Pressable
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setAutoPlayNext((v) => !v);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Toggle Autonext"
                  style={[styles.autonextBtn, !autoPlayNext && styles.autonextBtnInactive]}
                  hitSlop={8}
                >
                  <SkipForward size={15} color="#FFFFFF" weight="fill" />
                  <Text style={styles.autonextText}>Autonext</Text>
                </Pressable>

                {/* Quality selector */}
                <Pressable
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setActivePanel("quality");
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Pilih resolusi video"
                  style={styles.bottomTextBtn}
                  hitSlop={8}
                >
                  <Text style={styles.bottomControlLabel}>{playerQualityBadge}</Text>
                </Pressable>

                {/* Speed selector */}
                <Pressable
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setActivePanel("speed");
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Pilih kecepatan putar"
                  style={styles.bottomTextBtn}
                  hitSlop={8}
                >
                  <Text style={styles.bottomControlLabel}>{speedBadge}</Text>
                </Pressable>

                {/* Full-screen stretch/zoom toggle (Full Semua Layar <-> Normal 16:9) */}
                {manualFullscreen ? (
                  <Pressable
                    onPress={toggleFillMode}
                    accessibilityRole="button"
                    accessibilityLabel={fillMode === "cover" ? "Ubah ke layar normal 16:9" : "Ubah ke full semua layar"}
                    style={[styles.fillModeBtn, fillMode === "cover" && styles.fillModeBtnActive]}
                    hitSlop={8}
                  >
                    {fillMode === "cover" ? (
                      <ArrowsIn size={13} color="#FFFFFF" weight="bold" />
                    ) : (
                      <ArrowsOut size={13} color="#FFFFFF" weight="bold" />
                    )}
                    <Text style={styles.fillModeBtnText}>
                      {fillMode === "cover" ? "Normal" : "Full Layar"}
                    </Text>
                  </Pressable>
                ) : null}

                {/* Fullscreen corners */}
                <Pressable
                  onPress={manualFullscreen ? exitFullscreen : enterFullscreen}
                  accessibilityRole="button"
                  accessibilityLabel={manualFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                  style={styles.fullscreenCornerBtn}
                  hitSlop={10}
                >
                  <FullscreenCornersIcon size={20} exit={manualFullscreen} />
                </Pressable>
              </View>
            </View>

            {/* Edge-to-edge Red Seekbar pinned to very bottom of video */}
            <View
              ref={progressBarRef}
              style={styles.edgeSeekbarHitbox}
              hitSlop={{ top: 14, bottom: 10, left: 0, right: 0 }}
              onLayout={onProgressLayout}
              onTouchStart={onBarTouchStart}
              onTouchMove={onBarTouchMove}
              onTouchEnd={seekFromBar}
              onTouchCancel={() => setDragPct(null)}
              accessibilityRole="adjustable"
              accessibilityLabel="Seek bar"
            >
              <View pointerEvents="none" style={styles.edgeSeekbarBase} />
              <View
                pointerEvents="none"
                style={[
                  styles.edgeSeekbarBuffered,
                  dragPct !== null && styles.edgeSeekbarThick,
                  { width: `${bufferPct}%` },
                ]}
              />
              <View
                pointerEvents="none"
                style={[
                  styles.edgeSeekbarPlayed,
                  dragPct !== null && styles.edgeSeekbarThick,
                  { width: `${dragPct !== null ? dragPct : progressPct}%` },
                ]}
              />
              {chapterTrack.map((segment) => (
                <View
                  key={segment.kind}
                  pointerEvents="none"
                  style={[styles.chapterMarker, { left: `${segment.leftPct}%`, width: `${segment.widthPct}%` }]}
                />
              ))}
              <View
                pointerEvents="none"
                style={[
                  styles.redScrubberKnob,
                  dragPct !== null && styles.redScrubberKnobActive,
                  { left: `${Math.max(0, Math.min(100, dragPct !== null ? dragPct : progressPct))}%` },
                ]}
              />
              {dragPct !== null ? (
                <View
                  pointerEvents="none"
                  style={[styles.dragPreview, { left: `${Math.max(4, Math.min(dragPct, 92))}%` }]}
                >
                  <Text style={styles.dragPreviewText}>{formatClockTime((dragPct / 100) * duration)}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </Animated.View>
      ) : null}

      {/* Skip Intro/Outro (positioned bottom-right) */}
      {skipIntroEnabled && !playerLocked && (skipKind === "intro" || (!skipSegments.intro && currentTime >= 3 && currentTime < configuredIntroDuration)) ? (
        <Pressable
          style={styles.skipButtonOverlay}
          onPress={() => {
            if (skipKind === "intro") {
              skip("intro");
            } else {
              markIntentionalSeek(configuredIntroDuration);
              videoRef.current?.seek(configuredIntroDuration);
            }
          }}
          accessibilityRole="button"
          accessibilityLabel="Skip intro"
          accessibilityHint="Skips the opening sequence"
        >
          <SkipForward size={14} color="#FFF" weight="bold" />
          <Text style={styles.skipButtonText}>{`SKIP INTRO`}</Text>
          <Text style={styles.skipCountdown}>{`· ${Math.max(
            0,
            Math.round((skipSegments.intro?.endTime ?? configuredIntroDuration) - currentTime)
          )}s`}</Text>
        </Pressable>
      ) : null}
      {skipKind === "outro" && !playerLocked ? (
        <Pressable style={styles.skipButtonOverlay} onPress={() => skip("outro")} accessibilityRole="button" accessibilityLabel="Skip outro" accessibilityHint="Skips the ending sequence">
          <SkipForward size={14} color="#FFF" weight="bold" />
          <Text style={styles.skipButtonText}>{`SKIP OUTRO`}</Text>
          <Text style={styles.skipCountdown}>{`· ${Math.max(0, Math.round((skipSegments.outro?.endTime ?? currentTime) - currentTime))}s`}</Text>
        </Pressable>
      ) : null}

      {/* Up-next card: next poster + title. Waits for the user unless the
          auto-play preference runs the 5s countdown shown in the kicker. */}
      {source && upNextVisible && nextKnownEpisode && !playerLocked ? (
        <View style={styles.upNextCard}>
          {nextEpisodeDisplay?.thumbnail ? <Image source={{ uri: nextEpisodeDisplay.thumbnail }} style={styles.upNextPoster} contentFit="cover" cachePolicy="memory-disk" /> : null}
          <View style={styles.upNextCopy}>
            <Text style={styles.upNextKicker}>{upNextCountdown !== null ? `UP NEXT · ${upNextCountdown}s` : "UP NEXT"}</Text>
            <Text numberOfLines={1} style={styles.upNextTitle}>{`EP ${nextKnownEpisode}${nextEpisodeDisplay?.title ? ` · ${nextEpisodeDisplay.title}` : ""}`}</Text>
            <View style={styles.upNextRow}>
              <Pressable onPress={() => { setUpNextVisible(false); goToEpisode(nextKnownEpisode); }} accessibilityRole="button" accessibilityLabel="Play next episode now" style={styles.upNextPlay} hitSlop={8}>
                <Text style={styles.upNextPlayText}>PLAY NOW</Text>
              </Pressable>
              <Pressable onPress={dismissUpNext} accessibilityRole="button" accessibilityLabel="Dismiss up next" style={styles.upNextDismiss} hitSlop={8}>
                <X size={15} color="#FFF" weight="bold" />
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      {/* Locked state */}
      {playerLocked ? (
        <Pressable style={[styles.lockedPill, unlockArmed && styles.lockedPillArmed]} onPress={requestUnlock} accessibilityRole="button" accessibilityLabel="Unlock player" accessibilityHint="Tap twice to unlock player controls">
          <Lock size={16} color={unlockArmed ? nothing.red : "#FFF"} weight="bold" />
          <Text style={styles.lockedText}>{unlockArmed ? "Tap again to unlock" : "Controls locked"}</Text>
        </Pressable>
      ) : null}

      {/* Gesture HUD overlays */}
      {is2xSeeking ? (
        <View style={chrome.badge2x} pointerEvents="none">
          <FastForward size={16} color="#FFF" weight="bold" />
          <Text style={chrome.badge2xText}>2X SPEED</Text>
        </View>
      ) : null}
      {volumeHud !== null ? (
        <View style={chrome.verticalBarWrap} pointerEvents="none">
          <View style={chrome.verticalBarBg}><View style={[chrome.verticalBarFill, { height: `${volumeHud}%` }]} /></View>
          <View style={chrome.verticalBarLabel}>
            {volumeHud === 0 ? <SpeakerNone size={14} color="#FFF" weight="bold" /> : <SpeakerHigh size={14} color="#FFF" weight="bold" />}
            <Text style={chrome.verticalBarText}>{volumeHud}%</Text>
          </View>
        </View>
      ) : null}
      {brightnessHud !== null ? (
        <View style={chrome.verticalBarWrapLeft} pointerEvents="none">
          <View style={chrome.verticalBarBg}><View style={[chrome.verticalBarFillBright, { height: `${brightnessHud}%` }]} /></View>
          <View style={chrome.verticalBarLabel}>
            <Sun size={14} color="#FFF" weight="bold" />
            <Text style={chrome.verticalBarText}>{brightnessHud}%</Text>
          </View>
        </View>
      ) : null}

      {/* ── Settings panel — quality + playback info ── */}
      {source && activePanel === "settings" && !playerLocked ? <View style={ps.settingsOverlay}>
        <View style={ps.settingsHeader}>
          <Text style={ps.settingsHeaderText}>Settings</Text>
          <Pressable onPress={() => setActivePanel(null)} accessibilityRole="button" accessibilityLabel="Close settings" hitSlop={8}>
            <X size={15} color="#FFF" weight="bold" />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={ps.settingsContent} showsVerticalScrollIndicator={false}>
          <Text style={ps.sectionLabel}>{t("player.quality")}</Text>
          <View style={ps.chipRow}>
            {displayedQualityOptions.length ? displayedQualityOptions.map((item: WatchQualityOption) => {
              const selected = displayedQuality.toLowerCase() === item.label.toLowerCase();
              return <Pressable key={item.id} onPress={() => { if (source) void selectAdaptiveQuality(item); else if (item.source) selectQuality(item.source); }} style={[ps.chip, selected && ps.chipActive]}><Text style={[ps.chipText, selected && ps.chipTextActive]}>{item.label}</Text></Pressable>;
            }) : <Text style={ps.emptyLine}>{t("player.nothingSelectable")}</Text>}
          </View>
          {(() => {
            const ceiling = parsedQualityOptions?.find((option) => option.requestQuality !== "auto")?.label ?? null;
            if (liveHeight) return <Text style={ps.emptyLine}>{autoQualityLine({ ceilingLabel: ceiling, liveHeight })}</Text>;
            return ceiling ? <Text style={ps.emptyLine}>{`Auto · up to ${ceiling}`}</Text> : null;
          })()}
          {parsedQualityNote ? <Text style={ps.emptyLine} numberOfLines={1}>{parsedQualityNote}</Text> : null}

          <Text style={ps.sectionLabel}>INFO</Text>
          <View style={ps.infoRow}>
            <Text style={ps.infoLabel}>Server</Text>
            <Text style={ps.infoValue}>{activeProvider?.label || "Unknown"}</Text>
          </View>
          <View style={ps.infoRow}>
            <Text style={ps.infoLabel}>Quality</Text>
            <Text style={ps.infoValue}>{displayedQuality || "Auto"}</Text>
          </View>
          <View style={ps.infoRow}>
            <Text style={ps.infoLabel}>Language</Text>
            <Text style={ps.infoValue}>{language === "sub" ? "Subtitled" : "Dubbed"}</Text>
          </View>
          <View style={ps.infoRow}>
            <Text style={ps.infoLabel}>Source</Text>
            <Text style={ps.infoValue}>{useSourceProxy ? "Proxied" : "Direct"}</Text>
          </View>
          <View style={ps.infoRow}>
            <Text style={ps.infoLabel}>Format</Text>
            <Text style={ps.infoValue}>{source?.type?.toUpperCase() || "HLS"}</Text>
          </View>

          <Text style={ps.sectionLabel}>AUTO-PLAY NEXT EPISODE</Text>
          <View style={ps.chipRow}>
            <Pressable onPress={() => setAutoPlayNext(false)} accessibilityRole="checkbox" accessibilityState={{ checked: false }} accessibilityLabel="Auto-play next episode off" style={[ps.chip, !autoPlayNext && ps.chipActive]}>
              <Text style={[ps.chipText, !autoPlayNext && ps.chipTextActive]}>Off</Text>
            </Pressable>
            <Pressable onPress={() => setAutoPlayNext(true)} accessibilityRole="checkbox" accessibilityState={{ checked: true }} accessibilityLabel="Auto-play next episode on" style={[ps.chip, autoPlayNext && ps.chipActive]}>
              <Text style={[ps.chipText, autoPlayNext && ps.chipTextActive]}>On · 5s</Text>
            </Pressable>
          </View>
          <Text style={ps.emptyLine}>Counts down on the Up Next card, then plays. Pause, seek or dismiss to cancel.</Text>

          <Text style={ps.sectionLabel}>VIDEO FIT</Text>
          <View style={ps.chipRow}>
            <Pressable onPress={() => setFillMode("contain")} accessibilityRole="checkbox" accessibilityState={{ checked: fillMode === "contain" }} accessibilityLabel="Video fit: show the whole frame" style={[ps.chip, fillMode === "contain" && ps.chipActive]}>
              <Text style={[ps.chipText, fillMode === "contain" && ps.chipTextActive]}>Fit</Text>
            </Pressable>
            <Pressable onPress={() => setFillMode("cover")} accessibilityRole="checkbox" accessibilityState={{ checked: fillMode === "cover" }} accessibilityLabel="Video fit: crop to fill the screen" style={[ps.chip, fillMode === "cover" && ps.chipActive]}>
              <Text style={[ps.chipText, fillMode === "cover" && ps.chipTextActive]}>Fill · crop</Text>
            </Pressable>
          </View>

          <Pressable onPress={reportBrokenSource} accessibilityRole="button" accessibilityLabel="Report broken source" style={ps.reportButton}>
            <Text style={ps.reportButtonText}>REPORT BROKEN SOURCE</Text>
          </Pressable>
        </ScrollView>
      </View> : null}

      {/* ── Subtitle panel — language, size, bg, outline, font ── */}
      {source && activePanel === "subtitles" && !playerLocked ? <View style={ps.settingsOverlay}>
        <View style={ps.settingsHeader}>
          <Text style={ps.settingsHeaderText}>Subtitles</Text>
          <Pressable onPress={() => setActivePanel(null)} accessibilityRole="button" accessibilityLabel="Close subtitles" hitSlop={8}>
            <X size={15} color="#FFF" weight="bold" />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={ps.settingsContent} showsVerticalScrollIndicator={false}>
          <Text style={ps.sectionLabel}>{t("player.subtitles")}</Text>
          <View style={ps.chipRow}>
            {availableSubtitles.length ? <>
              <Pressable onPress={() => updateSubtitlePrefs({ enabled: false })} style={[ps.chip, subtitlePrefs && !subtitlePrefs.enabled && ps.chipActive]}>
                <Text style={[ps.chipText, subtitlePrefs && !subtitlePrefs.enabled && ps.chipTextActive]}>{t("player.off")}</Text>
              </Pressable>
              {availableSubtitles.map((sub) => {
                const active = Boolean(subtitlePrefs?.enabled !== false && selectedSubtitleUrl === sub.url);
                return (
                  <Pressable
                    key={sub.url}
                    onPress={() => {
                      setSelectedTrackUrl(sub.url);
                      updateSubtitlePrefs({ enabled: true, preferredLanguage: sub.lang || sub.label || "id" });
                    }}
                    style={[ps.chip, active && ps.chipActive]}
                  >
                    <Text numberOfLines={1} style={[ps.chipText, active && ps.chipTextActive]}>
                      {sub.label || sub.lang || "Track"}
                    </Text>
                  </Pressable>
                );
              })}
            </> : <Text style={ps.emptyLine}>{t("player.noTracks")}</Text>}
          </View>

          <Text style={ps.sectionLabel}>{t("player.subtitleSize")}</Text>
          <View style={ps.chipRow}>
            {[{ label: "S", value: 13 }, { label: "M", value: 15 }, { label: "L", value: 18 }].map((preset) => {
              const active = (subtitlePrefs?.fontSize ?? 15) === preset.value;
              return <Pressable key={preset.label} onPress={() => updateSubtitlePrefs({ enabled: true, fontSize: preset.value })} style={[ps.chip, active && ps.chipActive]}><Text style={[ps.chipText, active && ps.chipTextActive]}>{preset.label}</Text></Pressable>;
            })}
          </View>

          <Text style={ps.sectionLabel}>BACKGROUND</Text>
          <View style={ps.chipRow}>
            {BG_OPACITY_PRESETS.map((val) => {
              const active = (subtitlePrefs?.bgOpacity ?? 0) === val;
              const label = val === 0 ? "Off" : `${Math.round(val * 100)}%`;
              return <Pressable key={val} onPress={() => updateSubtitlePrefs({ enabled: true, bgOpacity: val })} style={[ps.chip, active && ps.chipActive]}><Text style={[ps.chipText, active && ps.chipTextActive]}>{label}</Text></Pressable>;
            })}
          </View>

          <Text style={ps.sectionLabel}>OUTLINE</Text>
          <View style={ps.chipRow}>
            {OUTLINE_PRESETS.map((val) => {
              const active = (subtitlePrefs?.outlineThickness ?? 2) === val;
              const label = val === 0 ? "Off" : `${val}px`;
              return <Pressable key={val} onPress={() => updateSubtitlePrefs({ enabled: true, outlineThickness: val })} style={[ps.chip, active && ps.chipActive]}><Text style={[ps.chipText, active && ps.chipTextActive]}>{label}</Text></Pressable>;
            })}
          </View>

          <Text style={ps.sectionLabel}>FONT</Text>
          <View style={ps.chipRow}>
            {SUBTITLE_FONTS.map((font) => {
              const active = (subtitlePrefs?.fontFamily ?? "default") === font.id;
              return <Pressable key={font.id} onPress={() => updateSubtitlePrefs({ enabled: true, fontFamily: font.id })} style={[ps.chip, active && ps.chipActive]}><Text style={[ps.chipText, active && ps.chipTextActive]}>{font.label}</Text></Pressable>;
            })}
          </View>

          <Text style={ps.sectionLabel}>TIMING OFFSET</Text>
          <View style={ps.chipRow}>
            <Pressable onPress={() => updateSubtitlePrefs({ enabled: true, timeOffset: clampSubtitleOffset((subtitlePrefs?.timeOffset ?? 0) - SUBTITLE_OFFSET_STEP) })} accessibilityRole="button" accessibilityLabel="Decrease subtitle timing offset" style={ps.chip} hitSlop={6}>
              <Text style={ps.chipText}>−</Text>
            </Pressable>
            <View style={ps.offsetValue}>
              <Text accessibilityRole="text" accessibilityLabel={`Subtitle timing offset ${formatSubtitleOffset(subtitlePrefs?.timeOffset ?? 0)}`} style={ps.offsetValueText}>{formatSubtitleOffset(subtitlePrefs?.timeOffset ?? 0)}</Text>
            </View>
            <Pressable onPress={() => updateSubtitlePrefs({ enabled: true, timeOffset: clampSubtitleOffset((subtitlePrefs?.timeOffset ?? 0) + SUBTITLE_OFFSET_STEP) })} accessibilityRole="button" accessibilityLabel="Increase subtitle timing offset" style={ps.chip} hitSlop={6}>
              <Text style={ps.chipText}>+</Text>
            </Pressable>
            {(subtitlePrefs?.timeOffset ?? 0) !== 0 ? (
              <Pressable onPress={() => updateSubtitlePrefs({ timeOffset: 0 })} accessibilityRole="button" accessibilityLabel="Reset subtitle timing offset" style={ps.chip} hitSlop={6}>
                <Text style={ps.chipText}>Reset</Text>
              </Pressable>
            ) : null}
          </View>
          <Text style={ps.emptyLine}>{`Positive delays subtitles, negative advances · ${formatSubtitleOffset(SUBTITLE_OFFSET_MIN)} … ${formatSubtitleOffset(SUBTITLE_OFFSET_MAX)} · ${SUBTITLE_OFFSET_STEP.toFixed(1)}s steps`}</Text>
        </ScrollView>
      </View> : null}

      {source && sleepRemaining && !playerLocked ? <SleepTimerPill remaining={sleepRemaining} onPress={() => setActivePanel("settings")} /> : null}
    </View>

    {/* ── Error ── */}
    {error ? <View style={styles.errorAction}><NothingCard style={styles.errorCard}><DotLabel tone="muted">{futureRelease ? "FUTURE EPISODE" : "VIDEO UNAVAILABLE"}</DotLabel><Text style={styles.errorCopy}>{error}</Text>{lastPlayerError ? <Text style={styles.errorCopy}>{humanPlayerError(lastPlayerError) ?? "Playback failed on this server."}</Text> : null}{lastPlayerError ? <Text style={ps.diagnosticLine}>{`PLAYER · ${lastPlayerError}`}</Text> : null}{skipFetchStatus !== "idle" && skipFetchStatus !== "ok" ? <Text style={ps.diagnosticLine}>{`SKIP DATA · ${skipFetchStatus.toUpperCase()}`}</Text> : null}{futureRelease ? null : <View style={styles.errorBtnRow}><NothingButton label={t("player.retry")} onPress={retry} variant="outline" /><NothingButton label={t("player.copyError")} onPress={() => { void Clipboard.setStringAsync(`${error}${lastPlayerError ? `\nPLAYER · ${lastPlayerError}` : ""}`).catch(() => {}); }} variant="outline" /></View>}</NothingCard></View> : null}

    {/* ── Below player ── */}
    {!manualFullscreen ? <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} removeClippedSubviews={Platform.OS === "android"}>
      
      {/* ── 1. Action Buttons Rail (Merged Like/Dislike | Quality | Download | Subtitle | Share) ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.actionPillsRail}>
        {/* Merged Like / Dislike Capsule */}
        <View style={styles.mergedReactionPill}>
          <Pressable
            accessibilityRole="button"
            onPress={toggleLike}
            style={styles.reactionHalfBtn}
            hitSlop={6}
          >
            <ThumbsUp
              size={15}
              color={userLiked === true ? "#EF4444" : "#FFFFFF"}
              weight={userLiked === true ? "fill" : "regular"}
            />
            <Text style={[styles.actionPillText, userLiked === true && styles.actionPillTextLiked]}>
              {userLiked === true ? "2.4K" : "2.3K"}
            </Text>
          </Pressable>
          <View style={styles.reactionDivider} />
          <Pressable
            accessibilityRole="button"
            onPress={toggleDislike}
            style={styles.reactionHalfBtn}
            hitSlop={6}
          >
            <ThumbsDown
              size={15}
              color={userLiked === false ? "#EF4444" : "#FFFFFF"}
              weight={userLiked === false ? "fill" : "regular"}
            />
            <Text style={[styles.actionPillText, userLiked === false && styles.actionPillTextLiked]}>
              {userLiked === false ? "21" : "20"}
            </Text>
          </Pressable>
        </View>

        {/* Quality Pill */}
        <Pressable
          accessibilityRole="button"
          onPress={() => setActivePanel("quality")}
          style={styles.actionPill}
        >
          <PlayCircle size={15} color="#FFFFFF" weight="bold" />
          <Text style={styles.actionPillText}>
            {`${playerQualityBadge} Quality`}
          </Text>
        </Pressable>

        {/* Download Pill */}
        <Pressable
          accessibilityRole="button"
          onPress={onDownloadPress}
          style={styles.actionPill}
        >
          <Download size={15} color="#FFFFFF" weight="regular" />
          <Text style={styles.actionPillText}>Download</Text>
        </Pressable>

        {/* Share Pill */}
        <Pressable
          accessibilityRole="button"
          onPress={handleShare}
          style={styles.actionPill}
        >
          <ShareNetwork size={15} color="#FFFFFF" weight="regular" />
          <Text style={styles.actionPillText}>Share</Text>
        </Pressable>
      </ScrollView>

      {/* ── 3. Anime / Movie Information Card ── */}
      <View style={styles.animeInfoCard}>
        <View style={styles.animeInfoHeaderRow}>
          <Image
            source={{ uri: watchBackdrop || animeQuery.data?.coverImage?.large || animeQuery.data?.coverImage?.extraLarge || "" }}
            style={styles.animeAvatar}
            contentFit="cover"
            transition={150}
          />
          <View style={styles.animeInfoMetaCol}>
            <Text style={styles.animeMainTitle} numberOfLines={1}>
              {title}
            </Text>
            <View style={styles.animeSubMetaRow}>
              <Text style={styles.animeSubMetaText}>Episode {episode}</Text>
              <Text style={styles.animeSubMetaDot}>•</Text>
              <View style={styles.viewsRow}>
                <Eye size={12} color="#9CA3AF" />
                <Text style={styles.animeSubMetaText}>
                  {formatCount(animeQuery.data?.popularity ? animeQuery.data.popularity * 12 : 1273878)}
                </Text>
              </View>
              <Text style={styles.animeSubMetaDot}>•</Text>
              <Text style={styles.animeSubMetaText}>
                {formatReleaseDate(animeQuery.data)}
              </Text>
            </View>
          </View>

          {/* Report Button (Yellow Amber like Wibuku) */}
          <Pressable
            accessibilityRole="button"
            onPress={reportBrokenSource}
            style={styles.reportPillBtn}
          >
            <Flag size={13} color="#1B1D22" weight="fill" />
            <Text style={styles.reportPillText}>Report</Text>
          </Pressable>
        </View>

        {/* Synopsis / Description */}
        <Text
          style={styles.animeDescText}
          numberOfLines={isDescExpanded ? undefined : 3}
          selectable
        >
          {cleanSynopsisText(animeQuery.data?.description)}
        </Text>
        {cleanSynopsisText(animeQuery.data?.description).length > 120 ? (
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setIsDescExpanded((prev) => !prev);
            }}
            style={styles.descToggleBtn}
          >
            <Text style={styles.descToggleText}>
              {isDescExpanded ? "Sembunyikan ▲" : "Selengkapnya ▼"}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {/* ── 4. Banner Top Up Crystal ── */}
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push("/topup" as never)}
        style={styles.crystalBannerCard}
      >
        <View style={styles.crystalBannerLeft}>
          <Image
            source={TOPUP_CRYSTAL}
            style={styles.crystalIconImg}
            contentFit="contain"
          />
          <View style={styles.crystalTextCol}>
            <View style={styles.crystalTag}>
              <Text style={styles.crystalTagText}>TOP UP CRYSTAL</Text>
            </View>
            <Text style={styles.crystalTitle}>Beli Crystal untuk Border & Banner Keren</Text>
            <Text style={styles.crystalDesc} numberOfLines={2}>
              Tingkatkan tampilan akunmu dengan berbagai border dan banner eksklusif.
            </Text>
          </View>
        </View>
        <View style={styles.crystalBtn}>
          <Text style={styles.crystalBtnText}>Ke Menu Top Up</Text>
        </View>
      </Pressable>

      {/* ── 5. Episode List (NO LOCKS, Red Active Card, Range Pills) ── */}
      <View style={styles.episodeSectionCard}>
        <View style={styles.episodeHeaderRow}>
          <Text style={styles.episodeSectionTitle}>Episode List</Text>
          <Text style={styles.episodeTotalCountBadge}>
            {filteredEpisodes.length} Episode
          </Text>
        </View>

        {episodeQuery.isPending ? (
          <View style={styles.episodeLoading}>
            <ActivityIndicator color="#EF4444" />
            <Text style={styles.episodeLoadingText}>MEMUAT DAFTAR EPISODE...</Text>
          </View>
        ) : filteredEpisodes.length ? (
          <EpisodeGrid
            episodes={pagedEpisodes}
            activeEpisode={episode}
            totalPages={totalEpisodePages}
            page={safeEpisodePage}
            onPageChange={setEpisodePage}
            onSelect={goToEpisode}
            onInfo={openEpisodeInfo}
            totalEpisodeCount={filteredEpisodes.length}
            progressMap={episodeProgressMap}
          />
        ) : (
          <Text style={styles.emptyEpisodeText}>
            {episodeSearch ? "Tidak ada episode yang cocok dengan pencarian." : "Tidak ada episode tersedia."}
          </Text>
        )}
      </View>

      {/* ── 6. Informasi Aturan Komunitas ── */}
      <View style={styles.communityRuleCard}>
        <Info size={18} color="#FFFFFF" weight="bold" />
        <Text style={styles.communityRuleText}>
          Jangan lupa untuk membuat komentar yang sopan dan santun dan mengikuti{" "}
          <Text
            onPress={() => router.push("/legal" as never)}
            style={styles.communityRuleLink}
          >
            Aturan Komunitas
          </Text>{" "}
          kami
        </Text>
      </View>

      {/* ── 7. Rating & Comments Section ── */}
      <View style={styles.commentsContainer}>
        {/* Rating Banner Card */}
        <View style={styles.ratingCard}>
          <View style={styles.ratingCardHeader}>
            <Image
              source={{ uri: "https://i.ibb.co.com/fVqkn7Ht/photo-2026-10-12-16-53-10-removebg-preview.png" }}
              style={styles.ratingMascotImg}
              contentFit="contain"
              transition={200}
            />
            <View style={styles.ratingHeaderCol}>
              <Text style={styles.ratingMainTitle}>Ayo beri kami nilai</Text>
              <Text style={styles.ratingSubtitle}>
                {currentRating
                  ? `Nilai kamu: ${currentRating} dari 10 Bintang`
                  : "Bantu kami dengan menilai keseruan episode ini!"}
              </Text>
            </View>
          </View>

          {/* Kolom Rating 1-10 Persegi Panjang */}
          <View style={styles.ratingChoicesRow}>
            {Array.from({ length: 10 }, (_, index) => index + 1).map((score) => {
              const isActive = currentRating >= score;
              const isExact = currentRating === score;
              return (
                <Pressable
                  key={score}
                  accessibilityRole="button"
                  accessibilityLabel={`Beri nilai ${score} dari 10`}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    if (!auth.user) {
                      router.push("/auth" as never);
                      return;
                    }
                    ratings.setRating.mutate({ episode, score });
                  }}
                  style={({ pressed }) => [
                    styles.ratingRectBox,
                    isActive && styles.ratingRectBoxActive,
                    isExact && styles.ratingRectBoxExact,
                    pressed && styles.btnPressed,
                  ]}
                >
                  <Text style={[styles.ratingRectText, isActive && styles.ratingRectTextActive]}>
                    {score}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <AnimeComments animeId={animeId} episodeNumber={episode} />
      </View>
    </ScrollView> : null}

    {/* ── Modal Pickers ── */}
    <Modal visible={activePanel === "speed"} transparent statusBarTranslucent navigationBarTranslucent animationType="fade"><Pressable style={styles.modalBackdrop} onPress={() => setActivePanel(null)}><View style={styles.modalSheet}><Text style={styles.modalTitle}>{t("player.playbackSpeed")}</Text>{[0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0].map((val) => <Pressable key={val} style={[styles.modalItem, speed === val && styles.modalItemActive]} onPress={() => { setSpeed(val); lockedSpeed.current = val; setActivePanel(null); }}><Text style={[styles.modalItemText, speed === val && styles.modalItemTextActive]}>{val === 1.0 ? "1.0x (Normal)" : `${val}x`}</Text>{speed === val && <Check size={20} color={nothing.red} weight="bold" />}</Pressable>)}</View></Pressable></Modal>

    {/* Pilihan Kualitas Video — Wibuku-identical Bottom Sheet */}
    <Modal
      visible={activePanel === "quality"}
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="slide"
      onRequestClose={() => setActivePanel(null)}
    >
      <Pressable style={styles.wibukuQualityBackdrop} onPress={() => setActivePanel(null)}>
        <Pressable
          style={styles.wibukuQualitySheet}
          onPress={(e) => {
            e.stopPropagation?.();
          }}
        >
          <View style={styles.wibukuQualityHandle} />
          <Text style={styles.wibukuQualityHeading}>Pilihan Kualitas Video</Text>

          <ScrollView
            style={styles.wibukuQualityScroll}
            contentContainerStyle={styles.wibukuQualityList}
            showsVerticalScrollIndicator={false}
          >
            {(
              [
                {
                  height: 360 as const,
                  code: "360p",
                  title: "360P (Hemat)",
                  color: "#E4E4E7",
                  bitrateCap: 850_000,
                  description:
                    "Memiliki kualitas rendah, kecepatan streaming cepat dan ukuran video yang lebih ekonomis",
                },
                {
                  height: 480 as const,
                  code: "480p",
                  title: "480P (Standar)",
                  color: "#7CB342",
                  bitrateCap: 1_500_000,
                  description:
                    "Memiliki kualitas sedang dan kecepatan streaming lumayan cepat",
                },
                {
                  height: 720 as const,
                  code: "720p",
                  title: "720P (Bagus)",
                  color: "#FB8C00",
                  bitrateCap: 3_200_000,
                  description:
                    "Memiliki kualitas lumayan dan kecepatan streaming mungkin memerlukan internet yang layak",
                },
                {
                  height: 1080 as const,
                  code: "1080p",
                  title: "1080P (Premium)",
                  color: "#FDD835",
                  bitrateCap: null,
                  description:
                    "Fitur khusus premium dengan kualitas streaming tertinggi untuk pengalaman menonton di Smartphone, memerlukan internet yang cepat",
                },
              ] as const
            ).map((tier) => {
              const selected = activeQualityTierHeight === tier.height;
              return (
                <Pressable
                  key={tier.code}
                  onPress={() => handleSelectWibukuQuality(tier)}
                  style={({ pressed }) => [
                    styles.wibukuQualityRow,
                    pressed && styles.wibukuQualityRowPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Pilih kualitas ${tier.title}`}
                >
                  <View style={styles.wibukuQualityCheckCol}>
                    {selected ? <Check size={20} color="#FFFFFF" weight="bold" /> : null}
                  </View>
                  <View style={styles.wibukuQualityTextCol}>
                    <Text style={[styles.wibukuQualityTitle, { color: tier.color }]}>
                      {tier.title}
                    </Text>
                    <Text style={styles.wibukuQualityDesc}>{tier.description}</Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>

    {/* Audio / Language Dropdown Picker - Half Screen Liquid Glass */}
    <Modal
      visible={activePanel === "language"}
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="fade"
      onRequestClose={() => setActivePanel(null)}
    >
      <Pressable style={styles.serverModalBackdrop} onPress={() => setActivePanel(null)}>
        <Pressable
          style={styles.serverModalSheet}
          onPress={(e) => {
            e.stopPropagation?.();
          }}
        >
          {/* Sheet Handle */}
          <View style={styles.serverSheetHandle} />

          {/* Header */}
          <View style={styles.serverSheetHeader}>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={styles.serverTitleRow}>
                <Subtitles size={16} color="#F3F4F6" weight="bold" />
                <Text style={styles.serverSheetTitle}>PILIH AUDIO / BAHASA</Text>
              </View>
              <Text style={styles.serverSheetSubtitle}>
                {language === "sub"
                  ? "Subtitle Indonesia Aktif"
                  : "Dubbing / Audio Asli Aktif"}
              </Text>
            </View>
            <Pressable
              onPress={() => setActivePanel(null)}
              hitSlop={12}
              style={({ pressed }) => [
                styles.serverCloseBtn,
                pressed && { opacity: 0.6 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Tutup Pilihan Audio"
            >
              <X size={16} color="#9CA3AF" weight="bold" />
            </Pressable>
          </View>

          {/* Language Options List */}
          <ScrollView
            style={styles.serverScrollList}
            contentContainerStyle={styles.serverScrollContent}
            showsVerticalScrollIndicator={false}
          >
            {(["sub", "dub"] as Language[]).map((item) => {
              const active = language === item;
              const count = providers[item]?.length ?? 0;
              return (
                <Pressable
                  key={item}
                  onPress={() => {
                    selectLanguage(item);
                    setActivePanel(null);
                  }}
                  style={({ pressed }) => [
                    styles.serverItemCard,
                    active && styles.serverItemCardActive,
                    pressed && styles.serverItemCardPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={item === "sub" ? "Pilih Subtitle Indonesia" : "Pilih Dubbing Audio Asli"}
                >
                  <View style={styles.serverItemLeft}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text
                        style={[
                          styles.serverItemTitle,
                          active && styles.serverItemTitleActive,
                        ]}
                      >
                        {item === "sub"
                          ? "SUB (Subtitle Indonesia)"
                          : "DUB (Dubbing / Audio Asli)"}
                      </Text>
                      <Text
                        style={[
                          styles.serverItemSub,
                          active && styles.serverItemSubActive,
                        ]}
                      >
                        {`${count} Server Tersedia`}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>

    {/* Download quality picker: backend per-quality file links - Half Screen Liquid Glass */}
    <Modal
      visible={activePanel === "download"}
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="fade"
      onRequestClose={() => setActivePanel(null)}
    >
      <Pressable style={styles.serverModalBackdrop} onPress={() => setActivePanel(null)}>
        <Pressable
          style={styles.serverModalSheet}
          onPress={(e) => {
            e.stopPropagation?.();
          }}
        >
          {/* Sheet Handle */}
          <View style={styles.serverSheetHandle} />

          {/* Header */}
          <View style={styles.serverSheetHeader}>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={styles.serverTitleRow}>
                <DownloadSimple size={16} color="#F3F4F6" weight="bold" />
                <Text style={styles.serverSheetTitle}>
                  {`DOWNLOAD · ${language.toUpperCase()} · EP ${episode}`}
                </Text>
              </View>
              <Text style={styles.serverSheetSubtitle}>
                {backendDownloadOptions.length
                  ? `${backendDownloadOptions.length} Resolusi Tersedia · Unduh untuk offline`
                  : "Mencari tautan unduhan…"}
              </Text>
            </View>
            <Pressable
              onPress={() => setActivePanel(null)}
              hitSlop={12}
              style={({ pressed }) => [
                styles.serverCloseBtn,
                pressed && { opacity: 0.6 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Tutup Pilihan Download"
            >
              <X size={16} color="#9CA3AF" weight="bold" />
            </Pressable>
          </View>

          {/* Download Options List */}
          <ScrollView
            style={styles.serverScrollList}
            contentContainerStyle={styles.serverScrollContent}
            showsVerticalScrollIndicator={false}
          >
            {backendDownloadOptions.length ? (
              backendDownloadOptions.map((option) => (
                <Pressable
                  key={option.url}
                  onPress={() => {
                    void openBackendDownload(option);
                  }}
                  style={({ pressed }) => [
                    styles.serverItemCard,
                    pressed && styles.serverItemCardPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Download kualitas ${option.quality ?? option.label}`}
                >
                  <View style={styles.serverItemLeft}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.serverItemTitleActive}>
                        {option.quality ?? option.label}
                      </Text>
                      {option.quality ? (
                        <Text style={styles.serverItemSubActive}>
                          {option.label}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  <View style={styles.downloadIconWrap}>
                    <Download size={16} color="#F3F4F6" weight="bold" />
                  </View>
                </Pressable>
              ))
            ) : (
              <View style={styles.serverEmptyBox}>
                <Text style={styles.serverEmptyText}>
                  Tidak ada tautan download langsung untuk episode ini.
                </Text>
              </View>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>

    {/* Chapter List Modal */}
    <Modal visible={activePanel === "chapters" && !playerLocked} transparent statusBarTranslucent navigationBarTranslucent animationType="fade"><Pressable style={styles.modalBackdrop} onPress={() => setActivePanel(null)}><View style={styles.chapterModalSheet}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}><Text style={styles.modalTitle}>{t("player.chapters")}</Text><Pressable onPress={() => setActivePanel(null)}><X size={20} color={nothing.muted} weight="bold" /></Pressable></View>
      {duration <= 0 ? <Text style={styles.chapterEmptyText}>No duration data available yet.</Text> : (
        <View style={styles.chapterList}>
          {(() => {
            const chapters: { name: string; startTime: number; endTime: number; kind: SkipKind }[] = [];
            if (skipSegments.intro) chapters.push({ name: "Intro", startTime: skipSegments.intro.startTime, endTime: skipSegments.intro.endTime, kind: "intro" });
            if (skipSegments.outro) chapters.push({ name: "Outro", startTime: skipSegments.outro.startTime, endTime: skipSegments.outro.endTime, kind: "outro" });
            if (chapters.length === 0) return <Text style={styles.chapterEmptyText}>No chapters detected for this episode.</Text>;
            return chapters.sort((a, b) => a.startTime - b.startTime).map((ch) => {
              const isActive = currentTime >= ch.startTime && currentTime < ch.endTime;
              const isPast = currentTime >= ch.endTime;
              const durationSec = ch.endTime - ch.startTime;
              return (
                <Pressable key={ch.kind} onPress={() => { seekTo(ch.startTime); setActivePanel(null); }} style={[styles.chapterItem, isActive && styles.chapterItemActive, isPast && styles.chapterItemPast]}>
                  <View style={styles.chapterItemLeft}>
                    <View style={[styles.chapterDot, isActive && styles.chapterDotActive, isPast && styles.chapterDotPast]} />
                    <View style={styles.chapterInfo}>
                      <Text style={[styles.chapterName, isActive && styles.chapterNameActive]}>{ch.name}</Text>
                      <Text style={styles.chapterTimestamp}>{formatTime(ch.startTime)} - {formatTime(ch.endTime)}</Text>
                    </View>
                  </View>
                  <View style={styles.chapterItemRight}>
                    <Text style={styles.chapterDuration}>{formatTime(durationSec)}</Text>
                    {isActive ? <Play size={16} color={nothing.red} weight="fill" /> : isPast ? <Check size={16} color={nothing.dim} weight="bold" /> : <CaretRight size={16} color={nothing.muted} weight="bold" />}
                  </View>
                </Pressable>
              );
            });
          })()}
        </View>
      )}
    </View></Pressable></Modal>

      <ReportStreamModal
        visible={reportModalVisible}
        onClose={() => setReportModalVisible(false)}
        animeId={animeId || 0}
        animeTitle={title}
        episodeNumber={episode}
        serverName={`${activeProvider?.label || "Server 1"} (${requestedQuality || "Auto"})`}
      />
  </NativeScreen>;
}

// ── Styles ──
const ps = StyleSheet.create({
  videoShellFullscreen: { position: "absolute", zIndex: 50, elevation: 50, top: 0, right: 0, bottom: 0, left: 0, width: "100%", height: "100%", aspectRatio: undefined, backgroundColor: "#000000", justifyContent: "center" },
  settingsOverlay: { position: "absolute", zIndex: 8, elevation: 8, top: 6, right: 6, bottom: 6, width: 240, maxWidth: "76%", borderRadius: 4, backgroundColor: "rgba(18,19,22,0.92)", overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  settingsHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  settingsHeaderText: { color: "#FFF", fontSize: 11, fontWeight: "800", letterSpacing: 0.3 },
  settingsContent: { padding: 8, paddingBottom: 10, gap: 1 },
  sectionLabel: { color: "#EF4444", fontSize: 9, fontWeight: "800", letterSpacing: 0.8, marginTop: 6, marginBottom: 2, textTransform: "uppercase" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 2 },
  chip: { minHeight: 26, paddingHorizontal: 8, borderRadius: 3, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "transparent", alignItems: "center", justifyContent: "center" },
  chipActive: { backgroundColor: nothing.red, borderColor: nothing.red },
  chipText: { color: "rgba(255,255,255,0.7)", fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  chipTextActive: { color: "#FFFFFF", fontSize: 10, fontWeight: "700" },
  emptyLine: { color: "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: "500" },
  infoRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)" },
  infoLabel: { color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: "600" },
  infoValue: { color: "rgba(255,255,255,0.8)", fontSize: 10, fontWeight: "700" },
  diagnosticLine: { color: "rgba(255,255,255,0.3)", fontSize: 9, fontWeight: "600", letterSpacing: 0.3, marginTop: 6 },
  offsetValue: { minHeight: 26, paddingHorizontal: 10, borderRadius: 3, borderWidth: 1, borderColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.05)" },
  offsetValueText: { color: "#FFFFFF", fontSize: 11, fontWeight: "800", fontVariant: ["tabular-nums"], letterSpacing: 0.3 },
  reportButton: { minHeight: 30, marginTop: 10, borderRadius: 3, borderWidth: 1, borderColor: "rgba(239,68,68,0.55)", alignItems: "center", justifyContent: "center" },
  reportButtonText: { color: "#EF4444", fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
});

const styles = StyleSheet.create({
  fill: { flex: 1 },
  invalidWrap: { flex: 1, alignItems: "flex-start", justifyContent: "center", gap: 12, paddingHorizontal: 24 },
  invalidTitle: { color: nothing.white, fontSize: 20, fontWeight: "900", letterSpacing: -0.4 },
  top: { minHeight: 52, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  closeButton: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: nothing.line, borderRadius: 6 },
  topCopy: { flex: 1, gap: 2 },
  title: { color: nothing.white, fontSize: 18, fontWeight: "900", lineHeight: 22, letterSpacing: -0.5 },
  episodeLabel: { color: nothing.muted, fontFamily: nothing.mono, fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
  videoShell: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#000000", overflow: "hidden", position: "relative" },
  video: { flex: 1 },
  gestureOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 2 },
  embedChrome: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 5, flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 8, backgroundColor: "rgba(0,0,0,0.55)" },
  embedFrame: { ...StyleSheet.absoluteFillObject, zIndex: 3, justifyContent: "space-between", paddingHorizontal: 8, paddingVertical: 6 },
  embedChromeGroup: { ...StyleSheet.absoluteFillObject, justifyContent: "space-between", paddingHorizontal: 8, paddingVertical: 6 },
  embedHiddenToggle: { ...StyleSheet.absoluteFillObject, justifyContent: "flex-start", alignItems: "flex-end", paddingHorizontal: 8, paddingVertical: 6 },
  embedShowButton: { width: 30, height: 30, borderRadius: 15, backgroundColor: "rgba(0,0,0,0.55)", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)", justifyContent: "center", alignItems: "center" },
  playerTitleWrap: { flex: 1, flexShrink: 1 },
  embedTopBar: { flexDirection: "row", alignItems: "center", flexWrap: "nowrap", width: "100%" },
  embedBottomDeck: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%" },
  embedBottomInfo: { flex: 1, flexShrink: 1, marginRight: 6 },
  embedBottomLabel: { color: "rgba(255,255,255,0.75)", fontSize: 11, fontWeight: "700", letterSpacing: 0.3 },
  statusToast: { position: "absolute", bottom: 34, alignSelf: "center", zIndex: 14, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 8, backgroundColor: "rgba(0,0,0,0.82)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)" },
  statusToastText: { color: "#FFF", fontSize: 11, fontWeight: "600", letterSpacing: 0.2 },
  subtitleWrapper: { ...StyleSheet.absoluteFillObject, justifyContent: "flex-end", alignItems: "center", paddingBottom: 12, zIndex: 2, elevation: 2 },
  subtitleWrapperWithControls: { paddingBottom: 42 },
  subtitleWrapperFullscreen: { paddingBottom: 24 },
  subtitleWrapperFullscreenControls: { paddingBottom: 68 },
  controlsBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 3,
    elevation: 3,
    justifyContent: "space-between",
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    paddingTop: 6,
    paddingBottom: 0,
    paddingHorizontal: 0,
  },
  controlsBackdropFullscreen: {
    paddingTop: 14,
    paddingBottom: 0,
    paddingHorizontal: 0,
  },
  scrimTopMain: { position: "absolute", top: 0, left: 0, right: 0, height: 56, backgroundColor: "rgba(0,0,0,0.22)" },
  scrimTopSoft: { position: "absolute", top: 0, left: 0, right: 0, height: 96, backgroundColor: "rgba(0,0,0,0.10)" },
  scrimBottomMain: { position: "absolute", bottom: 0, left: 0, right: 0, height: 80, backgroundColor: "rgba(0,0,0,0.22)" },
  scrimBottomSoft: { position: "absolute", bottom: 0, left: 0, right: 0, height: 110, backgroundColor: "rgba(0,0,0,0.10)" },
  topBar: { flexDirection: "row", alignItems: "center", flexWrap: "nowrap", width: "100%", paddingHorizontal: 10 },
  topBarFullscreen: { paddingHorizontal: 20 },
  playerTitle: { flex: 1, flexShrink: 1, color: "#FFF", fontSize: 13, fontWeight: "700", marginLeft: 8, marginRight: 6 },
  topRightRow: { flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 0 },
  iconButton: { width: 32, height: 32, padding: 2, justifyContent: "center", alignItems: "center", flexShrink: 0 },
  iconButtonActive: { backgroundColor: "rgba(255,0,0,0.16)", borderRadius: 6 },
  orientationBadge: { backgroundColor: "rgba(239,68,68,0.85)", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3 },
  orientationBadgeText: { color: nothing.white, fontFamily: nothing.mono, fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
  subPillBadge: { backgroundColor: nothing.red, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5, flexShrink: 0 },
  subPillBadgeText: { color: nothing.black, fontSize: 10, fontWeight: "800", letterSpacing: 0.2, textTransform: "uppercase" },
  centerTransportRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-evenly",
    width: "100%",
    paddingHorizontal: 12,
    marginTop: 2,
  },
  centerTransportRowFullscreen: {
    paddingHorizontal: 64,
    justifyContent: "center",
    gap: 34,
  },
  epNavBtn: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 68,
    gap: 5,
  },
  epNavBtnDisabled: {
    opacity: 0.35,
  },
  epNavLabel: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: -0.1,
    textShadowColor: "rgba(0,0,0,0.65)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  seek10Btn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  bottomDeck: { gap: 4, width: "100%" },
  wibukuBottomBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    paddingHorizontal: 12,
    paddingBottom: 6,
  },
  wibukuBottomBarFullscreen: {
    paddingHorizontal: 22,
    paddingBottom: 10,
  },
  wibukuTimeText: {
    color: "#FFFFFF",
    fontSize: 12.5,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    letterSpacing: 0.1,
    textShadowColor: "rgba(0,0,0,0.65)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  wibukuRightControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  autonextBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 3,
    paddingHorizontal: 2,
  },
  autonextBtnInactive: {
    opacity: 0.45,
  },
  autonextText: {
    color: "#FFFFFF",
    fontSize: 12.5,
    fontWeight: "700",
    letterSpacing: -0.1,
  },
  bottomTextBtn: {
    paddingVertical: 3,
    paddingHorizontal: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  bottomControlLabel: {
    color: "#FFFFFF",
    fontSize: 12.5,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  fullscreenCornerBtn: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  fillModeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
  },
  fillModeBtnActive: {
    backgroundColor: "rgba(229,9,20,0.88)",
    borderColor: "rgba(255,255,255,0.45)",
  },
  fillModeBtnText: {
    color: "#FFFFFF",
    fontSize: 11.5,
    fontWeight: "800",
    letterSpacing: 0.1,
  },
  fillModeToast: {
    position: "absolute",
    top: 16,
    alignSelf: "center",
    zIndex: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(12,12,15,0.84)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  fillModeToastText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.15,
  },
  edgeSeekbarHitbox: {
    width: "100%",
    height: 12,
    justifyContent: "flex-end",
    position: "relative",
  },
  edgeSeekbarBase: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: "rgba(255, 255, 255, 0.32)",
  },
  edgeSeekbarBuffered: {
    position: "absolute",
    left: 0,
    bottom: 0,
    height: 3,
    backgroundColor: "rgba(255, 255, 255, 0.58)",
  },
  edgeSeekbarPlayed: {
    position: "absolute",
    left: 0,
    bottom: 0,
    height: 3,
    backgroundColor: "#EF4444",
  },
  edgeSeekbarThick: {
    height: 4.5,
  },
  redScrubberKnob: {
    position: "absolute",
    width: 13,
    height: 13,
    borderRadius: 6.5,
    backgroundColor: "#EF4444",
    marginLeft: -6.5,
    bottom: -5,
    elevation: 4,
  },
  redScrubberKnobActive: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginLeft: -8,
    bottom: -6,
  },
  timelineRow: { flexDirection: "row", alignItems: "center", gap: 4, width: "100%" },
  timeLabel: { color: "#FFF", fontSize: 11, fontWeight: "600", minWidth: 34, textAlign: "center", flexShrink: 0, fontVariant: ["tabular-nums"] },
  progressBarTrack: { flex: 1, height: 16, justifyContent: "center" },
  progressBuffered: { position: "absolute", height: 2, backgroundColor: "rgba(255,255,255,0.45)", borderRadius: 1 },
  progressPlayed: { position: "absolute", height: 2, backgroundColor: nothing.red, borderRadius: 1 },
  progressTrackThick: { height: 3, borderRadius: 1.5 },
  scrubberKnob: { position: "absolute", width: 10, height: 10, borderRadius: 5, backgroundColor: "#FFF", marginLeft: -5, top: 3, elevation: 3 },
  scrubberKnobActive: { width: 14, height: 14, borderRadius: 7, marginLeft: -7, top: 1 },
  dragPreview: { position: "absolute", top: -30, marginLeft: -24, backgroundColor: "rgba(0,0,0,0.88)", borderRadius: 5, paddingHorizontal: 7, paddingVertical: 3 },
  dragPreviewText: { color: nothing.white, fontSize: 11, fontWeight: "700", fontVariant: ["tabular-nums"] },
  actionRail: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "nowrap", width: "100%" },
  railSide: { flexDirection: "row", alignItems: "center", gap: 2, flexShrink: 0 },
  railSideRight: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 2, flexShrink: 0 },
  railCenter: { flexDirection: "row", alignItems: "center", gap: 2, flexShrink: 1, justifyContent: "center" },
  railBtn: { width: 32, height: 32, justifyContent: "center", alignItems: "center", flexShrink: 0 },
  railBtnDisabled: { opacity: 0.35 },
  downloadBtn: { width: 32, height: 32, justifyContent: "center", alignItems: "center", flexShrink: 0, gap: 0 },
  bigPlayButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
    elevation: 5,
  },
  bigPlayButtonFullscreen: { width: 66, height: 66, borderRadius: 33 },
  hudBadge: { position: "absolute", top: 20, alignSelf: "center", backgroundColor: "rgba(0,0,0,0.75)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, flexDirection: "row", alignItems: "center", gap: 5, zIndex: 10 },
  hudPill: { position: "absolute", alignSelf: "center", backgroundColor: "rgba(0,0,0,0.8)", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, flexDirection: "row", alignItems: "center", gap: 8, zIndex: 10 },
  hudText: { color: "#FFF", fontSize: 12, fontWeight: "700" },
  doubleTapOverlay: { position: "absolute", top: "32%", alignItems: "center", justifyContent: "center", zIndex: 12 },
  doubleTapText: { color: "#FFF", fontSize: 12, fontWeight: "800", marginTop: 3 },
  chapterMarker: { position: "absolute", height: 3, backgroundColor: "#FFD600", bottom: 0 },
  skipButtonOverlay: { position: "absolute", bottom: 120, right: 12, backgroundColor: "rgba(255,255,255,0.92)", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, flexDirection: "row", alignItems: "center", gap: 4, zIndex: 15, elevation: 6, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 8 },
  upNextCard: { position: "absolute", bottom: 120, right: 12, zIndex: 15, elevation: 6, flexDirection: "row", gap: 8, alignItems: "center", maxWidth: 260, backgroundColor: "rgba(18,19,22,0.88)", borderRadius: 8, padding: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  upNextPoster: { width: 44, height: 62, borderRadius: 4, backgroundColor: nothing.raised },
  upNextCopy: { flex: 1, gap: 3 },
  upNextKicker: { color: nothing.red, fontSize: 10, fontWeight: "800", letterSpacing: 0.6, fontVariant: ["tabular-nums"] },
  upNextTitle: { color: "#FFF", fontSize: 12, fontWeight: "700" },
  upNextRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  upNextPlay: { minHeight: 30, paddingHorizontal: 10, justifyContent: "center", borderRadius: 4, backgroundColor: nothing.red },
  upNextPlayText: { color: "#FFF", fontSize: 10, fontWeight: "800", letterSpacing: 0.3 },
  upNextDismiss: { width: 30, height: 30, alignItems: "center", justifyContent: "center", borderRadius: 4 },
  skipButtonText: { color: nothing.black, fontSize: 11, fontWeight: "800", letterSpacing: 0.3, textTransform: "uppercase" },
  skipCountdown: { color: nothing.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.2 },
  lockedPill: { position: "absolute", bottom: 32, alignSelf: "center", backgroundColor: "rgba(0,0,0,0.8)", paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", zIndex: 15 },
  lockedPillArmed: { borderColor: nothing.red },
  bufferingVeil: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", zIndex: 2 },
  lockedText: { color: "#FFF", fontSize: 11, fontWeight: "600" },
  serverModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.72)",
    justifyContent: "flex-end",
  },
  serverModalSheet: {
    backgroundColor: "rgba(23, 14, 20, 0.98)",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: "rgba(255, 255, 255, 0.24)",
    maxHeight: "52%",
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 28 : 16,
    elevation: 20,
    ...(Platform.OS === "web"
      ? ({
          backdropFilter: "blur(24px) saturate(180%)",
          WebkitBackdropFilter: "blur(24px) saturate(180%)",
        } as any)
      : {}),
  },
  serverSheetHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.35)",
    alignSelf: "center",
    marginBottom: 10,
  },
  serverSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.14)",
  },
  serverTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  serverSheetTitle: {
    color: "#F3F4F6",
    fontFamily: "Nunito-Bold",
    fontSize: 13.5,
    letterSpacing: 0.6,
  },
  serverSheetSubtitle: {
    color: "#9CA3AF",
    fontFamily: "Nunito-SemiBold",
    fontSize: 11,
  },
  serverCloseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  serverScrollList: {
    flexShrink: 1,
  },
  serverScrollContent: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 7,
  },
  serverItemCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  serverItemCardActive: {
    backgroundColor: "rgba(255, 255, 255, 0.12)",
  },
  serverItemCardPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },
  serverItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    flex: 1,
  },
  serverNumText: {
    fontFamily: "Nunito-Bold",
    fontSize: 14,
    color: "#8E93A2",
    minWidth: 24,
  },
  serverNumTextActive: {
    color: "#FFFFFF",
    fontFamily: "Nunito-Bold",
  },
  serverItemTitle: {
    color: "#9CA3AF",
    fontFamily: "Nunito-Bold",
    fontSize: 13.5,
  },
  serverItemTitleActive: {
    color: "#FFFFFF",
    fontFamily: "Nunito-Bold",
  },
  serverItemSub: {
    color: "#6B7280",
    fontFamily: "Nunito-SemiBold",
    fontSize: 11,
  },
  serverItemSubActive: {
    color: "#F3F4F6",
  },
  serverEmptyBox: {
    paddingVertical: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  serverEmptyText: {
    color: "#8E93A2",
    fontFamily: "Nunito-SemiBold",
    fontSize: 12,
  },
  downloadIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.8)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: "rgba(18,19,22,0.96)", borderTopLeftRadius: 2, borderTopRightRadius: 2, padding: 14, gap: 1, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  modalTitle: { color: "#FFF", fontSize: 12, fontWeight: "800", letterSpacing: 0.3, marginBottom: 4, textTransform: "uppercase" },
  modalItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)" },
  modalItemActive: { backgroundColor: "rgba(239,68,68,0.06)" },
  modalItemText: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: "600" },
  modalItemSub: { color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: "600", marginTop: 1 },
  modalItemTextActive: { color: nothing.red, fontWeight: "700" },
  chapterModalSheet: { backgroundColor: "rgba(18,19,22,0.96)", borderTopLeftRadius: 2, borderTopRightRadius: 2, padding: 14, gap: 4, maxHeight: "70%", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  chapterList: { gap: 1 },
  chapterItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 9, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)" },
  chapterItemActive: { backgroundColor: "rgba(239,68,68,0.06)" },
  chapterItemPast: { opacity: 0.45 },
  chapterItemLeft: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  chapterDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: nothing.dim },
  chapterDotActive: { backgroundColor: nothing.red },
  chapterDotPast: { backgroundColor: nothing.green },
  chapterInfo: { gap: 1 },
  chapterName: { color: nothing.white, fontSize: 11, fontWeight: "700" },
  chapterNameActive: { color: nothing.red },
  chapterTimestamp: { color: nothing.muted, fontSize: 9, fontWeight: "500", fontVariant: ["tabular-nums"] },
  chapterItemRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  chapterDuration: { color: nothing.dim, fontSize: 9, fontWeight: "600", fontVariant: ["tabular-nums"] },
  chapterEmptyText: { color: nothing.muted, fontSize: 11, textAlign: "center", paddingVertical: 12 },
  contextActions: { alignSelf: "flex-end", alignItems: "flex-end", gap: 4 },
  videoPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "#121316" },
  thumbnailLoading: { ...StyleSheet.absoluteFillObject, overflow: "hidden", justifyContent: "flex-end", backgroundColor: "#121316" },
  thumbnailLoadingShade: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.32)" },
  thumbnailLoadingContent: { zIndex: 1, gap: 6, padding: 14, paddingTop: 48, backgroundColor: "rgba(18,19,22,0.68)" },
  thumbnailPlay: { width: 34, height: 34, alignItems: "center", justifyContent: "center", backgroundColor: nothing.white, borderRadius: 4 },
  thumbnailEpisode: { color: nothing.muted, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  thumbnailTitle: { color: nothing.white, fontSize: 14, lineHeight: 18, fontWeight: "900" },
  thumbnailStatus: { color: nothing.muted, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  placeholderText: { color: nothing.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.8 },
  errorText: { color: nothing.red, fontSize: 11, fontWeight: "600", textAlign: "center", paddingHorizontal: 20 },
  playerOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 3, justifyContent: "space-between", padding: 8 },
  pointerBoxNone: { pointerEvents: "box-none" },
  pointerNone: { pointerEvents: "none" },
  th3Section: { gap: 10 },
  th3Watching: { fontSize: 16, fontWeight: "900", letterSpacing: -0.4, textAlign: "center", paddingVertical: 10, marginHorizontal: -14, backgroundColor: nothing.surface, borderBottomWidth: 1, borderBottomColor: nothing.line },
  th3WatchingGreen: { color: nothing.red, fontSize: 16, fontWeight: "900", letterSpacing: -0.4 },
  th3WatchingWhite: { color: nothing.white, fontSize: 16, fontWeight: "900", letterSpacing: -0.4 },
  th3Tabs: { flexDirection: "row", gap: 16, marginHorizontal: 14, borderBottomWidth: 1, borderBottomColor: nothing.line },
  th3Tab: { flex: 1, alignItems: "center", paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: "transparent", marginBottom: -1 },
  th3TabActive: { borderBottomColor: nothing.red },
  th3TabText: { color: nothing.muted, fontSize: 14, fontWeight: "700" },
  th3TabTextActive: { color: nothing.red, fontWeight: "900" },
  th3TabTextEmpty: { color: nothing.dim },
  th3Servers: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingVertical: 4, marginHorizontal: 14 },
  th3Server: { minHeight: 32, paddingHorizontal: 14, justifyContent: "center", borderRadius: 16, borderWidth: 1, borderColor: nothing.line, backgroundColor: nothing.surface },
  th3ServerActive: { backgroundColor: nothing.red, borderColor: nothing.red },
  th3ServerText: { color: nothing.muted, fontSize: 12, fontWeight: "700" },
  th3ServerTextActive: { color: nothing.black, fontWeight: "900" },
  th3EpHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  th3EpTitle: { color: nothing.white, fontSize: 16, fontWeight: "900", letterSpacing: -0.4 },
  th3EpSearch: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, height: 34, minWidth: 140, borderWidth: 1, borderColor: nothing.line, borderRadius: 8, backgroundColor: nothing.surface },
  th3EpSearchInput: { flex: 1, color: nothing.white, fontSize: 12, paddingVertical: 0 },
  th3EpsRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  th3EpsText: { color: nothing.red, fontFamily: nothing.mono, fontSize: 11, fontWeight: "900", letterSpacing: 0.4 },
  th3Grid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  th3EpBtn: { width: 56, height: 56, alignItems: "center", justifyContent: "center", borderRadius: 8, borderWidth: 1, borderColor: nothing.line, backgroundColor: nothing.surface, overflow: "hidden" },
  th3EpBtnActive: { backgroundColor: nothing.red, borderColor: nothing.red },
  th3EpBtnText: { color: nothing.muted, fontFamily: nothing.mono, fontSize: 13, fontWeight: "800", zIndex: 1 },
  th3EpBtnTextActive: { color: nothing.black, fontWeight: "900" },
  th3EpBtnFiller: { color: nothing.muted },
  resumeBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: "rgba(0,0,0,0.7)" },
  resumeBtnText: { color: nothing.white, fontSize: 10, fontWeight: "800", letterSpacing: 0.3 },
  lockedRow: { flex: 1, alignItems: "flex-end", justifyContent: "center" },
  errorBtnRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  errorAction: { paddingHorizontal: 12, paddingTop: 10 },
  errorCard: { gap: 6, padding: 12 },
  errorCopy: { color: nothing.muted, fontSize: 12, lineHeight: 16 },
  scroll: { backgroundColor: "#121316", padding: 14, gap: 14, paddingBottom: 40 },
  actionPillsRail: { flexDirection: "row", gap: 8, paddingVertical: 2 },
  mergedReactionPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1B1D22",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.18)",
    borderRadius: 22,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 10,
  },
  reactionHalfBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  reactionDivider: {
    width: 1,
    height: 14,
    backgroundColor: "rgba(255, 255, 255, 0.24)",
  },
  actionPill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#1B1D22", borderWidth: 1, borderColor: "rgba(255, 255, 255, 0.18)", borderRadius: 22, paddingHorizontal: 14, paddingVertical: 8 },
  actionPillSubtitleOn: { backgroundColor: "#23262F" },
  actionPillActive: { backgroundColor: "rgba(239, 68, 68, 0.18)", borderColor: "#FFFFFF" },
  actionPillServer: { backgroundColor: "rgba(239, 68, 68, 0.14)", borderColor: "rgba(255, 255, 255, 0.32)" },
  actionPillLang: { backgroundColor: "rgba(251, 191, 36, 0.12)", borderColor: "rgba(251, 191, 36, 0.30)" },
  actionPillText: { color: "#F3F4F6", fontSize: 12, fontWeight: "700" },
  actionPillTextLiked: { color: "#FFFFFF" },
  audioServerCard: { backgroundColor: "#1B1D22", borderRadius: 16, padding: 12, gap: 10, borderWidth: 1, borderColor: "rgba(255, 255, 255, 0.16)" },
  subDubPills: { flexDirection: "row", gap: 8 },
  subDubPill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 10, backgroundColor: "#23262F", borderWidth: 1, borderColor: "rgba(255, 255, 255, 0.16)" },
  subDubPillActive: { backgroundColor: "#EF4444", borderColor: "#D1D5DB" },
  subDubPillText: { color: "#9CA3AF", fontSize: 11, fontWeight: "800" },
  subDubPillTextActive: { color: "#FFFFFF" },
  serverPillsScroll: { flexDirection: "row", gap: 8 },
  serverPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: "#23262F", borderWidth: 1, borderColor: "rgba(255, 255, 255, 0.16)" },
  serverPillActive: { backgroundColor: "#EF4444", borderColor: "#D1D5DB" },
  serverPillText: { color: "#9CA3AF", fontSize: 11, fontWeight: "700" },
  serverPillTextActive: { color: "#FFFFFF", fontWeight: "800" },
  animeInfoCard: { paddingVertical: 2, gap: 10 },
  animeInfoHeaderRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  animeAvatar: { width: 48, height: 48, borderRadius: 16, backgroundColor: "#23262F", borderWidth: 1.5, borderColor: "rgba(255, 255, 255, 0.32)" },
  animeInfoMetaCol: { flex: 1, gap: 3 },
  animeMainTitle: { color: "#F3F4F6", fontSize: 16, fontWeight: "800", letterSpacing: -0.2 },
  animeSubMetaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 5 },
  animeSubMetaText: { color: "#9CA3AF", fontSize: 12, fontWeight: "600" },
  animeSubMetaDot: { color: "#8E93A2", fontSize: 12 },
  viewsRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  reportPillBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(251, 191, 36, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(251, 191, 36, 0.42)",
    borderRadius: 20,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  reportPillText: { color: "#F5C518", fontSize: 12, fontWeight: "800" },
  animeDescText: { color: "#D9BECA", fontSize: 13, lineHeight: 19 },
  descToggleBtn: { alignSelf: "flex-start", marginTop: -4 },
  descToggleText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  crystalBannerCard: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 16, backgroundColor: "#1B1D22", borderWidth: 1, borderColor: "rgba(255, 255, 255, 0.20)", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  crystalBannerLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  crystalIconImg: { width: 44, height: 44 },
  crystalTextCol: { flex: 1, gap: 2 },
  crystalTag: { flexDirection: "row", alignItems: "center" },
  crystalTagText: { color: "#FFFFFF", fontSize: 9, fontWeight: "900", letterSpacing: 0.6 },
  crystalTitle: { color: "#F3F4F6", fontSize: 13, fontWeight: "800" },
  crystalDesc: { color: "#9CA3AF", fontSize: 11, lineHeight: 15 },
  crystalBtn: { backgroundColor: "#EF4444", borderRadius: 11, paddingHorizontal: 13, paddingVertical: 8 },
  crystalBtnText: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" },
  episodeSectionCard: { backgroundColor: "#1B1D22", borderRadius: 18, padding: 14, gap: 12, borderWidth: 1, borderColor: "rgba(255, 255, 255, 0.18)" },
  episodeHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  episodeSectionTitle: { color: "#F3F4F6", fontSize: 17, fontWeight: "900", letterSpacing: -0.3 },
  episodeTotalCountBadge: { color: "#D1D5DB", fontSize: 12, fontWeight: "700", backgroundColor: "rgba(239, 68, 68, 0.16)", paddingHorizontal: 9, paddingVertical: 3, borderRadius: 99 },
  episodeGridWrap: { gap: 10 },
  rangePillsRow: { flexDirection: "row", gap: 8, paddingBottom: 2 },
  rangePill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: "#23262F", borderWidth: 1, borderColor: "rgba(255, 255, 255, 0.16)" },
  rangePillActive: { backgroundColor: "#EF4444", borderColor: "#D1D5DB" },
  rangePillText: { color: "#9CA3AF", fontSize: 12, fontWeight: "700" },
  rangePillTextActive: { color: "#FFFFFF", fontWeight: "800" },
  episodeCardsScroll: { flexDirection: "row", gap: 8, paddingVertical: 4 },
  modernEpCard: { width: 54, height: 54, borderRadius: 14, backgroundColor: "#23262F", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" },
  modernEpCardActive: { backgroundColor: "#EF4444" },
  modernEpNum: { color: "#D9BECA", fontSize: 14, fontWeight: "700" },
  modernEpNumActive: { color: "#FFFFFF", fontSize: 16, fontWeight: "900" },
  communityRuleCard: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#1B1D22", borderRadius: 14, padding: 12, borderWidth: 1, borderColor: "rgba(255, 255, 255, 0.16)" },
  communityRuleText: { flex: 1, color: "#9CA3AF", fontSize: 12, lineHeight: 17 },
  communityRuleLink: { color: "#FFFFFF", fontWeight: "700", textDecorationLine: "underline" },
  commentsContainer: { gap: 12 },
  episodeLoading: { minHeight: 72, alignItems: "center", justifyContent: "center", gap: 7, borderTopWidth: 1, borderTopColor: nothing.line },
  episodeLoadingText: { color: nothing.muted, fontFamily: nothing.mono, fontSize: 10, fontWeight: "900", letterSpacing: 0.7 },
  episodePager: { flexDirection: "row", alignItems: "center", gap: 6 },
  episodePagerButton: { flex: 1, minHeight: 32, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3 },
  episodePagerDisabled: { opacity: 0.3 },
  episodePagerText: { color: nothing.white, fontSize: 10, fontWeight: "800", letterSpacing: 0.3 },
  episodePagerIndicator: { color: nothing.dim, fontFamily: nothing.mono, fontSize: 10, fontWeight: "800", letterSpacing: 0.3 },
  emptyEpisodeText: { color: nothing.muted, paddingVertical: 14, textAlign: "center", fontSize: 12 },
  swipeHintRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, marginBottom: 2 },
  swipeHintText: { color: nothing.muted, fontFamily: nothing.mono, fontSize: 10, fontWeight: "700", letterSpacing: 0.3 },
  episodeSwipeContainer: { overflow: "hidden" },
  watchCommunitySection: { gap: 10, paddingTop: 2 },
  ratingCard: {
    backgroundColor: "#1B1D22",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.18)",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  ratingCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  ratingMascotImg: {
    width: 48,
    height: 48,
  },
  ratingHeaderCol: {
    flex: 1,
    gap: 3,
  },
  ratingMainTitle: {
    color: "#F3F4F6",
    fontSize: 15,
    fontFamily: "Nunito-Bold",
    letterSpacing: -0.2,
  },
  ratingSubtitle: {
    color: "#9CA3AF",
    fontSize: 11.5,
    fontFamily: "Nunito-Bold",
  },
  ratingChoicesRow: {
    flexDirection: "row",
    gap: 5,
    alignItems: "center",
  },
  ratingRectBox: {
    flex: 1,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#23262F",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.18)",
    borderRadius: 7,
    ...(Platform.OS === "web"
      ? ({
          cursor: "pointer",
          transition: "all 0.15s ease",
        } as any)
      : {}),
  },
  ratingRectBoxActive: {
    backgroundColor: "rgba(239, 68, 68, 0.25)",
    borderColor: "#FFFFFF",
  },
  ratingRectBoxExact: {
    backgroundColor: "#EF4444",
    borderColor: "#D1D5DB",
  },
  ratingRectText: {
    color: "#9CA3AF",
    fontFamily: "Nunito-Bold",
    fontSize: 11.5,
  },
  ratingRectTextActive: {
    color: "#FFFFFF",
    fontFamily: "Nunito-Bold",
  },
  btnPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.96 }],
  },
  languageRow: { flexDirection: "row", gap: 4 },
  language: { minWidth: 48, minHeight: 28, alignItems: "center", justifyContent: "center", paddingHorizontal: 8, borderRadius: 3, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "transparent" },
  languageActive: { borderColor: nothing.red, backgroundColor: "rgba(239,68,68,0.06)" },
  languageDisabled: { opacity: 0.3 },
  languageText: { color: "rgba(255,255,255,0.5)", fontFamily: nothing.mono, fontSize: 9, fontWeight: "900", letterSpacing: 0.2 },
  languageTextActive: { color: nothing.red },
  providerDiscovery: { width: "100%", maxWidth: 260, alignItems: "center", gap: 10 },
  providerDiscoveryCopy: { alignItems: "center", gap: 3 },
  providerDiscoveryTitle: { color: nothing.white, fontFamily: nothing.mono, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  providerDiscoveryDetail: { color: nothing.muted, fontFamily: nothing.mono, fontSize: 10, fontWeight: "800", letterSpacing: 0.6 },
  wibukuQualityBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.58)",
    justifyContent: "flex-end",
  },
  wibukuQualitySheet: {
    backgroundColor: "#17181A",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingBottom: 28,
    paddingHorizontal: 20,
    maxHeight: "84%",
  },
  wibukuQualityHandle: {
    alignSelf: "center",
    width: 44,
    height: 4.5,
    borderRadius: 999,
    backgroundColor: "rgba(255, 255, 255, 0.28)",
    marginBottom: 18,
  },
  wibukuQualityHeading: {
    color: "#F4F4F5",
    fontSize: 18,
    fontWeight: "600",
    letterSpacing: -0.1,
    marginBottom: 16,
    paddingHorizontal: 2,
  },
  wibukuQualityScroll: {
    width: "100%",
  },
  wibukuQualityList: {
    gap: 6,
    paddingBottom: 6,
  },
  wibukuQualityRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    paddingRight: 4,
    borderRadius: 12,
  },
  wibukuQualityRowPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  wibukuQualityCheckCol: {
    width: 38,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  wibukuQualityTextCol: {
    flex: 1,
    gap: 3,
  },
  wibukuQualityTitle: {
    fontSize: 15.5,
    fontWeight: "600",
    letterSpacing: 0.1,
  },
  wibukuQualityDesc: {
    color: "#A1A1AA",
    fontSize: 13,
    lineHeight: 18.5,
    fontWeight: "400",
  },
});

// Memoized: the watch screen re-renders every second (progress clock), and
// re-diffing 50+ episode buttons per tick was the largest avoidable cost.
// Track 5.2: FlatList virtualization when total episodes > 100 (e.g. One Piece).
const EpisodeGrid = memo(function EpisodeGrid({
  episodes,
  activeEpisode,
  totalPages,
  page,
  onPageChange,
  onSelect,
  onInfo,
  totalEpisodeCount = 0,
  progressMap = {},
}: {
  episodes: Episode[];
  activeEpisode: number;
  totalPages: number;
  page: number;
  onPageChange: (update: (value: number) => number) => void;
  onSelect: (n: number) => void;
  onInfo: (n: number) => void;
  totalEpisodeCount?: number;
  progressMap?: Record<number, number>;
}) {
  return (
    <View style={styles.episodeGridWrap}>
      {/* Range Filter Pills */}
      {totalPages > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rangePillsRow}>
          {Array.from({ length: totalPages }).map((_, idx) => {
            const startNum = idx * EPISODE_PAGE_SIZE + 1;
            const endNum = Math.min((idx + 1) * EPISODE_PAGE_SIZE, totalEpisodeCount);
            const isActive = page === idx;
            return (
              <Pressable
                key={idx}
                accessibilityRole="button"
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onPageChange(() => idx);
                }}
                style={[styles.rangePill, isActive && styles.rangePillActive]}
              >
                <Text style={[styles.rangePillText, isActive && styles.rangePillTextActive]}>
                  {`${startNum} - ${endNum}`}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {/* Episode Cards Horizontal Scroll */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.episodeCardsScroll}>
        {episodes.map((item) => {
          const active = item.number === activeEpisode;
          const progress = progressMap[item.number] ?? 0;
          return (
            <Pressable
              key={item.number}
              accessibilityRole="button"
              accessibilityLabel={`Episode ${item.number}`}
              onPress={() => onSelect(item.number)}
              onLongPress={() => onInfo(item.number)}
              style={[
                styles.modernEpCard,
                active && styles.modernEpCardActive,
              ]}
            >
              {/* Perimeter border track and history progress line circling around the box */}
              <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
                <Svg width={54} height={54} viewBox="0 0 54 54">
                  <Rect
                    x={1.5}
                    y={1.5}
                    width={51}
                    height={51}
                    rx={11}
                    ry={11}
                    fill="none"
                    stroke={active ? "rgba(0, 0, 0, 0.08)" : "rgba(255, 255, 255, 0.08)"}
                    strokeWidth={2}
                  />
                  {progress > 0 ? (
                    <Rect
                      x={1.5}
                      y={1.5}
                      width={51}
                      height={51}
                      rx={11}
                      ry={11}
                      fill="none"
                      stroke="#EF4444"
                      strokeWidth={2.5}
                      strokeLinecap="round"
                      strokeDasharray={185.12}
                      strokeDashoffset={185.12 * (1 - Math.min(100, Math.max(0, progress)) / 100)}
                    />
                  ) : null}
                </Svg>
              </View>

              <Text style={[styles.modernEpNum, active && styles.modernEpNumActive]}>
                {item.number}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
});

function ProviderDiscoveryLoader({ attempt: _attempt }: { attempt: number }) {
  return (
    <View style={styles.providerDiscovery}>
      <ActivityIndicator size="large" color={nothing.red} style={{ transform: [{ scale: 1.2 }] }} />
    </View>
  );
}

/**
 * Circular arrow with crisp "10" in the center — matches Wibuku's -10s / +10s buttons.
 */
function Seek10Icon({ direction, size = 35 }: { direction: "back" | "forward"; size?: number }) {
  const numFontSize = Math.round(size * 0.31);
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} viewBox="0 0 36 36">
        {direction === "back" ? (
          <>
            <Path
              d="M18 6 A12 12 0 1 1 7.6 12"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth={2.5}
              strokeLinecap="round"
            />
            <Path
              d="M18 2.2 L12.5 6 L18 9.8 Z"
              fill="#FFFFFF"
            />
          </>
        ) : (
          <>
            <Path
              d="M18 6 A12 12 0 1 0 28.4 12"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth={2.5}
              strokeLinecap="round"
            />
            <Path
              d="M18 2.2 L23.5 6 L18 9.8 Z"
              fill="#FFFFFF"
            />
          </>
        )}
      </Svg>
      <Text
        style={{
          position: "absolute",
          color: "#FFFFFF",
          fontSize: numFontSize,
          fontWeight: "800",
          letterSpacing: -0.4,
          marginTop: 2,
          includeFontPadding: false,
        }}
      >
        10
      </Text>
    </View>
  );
}

/**
 * 4-corner frame fullscreen icon — matches Wibuku's bottom-right fullscreen icon.
 */
function FullscreenCornersIcon({ size = 20, exit = false }: { size?: number; exit?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {exit ? (
        <Path
          d="M4 9H9V4M15 4V9H20M20 15H15V20M9 20V15H4"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth={2.3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <Path
          d="M4 9V4H9M15 4H20V9M20 15V20H15M9 20H4V15"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth={2.3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </Svg>
  );
}


