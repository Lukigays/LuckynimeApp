import { Pressable, StyleSheet, Text, View } from "react-native";
import { useFirstRunImport } from "@/hooks/use-first-run-import";
import { PROVIDER_LABELS } from "@/components/provider-mark";
import { nothing } from "@/components/nothing-ui";

export function FirstRunImportPrompt() {
  const firstRun = useFirstRunImport();
  if (!firstRun.shouldPrompt || !firstRun.provider) return null;
  const label = PROVIDER_LABELS[firstRun.provider];
  return (
    <View style={styles.card}>
      <View style={styles.copy}>
        <Text style={styles.title}>Bring your {label} list here</Text>
        <Text style={styles.detail}>One import seeds favorites with list statuses (Watching, Plan to Watch, Completed, …), episode progress and scores. Skip keeps this device as-is.</Text>
        {firstRun.importError ? (
          <Text style={styles.error}>
            {firstRun.importError instanceof Error
              ? firstRun.importError.message.toUpperCase()
              : "IMPORT COULD NOT COMPLETE."}
          </Text>
        ) : null}
      </View>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          disabled={firstRun.importing}
          onPress={() => void firstRun.runImport().catch(() => {})}
          style={[styles.primary, firstRun.importing && styles.disabled]}
        >
          <Text style={styles.primaryText}>{firstRun.importing ? "IMPORTING" : "IMPORT"}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={firstRun.dismiss} style={styles.skip}>
          <Text style={styles.skipText}>SKIP</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 16,
    backgroundColor: "rgba(25, 16, 22, 0.72)",
  },
  copy: { gap: 4 },
  title: { color: "#FFFFFF", fontSize: 14, fontFamily: "Nunito-Black" },
  detail: { color: "#C4A6B3", fontSize: 12, fontFamily: "Nunito-SemiBold", lineHeight: 17 },
  error: { color: "#EF4444", fontSize: 11, fontFamily: "Nunito-Bold" },
  actions: { flexDirection: "row", gap: 8 },
  primary: {
    minHeight: 34,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: "#FB7185",
  },
  disabled: { opacity: 0.5 },
  primaryText: { color: "#0D080B", fontSize: 11, fontFamily: "Nunito-Black" },
  skip: {
    minHeight: 34,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  skipText: { color: "#C4A6B3", fontSize: 11, fontFamily: "Nunito-Bold" },
});
