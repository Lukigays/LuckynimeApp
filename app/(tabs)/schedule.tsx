import { memo, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { getAiringScheduleWindow, type AiringScheduleWindow } from "@/lib/anilist";
import { APP_CONFIG } from "@/lib/app-config";
import { animeTitle } from "@/lib/types";
import type { AiringScheduleItem, AiringSchedulePage } from "@/lib/types";
import { useNotifyMe } from "@/hooks/use-notify-me";
import { ErrorState, LoadingState, EmptyState } from "@/components/async-state";
import { AppIcon } from "@/components/app-icon";
import { hapticLight } from "@/lib/haptics";

const SCHEDULE_MEDIA_FIELDS = `id type title { romaji english native } coverImage { large extraLarge } format status averageScore popularity`;

type ArchivePage = {
  pageInfo?: { currentPage?: number; hasNextPage?: boolean; total?: number | null };
  airingSchedules?: AiringScheduleItem[];
};

let nextArchiveRequestAt = 0;
const ARCHIVE_REQUEST_INTERVAL_MS = 2_500;

async function fetchAiringArchive(window: AiringScheduleWindow): Promise<AiringSchedulePage> {
  const query = `query AiringArchive($startAt: Int, $endAt: Int) {
    first: Page(page: 1, perPage: 50) { pageInfo { currentPage hasNextPage total } airingSchedules(airingAt_greater: $startAt, airingAt_lesser: $endAt, sort: [TIME]) { airingAt episode media { ${SCHEDULE_MEDIA_FIELDS} } } }
    second: Page(page: 2, perPage: 50) { airingSchedules(airingAt_greater: $startAt, airingAt_lesser: $endAt, sort: [TIME]) { airingAt episode media { ${SCHEDULE_MEDIA_FIELDS} } } }
  }`;
  const now = Date.now();
  const scheduledAt = Math.max(now, nextArchiveRequestAt);
  nextArchiveRequestAt = scheduledAt + ARCHIVE_REQUEST_INTERVAL_MS;
  if (scheduledAt > now) await new Promise<void>((resolve) => { setTimeout(resolve, scheduledAt - now); });
  const response = await fetch(APP_CONFIG.anilistGraphqlUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables: { startAt: window.startAt, endAt: window.endAt } }),
  });
  if (response.status === 429) throw new Error("AniList sedang sibuk. Tunggu sebentar dan coba lagi.");
  const payload = (await response.json().catch(() => null)) as {
    data?: { first?: ArchivePage; second?: ArchivePage };
    errors?: Array<{ message?: string }>;
  } | null;
  if (!response.ok || payload?.errors?.length || !payload?.data?.first) {
    throw new Error(payload?.errors?.[0]?.message || "Gagal memuat jadwal tayang anime.");
  }
  const first = payload.data.first;
  const airingSchedules = [...(first.airingSchedules ?? []), ...(payload.data.second?.airingSchedules ?? [])];
  return {
    pageInfo: {
      currentPage: first.pageInfo?.currentPage ?? 1,
      hasNextPage: Boolean(first.pageInfo?.hasNextPage),
      total: first.pageInfo?.total ?? airingSchedules.length,
    },
    airingSchedules,
  };
}

function startOfLocalDay(value: Date) {
  const start = new Date(value);
  start.setHours(0, 0, 0, 0);
  return start;
}

function localDayKey(value: Date) {
  return `${value.getFullYear()}-${value.getMonth() + 1}-${value.getDate()}`;
}

const ID_DAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"] as const;
const ID_DAYS_SHORT = ["MIN", "SEN", "SEL", "RAB", "KAM", "JUM", "SAB"] as const;

type DayGroup = {
  key: string;
  dayName: string;
  dayShort: string;
  dayNum: string;
  dateLabel: string;
  items: AiringScheduleItem[];
};

