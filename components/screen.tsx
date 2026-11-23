import type { PropsWithChildren, ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { AppIcon } from "@/components/app-icon";
import { nothing } from "@/components/nothing-ui";

export function NativeScreen({
  children,
  scroll = true,
  fullscreen = false,
  style,
}: PropsWithChildren<{ scroll?: boolean; fullscreen?: boolean; style?: ViewStyle }>) {
  const bg = style?.backgroundColor ? { backgroundColor: style.backgroundColor } : null;
  const content = scroll ? (
    <ScrollView
      style={[styles.fill, bg]}
      contentContainerStyle={[styles.scroll, style]}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.fill, style]}>{children}</View>
  );
  return (
    <SafeAreaView edges={fullscreen ? [] : ["top", "left", "right"]} style={[styles.safe, bg]}>
      {content}
    </SafeAreaView>
  );
}

export function NativeHeader({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        <View style={styles.accentBlade} />
        <View style={styles.headerText}>
          {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
          <Text style={styles.headerTitle}>{title}</Text>
        </View>
      </View>
      {action}
    </View>
  );
}

export function SearchAction() {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Cari anime"
      onPress={() => router.push("/search" as never)}
      style={({ pressed }) => [styles.searchButton, pressed && styles.pressed]}
    >
      <AppIcon name="magnify" color={nothing.sakura} size={20} />
    </Pressable>
  );
}

export function NotificationAction({ onPress }: { onPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Notifikasi"
      onPress={onPress}
      style={({ pressed }) => [styles.searchButton, pressed && styles.pressed]}
    >
      <AppIcon name="bell" color={nothing.sakura} size={20} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: nothing.black },
  scroll: { paddingHorizontal: 18, paddingBottom: 118, gap: 24, flexGrow: 1 },
  fill: { flex: 1 },
  header: {
    minHeight: 64,
    paddingTop: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  accentBlade: {
    width: 4,
    height: 28,
    borderRadius: 99,
    backgroundColor: nothing.red,
  },
  headerText: { gap: 2, flex: 1 },
  eyebrow: {
    color: nothing.sakura,
    fontFamily: "SpaceGrotesk-Bold",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  headerTitle: {
    color: nothing.white,
    fontFamily: "Nunito-Black",
    fontSize: 25,
    fontWeight: "900",
    letterSpacing: -0.6,
  },
  searchButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: nothing.lineStrong,
    backgroundColor: "rgba(244, 63, 94, 0.10)",
  },
  pressed: nothing.pressed,
});
