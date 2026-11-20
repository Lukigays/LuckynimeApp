import { describe, expect, it, beforeEach, vi } from "vitest";
import { parseSubtitle, matchSubtitleTrack } from "../lib/subtitle-parser";
import {
  getSubtitlePreferencesSync,
  loadSubtitlePreferences,
  resetSubtitlePreferencesCache,
  saveSubtitlePreferences,
} from "../lib/subtitle-preferences";

const mockStore = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (key: string) => mockStore.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      mockStore.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      mockStore.delete(key);
    }),
  },
}));

describe("Wibuku-style player & clean white Indonesian subtitles", () => {
  beforeEach(() => {
    mockStore.clear();
    resetSubtitlePreferencesCache();
  });

  it("defaults to automatic Indonesian subtitles with clean white outline and 0 background opacity", async () => {
    const syncDefaults = getSubtitlePreferencesSync();
    expect(syncDefaults.enabled).toBe(true);
    expect(syncDefaults.preferredLanguage).toBe("id");
    expect(syncDefaults.bgOpacity).toBe(0);
    expect(syncDefaults.outlineThickness).toBeGreaterThanOrEqual(2);

    const loaded = await loadSubtitlePreferences();
    expect(loaded.enabled).toBe(true);
    expect(loaded.preferredLanguage).toBe("id");
    expect(loaded.bgOpacity).toBe(0);
  });

  it("migrates legacy v3 boxed dark-background prefs to clean white bgOpacity=0", async () => {
    mockStore.set(
      "luckynime.subtitle-preferences.v3",
      JSON.stringify({
        enabled: false,
        preferredLanguage: "en",
        fontSize: 16,
        bgOpacity: 0.55,
        outlineThickness: 1,
        fontFamily: "default",
        timeOffset: 0,
      }),
    );

    const migrated = await loadSubtitlePreferences();
    expect(migrated.enabled).toBe(true);
    expect(migrated.preferredLanguage).toBe("id");
    expect(migrated.bgOpacity).toBe(0);
    expect(migrated.outlineThickness).toBe(2);
    expect(migrated.fontSize).toBe(16);

    // Subsequent explicit user changes in v4 persist normally
    await saveSubtitlePreferences({ ...migrated, fontSize: 18 });
    const reloaded = await loadSubtitlePreferences();
    expect(reloaded.fontSize).toBe(18);
  });

  it("prioritizes Indonesian track automatically when matching subtitle tracks", () => {
    const tracks = [
      { url: "https://cdn.example/en.vtt", lang: "en", label: "English", default: true },
      { url: "https://luckynime-api.vercel.app/api/v1/proxy?url=sub.vtt&translate=id", lang: "id", label: "Indonesian" },
    ];
    const matched = matchSubtitleTrack(tracks, "id");
    expect(matched?.lang).toBe("id");
    expect(matched?.url).toContain("translate=id");
  });

  it("detects italic tags in VTT and SRT cues while stripping HTML tags cleanly", () => {
    const vtt = [
      "WEBVTT",
      "",
      "00:00:04.000 --> 00:00:07.500",
      "<i>akhirnya dibuka.</i>",
    ].join("\n");
    const parsedVtt = parseSubtitle(vtt, "vtt");
    expect(parsedVtt.cues).toHaveLength(1);
    expect(parsedVtt.cues[0].text).toBe("akhirnya dibuka.");
    expect(parsedVtt.cues[0].style?.italic).toBe(true);

    const srt = [
      "1",
      "00:00:04,000 --> 00:00:07,500",
      "Normal line",
    ].join("\n");
    const parsedSrt = parseSubtitle(srt, "srt");
    expect(parsedSrt.cues).toHaveLength(1);
    expect(parsedSrt.cues[0].text).toBe("Normal line");
    expect(parsedSrt.cues[0].style?.italic).toBeUndefined();
  });
});
