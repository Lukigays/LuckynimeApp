import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Modal, Platform, Pressable, Share, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import { AppIcon } from "@/components/app-icon";
import type { Anime } from "@/lib/types";
import { animeTitle } from "@/lib/types";
import { usePrefetchAnime } from "@/lib/prefetch";
import { POSTER_W, getOptimizedImageUri } from "@/lib/image-optimization";
import { nothing } from "@/components/nothing-ui";
import { useBookmarks } from "@/hooks/use-bookmarks";
import { useWatchHistory } from "@/hooks/use-watch-history";
import { useLuckynimeAuth } from "@/providers/auth-provider";

type ActionItem = { label: string; icon: string; onPress: () => void };

const MENU_CLOSE_FADE_MS = 240;
const MARK_WATCHED_MAX_EPISODES = 24;

function showQuickFeedback(message: string) {
  Alert.alert("", message, [{ text: "OK" }], { cancelable: true });
}

function airedEpisodeCount(anime: Anime): number {
  const total = typeof anime.episodes === "number" && anime.episodes > 0 ? anime.episodes : null;
  const next =
    typeof anime.nextAiringEpisode?.episode === "number" && anime.nextAiringEpisode.episode > 0
      ? anime.nextAiringEpisode.episode
      : null;
  const aired = next !== null ? Math.max(0, next - 1) : (total ?? 1);
  return total !== null ? Math.min(aired, total) : aired;
}

function shareAnime(anime: Anime, title: string) {
  const deepLink = `luckynime://anime/${anime.id}`;
  const webUrl = `https://luckynime.tech/anime/${anime.id}`;
  void Share.share({
    title,
    message: `Tonton ${title} di Luckynime\n${deepLink}`,
    url: Platform.OS === "ios" ? deepLink : webUrl,
  })
    .then((result) => {
      if (result?.action !== "dismissedAction") showQuickFeedback(`Berhasil membagikan "${title}"`);
    })
    .catch(() => {
      showQuickFeedback("Tidak dapat membagikan saat ini");
    });
}

