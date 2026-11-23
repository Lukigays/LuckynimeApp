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
          <Text style={styles.title}>{title}</Text>
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
          <AppIcon name="chevron-right" size={14} color={nothing.muted} />
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
  section: { gap: 12 },
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
  title: {
    color: nothing.white,
    fontFamily: "Nunito-Bold",
    fontSize: 17,
    fontWeight: "700",
  },
  browsePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  browseText: {
    color: nothing.muted,
    fontFamily: "Nunito-SemiBold",
    fontSize: 13,
  },
  rail: {
    gap: 13,
    paddingRight: 18,
  },
});
