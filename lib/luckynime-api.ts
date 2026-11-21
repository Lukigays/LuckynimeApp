import { APP_CONFIG } from "@/lib/app-config";
import { getCachedClientServerStream, resolveClientFallbackServers } from "@/lib/client-indo-scrapers";
import type { Anime, Episode, Server, StreamResponse, StreamSource } from "@/lib/types";

export const CHROME_ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 15; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";

async function apiRequest<T>(path: string, init?: RequestInit, timeoutMs: number = 15_000): Promise<T> {
  let response: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    response = await fetch(`${APP_CONFIG.apiBaseUrl}${path}`, {
      ...init,
      signal: init?.signal ?? controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": CHROME_ANDROID_UA,
        Referer: "https://luckynime.tech/",
        ...(init?.headers ?? {}),
      },
    });
  } catch (cause) {
    const timedOut = cause instanceof Error && cause.name === "AbortError";
    throw new Error(timedOut ? "The video service took too long to respond. Please try again." : "We could not reach Luckynime right now. Please check your connection and try again.");
  } finally {
    clearTimeout(timeout);
  }
  const rawPayload = await response.text();
  let payload: { error?: string; message?: string } & T;
  try {
    payload = rawPayload ? JSON.parse(rawPayload) : {} as T;
  } catch {
    throw new Error("The video service sent an unexpected response. Please try again.");
  }
  if (!response.ok) {
    throw new Error(payload.error || payload.message || "The video service is unavailable right now. Please try again.");
  }
  return payload;
}