function AnimeCardBase({ anime, compact = false }: { anime: Anime; compact?: boolean }) {
  const title = animeTitle(anime);
  const rawArtwork = anime.coverImage?.extraLarge || anime.coverImage?.large;
  const artwork = rawArtwork ? getOptimizedImageUri(rawArtwork, POSTER_W) : undefined;
  const [menuVisible, setMenuVisible] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefetch = usePrefetchAnime();

  const isFinished =
    anime.status?.toUpperCase() === "FINISHED" ||
    anime.status?.toUpperCase() === "COMPLETED";

  const statusBadge = isFinished
    ? "TAMAT"
    : anime.nextAiringEpisode?.episode
      ? `EP ${anime.nextAiringEpisode.episode}`
      : typeof anime.episodes === "number" && anime.episodes > 0
        ? `EP ${anime.episodes}`
        : anime.status?.toUpperCase() === "RELEASING"
          ? "ONGOING"
          : null;

  const subMeta = useMemo(() => {
    const parts: string[] = [];
    if (anime.format) parts.push(String(anime.format).replace("_", " "));
    if (anime.seasonYear) parts.push(String(anime.seasonYear));
    else if (anime.genres?.[0]) parts.push(anime.genres[0]);
    return parts.join(" • ");
  }, [anime.format, anime.seasonYear, anime.genres]);

  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const openMenu = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setMenuVisible(true);
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Buka ${title}`}
        accessibilityHint="Ketuk untuk detail anime. Tahan untuk aksi cepat."
        onPress={() => {
          cancelLongPress();
          void Haptics.selectionAsync();
          prefetch(anime.id);
          router.push(`/anime/${anime.id}` as never);
        }}
        onPressIn={() => {
          longPressTimer.current = setTimeout(() => {
            longPressTimer.current = null;
            openMenu();
          }, 500);
        }}
        onPressOut={cancelLongPress}
        style={({ pressed }) => [styles.card, compact && styles.compactCard, pressed && styles.pressed]}
      >
        <View style={[styles.media, compact && styles.compactMedia]}>
          <View style={styles.artFallback}>
            <Text style={styles.fallbackInitial}>{title.charAt(0).toUpperCase()}</Text>
          </View>
          {artwork ? (
            <Image
              source={{ uri: artwork }}
              style={styles.poster}
              contentFit="cover"
              transition={140}
              cachePolicy="memory-disk"
            />
          ) : null}

          <LinearGradient
            colors={["transparent", "rgba(18,19,22, 0.22)", "rgba(18,19,22, 0.88)"]}
            locations={[0.46, 0.74, 1]}
            style={StyleSheet.absoluteFill}
          />

          {/* Score Pill Top-Right */}
          <View style={styles.cardScoreBadge}>
            <Text style={styles.cardScoreStar}>★</Text>
            <Text style={styles.cardScoreValue}>
              {anime.averageScore ? (anime.averageScore / 10).toFixed(1) : "8.5"}
            </Text>
          </View>

          {/* Crimson Episode Ribbon Bottom-Left */}
          {statusBadge ? (
            <View style={[styles.statusBadge, isFinished && styles.statusBadgeFinished]}>
              <Text style={styles.statusBadgeText}>{statusBadge}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.meta}>
          <Text numberOfLines={2} style={styles.title}>{title}</Text>
          <Text numberOfLines={1} style={styles.detail}>{subMeta}</Text>
        </View>
      </Pressable>

      {menuVisible ? (
        <AnimeCardMenu anime={anime} title={title} onClose={() => setMenuVisible(false)} />
      ) : null}
    </>
  );
}

export const AnimeCard = memo(AnimeCardBase);

function AnimeCardMenu({ anime, title, onClose }: { anime: Anime; title: string; onClose: () => void }) {
  const auth = useLuckynimeAuth();
  const bookmarks = useBookmarks();
  const history = useWatchHistory();
  const [visible, setVisible] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const openTimer = setTimeout(() => setVisible(true), 0);
    return () => {
      clearTimeout(openTimer);
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  const close = (then?: () => void) => {
    setVisible(false);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      onClose();
      then?.();
    }, MENU_CLOSE_FADE_MS);
  };

  const requireAccount = () => {
    if (auth.user) return true;
    router.push("/auth" as never);
    return false;
  };

  const toggleLibrary = () => {
    if (!requireAccount()) return;
    bookmarks.toggle.mutate(anime, {
      onSuccess: (added) =>
        showQuickFeedback(added ? `"${title}" disimpan ke Koleksi` : `"${title}" dihapus dari Koleksi`),
      onError: (error) =>
        showQuickFeedback(error instanceof Error ? error.message : "Gagal memperbarui Koleksi"),
    });
  };

  const markAsWatched = () => {
    if (!requireAccount()) return;
    const airedTotal = airedEpisodeCount(anime);
    const episodeCount = Math.min(airedTotal, MARK_WATCHED_MAX_EPISODES);
    if (episodeCount <= 0) {
      showQuickFeedback(`"${title}" belum memiliki episode tayang`);
      return;
    }
    const episodeDuration = Math.max(1, Math.round((anime.duration || 24) * 60));
    const image = anime.coverImage?.extraLarge || anime.coverImage?.large || null;
    void (async () => {
      try {
        const CONCURRENCY = 6;
        for (let start = 1; start <= episodeCount; start += CONCURRENCY) {
          const chunk: Array<Promise<void>> = [];
          const end = Math.min(start + CONCURRENCY - 1, episodeCount);
          for (let episode = start; episode <= end; episode++) {
            chunk.push(
              history.save.mutateAsync({
                animeId: anime.id,
                animeTitle: title,
                animeImage: image,
                episode,
                progress: episodeDuration,
                duration: episodeDuration,
              })
            );
          }
          await Promise.all(chunk);
        }
        showQuickFeedback(
          episodeCount < airedTotal
            ? `${episodeCount} episode "${title}" ditandai selesai`
            : `"${title}" ditandai selesai`
        );
      } catch (error) {
        showQuickFeedback(error instanceof Error ? error.message : `Gagal menandai "${title}"`);
      }
    })();
  };

  const openInBrowser = () => {
    const url = `https://anilist.co/anime/${anime.id}`;
    void Linking.openURL(url).catch(() => {
      showQuickFeedback("Tidak dapat membuka browser");
    });
  };

  const actions: ActionItem[] = [
    {
      label: "Simpan ke Koleksi",
      icon: "bookmark",
      onPress: () => close(toggleLibrary),
    },
    {
      label: "Tandai Sudah Ditonton",
      icon: "check-circle",
      onPress: () => close(markAsWatched),
    },
    {
      label: "Bagikan Anime",
      icon: "share",
      onPress: () => close(() => shareAnime(anime, title)),
    },
    {
      label: "Buka di Browser",
      icon: "external-link",
      onPress: () => close(openInBrowser),
    },
  ];

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={() => close()}>
      <Pressable style={styles.backdrop} onPress={() => close()}>
        <View style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetEyebrow}>AKSI CEPAT</Text>
            <Text numberOfLines={1} style={styles.sheetTitle}>{title}</Text>
          </View>
          <View style={styles.divider} />
          {actions.map((action) => (
            <Pressable
              key={action.label}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              onPress={() => {
                void Haptics.selectionAsync();
                action.onPress();
              }}
              style={({ pressed }) => [styles.actionRow, pressed && styles.actionPressed]}
            >
              <View style={styles.actionIconBox}>
                <AppIcon name={action.icon as any} size={16} color={nothing.sakura} />
              </View>
              <Text style={styles.actionLabel}>{action.label}</Text>
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: { width: 146, gap: 8 },
  compactCard: { width: 126 },
  pressed: nothing.pressed,
  media: {
    height: 206,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: nothing.surface,
  },
  compactMedia: {
    height: 178,
  },
  artFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1B1D22",
  },
  fallbackInitial: {
    color: "rgba(255, 255, 255, 0.35)",
    fontFamily: "Nunito-Bold",
    fontSize: 52,
  },
  poster: { ...StyleSheet.absoluteFillObject },
  cardScoreBadge: {
    position: "absolute",
    top: 7,
    right: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(18, 19, 22, 0.86)",
    paddingHorizontal: 6.5,
    paddingVertical: 2.5,
    borderRadius: 99,
  },
  cardScoreStar: {
    color: "#F5C518",
    fontSize: 9.5,
  },
  cardScoreValue: {
    fontFamily: "Nunito-SemiBold",
    fontSize: 10.5,
    color: "#F3F4F6",
    fontWeight: "700",
  },
  statusBadge: {
    position: "absolute",
    left: 7,
    bottom: 7,
    backgroundColor: "#EF4444",
    paddingHorizontal: 7.5,
    paddingVertical: 2.5,
    borderRadius: 8,
  },
  statusBadgeFinished: {
    backgroundColor: "#2C303E",
  },
  statusBadgeText: {
    fontFamily: "Nunito-SemiBold",
    fontSize: 9.5,
    color: "#FFFFFF",
    fontWeight: "800",
    letterSpacing: 0.45,
  },
  meta: { gap: 3, paddingHorizontal: 1 },
  title: {
    color: nothing.white,
    fontFamily: "Nunito-Bold",
    fontSize: 13,
    lineHeight: 17,
  },
  detail: {
    color: nothing.dim,
    fontFamily: "Nunito-SemiBold",
    fontSize: 10.5,
    letterSpacing: 0.2,
  },
  backdrop: {
    flex: 1,
    padding: 18,
    justifyContent: "flex-end",
    backgroundColor: "rgba(18,19,22, 0.82)",
  },
  sheet: {
    gap: 2,
    padding: 8,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: nothing.lineStrong,
    backgroundColor: "#1B1D22",
  },
  sheetHandle: {
    alignSelf: "center",
    width: 38,
    height: 4,
    borderRadius: 99,
    backgroundColor: "rgba(255, 255, 255, 0.35)",
    marginTop: 4,
    marginBottom: 4,
  },
  sheetHeader: { paddingHorizontal: 14, paddingTop: 6, paddingBottom: 10, gap: 2 },
  sheetEyebrow: {
    color: nothing.sakura,
    fontFamily: "Nunito-SemiBold",
    fontSize: 9.5,
    letterSpacing: 0.2,
  },
  sheetTitle: { color: nothing.white, fontFamily: "Nunito-Bold", fontSize: 16 },
  divider: { height: 1, backgroundColor: nothing.line, marginHorizontal: 10, marginBottom: 4 },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  actionPressed: { backgroundColor: nothing.raised },
  actionIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: { color: nothing.white, fontFamily: "Nunito-Bold", fontSize: 13.5 },
});
