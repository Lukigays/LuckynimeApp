import { describe, expect, it } from "vitest";
import { findActiveCues, parseSubtitle } from "../lib/subtitle-parser";

describe("subtitle-parser clean rendering & deduplication", () => {
  it("prevents boundary overlap and deduplicates identical overlapping cues", () => {
    const vtt = `WEBVTT

00:00:19.380 --> 00:00:21.700
Suhu di daratan akan lebih panas,

00:00:21.700 --> 00:00:26.760
jadi harap berhati-hati terhadap hujan badai
yang tidak terduga di daerah dekat pegunungan.

00:00:21.700 --> 00:00:26.760
jadi harap berhati-hati terhadap hujan badai
yang tidak terduga di daerah dekat pegunungan.
`;
    const parsed = parseSubtitle(vtt, "vtt");
    // At exact transition 21.700s, previous cue ending at 21.700 must NOT linger alongside the new cue.
    const activeAtBoundary = findActiveCues(parsed.cues, 21.7);
    expect(activeAtBoundary).toHaveLength(1);
    expect(activeAtBoundary[0]?.text).toContain("hujan badai");
  });

  it("ignores ASS vector drawing commands so coordinates never leak into subtitles", () => {
    const ass = `[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:04.00,Default,,0,0,0,,{\\p1}m 0 0 l 100 0 100 100 0 100{\\p0}
Dialogue: 0,0:00:01.00,0:00:04.00,Default,,0,0,0,,{\\an8}Halo Takemichi!
`;
    const parsed = parseSubtitle(ass, "ass");
    expect(parsed.cues).toHaveLength(1);
    expect(parsed.cues[0]?.text).toBe("Halo Takemichi!");
  });
});
