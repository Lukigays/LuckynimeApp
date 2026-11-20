import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { SubtitleCue } from "@/lib/subtitle-parser";
import type { SubtitlePreferences } from "@/lib/subtitle-preferences";
import { SUBTITLE_FONTS } from "@/lib/subtitle-preferences";

type Props = {
  cues: SubtitleCue[];
  preferences: SubtitlePreferences;
};

function resolveFont(pref: SubtitlePreferences["fontFamily"]): string | undefined {
  const match = SUBTITLE_FONTS.find((f) => f.id === pref);
  if (!match || match.id === "default") return undefined;
  return match.family;
}

export function SubtitleRenderer({ cues, preferences }: Props) {
  const activeCues = useMemo(() => cues.slice(0, 2), [cues]);

  if (!preferences.enabled || activeCues.length === 0) return null;

  const fontFamily = resolveFont(preferences.fontFamily);
  const bgAlpha = preferences.bgOpacity;
  const outline = preferences.outlineThickness;

  return (
    <View style={styles.container} pointerEvents="none">
      {activeCues.map((cue) => (
        <View
          key={cue.id}
          style={[
            styles.cueWrapper,
            {
              backgroundColor: `rgba(0,0,0,${bgAlpha})`,
              paddingHorizontal: outline > 0 ? 10 : 6,
            },
          ]}
        >
          <Text
            style={[
              styles.cueText,
              {
                fontSize: preferences.fontSize,
                lineHeight: Math.round(preferences.fontSize * 1.42),
                fontFamily,
                textShadowRadius: Math.max(2, outline * 1.5),
              },
            ]}
          >
            {cue.text}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    paddingHorizontal: 14,
    alignItems: "center",
    gap: 4,
  },
  cueWrapper: {
    maxWidth: "94%",
    borderRadius: 4,
    paddingVertical: 3,
  },
  cueText: {
    color: "#FFFFFF",
    textAlign: "center",
    fontWeight: "700",
    lineHeight: 20,
    textShadowColor: "rgba(0,0,0,0.96)",
    textShadowOffset: { width: 0, height: 1 },
  },
});
