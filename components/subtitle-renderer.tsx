import { useMemo } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import type { SubtitleCue } from "@/lib/subtitle-parser";
import type { SubtitlePreferences } from "@/lib/subtitle-preferences";
import { SUBTITLE_FONTS } from "@/lib/subtitle-preferences";

type Props = {
  cues: SubtitleCue[];
  preferences: SubtitlePreferences;
  fullscreen?: boolean;
};

function resolveFont(pref: SubtitlePreferences["fontFamily"]): string | undefined {
  const match = SUBTITLE_FONTS.find((f) => f.id === pref);
  if (!match || match.id === "default") return undefined;
  return match.family;
}

const STROKE_OFFSETS = [
  { x: -1.25, y: -1.25 },
  { x: 1.25, y: -1.25 },
  { x: -1.25, y: 1.25 },
  { x: 1.25, y: 1.25 },
];

export function SubtitleRenderer({ cues, preferences, fullscreen = false }: Props) {
  const activeCues = useMemo(() => cues.slice(0, 2), [cues]);

  if (!preferences.enabled || activeCues.length === 0) return null;

  const fontFamily = resolveFont(preferences.fontFamily);
  const bgAlpha = preferences.bgOpacity;
  const outline = preferences.outlineThickness;
  const fontSize = fullscreen
    ? Math.round(preferences.fontSize * 1.26)
    : preferences.fontSize;
  const lineHeight = Math.round(fontSize * 1.36);
  const strokeScale = Math.max(0.75, outline / 2);

  return (
    <View style={styles.container} pointerEvents="none">
      {activeCues.map((cue) => {
        const fontStyle = cue.style?.italic ? ("italic" as const) : ("normal" as const);
        return (
          <View
            key={cue.id}
            style={[
              styles.cueWrapper,
              bgAlpha > 0
                ? {
                    backgroundColor: `rgba(0,0,0,${bgAlpha})`,
                    paddingHorizontal: 10,
                    paddingVertical: 3,
                    borderRadius: 4,
                  }
                : null,
            ]}
          >
            {outline > 0 && Platform.OS !== "web"
              ? STROKE_OFFSETS.map((off, idx) => (
                  <Text
                    key={idx}
                    importantForAccessibility="no"
                    accessible={false}
                    style={[
                      styles.cueText,
                      styles.strokeClone,
                      {
                        fontSize,
                        lineHeight,
                        fontFamily,
                        fontStyle,
                        transform: [
                          { translateX: off.x * strokeScale },
                          { translateY: off.y * strokeScale },
                        ],
                      },
                    ]}
                  >
                    {cue.text}
                  </Text>
                ))
              : null}
            <Text
              style={[
                styles.cueText,
                {
                  fontSize,
                  lineHeight,
                  fontFamily,
                  fontStyle,
                  textShadowRadius: outline > 0 ? Math.max(3, outline * 1.6) : 0,
                },
                Platform.OS === "web" && outline > 0
                  ? ({
                      textShadow:
                        "-1.3px -1.3px 0 #000, 1.3px -1.3px 0 #000, -1.3px 1.3px 0 #000, 1.3px 1.3px 0 #000, 0 2px 4px rgba(0,0,0,0.9)",
                    } as any)
                  : null,
              ]}
            >
              {cue.text}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    paddingHorizontal: 16,
    alignItems: "center",
    gap: 2,
  },
  cueWrapper: {
    maxWidth: "92%",
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  cueText: {
    color: "#FFFFFF",
    textAlign: "center",
    fontWeight: "700",
    letterSpacing: 0.15,
    textShadowColor: "rgba(0,0,0,0.96)",
    textShadowOffset: { width: 0, height: 1 },
  },
  strokeClone: {
    position: "absolute",
    color: "#000000",
    textShadowColor: "#000000",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 1.5,
  },
});
