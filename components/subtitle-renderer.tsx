import { useMemo } from "react";
import { Platform, StyleSheet, Text, useWindowDimensions, View } from "react-native";
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
  { x: -1.05, y: -1.05 },
  { x: 1.05, y: -1.05 },
  { x: -1.05, y: 1.05 },
  { x: 1.05, y: 1.05 },
];

/**
 * Normalizes raw cue text and splits long sentences into evenly balanced lines
 * sized for the current viewport so words never orphan in the middle line and
 * outline clones never wrap differently from foreground text.
 */
export function formatSubtitleLines(rawText: string, maxCharsPerLine: number): string[] {
  const normalized = rawText
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
  if (!normalized) return [];

  const rawLines = normalized
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  if (rawLines.length === 0) return [];

  // Preserve explicit speaker turns (e.g. "- Tunggu!\n- Apa itu?") as separate segments,
  // otherwise merge mid-sentence hard breaks from upstream VTT/SRT files so we can wrap cleanly
  // for the actual phone width (portrait vs landscape).
  const isSpeakerDialogue =
    rawLines.length > 1 && rawLines.some((line) => /^[-–—•]\s*/.test(line));

  const paragraphs = isSpeakerDialogue ? rawLines : [rawLines.join(" ")];
  const safeMax = Math.max(20, maxCharsPerLine);
  const result: string[] = [];

  for (const paragraph of paragraphs) {
    if (paragraph.length <= safeMax) {
      result.push(paragraph);
      continue;
    }

    const words = paragraph.split(" ").filter(Boolean);
    if (words.length <= 1) {
      result.push(paragraph);
      continue;
    }

    const lineCount = Math.min(3, Math.max(2, Math.ceil(paragraph.length / safeMax)));
    const targetLen = Math.ceil(paragraph.length / lineCount);

    let startIdx = 0;
    for (let lineIdx = 0; lineIdx < lineCount; lineIdx++) {
      if (lineIdx === lineCount - 1) {
        const rest = words.slice(startIdx).join(" ");
        if (rest) result.push(rest);
        break;
      }

      let bestEnd = startIdx + 1;
      let bestScore = Infinity;
      let runningLen = 0;

      for (let i = startIdx; i < words.length - (lineCount - 1 - lineIdx); i++) {
        runningLen += (i === startIdx ? 0 : 1) + words[i].length;
        const dist = Math.abs(runningLen - targetLen);
        // Penalize exceeding safeMax so individual lines don't soft-wrap a second time.
        const overflowPenalty = runningLen > safeMax ? (runningLen - safeMax) * 4 : 0;
        const score = dist + overflowPenalty;
        if (score <= bestScore) {
          bestScore = score;
          bestEnd = i + 1;
        }
        if (runningLen > safeMax + 8) break;
      }

      result.push(words.slice(startIdx, bestEnd).join(" "));
      startIdx = bestEnd;
    }
  }

  return result;
}

export function SubtitleRenderer({ cues, preferences, fullscreen = false }: Props) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  // Deduplicate identical cues and cap to at most 2 simultaneous cues.
  const activeCues = useMemo(() => {
    const seen = new Set<string>();
    const unique: SubtitleCue[] = [];
    for (const cue of cues) {
      const key = cue.text.replace(/\s+/g, " ").trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      unique.push(cue);
      if (unique.length >= 2) break;
    }
    return unique;
  }, [cues]);

  if (!preferences.enabled || activeCues.length === 0) return null;

  const fontFamily = resolveFont(preferences.fontFamily);
  const bgAlpha = preferences.bgOpacity;
  const outline = preferences.outlineThickness;

  // Slightly more compact in inline portrait 16:9 player, crisp & roomy in fullscreen landscape.
  const fontSize = fullscreen
    ? Math.round(preferences.fontSize * 1.2)
    : Math.max(12, Math.round(preferences.fontSize * 0.92));
  const lineHeight = Math.round(fontSize * 1.34);
  const strokeScale = Math.max(0.7, Math.min(1.5, outline * 0.55));

  // Explicit integer pixel width guarantees stroke & fill <Text> nodes measure identically on Android Yoga.
  const effectiveViewportWidth = fullscreen
    ? Math.max(windowWidth, windowHeight)
    : windowWidth;
  const horizontalMargin = fullscreen ? 48 : 28;
  const boxWidth = Math.max(200, Math.floor(effectiveViewportWidth - horizontalMargin));

  // Estimate comfortable characters per line for bold sans-serif (~0.56 * fontSize average glyph width).
  const approxCharWidth = fontSize * 0.56;
  const maxCharsPerLine = Math.max(
    24,
    Math.min(fullscreen ? 64 : 40, Math.floor((boxWidth - 16) / approxCharWidth))
  );

  return (
    <View style={styles.container} pointerEvents="none">
      {activeCues.map((cue) => {
        const fontStyle = cue.style?.italic ? ("italic" as const) : ("normal" as const);
        const lines = formatSubtitleLines(cue.text, maxCharsPerLine);
        if (lines.length === 0) return null;

        return (
          <View
            key={cue.id}
            style={[
              styles.cueGroup,
              bgAlpha > 0
                ? {
                    backgroundColor: `rgba(0,0,0,${bgAlpha})`,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 6,
                    maxWidth: boxWidth,
                  }
                : { width: boxWidth },
            ]}
          >
            {lines.map((line, lineIdx) => {
              const lineWidthStyle = bgAlpha > 0 ? undefined : { width: boxWidth };
              return (
                <View key={lineIdx} style={[styles.lineRow, lineWidthStyle]}>
                  {outline > 0 && Platform.OS !== "web" && bgAlpha === 0
                    ? STROKE_OFFSETS.map((off, idx) => (
                        <Text
                          key={idx}
                          importantForAccessibility="no"
                          accessible={false}
                          textBreakStrategy="simple"
                          style={[
                            styles.cueText,
                            styles.strokeClone,
                            {
                              width: boxWidth,
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
                          {line}
                        </Text>
                      ))
                    : null}
                  <Text
                    textBreakStrategy="simple"
                    style={[
                      styles.cueText,
                      bgAlpha > 0 ? null : { width: boxWidth },
                      {
                        fontSize,
                        lineHeight,
                        fontFamily,
                        fontStyle,
                        textShadowRadius: outline > 0 ? Math.max(2.5, outline * 1.4) : 0,
                      },
                      Platform.OS === "web" && outline > 0
                        ? ({
                            textShadow:
                              "-1.2px -1.2px 0 #000, 1.2px -1.2px 0 #000, -1.2px 1.2px 0 #000, 1.2px 1.2px 0 #000, 0 1.5px 3px rgba(0,0,0,0.92)",
                          } as any)
                        : null,
                    ]}
                  >
                    {line}
                  </Text>
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 3,
  },
  cueGroup: {
    alignItems: "center",
    justifyContent: "flex-end",
  },
  lineRow: {
    position: "relative",
    alignItems: "center",
  },
  cueText: {
    color: "#FFFFFF",
    textAlign: "center",
    fontWeight: "700",
    letterSpacing: 0.12,
    includeFontPadding: false,
    textShadowColor: "rgba(0,0,0,0.96)",
    textShadowOffset: { width: 0, height: 1 },
  },
  strokeClone: {
    position: "absolute",
    top: 0,
    left: 0,
    color: "#000000",
    textShadowColor: "#000000",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 1.2,
  },
});
