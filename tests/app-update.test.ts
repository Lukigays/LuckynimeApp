import { describe, expect, it } from "vitest";
import {
  checkForLuckynimeUpdate,
  compareVersions,
  isReleaseNewer,
  normalizeVersion,
  parseGitHubRelease,
  updateDismissalKey,
} from "../lib/app-update";

describe("Luckynime direct-distribution update logic", () => {
  it("normalizes and compares release tags without treating a suffix as a newer build", () => {
    expect(normalizeVersion("v4.2.1 — Stability")).toBe("4.2.1");
    expect(compareVersions("4.2.1", "4.2")).toBe(1);
    expect(compareVersions("4.2", "4.2.0")).toBe(0);
    expect(isReleaseNewer("4.2.1", "v4.2.1")).toBe(false);
  });

  it("accepts only a trusted Luckynime GitHub APK asset and marks newer releases mandatory", async () => {
    const asset = {
      name: "Luckynime-v5.0.0.apk",
      size: 88_000_000,
      content_type: "application/vnd.android.package-archive",
      browser_download_url:
        "https://github.com/Lukigays/Luckynime-Release/releases/download/v5.0.0/Luckynime-v5.0.0.apk",
    };
    const parsed = parseGitHubRelease({
      tag_name: "v5.0.0",
      name: "v5.0.0",
      html_url: "https://github.com/Lukigays/Luckynime-Release/releases/tag/v5.0.0",
      assets: [asset],
    });
    expect(parsed).toMatchObject({
      version: "5.0.0",
      assetName: "Luckynime-v5.0.0.apk",
      mandatory: true,
    });
    expect(parseGitHubRelease({ tag_name: "v4.2.1" })).toBeNull();
    expect(updateDismissalKey("v4.2.4")).toBe("luckynime.update.dismissed:4.2.4");

    const checkRes = await checkForLuckynimeUpdate("1.0.9", {
      force: true,
      fetcher: async () =>
        new Response(
          JSON.stringify({
            tag_name: "v1.1.0",
            name: "Luckynime v1.1.0",
            html_url: "https://github.com/Lukigays/Luckynime-Release/releases/tag/v1.1.0",
            assets: [
              {
                name: "Luckynime-v1.1.0-arm64.apk",
                size: 52_000_000,
                content_type: "application/vnd.android.package-archive",
                browser_download_url:
                  "https://github.com/Lukigays/Luckynime-Release/releases/download/v1.1.0/Luckynime-v1.1.0-arm64.apk",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        ),
    });

    expect(checkRes.available).toBe(true);
    expect(checkRes.release?.version).toBe("1.1.0");
    expect(checkRes.release?.mandatory).toBe(true);
  });
});