const SakuraScheduleCard = memo(function SakuraScheduleCard({
  item,
  isLast,
}: {
  item: AiringScheduleItem;
  isLast: boolean;
}) {
  const notify = useNotifyMe(item.media.id);
  const date = new Date(item.airingAt * 1000);
  const anime = item.media;
  const title = animeTitle(anime);

  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const timeStr = `${hours}:${minutes}`;

  const isAired = item.airingAt * 1000 <= Date.now();

  const scoreVal =
    typeof anime.averageScore === "number" && anime.averageScore > 0
      ? (anime.averageScore / 10).toFixed(1)
      : "—";
  const popVal =
    typeof anime.popularity === "number" && anime.popularity > 0
      ? anime.popularity >= 1000
        ? `${(anime.popularity / 1000).toFixed(anime.popularity >= 10000 ? 0 : 1)}K`
        : String(anime.popularity)
      : "—";

  return (
    <View style={styles.timelineRow}>
      {/* Left Time Rail */}
      <View style={styles.timeRailCol}>
        <View style={[styles.timeBadge, isAired && styles.timeBadgeAired]}>
          <Text style={[styles.timeBadgeText, isAired && styles.timeBadgeTextAired]}>
            {timeStr}
          </Text>
        </View>
        <View style={[styles.railNode, isAired && styles.railNodeAired]} />
        {!isLast ? <View style={styles.railConnector} /> : null}
      </View>

      {/* Right Sakura Card */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Buka ${title}`}
        onPress={() => {
          hapticLight();
          router.push(`/anime/${anime.id}` as never);
        }}
        style={({ pressed }) => [styles.releaseCard, pressed && styles.btnPressed]}
      >
        <Image
          source={{ uri: anime.coverImage?.large || anime.coverImage?.extraLarge || "" }}
          style={styles.cardPoster}
          contentFit="cover"
          transition={150}
          cachePolicy="memory-disk"
        />

        <View style={styles.cardBody}>
          <View style={styles.cardTopMeta}>
            <View style={styles.epRibbon}>
              <Text style={styles.epRibbonText}>EP {item.episode}</Text>
            </View>
            <View style={[styles.airStatePill, isAired ? styles.airStateDone : styles.airStateSoon]}>
              <Text style={[styles.airStateText, isAired ? styles.airStateTextDone : styles.airStateTextSoon]}>
                {isAired ? "TERSEDIA" : "SEGERA"}
              </Text>
            </View>
          </View>

          <Text style={styles.cardTitle} numberOfLines={2}>
            {title}
          </Text>

          <View style={styles.cardStatsRow}>
            <View style={styles.cardStatItem}>
              <Text style={styles.starIcon}>★</Text>
              <Text style={styles.scoreText}>{scoreVal}</Text>
            </View>
            <Text style={styles.statDot}>•</Text>
            <View style={styles.cardStatItem}>
              <AppIcon name="fire" size={11} color="#FB7185" />
              <Text style={styles.popText}>{popVal} penonton</Text>
            </View>
          </View>
        </View>

        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: notify.enabled }}
          accessibilityLabel={notify.enabled ? `Pengingat aktif untuk ${title}` : `Ingatkan ${title}`}
          hitSlop={10}
          onPress={() => {
            hapticLight();
            void notify.toggle();
          }}
          style={({ pressed }) => [
            styles.bellBtn,
            notify.enabled && styles.bellBtnActive,
            pressed && styles.btnPressed,
          ]}
        >
          <AppIcon
            name={notify.enabled ? "bell" : "bell-outline"}
            size={16}
            color={notify.enabled ? "#FFFFFF" : "#C4A6B3"}
          />
        </Pressable>
      </Pressable>
    </View>
  );
});

let memoryScheduleCache: AiringSchedulePage | null = null;

export default function ScheduleScreen() {
  const [dayOffset] = useState(0);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [cachedSchedule, setCachedSchedule] = useState<AiringSchedulePage | null>(memoryScheduleCache);

  useEffect(() => {
    void AsyncStorage.getItem("luckynime.cache.schedule.v1").then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.airingSchedules) && parsed.airingSchedules.length > 0) {
            memoryScheduleCache = parsed;
            setCachedSchedule(parsed);
          }
        } catch {}
      }
    });
  }, []);

  const [todayKey, setTodayKey] = useState(() => localDayKey(new Date()));
  useEffect(() => {
    const timer = setInterval(() => {
      setTodayKey((prev) => {
        const next = localDayKey(new Date());
        return next === prev ? prev : next;
      });
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  const window = useMemo(() => {
    const start = startOfLocalDay(new Date());
    start.setDate(start.getDate() + dayOffset);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { startAt: Math.floor(start.getTime() / 1000), endAt: Math.floor(end.getTime() / 1000) };
  }, [dayOffset, todayKey]);

  const schedule = useQuery({
    queryKey: ["schedule", window.startAt, window.endAt],
    queryFn: () => (dayOffset < 0 ? fetchAiringArchive(window) : getAiringScheduleWindow(window)),
    placeholderData: dayOffset === 0 ? cachedSchedule ?? undefined : undefined,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });

  useEffect(() => {
    if (dayOffset === 0 && schedule.data?.airingSchedules?.length) {
      memoryScheduleCache = schedule.data;
      void AsyncStorage.setItem("luckynime.cache.schedule.v1", JSON.stringify(schedule.data)).catch(() => {});
    }
  }, [dayOffset, schedule.data]);

  const dayGroups: DayGroup[] = useMemo(() => {
    if (!schedule.data?.airingSchedules) return [];
    const map = new Map<
      string,
      { dayName: string; dayShort: string; dayNum: string; dateLabel: string; items: AiringScheduleItem[] }
    >();

    schedule.data.airingSchedules.forEach((item) => {
      const d = new Date(item.airingAt * 1000);
      const dayKey = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
      const dayName = ID_DAYS[d.getDay()] || "Senin";
      const dayShort = ID_DAYS_SHORT[d.getDay()] || "SEN";
      const dayNum = String(d.getDate()).padStart(2, "0");
      const dateLabel = `${d.getDate()} ${d.toLocaleDateString("id-ID", { month: "short" })}`;

      const current = map.get(dayKey) ?? { dayName, dayShort, dayNum, dateLabel, items: [] };
      current.items.push(item);
      map.set(dayKey, current);
    });

    return [...map.entries()].map(([key, val]) => ({
      key,
      ...val,
    }));
  }, [schedule.data]);

  const safeIndex = Math.min(selectedDayIndex, Math.max(0, dayGroups.length - 1));
  const currentGroup = dayGroups[safeIndex];
  const nextGroup = dayGroups.length > 1 ? dayGroups[(safeIndex + 1) % dayGroups.length] : null;

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.container}>
      {/* 1. Editorial Sakura Header */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <View style={styles.accentBlade} />
          <View>
            <Text style={styles.headerEyebrow}>SIMULCAST MINGGUAN</Text>
            <Text style={styles.headerTitle}>Kalender Rilis</Text>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cari anime"
          onPress={() => {
            hapticLight();
            router.push("/search" as never);
          }}
          style={({ pressed }) => [styles.headerSearchBtn, pressed && styles.btnPressed]}
        >
          <AppIcon name="magnify" size={19} color="#FB7185" />
        </Pressable>
      </View>

      {/* 2. Vertical Calendar Date Cards */}
      {dayGroups.length > 0 ? (
        <View style={styles.calendarStripWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.calendarStripScroll}
          >
            {dayGroups.map((group, idx) => {
              const active = safeIndex === idx;
              return (
                <Pressable
                  key={group.key}
                  onPress={() => {
                    hapticLight();
                    setSelectedDayIndex(idx);
                  }}
                  style={({ pressed }) => [
                    styles.dateCard,
                    active && styles.dateCardActive,
                    pressed && styles.btnPressed,
                  ]}
                >
                  <Text style={[styles.dateShort, active && styles.dateShortActive]}>
                    {group.dayShort}
                  </Text>
                  <Text style={[styles.dateNumber, active && styles.dateNumberActive]}>
                    {group.dayNum}
                  </Text>
                  <View style={[styles.dateCountDot, active && styles.dateCountDotActive]}>
                    <Text style={[styles.dateCountText, active && styles.dateCountTextActive]}>
                      {group.items.length}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {/* 3. Selected Day Summary Banner */}
      {currentGroup ? (
        <View style={styles.summaryBanner}>
          <LinearGradient
            colors={["rgba(244, 63, 94, 0.18)", "rgba(25, 16, 22, 0.90)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.summaryLeft}>
            <AppIcon name="calendar-check" size={16} color="#FB7185" />
            <Text style={styles.summaryDayText}>
              {currentGroup.dayName}, {currentGroup.dateLabel}
            </Text>
          </View>
          <View style={styles.summaryCountPill}>
            <Text style={styles.summaryCountText}>
              {currentGroup.items.length} Episode
            </Text>
          </View>
        </View>
      ) : null}

      {/* 4. Schedule Timeline List */}
      {schedule.isPending ? (
        <LoadingState label="Menyusun jadwal rilis minggu ini..." />
      ) : schedule.isError || !schedule.data ? (
        <ErrorState
          message={schedule.error?.message ?? "Gagal memuat jadwal tayang."}
          onRetry={() => void schedule.refetch()}
        />
      ) : !dayGroups.length || !currentGroup?.items.length ? (
        <EmptyState label="Belum ada jadwal rilis pada hari ini." />
      ) : (
        <FlatList
          data={currentGroup.items}
          keyExtractor={(item, index) => `${item.media?.id ?? "anime"}:${item.episode}:${item.airingAt}:${index}`}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={schedule.isFetching && !schedule.isPending}
              onRefresh={() => void schedule.refetch()}
              tintColor="#F43F5E"
            />
          }
          renderItem={({ item, index }) => (
            <SakuraScheduleCard
              item={item}
              isLast={index === currentGroup.items.length - 1}
            />
          )}
        />
      )}

      {/* 5. Floating Next Day Pill */}
      {nextGroup ? (
        <Pressable
          onPress={() => {
            hapticLight();
            setSelectedDayIndex((prev) => (prev + 1) % dayGroups.length);
          }}
          style={({ pressed }) => [styles.floatingNextBtn, pressed && styles.btnPressed]}
          accessibilityLabel={`Lanjut ke hari ${nextGroup.dayName}`}
        >
          <Text style={styles.floatingNextText}>{nextGroup.dayName}</Text>
          <AppIcon name="arrow-right" size={14} color="#FFFFFF" />
        </Pressable>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0D080B",
  },
  btnPressed: {
    opacity: 0.84,
    transform: [{ scale: 0.98 }],
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  accentBlade: {
    width: 4,
    height: 28,
    borderRadius: 99,
    backgroundColor: "#F43F5E",
  },
  headerEyebrow: {
    fontFamily: "SpaceGrotesk-Bold",
    fontSize: 9.5,
    color: "#FB7185",
    letterSpacing: 1.1,
  },
  headerTitle: {
    fontFamily: "Nunito-Black",
    fontSize: 23,
    color: "#FFF5F7",
    letterSpacing: -0.4,
  },
  headerSearchBtn: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: "#191016",
    borderWidth: 1,
    borderColor: "rgba(251, 113, 133, 0.24)",
    alignItems: "center",
    justifyContent: "center",
  },

  // ─── CALENDAR DATE STRIP ───
  calendarStripWrap: {
    paddingVertical: 4,
  },
  calendarStripScroll: {
    paddingHorizontal: 16,
    gap: 9,
  },
  dateCard: {
    width: 58,
    paddingVertical: 9,
    borderRadius: 16,
    backgroundColor: "#180F15",
    borderWidth: 1,
    borderColor: "rgba(251, 113, 133, 0.16)",
    alignItems: "center",
    gap: 3,
  },
  dateCardActive: {
    backgroundColor: "#E11D48",
    borderColor: "#FDA4AF",
  },
  dateShort: {
    fontFamily: "SpaceGrotesk-Bold",
    fontSize: 10,
    color: "#9A7D8A",
    letterSpacing: 0.6,
  },
  dateShortActive: {
    color: "#FFE4E6",
  },
  dateNumber: {
    fontFamily: "Nunito-Black",
    fontSize: 17,
    color: "#FFF5F7",
  },
  dateNumberActive: {
    color: "#FFFFFF",
  },
  dateCountDot: {
    paddingHorizontal: 7,
    paddingVertical: 1.5,
    borderRadius: 99,
    backgroundColor: "rgba(251, 113, 133, 0.12)",
  },
  dateCountDotActive: {
    backgroundColor: "rgba(13, 8, 11, 0.34)",
  },
  dateCountText: {
    fontFamily: "SpaceGrotesk-Bold",
    fontSize: 9.5,
    color: "#FB7185",
  },
  dateCountTextActive: {
    color: "#FFFFFF",
  },

  // ─── SUMMARY BANNER ───
  summaryBanner: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(251, 113, 133, 0.22)",
    paddingHorizontal: 14,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    overflow: "hidden",
  },
  summaryLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  summaryDayText: {
    fontFamily: "Nunito-ExtraBold",
    fontSize: 13.5,
    color: "#FFF5F7",
  },
  summaryCountPill: {
    paddingHorizontal: 10,
    paddingVertical: 3.5,
    borderRadius: 99,
    backgroundColor: "rgba(244, 63, 94, 0.20)",
  },
  summaryCountText: {
    fontFamily: "SpaceGrotesk-Bold",
    fontSize: 10.5,
    color: "#FDA4AF",
  },

  // ─── TIMELINE LIST ───
  listContent: {
    paddingHorizontal: 14,
    paddingBottom: 112,
    paddingTop: 4,
  },
  timelineRow: {
    flexDirection: "row",
    alignItems: "stretch",
    marginBottom: 14,
  },
  timeRailCol: {
    width: 56,
    alignItems: "center",
    paddingTop: 6,
    marginRight: 8,
    position: "relative",
  },
  timeBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: "#1C1118",
    borderWidth: 1,
    borderColor: "rgba(251, 113, 133, 0.22)",
    marginBottom: 7,
  },
  timeBadgeAired: {
    backgroundColor: "rgba(16, 185, 129, 0.14)",
    borderColor: "rgba(52, 211, 153, 0.35)",
  },
  timeBadgeText: {
    fontFamily: "SpaceGrotesk-Bold",
    fontSize: 11,
    color: "#FDA4AF",
  },
  timeBadgeTextAired: {
    color: "#6EE7B7",
  },
  railNode: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: "#F43F5E",
    borderWidth: 1.5,
    borderColor: "#FDA4AF",
    zIndex: 2,
  },
  railNodeAired: {
    backgroundColor: "#10B981",
    borderColor: "#6EE7B7",
  },
  railConnector: {
    position: "absolute",
    top: 44,
    bottom: -16,
    width: 1.5,
    backgroundColor: "rgba(251, 113, 133, 0.22)",
    zIndex: 1,
  },

  // ─── RELEASE CARD ───
  releaseCard: {
    flex: 1,
    backgroundColor: "#180F15",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(251, 113, 133, 0.17)",
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  cardPoster: {
    width: 68,
    height: 96,
    borderRadius: 13,
    backgroundColor: "#23161F",
    borderWidth: 1,
    borderColor: "rgba(251, 113, 133, 0.18)",
  },
  cardBody: {
    flex: 1,
    gap: 5,
    minWidth: 0,
  },
  cardTopMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  epRibbon: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "rgba(244, 63, 94, 0.20)",
    borderWidth: 1,
    borderColor: "rgba(251, 113, 133, 0.35)",
  },
  epRibbonText: {
    fontFamily: "SpaceGrotesk-Bold",
    fontSize: 9.5,
    color: "#FDA4AF",
  },
  airStatePill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  airStateDone: {
    backgroundColor: "rgba(16, 185, 129, 0.15)",
  },
  airStateSoon: {
    backgroundColor: "rgba(251, 191, 36, 0.14)",
  },
  airStateText: {
    fontFamily: "SpaceGrotesk-Bold",
    fontSize: 9,
    letterSpacing: 0.5,
  },
  airStateTextDone: {
    color: "#34D399",
  },
  airStateTextSoon: {
    color: "#FBBF24",
  },
  cardTitle: {
    fontFamily: "Nunito-ExtraBold",
    fontSize: 14,
    lineHeight: 18,
    color: "#FFF5F7",
  },
  cardStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  cardStatItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  starIcon: {
    fontSize: 11,
    color: "#FBBF24",
  },
  scoreText: {
    fontFamily: "SpaceGrotesk-Bold",
    fontSize: 11,
    color: "#FDE68A",
  },
  statDot: {
    color: "#7F6270",
    fontSize: 10,
  },
  popText: {
    fontFamily: "Nunito-SemiBold",
    fontSize: 11,
    color: "#C4A6B3",
  },
  bellBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#23161F",
    borderWidth: 1,
    borderColor: "rgba(251, 113, 133, 0.18)",
  },
  bellBtnActive: {
    backgroundColor: "#F43F5E",
    borderColor: "#FDA4AF",
  },
  floatingNextBtn: {
    position: "absolute",
    bottom: 88,
    right: 18,
    backgroundColor: "#E11D48",
    borderWidth: 1,
    borderColor: "#FDA4AF",
    borderRadius: 99,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    zIndex: 100,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 10,
  },
  floatingNextText: {
    fontFamily: "Nunito-ExtraBold",
    fontSize: 12.5,
    color: "#FFFFFF",
  },
});
