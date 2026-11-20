import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeModules, Platform } from "react-native";
import { supabase } from "@/lib/supabase";

export const LUCKYNIME_LATEST_RELEASE_URL =
  "https://api.github.com/repos/Lukigays/Luckynime-Release/releases/latest";
export const UPDATE_CHECK_CACHE_KEY = "luckynime.update.latest-release.v3";
export const UPDATE_CHECK_TTL_MS = 6 * 60 * 60 * 1000;

export const TRUSTED_RELEASE_DOWNLOAD_PREFIXES = [
  "/Lukigays/Luckynime-Release/releases/download/",
  "/Lukigays/LuckynimeApp/releases/download/",
] as const;

// ── ABI / Architecture helpers ──────────────────────────────────────────────

export type ApkAbi = "arm64-v8a" | "armeabi-v7a" | "x86_64" | "universal";

/** Canonical order for display + recommendation priority. */
export const ABI_PRIORITY: ApkAbi[] = ["arm64-v8a", "armeabi-v7a", "x86_64", "universal"];

const ABI_LABELS: Record<ApkAbi, string> = {
  "arm64-v8a":   "ARM64 (64-bit)",
  "armeabi-v7a": "ARM (32-bit)",
  "x86_64":      "x86_64 (emulator/PC)",
  universal:     "Universal",
};

const ABI_PATTERNS: Array<{ abi: ApkAbi; pattern: RegExp }> = [
  { abi: "arm64-v8a",   pattern: /arm64(?:[-_]?v8a)?/i },
  { abi: "armeabi-v7a", pattern: /armeabi(?:[-_]?v7a)?|arm32/i },
  { abi: "x86_64",      pattern: /x86_64|x86-64/i },
  { abi: "universal",   pattern: /universal/i },
];

export function detectAssetAbi(assetName: string): ApkAbi | null {
  for (const { abi, pattern } of ABI_PATTERNS) {
    if (pattern.test(assetName)) return abi;
  }
  return null;
}

export function abiLabel(abi: ApkAbi | null): string {
  if (!abi) return "Unknown";
  return ABI_LABELS[abi];
}

