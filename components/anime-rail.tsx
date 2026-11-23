import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import type { Anime } from "@/lib/types";
import { AnimeCard } from "@/components/anime-card";
import { AppIcon } from "@/components/app-icon";
import { nothing } from "@/components/nothing-ui";

export function AnimeRail({
  label,
  title,
  items,
  seeAllParams,
}: {
  label?: string;
  title: string;
  items: Anime[];
  seeAllParams?: Record<string, string>;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <View style={styles.headingLeft}>
          <View style={styles.sakuraGem}>
            <View style={styles.sakuraGemCore} />
          </View>
          <View>
            {label ? <Text style={styles.eyebrow}>{label}</Text> : null}
            <Text style={styles.title}>{title}</Text>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Lihat semua ${title}`}
          onPress={() => {
            if (seeAllParams) router.push({ pathname: "/search", params: seeAllParams } as never);
            else router.push("/catalog" as never);
          }}
          style={({ pressed }) => [styles.browsePill, pressed && nothing.pressed]}
          hitSlop={8}
        >
          <Text style={styles.browseText}>Semua</Text>
          <AppIcon name="arrow-right" size={12} color={nothing.sakura} />
        </Pressable>
      </View>
      <FlatList
        horizontal
        data={items}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => <AnimeCard anime={item} />}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={3}
        removeClippedSubviews
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 13 },
  heading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headingLeft: {
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
  sakuraGemCore: {
    width: 6,
    height: 6,
    borderRadius: 2,
    backgroundColor: nothing.red,
    transform: [{ rotate: "45deg" }],
  },
  eyebrow: {
    color: nothing.sakura,
    fontFamily: "SpaceGrotesk-Bold",
    fontSize: 9.5,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  title: {
    color: nothing.white,
    fontFamily: "Nunito-ExtraBold",
    fontSize: 17,
    letterSpacing: -0.3,
  },
  browsePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 99,
    backgroundColor: "rgba(244, 63, 94, 0.11)",
    borderWidth: 1,
    borderColor: "rgba(251, 113, 133, 0.25)",
  },
  browseText: {
    color: nothing.sakura,
    fontFamily: "Nunito-Bold",
    fontSize: 11.5,
  },
  rail: {
    gap: 13,
    paddingRight: 18,
  },
});
