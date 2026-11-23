import { View, StyleSheet } from "react-native";

const PROVIDER_COLORS: Record<string, string> = {
  momo: "#9CA3AF",
  niko: "#F5C518",
};

export function ProviderIcon({ provider, size = 22 }: { provider?: string; size?: number }) {
  const key = String(provider || "").trim().toLowerCase();
  const color = PROVIDER_COLORS[key] || "#EF4444";

  return (
    <View style={[styles.icon, { width: size, height: size, borderRadius: size * 0.28, backgroundColor: color }]}>
      <View style={[styles.innerRing, { borderColor: "rgba(255,255,255,0.3)" }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  icon: { alignItems: "center", justifyContent: "center" },
  innerRing: { width: "56%", height: "56%", borderWidth: 1.5, borderRadius: 99 },
});
