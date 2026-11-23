import { memo } from "react";
import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { getOptimizedImageUri, POSTER_W } from "@/lib/image-optimization";
import { usePrefetchAnime } from "@/lib/prefetch";
import { animeTitle, type Anime } from "@/lib/types";

export type SearchRowAnime = Pick<Anime, "id" | "title"> &
  Partial<Pick<Anime, "format" | "episodes" | "averageScore" | "coverImage" | "genres" | "seasonYear">> & {
    description?: string | null;
  };

type Props = {
  anime: SearchRowAnime;
  onPress: () => void;
};

function cleanSynopsis(raw?: string | null): string {
  if (!raw) return "";
  return raw.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

/** Wibuku-style borderless search row: 96x132 poster, title, meta, 3-4 line synopsis. */
function SearchResultRowImpl({ anime, onPress }: Props) {
  const prefetch = usePrefetchAnime();
  const title = animeTitle(anime);
  const rawImage = anime.coverImage?.extraLarge || anime.coverImage?.large || "";
  const image = rawImage ? getOptimizedImageUri(rawImage, POSTER_W) : "";
  const format = anime.format ? String(anime.format).replace("_", " ") : "TV";
  const episodes = anime.episodes ? `${anime.episodes} Eps` : "Ongoing";
  const score =
    typeof anime.averageScore === "number" && anime.averageScore > 0
      ? (anime.averageScore / 10).toFixed(1)
      : null;
  const meta = [format, episodes, anime.seasonYear ? String(anime.seasonYear) : null].filter(Boolean).join(" • ");
  const synopsis = cleanSynopsis(anime.description);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={() => {
        prefetch(anime.id);
        onPress();
      }}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.poster}>
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

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        <View style={styles.metaRow}>
          <Text style={styles.meta} numberOfLines={1}>{meta}</Text>
          {score ? (
            <Text style={styles.score}>★ {score}</Text>
          ) : null}
        </View>
        {synopsis ? (
          <Text style={styles.synopsis} numberOfLines={4}>
            {synopsis}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export const SearchResultRow = memo(SearchResultRowImpl);

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 14,
    paddingVertical: 4,
  },
  poster: {
    width: 96,
    height: 132,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#1B1D22",
  },
  body: {
    flex: 1,
    gap: 5,
    minWidth: 0,
  },
  title: {
    color: "#F3F4F6",
    fontFamily: "Nunito-Bold",
    fontSize: 15,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  meta: {
    color: "#9CA3AF",
    fontFamily: "Nunito-Regular",
    fontSize: 12,
  },
  score: {
    color: "#F5C518",
    fontFamily: "Nunito-Bold",
    fontSize: 12,
  },
  synopsis: {
    color: "#9CA3AF",
    fontFamily: "Nunito-Regular",
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 2,
  },
  pressed: { opacity: 0.72 },
});
