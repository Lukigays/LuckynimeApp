import type { ReactNode } from "react";
import { Platform, Pressable, StyleSheet, Text, View, type GestureResponderEvent, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import * as Haptics from "expo-haptics";
import { AppIcon } from "@/components/app-icon";
import { useTheme, lightColors, darkColors } from "@/providers/theme-provider";

/**
 * Wibuku Clean Matte Dark Design Tokens (Luckynime v2.1)
 * Minimalist, calm, zero-clutter dark charcoal with clean white & gold accents.
 */
export const nothing = {
  black: "#121316",
  surface: "#1B1D22",
  raised: "#23262F",
  panel: "#2A2E39",
  line: "rgba(255, 255, 255, 0.08)",
  lineStrong: "rgba(255, 255, 255, 0.16)",
  white: "#F3F4F6",
  muted: "#9CA3AF",
  dim: "#6B7280",
  red: "#EF4444",
  crimson: "#EF4444",
  sakura: "#F3F4F6",
  sakuraSoft: "rgba(255, 255, 255, 0.08)",
  crimsonSoft: "rgba(255, 255, 255, 0.10)",
  amber: "#F5C518",
  green: "#10B981",
  font: "Nunito-Regular",
  fontMedium: "Nunito-SemiBold",
  fontBold: "Nunito-Bold",
  mono: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  pressed: { opacity: 0.78 } as const,
  pressedSubtle: { opacity: 0.72 } as const,
  trackingTight: -0.3 as const,
  trackingNormal: 0 as const,
  trackingWide: 0.2 as const,
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
    red: "#EF4444",
    green: isDark ? "#10B981" : "#059669",
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
    tone === "red" || tone === "signal"
      ? nothing.red
      : tone === "live" || tone === "white"
        ? nothing.white
        : nothing.muted;
  const text = typeof children === "string" ? children.trim().toLowerCase() : "";
  if (text === "download" || text === "offline") {
    return (
      <View style={styles.downloadLabel}>
        <AppIcon name="download" size={12} color={color} />
        <Text style={[styles.dotLabel, { color }, style]}>
          {children === "OFFLINE" ? "Unduhan" : children}
        </Text>
      </View>
    );
  }
  return <Text style={[styles.dotLabel, { color }, style]}>{children}</Text>;
}

export function LuckynimeMark({ size = 34, inverted = false }: { size?: number; inverted?: boolean }) {
  const bg = inverted ? "#FFFFFF" : nothing.raised;
  const fg = inverted ? "#121316" : "#FFFFFF";
  return (
    <View
      style={[
        styles.mark,
        {
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.3),
          backgroundColor: bg,
          borderColor: nothing.line,
        },
      ]}
    >
      <View style={[styles.markOrbit, { borderColor: fg }]} />
      <View style={[styles.markDot, { backgroundColor: nothing.amber }]} />
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
  const color = tone === "signal" ? nothing.red : tone === "live" ? nothing.green : nothing.muted;
  return (
    <View style={styles.signalRow}>
      <View style={[styles.signalDot, { backgroundColor: color }]} />
      <Text style={[styles.signalText, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dotLabel: { fontFamily: "Nunito-SemiBold", fontSize: 12, fontWeight: "600" },
  downloadLabel: { flexDirection: "row", alignItems: "center", gap: 5 },
  mark: { alignItems: "center", justifyContent: "center", borderWidth: 1, overflow: "hidden" },
  markOrbit: { width: "52%", height: "52%", borderWidth: 2, borderRadius: 99 },
  markDot: { width: 5, height: 5, borderRadius: 99, position: "absolute", right: "22%", bottom: "22%" },
  card: {
    backgroundColor: nothing.surface,
    borderRadius: 14,
    overflow: "hidden",
  },
  button: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    borderRadius: 999,
    paddingHorizontal: 18,
  },
  primaryButton: {
    backgroundColor: "#FFFFFF",
  },
  outlineButton: {
    backgroundColor: nothing.raised,
  },
  dangerButton: {
    backgroundColor: "rgba(239, 68, 68, 0.16)",
  },
  disabledButton: { opacity: 0.45 },
  pressed: nothing.pressed,
  buttonText: { fontFamily: "Nunito-Bold", fontSize: 13.5, fontWeight: "700" },
  primaryButtonText: { color: "#121316" },
  outlineButtonText: { color: nothing.white },
  signalRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  signalDot: { width: 6, height: 6, borderRadius: 3 },
  signalText: { fontFamily: "Nunito-SemiBold", fontSize: 11.5, fontWeight: "600" },
});