/** Returns the device's primary supported ABI (android only). */
export async function getDeviceAbi(): Promise<ApkAbi | null> {
  if (Platform.OS !== "android") return null;
  try {
    const constants = NativeModules.PlatformConstants as
      | { CPU_ABI?: string; CPU_ABI2?: string }
      | undefined;
    const raw = constants?.CPU_ABI ?? "";
    if (/arm64|aarch64/i.test(raw)) return "arm64-v8a";
    if (/armeabi/i.test(raw)) return "armeabi-v7a";
    if (/x86_64/i.test(raw)) return "x86_64";
    return null;
  } catch {
    return null;
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

export type ApkAsset = {
  name: string;
  size: number;
  downloadUrl: string;
  abi: ApkAbi | null;
};

export type AppRelease = {
  version: string;
  name: string;
  releaseUrl: string;
  /** All trusted APK assets for this release (may include multiple ABIs). */
  assets: ApkAsset[];
  /** Pre-selected asset (device ABI or fallback). */
  downloadUrl: string;
  assetName: string;
  assetSize: number;
  publishedAt?: string;
  body?: string;
  mandatory?: boolean;
};

type CachedRelease = { fetchedAt: number; release: AppRelease };

// ── Parsing helpers ──────────────────────────────────────────────────────────

export function normalizeVersion(value?: string | null) {
  const cleaned = String(value ?? "").trim().replace(/^v/i, "");
  const match = cleaned.match(/\d+(?:\.\d+){0,2}/);
  return match ? match[0] : "0.0.0";
}

export function compareVersions(left?: string | null, right?: string | null) {
  const a = normalizeVersion(left).split(".").map(Number);
  const b = normalizeVersion(right).split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference > 0 ? 1 : -1;
  }
  return 0;
}

export function isTrustedReleaseDownloadUrl(downloadUrl: string): boolean {
  try {
    const parsed = new URL(downloadUrl);
    return (
      parsed.protocol === "https:" &&
      parsed.origin === "https://github.com" &&
      TRUSTED_RELEASE_DOWNLOAD_PREFIXES.some((prefix) =>
        parsed.pathname.startsWith(prefix)
      )
    );
  } catch {
    return false;
  }
}

function trustedApkAsset(value: unknown): ApkAsset | null {
  const asset = value as {
    name?: unknown;
    size?: unknown;
    browser_download_url?: unknown;
    content_type?: unknown;
  } | null;
  const name = typeof asset?.name === "string" ? asset.name.trim() : "";
  const size = Number(asset?.size);
  const downloadUrl =
    typeof asset?.browser_download_url === "string"
      ? asset.browser_download_url.trim()
      : "";
  const isReleaseAsset = isTrustedReleaseDownloadUrl(downloadUrl);
  const isApk = name.toLowerCase().endsWith(".apk");
  const isAndroidPackage =
    !asset?.content_type ||
    asset.content_type === "application/vnd.android.package-archive" ||
    asset.content_type === "application/octet-stream";
  if (
    isReleaseAsset &&
    isApk &&
    isAndroidPackage &&
    Number.isSafeInteger(size) &&
    size > 0
  ) {
    return { name, size, downloadUrl, abi: detectAssetAbi(name) };
  }
  return null;
}

export function parseGitHubRelease(payload: unknown): AppRelease | null {
  const record = payload as {
    tag_name?: unknown;
    name?: unknown;
    html_url?: unknown;
    published_at?: unknown;
    assets?: unknown;
    body?: unknown;
  } | null;

  const version = normalizeVersion(
    typeof record?.tag_name === "string" ? record.tag_name : ""
  );
  const releaseUrl =
    typeof record?.html_url === "string" ? record.html_url : "";
  const body = typeof record?.body === "string" ? record.body.trim() : undefined;

  const assets = Array.isArray(record?.assets)
    ? record.assets
        .map(trustedApkAsset)
        .filter((a): a is ApkAsset => Boolean(a))
    : [];

  // Sort: known ABIs first by priority, then universal, then others
  assets.sort((a, b) => {
    const ai = a.abi ? ABI_PRIORITY.indexOf(a.abi) : 99;
    const bi = b.abi ? ABI_PRIORITY.indexOf(b.abi) : 99;
    return ai - bi;
  });

  // Default: prefer universal, else first asset
  const preferred =
    assets.find((a) => a.abi === "universal") ?? assets[0];

  if (version === "0.0.0" || !releaseUrl || !preferred) return null;

  return {
    version,
    name:
      typeof record?.name === "string" && record.name.trim()
        ? record.name
        : `Luckynime v${version}`,
    releaseUrl,
    assets,
    downloadUrl: preferred.downloadUrl,
    assetName: preferred.name,
    assetSize: preferred.size,
    publishedAt:
      typeof record?.published_at === "string"
        ? record.published_at
        : undefined,
    body,
    mandatory: false,
  };
}

export function isReleaseNewer(
  installedVersion?: string | null,
  releaseVersion?: string | null
) {
  return compareVersions(releaseVersion, installedVersion) > 0;
}

export function updateDismissalKey(releaseVersion: string) {
  return `luckynime.update.dismissed:${normalizeVersion(releaseVersion)}`;
}

async function fetchSupabaseFallbackRelease(): Promise<AppRelease | null> {
  try {
    const { data, error } = await supabase
      .from("system_configs")
      .select("value")
      .eq("key", "app_release")
      .maybeSingle();
    if (error || !data?.value) return null;
    const val = typeof data.value === "string" ? JSON.parse(data.value) : data.value;
    const rawVer = val?.latest_version ?? val?.version ?? "";
    const version = normalizeVersion(rawVer);
    if (version === "0.0.0") return null;

    const tag = `v${version}`;
    const baseDownload = `https://github.com/Lukigays/Luckynime-Release/releases/download/${tag}`;
    const releaseUrl =
      typeof val?.release_url === "string" && val.release_url.includes("github.com")
        ? val.release_url
        : `https://github.com/Lukigays/Luckynime-Release/releases/tag/${tag}`;
    const arm64Asset: ApkAsset = {
      name: `Luckynime-${tag}-arm64.apk`,
      size: 0,
      downloadUrl: `${baseDownload}/Luckynime-${tag}-arm64.apk`,
      abi: "arm64-v8a",
    };
    const arm32Asset: ApkAsset = {
      name: `Luckynime-${tag}-arm32.apk`,
      size: 0,
      downloadUrl: `${baseDownload}/Luckynime-${tag}-arm32.apk`,
      abi: "armeabi-v7a",
    };
    const universalAsset: ApkAsset = {
      name: `Luckynime-${tag}-universal.apk`,
      size: 0,
      downloadUrl: `${baseDownload}/Luckynime-${tag}-universal.apk`,
      abi: "universal",
    };
    return {
      version,
      name: `Luckynime v${version}`,
      releaseUrl,
      assets: [arm64Asset, arm32Asset, universalAsset],
      downloadUrl: arm64Asset.downloadUrl,
      assetName: arm64Asset.name,
      assetSize: 0,
      body: val?.changelog ?? val?.release_notes ?? `Pembaruan Luckynime v${version}`,
      mandatory: Boolean(val?.force_update ?? val?.forceUpdate),
    };
  } catch {
    return null;
  }
}

export async function getLatestLuckynimeRelease(options?: {
  force?: boolean;
  fetcher?: typeof fetch;
  now?: number;
}): Promise<AppRelease | null> {
  const now = options?.now ?? Date.now();
  if (!options?.force) {
    const cached = await AsyncStorage.getItem(UPDATE_CHECK_CACHE_KEY).catch(
      () => null
    );
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as CachedRelease;
        if (parsed.release && now - parsed.fetchedAt < UPDATE_CHECK_TTL_MS)
          return parsed.release;
      } catch {}
    }
  }

  try {
    const response = await (options?.fetcher ?? fetch)(
      LUCKYNIME_LATEST_RELEASE_URL,
      { headers: { Accept: "application/vnd.github+json" } }
    );
    if (response.ok) {
      const release = parseGitHubRelease(await response.json());
      if (release) {
        void AsyncStorage.setItem(
          UPDATE_CHECK_CACHE_KEY,
          JSON.stringify({ fetchedAt: now, release })
        ).catch(() => {});
        return release;
      }
    }
  } catch {
    // Fall through to Supabase fallback when custom fetcher isn't passed
  }

  // Only fall back to Supabase in live runtime (when no mock test fetcher was injected)
  if (!options?.fetcher) {
    const fallback = await fetchSupabaseFallbackRelease();
    if (fallback) {
      void AsyncStorage.setItem(
        UPDATE_CHECK_CACHE_KEY,
        JSON.stringify({ fetchedAt: now, release: fallback })
      ).catch(() => {});
      return fallback;
    }
  }

  throw new Error("Tidak dapat mengecek pembaruan saat ini.");
}

export async function checkForLuckynimeUpdate(
  installedVersion: string,
  options?: { force?: boolean; fetcher?: typeof fetch; now?: number }
) {
  const release = await getLatestLuckynimeRelease(options);
  return {
    release,
    available: Boolean(
      release && isReleaseNewer(installedVersion, release.version)
    ),
  };
}