export function getPlaybackType(source: StreamSource): "hls" | "dash" | "native" | "embed" {
  const raw = `${source.type ?? ""} ${source.mime ?? ""}`.toLowerCase();
  const url = String(source.url ?? "").toLowerCase();
  if (raw.includes("embed") || raw.includes("iframe") || raw.includes("page")) return "embed";
  if (raw.includes("dash") || /\.mpd(?:$|[?#])/.test(url)) return "dash";
  if (raw.includes("hls") || raw.includes("mpegurl") || /\.m3u8(?:$|[?#])/.test(url)) return "hls";
  return "native";
}

export function sourceVerification(source: StreamSource) {
  return String(source.verification ?? source.Verification ?? "").toLowerCase();
}

export function hasExpiredEmbeddedToken(url: string) {
  const values = [...url.matchAll(/(?:^|[^0-9])(20\d{12})(?!\d)/g)].map((match) => match[1]);
  let newest = 0;
  for (const stamp of values) {
    const date = Date.UTC(Number(stamp.slice(0, 4)), Number(stamp.slice(4, 6)) - 1, Number(stamp.slice(6, 8)), Number(stamp.slice(8, 10)), Number(stamp.slice(10, 12)), Number(stamp.slice(12, 14)));
    if (Number.isFinite(date)) newest = Math.max(newest, date);
  }
  return newest > 0 && Date.now() > newest + 30_000;
}

export function playableSources(sources: StreamSource[]) {
  return sources.filter((source) => source.url && sourceVerification(source) !== "dead" && !hasExpiredEmbeddedToken(source.url));
}

export function nativePlaybackHeaders(headers?: Record<string, string>) {
  // ExoPlayer (react-native-video DataSourceUtil) forwards a `User-Agent`
  // header when present and falls back to its default UA otherwise. Stripping
  // it caused 403s on UA-locked CDNs, so only transport-managed headers are
  // blocked now. Referer / Origin / Authorization / User-Agent pass through.
  const blocked = /^(host|content-length|connection|accept-encoding)$/i;
  const retained = Object.entries(headers ?? {}).filter(([name]) => !blocked.test(name));
  return retained.length ? Object.fromEntries(retained) : undefined;
}

export function isLuckynimeProxyUrl(url: string) {
  return String(url ?? "").includes("/api/v1/proxy?");
}

export function luckynimeProxyUrl(url: string, headers?: Record<string, string>) {
  // The backend now returns pre-proxied stream URLs (verification: "proxy",
  // url already points at /api/v1/proxy?...). Re-wrapping them produces a
  // proxy-of-proxy URL that the backend rejects with
  // {"error":"proxy target not allowed"} → HTTP 403 → ExoPlayer
  // ERROR_CODE_IO_BAD_HTTP_STATUS. Play those URLs as-is.
  if (isLuckynimeProxyUrl(url)) {
    if (url.startsWith("/")) {
      return `${APP_CONFIG.apiBaseUrl}${url}`;
    }
    return url;
  }
  const parameters = new URLSearchParams({ url, rn: `${Date.now()}-${Math.random().toString(36).slice(2)}` });
  if (headers && Object.keys(headers).length) parameters.set("headers", JSON.stringify(headers));
  return `${APP_CONFIG.apiBaseUrl}/api/v1/proxy?${parameters.toString()}`;
}

export function luckynimeDownloadUrl(url: string, headers?: Record<string, string>) {
  const parameters = new URLSearchParams({ url });
  if (headers && Object.keys(headers).length) parameters.set("headers", JSON.stringify(headers));
  return `${APP_CONFIG.apiBaseUrl}/api/v1/download?${parameters.toString()}`;
}

type BackendSkipSegment = { start?: number; end?: number; startTime?: number; endTime?: number };
type BackendStreamResponse = Omit<StreamResponse, "intro" | "outro"> & { intro?: BackendSkipSegment; outro?: BackendSkipSegment };

export function normalizeStreamResponse(payload: BackendStreamResponse): StreamResponse {
  const normalizeSegment = (segment?: BackendSkipSegment) => segment ? {
    startTime: segment.startTime ?? segment.start,
    endTime: segment.endTime ?? segment.end,
  } : undefined;
  return { ...payload, intro: normalizeSegment(payload.intro), outro: normalizeSegment(payload.outro) };
}

export async function getAnimeMetadata(animeId: number): Promise<Anime> {
  return apiRequest<Anime>(`/api/v1/anime/${animeId}`);
}

type BackendEpisode = Omit<Episode, "isFiller"> & { filler?: boolean; isFiller?: boolean };

function normalizeBackendEpisodes(payload: BackendEpisode[] | { episodes?: BackendEpisode[] }): Episode[] {
  const episodes = Array.isArray(payload) ? payload : payload.episodes;
  if (!Array.isArray(episodes)) throw new Error("Luckynime returned an invalid episode availability response.");
  return episodes.filter(Boolean).map((episode, index) => ({
    number: index + 1,
    title: episode.title,
    thumbnail: episode.thumbnail,
    description: episode.description,
    isFiller: Boolean(episode.isFiller ?? episode.filler),
  }));
}

export async function getEpisodes(animeId: number): Promise<Episode[]> {
  return normalizeBackendEpisodes(await apiRequest<BackendEpisode[] | { episodes?: BackendEpisode[] }>(`/api/v1/anime/${animeId}/episodes`));
}

/** Check if dub is available for a specific episode (returns true if servers exist for lang=dub). */
export async function hasDubForEpisode(animeId: number, episode: number): Promise<boolean> {
  try {
    const payload = await apiRequest<any[]>(`/api/v1/servers?animeId=${animeId}&episode=${episode}&lang=dub`, undefined, 15_000);
    return Array.isArray(payload) && payload.length > 0;
  } catch {
    return false;
  }
}

const UNSUPPORTED_PROVIDERS = new Set(["flixcloud"]);

/** Accept every server the backend + on-device scrapers return. Native HLS/MP4
 *  streams are ordered above embeds, and duplicate primary URLs are merged. */
export async function getServers(animeId: number, episode: number, lang: "sub" | "dub"): Promise<Server[]> {
  let backendErr: unknown = null;
  const [backendResult, clientServers] = await Promise.all([
    apiRequest<any[]>(`/api/v1/servers?animeId=${animeId}&episode=${episode}&lang=${lang}`, undefined, 25_000).catch(
      (err) => {
        backendErr = err;
        return [] as any[];
      }
    ),
    resolveClientFallbackServers(animeId, episode, lang).catch(() => [] as Server[]),
  ]);

  if (backendErr && clientServers.length === 0) {
    throw backendErr;
  }

  const payload = Array.isArray(backendResult) ? backendResult : [];

  const collectBackend = (skipUnsupported: boolean): Server[] => {
    const seen = new Set<string>();
    const servers: Server[] = [];
    for (const server of payload) {
      const providerName = String(server.provider || "").trim().toLowerCase();
      const displayName = String(server.name || server.provider || "anikoto").trim().toLowerCase();
      if (skipUnsupported && (UNSUPPORTED_PROVIDERS.has(providerName) || UNSUPPORTED_PROVIDERS.has(displayName))) continue;
      const dedupeKey = displayName || providerName;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      servers.push({
        id: server.id || `${dedupeKey}:${lang}:${servers.length}`,
        provider: providerName || dedupeKey,
        label: String(server.name || server.provider || "ANIKOTO").toUpperCase(),
        lang: (server.lang || lang) as "sub" | "dub",
        sources: server.sources,
        headers: server.headers,
        downloads: server.downloads,
        subtitles: server.subtitles,
      });
    }
    return servers;
  };

  let backendServers = collectBackend(true);
  if (backendServers.length === 0 && payload.length > 0) {
    backendServers = collectBackend(false);
  }

  // For dub, only append client MegaPlay fallback if backend actually confirmed dub exists
  // (prevents false-positive DUB pill on sub-only anime)
  const effectiveClient =
    lang === "dub" && backendServers.length === 0
      ? []
      : clientServers;

  const combined = [...backendServers, ...effectiveClient];
  if (combined.length === 0) return [];

  const seenUrls = new Set<string>();
  const seenLabels = new Set<string>();
  const deduped: Server[] = [];
  for (const srv of combined) {
    const primaryUrl = String(srv.sources?.[0]?.url ?? "").split("?")[0] ?? "";
    const normLabel = srv.label.trim().toUpperCase();
    if (primaryUrl && seenUrls.has(primaryUrl)) continue;
    if (seenLabels.has(normLabel)) continue;
    if (primaryUrl) seenUrls.add(primaryUrl);
    seenLabels.add(normLabel);
    deduped.push(srv);
  }

  const isNativeServer = (srv: Server) =>
    (srv.sources ?? []).some((s) => {
      const t = getPlaybackType(s);
      return t === "hls" || t === "dash" || t === "native";
    });

  return [
    ...deduped.filter((s) => isNativeServer(s)),
    ...deduped.filter((s) => !isNativeServer(s)),
  ];
}

export async function getStream(input: { animeId: number; episode: number; provider: string; lang: "sub" | "dub"; quality?: string; refresh?: boolean }): Promise<StreamResponse> {
  if (String(input.provider || "").toLowerCase().startsWith("client-")) {
    const clientSrv =
      getCachedClientServerStream(input.animeId, input.episode, input.lang, input.provider) ??
      (await resolveClientFallbackServers(input.animeId, input.episode, input.lang)).find(
        (s) => s.provider.toLowerCase() === input.provider.toLowerCase()
      );
    if (clientSrv) {
      const qualities = Array.from(
        new Set(
          (clientSrv.sources ?? [])
            .filter((s) => getPlaybackType(s) !== "embed")
            .map((s) => String(s.quality || "Auto"))
        )
      );
      return {
        sources: clientSrv.sources ?? [],
        qualities: qualities.length > 0 ? qualities : ["Auto"],
        headers: clientSrv.headers ?? {},
        subtitles: clientSrv.subtitles,
      };
    }
  }
  const payload = await apiRequest<BackendStreamResponse>("/api/v1/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, quality: input.quality || "auto", refresh: Boolean(input.refresh) }),
  });
  return normalizeStreamResponse(payload);
}

export async function healthCheck() {
  return apiRequest<{ status: string }>("/api/v1/health");
}
