import { memo } from "react";
import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AppIcon } from "@/components/app-icon";
import { nothing } from "@/components/nothing-ui";
import { getOptimizedImageUri, POSTER_W } from "@/lib/image-optimization";
import { usePrefetchAnime } from "@/lib/prefetch";
import { animeTitle, type Anime } from "@/lib/types";

export type SearchRowAnime = Pick<Anime, "id" | "title"> &
  Partial<Pick<Anime, "format" | "episodes" | "averageScore" | "coverImage" | "genres" | "seasonYear">>;

type Props = {
  anime: SearchRowAnime;
  onPress: () => void;
};

function SearchResultRowImpl({ anime, onPress }: Props) {
  const prefetch = usePrefetchAnime();
  const title = animeTitle(anime);
  const rawImage = anime.coverImage?.extraLarge || anime.coverImage?.large || "";
  const image = rawImage ? getOptimizedImageUri(rawImage, POSTER_W) : "";
  const format = anime.format ? String(anime.format).replace("_", " ") : "TV";
  const episodes = anime.episodes ? `${anime.episodes} EP` : "ONGOING";
  const score =
    typeof anime.averageScore === "number" && anime.averageScore > 0
      ? (anime.averageScore / 10).toFixed(1)
      : null;
  const genreLine = anime.genres?.slice(0, 3).join(" • ") || (anime.seasonYear ? String(anime.seasonYear) : "Sub Indo");

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={() => {
        prefetch(anime.id);
        onPress();
      }}
      style={({ pressed }) => [styles.cardRow, pressed && styles.pressed]}
    >
      <View style={styles.posterBox}>
        {image ? (
          <Image
            source={{ uri: image }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={160}
            cachePolicy="memory-disk"
          />
        ) : null}
      </View>

      <View style={styles.bodyCol}>
        <View style={styles.badgesRow}>
          <View style={styles.formatPill}>
            <Text style={styles.formatText}>{format}</Text>
          </View>
          <View style={styles.epPill}>
            <Text style={styles.epText}>{episodes}</Text>
          </View>
          {score ? (
            <View style={styles.scorePill}>
              <Text style={styles.star}>★</Text>
              <Text style={styles.scoreVal}>{score}</Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>

        <Text style={styles.genreText} numberOfLines={1}>
          {genreLine}
        </Text>
      </View>

      <View style={styles.playCircle}>
        <AppIcon name="play" size={14} color="#FFFFFF" />
      </View>
    </Pressable>
  );
}

export const SearchResultRow = memo(SearchResultRowImpl);

const styles = StyleSheet.create({
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 10,
    marginBottom: 8,
    borderRadius: 18,
    backgroundColor: "#180F15",
    borderWidth: 1,
    borderColor: "rgba(251, 113, 133, 0.16)",
  },
  posterBox: {
    width: 66,
    height: 94,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#23161F",
    borderWidth: 1,
    borderColor: "rgba(251, 113, 133, 0.20)",
  },
  bodyCol: {
    flex: 1,
    gap: 5,
    minWidth: 0,
  },
  badgesRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 5,
  },
  formatPill: {
    paddingHorizontal: 6.5,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "rgba(255, 245, 247, 0.08)",
  },
  formatText: {
    fontFamily: "SpaceGrotesk-Bold",
    fontSize: 9.5,
    color: "#FFF5F7",
  },
  epPill: {
    paddingHorizontal: 6.5,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "rgba(244, 63, 94, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(251, 113, 133, 0.32)",
  },
  epText: {
    fontFamily: "SpaceGrotesk-Bold",
    fontSize: 9.5,
    color: "#FDA4AF",
  },
  scorePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2.5,
    paddingHorizontal: 6.5,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "rgba(251, 191, 36, 0.14)",
  },
  star: {
    fontSize: 9.5,
    color: "#FBBF24",
  },
  scoreVal: {
    fontFamily: "SpaceGrotesk-Bold",
    fontSize: 9.5,
    color: "#FDE68A",
  },
  title: {
    color: nothing.white,
    fontFamily: "Nunito-ExtraBold",
    fontSize: 14,
    lineHeight: 18,
  },
  genreText: {
    color: nothing.muted,
    fontFamily: "Nunito-SemiBold",
    fontSize: 11.5,
  },
  playCircle: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "#F43F5E",
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: nothing.pressed,
});
