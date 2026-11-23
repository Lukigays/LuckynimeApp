import type { ReactNode } from "react";
import { Platform, Pressable, StyleSheet, Text, View, type GestureResponderEvent, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import * as Haptics from "expo-haptics";
import { AppIcon } from "@/components/app-icon";
import { useTheme, lightColors, darkColors } from "@/providers/theme-provider";

/**
 * Kuro-Sakura Design Tokens (Luckynime v2.0)
 * Warm Charcoal-Obsidian + Crimson Flame & Sakura Coral.
 */
export const nothing = {
  black: "#0D080B",
  surface: "#180F15",
  raised: "#23161F",
  panel: "#2C1B26",
  line: "rgba(251, 113, 133, 0.16)",
  lineStrong: "rgba(244, 63, 94, 0.35)",
  white: "#FFF5F7",
  muted: "#C4A6B3",
  dim: "#7F6270",
  red: "#F43F5E",
  crimson: "#E11D48",
  sakura: "#FB7185",
  sakuraSoft: "rgba(251, 113, 133, 0.14)",
  crimsonSoft: "rgba(244, 63, 94, 0.16)",
  amber: "#FBBF24",
  green: "#34D399",
  font: "SpaceGrotesk-Regular",
  fontMedium: "SpaceGrotesk-Medium",
  fontBold: "SpaceGrotesk-SemiBold",
  mono: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  pressed: { opacity: 0.84, transform: [{ scale: 0.975 }] } as const,
  pressedSubtle: { opacity: 0.80 } as const,
  trackingTight: -0.65 as const,
  trackingNormal: 0.3 as const,
  trackingWide: 0.6 as const,
} as const;

export function useThemeColors() {
  const { isDark } = useTheme();
  const c = isDark ? darkColors : lightColors;
  return {
    black: c.background,
    background: c.background,
    surface: c.surface,
    raised: c.raised,
    line: c.line,
    white: c.text,
    text: c.text,
    muted: c.muted,
    dim: c.dim,
    red: c.accent,
    green: isDark ? "#34D399" : "#059669",
    card: c.card,
    cardBorder: c.cardBorder,
  };
}

export function DotLabel({
  children,
  tone = "muted",
  style,
}: {
  children: ReactNode;
  tone?: "muted" | "white" | "red" | "signal" | "live";
  style?: StyleProp<TextStyle>;
}) {
  const color =
    tone === "red" || tone === "signal" || tone === "live"
      ? nothing.sakura
      : tone === "white"
        ? nothing.white
        : nothing.muted;
  const text = typeof children === "string" ? children.trim().toLowerCase() : "";
  if (text === "download" || text === "offline") {
    return (
      <View style={styles.downloadLabel}>
        <AppIcon name="download" size={12} color={color} />
        <Text style={[styles.dotLabel, { color }, style]}>
          {children === "OFFLINE" ? "DOWNLOADS" : children}
        </Text>
      </View>
    );
  }
  return <Text style={[styles.dotLabel, { color }, style]}>{children}</Text>;
}

export function LuckynimeMark({ size = 34, inverted = false }: { size?: number; inverted?: boolean }) {
  const bg = inverted ? nothing.red : nothing.surface;
  const fg = "#FFF5F7";
  return (
    <View
      style={[
        styles.mark,
        {
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.34),
          backgroundColor: bg,
          borderColor: inverted ? nothing.sakura : nothing.lineStrong,
        },
      ]}
    >
      <View style={[styles.markOrbit, { borderColor: fg }]} />
      <View style={[styles.markDot, { backgroundColor: inverted ? "#FFF5F7" : nothing.red }]} />
    </View>
  );
}

export const NothingMark = LuckynimeMark;

export function NothingCard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function NothingButton({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
}: {
  label: string;
  onPress: (event: GestureResponderEvent) => void;
  variant?: "primary" | "outline" | "danger";
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={(event) => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress(event);
      }}
      style={({ pressed }) => [
        styles.button,
        variant === "primary" && styles.primaryButton,
        variant === "outline" && styles.outlineButton,
        variant === "danger" && styles.dangerButton,
        disabled && styles.disabledButton,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.buttonText, variant === "primary" ? styles.primaryButtonText : styles.outlineButtonText]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Signal({ label, tone = "live" }: { label: string; tone?: "live" | "signal" | "muted" }) {
  const color = tone === "signal" || tone === "live" ? nothing.red : nothing.muted;
  return (
    <View style={styles.signalRow}>
      <View style={[styles.signalDot, { backgroundColor: color }]} />
      <Text style={[styles.signalText, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dotLabel: { fontFamily: "SpaceGrotesk-SemiBold", fontSize: 10.5, fontWeight: "800", letterSpacing: 0.9, textTransform: "uppercase" },
  downloadLabel: { flexDirection: "row", alignItems: "center", gap: 5 },
  mark: { alignItems: "center", justifyContent: "center", borderWidth: 1, overflow: "hidden" },
  markOrbit: { width: "54%", height: "54%", borderWidth: 2, borderRadius: 99, opacity: 0.92 },
  markDot: { width: 5, height: 5, borderRadius: 99, position: "absolute", right: "22%", bottom: "22%" },
  card: {
    backgroundColor: nothing.surface,
    borderWidth: 1,
    borderColor: nothing.line,
    borderRadius: 16,
    overflow: "hidden",
  },
  button: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    borderRadius: 14,
    paddingHorizontal: 18,
    borderWidth: 1,
  },
  primaryButton: {
    backgroundColor: nothing.red,
    borderColor: nothing.sakura,
  },
  outlineButton: {
    backgroundColor: "rgba(244, 63, 94, 0.08)",
    borderColor: nothing.lineStrong,
  },
  dangerButton: {
    backgroundColor: "rgba(239, 68, 68, 0.14)",
    borderColor: "rgba(239, 68, 68, 0.50)",
  },
  disabledButton: { opacity: 0.45 },
  pressed: nothing.pressed,
  buttonText: { fontFamily: "Nunito-ExtraBold", fontSize: 13, fontWeight: "900", letterSpacing: 0.35 },
  primaryButtonText: { color: "#FFFFFF" },
  outlineButtonText: { color: nothing.white },
  signalRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  signalDot: { width: 7, height: 7, borderRadius: 4 },
  signalText: { fontFamily: "SpaceGrotesk-SemiBold", fontSize: 10, fontWeight: "700", letterSpacing: 0.9 },
});
