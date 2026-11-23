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

export function NativeHeader({ title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <View style={styles.header}>
      <Text style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Text>
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
      style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
    >
      <AppIcon name="magnify" color={nothing.white} size={20} />
    </Pressable>
  );
}

export function NotificationAction({ onPress }: { onPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Notifikasi"
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
    >
      <AppIcon name="bell" color={nothing.white} size={20} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: nothing.black },
  scroll: { paddingHorizontal: 16, paddingBottom: 88, gap: 18, flexGrow: 1 },
  fill: { flex: 1 },
  header: {
    minHeight: 52,
    paddingTop: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  headerTitle: {
    flex: 1,
    color: nothing.white,
    fontFamily: "Nunito-Bold",
    fontSize: 21,
    fontWeight: "700",
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: nothing.surface,
  },
  pressed: nothing.pressed,
});
