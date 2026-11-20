import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "luckynime.subtitle-preferences.v4";
const LEGACY_STORAGE_KEYS = [
  "luckynime.subtitle-preferences.v3",
  "luckynime.subtitle-preferences.v2",
];

export type SubtitleFont = "default" | "monospace" | "serif" | "rounded";

export type SubtitlePreferences = {
  enabled: boolean;
  preferredLanguage: string;
  fontSize: number;
  bgOpacity: number;
  outlineThickness: number;
  fontFamily: SubtitleFont;
  /** Seconds of timing shift. Positive delays subtitles, negative advances them. */
  timeOffset: number;
};

const DEFAULTS: SubtitlePreferences = {
  enabled: true,
  preferredLanguage: "id",
  fontSize: 15,
  bgOpacity: 0,
  outlineThickness: 2,
  fontFamily: "default",
  timeOffset: 0,
};

export const SUBTITLE_OFFSET_MIN = -5;
export const SUBTITLE_OFFSET_MAX = 5;
export const SUBTITLE_OFFSET_STEP = 0.1;

/** Clamps to the supported range and snaps to 0.1s so float drift never
 * shows up as "0.30000000000000004s" in the panel. */
export function clampSubtitleOffset(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const snapped = Math.round(value * 10) / 10;
  return Math.min(SUBTITLE_OFFSET_MAX, Math.max(SUBTITLE_OFFSET_MIN, snapped));
}

export function formatSubtitleOffset(value: number): string {
  const snapped = clampSubtitleOffset(value);
  return `${snapped > 0 ? "+" : ""}${snapped.toFixed(1)}s`;
}

let cached: SubtitlePreferences | null = null;

export async function loadSubtitlePreferences(): Promise<SubtitlePreferences> {
  if (cached) return cached;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = { ...DEFAULTS, ...JSON.parse(raw) } as SubtitlePreferences;
      cached = parsed;
      return parsed;
    }
    for (const legacyKey of LEGACY_STORAGE_KEYS) {
      const legacyRaw = await AsyncStorage.getItem(legacyKey);
      if (legacyRaw) {
        const legacyParsed = JSON.parse(legacyRaw) as Partial<SubtitlePreferences>;
        // Migrate to clean fansub style: automatic Indonesian ("id"), enabled,
        // crisp white text with black outline and NO dark box background (bgOpacity: 0).
        const migrated: SubtitlePreferences = {
          ...DEFAULTS,
          fontFamily: legacyParsed.fontFamily ?? DEFAULTS.fontFamily,
          timeOffset: clampSubtitleOffset(legacyParsed.timeOffset ?? 0),
          enabled: true,
          preferredLanguage: "id",
          bgOpacity: 0,
          outlineThickness: Math.max(2, legacyParsed.outlineThickness ?? 2),
          fontSize: legacyParsed.fontSize && legacyParsed.fontSize >= 14 ? legacyParsed.fontSize : 15,
        };
        cached = migrated;
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(migrated)).catch(() => {});
        return migrated;
      }
    }
  } catch {}
  cached = DEFAULTS;
  return cached;
}

export async function saveSubtitlePreferences(prefs: Partial<SubtitlePreferences>): Promise<SubtitlePreferences> {
  const current = await loadSubtitlePreferences();
  const next = { ...current, ...prefs };
  cached = next;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  return next;
}

export function getSubtitlePreferencesSync(): SubtitlePreferences {
  return cached ?? DEFAULTS;
}

export function resetSubtitlePreferencesCache(): void {
  cached = null;
}

export const SUBTITLE_FONTS: { id: SubtitleFont; label: string; family: string }[] = [
  { id: "default", label: "System", family: "System" },
  { id: "monospace", label: "Mono", family: "monospace" },
  { id: "serif", label: "Serif", family: "serif" },
  { id: "rounded", label: "Rounded", family: "Caveat-Bold" },
];

export const FONT_SIZE_PRESETS = [12, 14, 15, 17, 19, 22];
export const BG_OPACITY_PRESETS = [0, 0.3, 0.55, 0.75, 0.9];
export const OUTLINE_PRESETS = [0, 1, 2, 3, 4];
