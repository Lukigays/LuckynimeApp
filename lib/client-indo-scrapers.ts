import { getAnimeById } from "@/lib/anilist";
import { CHROME_ANDROID_UA } from "@/lib/luckynime-api";
import type { Server, StreamSource } from "@/lib/types";

const SAMEHADAKU_BASE = "https://v2.samehadaku.how";
const OPLOVERZ_BASE = "https://oploverz.am";
const ANOBOY_BASE = "https://anoboy.be";

const clientServerCache = new Map<string, { savedAt: number; servers: Server[] }>();
const CLIENT_CACHE_TTL_MS = 10 * 60 * 1000;

function decodeHtml(str: string): string {
  return str
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(html: string): string {
  return decodeHtml(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function normalizeWords(s: string): string[] {
  return decodeHtml(s)
    .toLowerCase()
    .replace(/\b2nd\s+season\b/g, "season 2")
    .replace(/\b3rd\s+season\b/g, "season 3")
    .replace(/\b(\d+)th\s+season\b/g, "season $1")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0 && w !== "the" && w !== "sub" && w !== "indo" && w !== "subtitle" && w !== "indonesia");
}

function titleSimilarity(a: string, b: string): number {
  const wa = normalizeWords(a);
  const wb = normalizeWords(b);
  if (!wa.length || !wb.length) return 0;
  if (wa.join(" ") === wb.join(" ")) return 1;
  const setA = new Set(wa);
  const setB = new Set(wb);
  let inter = 0;
  for (const w of setA) if (setB.has(w)) inter++;
  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? inter / union : 0;
}

function toSlug(s: string): string {
  return decodeHtml(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function fetchTextFast(url: string, referer: string, timeoutMs = 6500): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": CHROME_ANDROID_UA,
        Accept: "text/html,application/xhtml+xml,application/json,*/*;q=0.8",
        "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
        Referer: referer,
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function base64DecodeSafe(b64: string): string {
  try {
    if (typeof globalThis.atob === "function") {
      return globalThis.atob(b64.trim());
    }
  } catch {
    // ignore
  }
  return "";
}

function extractEpisodeNumber(href: string, text: string): number | null {
  const mHref = href.match(/episode-(\d+)(?:[^\d]|$)/i);
  if (mHref) return Number(mHref[1]);
  const mEp = text.match(/(?:episode|ep|eps)\s*(\d+)/i);
  if (mEp) return Number(mEp[1]);
  const mPure = text.trim().match(/^(\d{1,4})$/);
  if (mPure) return Number(mPure[1]);
  return null;
}

async function resolveWibufileDirectMp4(embedUrl: string): Promise<string | null> {
  try {
    const html = await fetchTextFast(embedUrl, `${SAMEHADAKU_BASE}/`, 5500);
    const mApi = html.match(/https?:\/\/api\.wibufile\.com\/api\/\?[^"'\s<>]+/i);
    if (!mApi) return null;
    const raw = await fetchTextFast(mApi[0], embedUrl, 5500);
    const data = JSON.parse(raw) as { sources?: Array<{ file?: string }> };
    const fileUrl = data?.sources?.[0]?.file;
    if (fileUrl && /^https?:\/\//i.test(fileUrl)) return fileUrl;
  } catch {
    // ignore
  }
  return null;
}

async function scrapeSamehadakuClient(
  titles: string[],
  queries: string[],
  episode: number,
  isMovie: boolean
): Promise<Server[]> {
  let animeUrl: string | null = null;

  // 1) Try direct slug first for instant hit
  for (const t of titles.slice(0, 2)) {
    const slug = toSlug(t);
    if (slug.length < 3) continue;
    try {
      const candidate = `${SAMEHADAKU_BASE}/anime/${slug}/`;
      const html = await fetchTextFast(candidate, `${SAMEHADAKU_BASE}/`, 4500);
      if (html.includes("episode")) {
        animeUrl = candidate;
        break;
      }
    } catch {
      // continue
    }
  }

  // 2) Search fallback
  if (!animeUrl) {
    let bestScore = 0;
    for (const q of queries.slice(0, 3)) {
      try {
        const html = await fetchTextFast(`${SAMEHADAKU_BASE}/?s=${encodeURIComponent(q)}`, `${SAMEHADAKU_BASE}/`, 5500);
        const linkRe = /<a[^>]+href="(https:\/\/v2\.samehadaku\.how\/anime\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
        let m: RegExpExecArray | null;
        while ((m = linkRe.exec(html)) !== null) {
          const href = m[1]!;
          if (href.includes("/anime/?")) continue;
          const h2Match = m[2]!.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
          const clean = stripTags(h2Match ? h2Match[1]! : m[2]!)
            .replace(/^(?:TV|Movie|OVA|ONA|Special|BD)\s*(?:★|\*)?\s*[\d.]*\s*/i, "")
            .replace(/\s*(?:Completed|Ongoing|Currently Airing)\s*$/i, "")
            .trim();
          if (!clean) continue;
          const score = Math.max(0, ...titles.map((rt) => titleSimilarity(rt, clean)));
          if (score > bestScore) {
            bestScore = score;
            animeUrl = href;
          }
        }
        if (bestScore >= 0.8) break;
      } catch {
        // continue
      }
    }
    if (bestScore < 0.35) animeUrl = null;
  }

  if (!animeUrl) return [];

  try {
    const animeHtml = await fetchTextFast(animeUrl, `${SAMEHADAKU_BASE}/`, 5500);
    const epRe = /<a[^>]+href="(https:\/\/v2\.samehadaku\.how\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let epUrl: string | null = null;
    let fallbackEpUrl: string | null = null;
    let m: RegExpExecArray | null;
    while ((m = epRe.exec(animeHtml)) !== null) {
      const href = m[1]!;
      if (
        href.includes("/anime/") ||
        href.includes("/genres/") ||
        href.includes("/ batch") ||
        href.includes("-batch")
      ) {
        continue;
      }
      if (!href.includes("episode") && !isMovie) continue;
      if (!fallbackEpUrl && href.includes("episode")) fallbackEpUrl = href;
      const num = extractEpisodeNumber(href, stripTags(m[2]!));
      if (num === episode) {
        epUrl = href;
        break;
      }
    }
    if (!epUrl && episode === 1 && isMovie) epUrl = fallbackEpUrl;
    if (!epUrl) return [];

    const epHtml = await fetchTextFast(epUrl, animeUrl, 6000);
    const out: Server[] = [];

    // Default iframe (Wibufile direct MP4)
    const iframeMatch = epHtml.match(/<iframe[^>]+src="([^"]+)"/i);
    const embedSrc = iframeMatch?.[1]?.startsWith("//")
      ? `https:${iframeMatch[1]}`
      : iframeMatch?.[1] ?? "";

    if (embedSrc && /wibufile\.com\/embed\//i.test(embedSrc)) {
      const mp4 = await resolveWibufileDirectMp4(embedSrc);
      if (mp4) {
        out.push({
          id: `client-samehadaku-wibufile:sub:0`,
          provider: "client-samehadaku-wibufile",
          label: "SAMEHADAKU WIBUFILE",
          lang: "sub",
          sources: [
            {
              url: mp4,
              quality: "720p",
              type: "native",
            },
          ],
          headers: { Referer: embedSrc },
        });
      }
    }

    // Pixeldrain 360p/480p/720p/1080p direct links
    const pdSources: StreamSource[] = [];
    const seenPd = new Set<string>();
    const pdMatches = [...epHtml.matchAll(/https?:\/\/pixeldrain\.com\/u\/([A-Za-z0-9_-]+)/gi)];
    for (const pm of pdMatches) {
      const fileId = pm[1]!;
      if (seenPd.has(fileId)) continue;
      seenPd.add(fileId);
      const ctxBefore = epHtml.slice(Math.max(0, (pm.index ?? 0) - 260), pm.index ?? 0);
      const qMatches = [...ctxBefore.matchAll(/(1080p|720p|480p|360p)/gi)];
      const quality = qMatches.length > 0 ? qMatches[qMatches.length - 1]![1]!.toLowerCase() : "720p";
      pdSources.push({
        url: `https://pixeldrain.com/api/file/${fileId}`,
        quality,
        type: "native",
      });
    }
    if (pdSources.length > 0) {
      const rank = (q?: string) => (q === "1080p" ? 0 : q === "720p" ? 1 : q === "480p" ? 2 : 3);
      pdSources.sort((a, b) => rank(a.quality) - rank(b.quality));
      out.push({
        id: `client-samehadaku-pixeldrain:sub:0`,
        provider: "client-samehadaku-pixeldrain",
        label: "SAMEHADAKU PIXELDRAIN HD",
        lang: "sub",
        sources: pdSources,
        headers: { Referer: "https://pixeldrain.com/" },
      });
    }

    if (embedSrc && /^https?:\/\//i.test(embedSrc)) {
      out.push({
        id: `client-samehadaku-embed:sub:0`,
        provider: "client-samehadaku-embed",
        label: "SAMEHADAKU EMBED",
        lang: "sub",
        sources: [{ url: embedSrc, quality: "Auto", type: "embed", verification: "embed" }],
        headers: { Referer: epUrl },
      });
    }

    return out;
  } catch {
    return [];
  }
}

async function scrapeOploverzClient(
  titles: string[],
  queries: string[],
  episode: number,
  isMovie: boolean
): Promise<Server[]> {
  let animeUrl: string | null = null;
  let bestScore = 0;

  for (const q of queries.slice(0, 2)) {
    try {
      const html = await fetchTextFast(`${OPLOVERZ_BASE}/?s=${encodeURIComponent(q)}`, `${OPLOVERZ_BASE}/`, 5500);
      const re = /<a[^>]+href="(https:\/\/oploverz\.am\/anime\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(html)) !== null) {
        const href = m[1]!;
        const clean = stripTags(m[2]!)
          .replace(/^(?:TV|Movie|OVA|ONA|Special)\s*/i, "")
          .replace(/\s*(?:Completed|Ongoing)\s*$/i, "")
          .trim();
        if (!clean) continue;
        const score = Math.max(0, ...titles.map((rt) => titleSimilarity(rt, clean)));
        if (score > bestScore) {
          bestScore = score;
          animeUrl = href;
        }
      }
      if (bestScore >= 0.8) break;
    } catch {
      // continue
    }
  }
  if (!animeUrl || bestScore < 0.35) return [];

  try {
    const animeHtml = await fetchTextFast(animeUrl, `${OPLOVERZ_BASE}/`, 5500);
    const epRe = /<a[^>]+href="(https:\/\/oploverz\.am\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let epUrl: string | null = null;
    let m: RegExpExecArray | null;
    while ((m = epRe.exec(animeHtml)) !== null) {
      const href = m[1]!;
      if (href.includes("/anime/") || !href.includes("episode")) continue;
      const num = extractEpisodeNumber(href, stripTags(m[2]!));
      if (num === episode || (episode === 1 && isMovie && !epUrl)) {
        epUrl = href;
        if (num === episode) break;
      }
    }
    if (!epUrl) return [];

    const epHtml = await fetchTextFast(epUrl, animeUrl, 5500);
    const out: Server[] = [];

    // Option base64 mirrors
    const optRe = /<option[^>]+value="([A-Za-z0-9+/=]{24,})"[^>]*>([^<]*)<\/option>/gi;
    let om: RegExpExecArray | null;
    const seen = new Set<string>();
    let idx = 0;
    while ((om = optRe.exec(epHtml)) !== null) {
      const decoded = base64DecodeSafe(om[1]!);
      const srcMatch = decoded.match(/src=["']([^"']+)["']/i);
      if (!srcMatch?.[1]) continue;
      const src = srcMatch[1].startsWith("//") ? `https:${srcMatch[1]}` : srcMatch[1];
      if (!/^https?:\/\//i.test(src) || seen.has(src)) continue;
      seen.add(src);
      const labelClean = stripTags(om[2]!).toUpperCase() || `MIRROR ${idx + 1}`;
      out.push({
        id: `client-oploverz-${idx}:sub:${idx}`,
        provider: `client-oploverz-${idx}`,
        label: `OPLOVERZ ${labelClean}`,
        lang: "sub",
        sources: [{ url: src, quality: "Auto", type: "embed", verification: "embed" }],
        headers: { Referer: `${OPLOVERZ_BASE}/` },
      });
      idx++;
      if (idx >= 3) break;
    }

    if (out.length === 0) {
      const ifr = epHtml.match(/<iframe[^>]+src="([^"]+)"/i)?.[1];
      if (ifr && /^https?:\/\//i.test(ifr)) {
        out.push({
          id: `client-oploverz-main:sub:0`,
          provider: "client-oploverz-main",
          label: "OPLOVERZ UTAMA",
          lang: "sub",
          sources: [{ url: ifr, quality: "Auto", type: "embed", verification: "embed" }],
          headers: { Referer: `${OPLOVERZ_BASE}/` },
        });
      }
    }

    return out;
  } catch {
    return [];
  }
}

async function scrapeAnoboyClient(
  titles: string[],
  queries: string[],
  episode: number
): Promise<Server[]> {
  for (const q of queries.slice(0, 2)) {
    try {
      const searchQ = `${q} episode ${episode}`;
      const html = await fetchTextFast(`${ANOBOY_BASE}/?s=${encodeURIComponent(searchQ)}`, `${ANOBOY_BASE}/`, 5500);
      const re = /<a[^>]+href="(https:\/\/anoboy\.be\/[^"]+)"[^>]*title="([^"]*)"/gi;
      let m: RegExpExecArray | null;
      let epUrl: string | null = null;
      while ((m = re.exec(html)) !== null) {
        const href = m[1]!;
        const text = decodeHtml(m[2]!);
        const epNum = extractEpisodeNumber(href, text);
        if (epNum !== episode) continue;
        const cleaned = text.replace(/episode\s*\d+.*$/i, "").trim();
        const score = Math.max(0, ...titles.map((rt) => titleSimilarity(rt, cleaned)));
        if (score >= 0.35) {
          epUrl = href;
          break;
        }
      }
      if (!epUrl) continue;
      const epHtml = await fetchTextFast(epUrl, `${ANOBOY_BASE}/`, 5500);
      const ifr =
        epHtml.match(/id="mediaplayer"[^>]+src="([^"]+)"/i)?.[1] ??
        epHtml.match(/<iframe[^>]+src="([^"]+)"/i)?.[1];
      if (ifr) {
        const full = ifr.startsWith("//") ? `https:${ifr}` : ifr.startsWith("/") ? `${ANOBOY_BASE}${ifr}` : ifr;
        if (/^https?:\/\//i.test(full)) {
          return [
            {
              id: `client-anoboy:sub:0`,
              provider: "client-anoboy",
              label: "ANOBOY",
              lang: "sub",
              sources: [{ url: full, quality: "Auto", type: "embed", verification: "embed" }],
              headers: { Referer: `${ANOBOY_BASE}/` },
            },
          ];
        }
      }
    } catch {
      // continue
    }
  }
  return [];
}

async function scrapeMegaplayClientDirect(
  animeId: number,
  episode: number,
  lang: "sub" | "dub"
): Promise<Server[]> {
  try {
    const embedUrl = `https://megaplay.buzz/stream/ani/${animeId}/${episode}/${lang}`;
    const html = await fetchTextFast(embedUrl, "https://megaplay.buzz/", 5500);
    const idMatch = html.match(/data-id=["'](\d+)["']/i);
    if (!idMatch?.[1]) return [];

    const dataId = idMatch[1];
    try {
      const rawJson = await fetchTextFast(
        `https://megaplay.buzz/stream/getSources?id=${encodeURIComponent(dataId)}&platform=OTHER&st=other`,
        embedUrl,
        5500
      );
      const data = JSON.parse(rawJson) as {
        sources?: { file?: string } | Array<{ file?: string }>;
        tracks?: Array<{ file?: string; label?: string; kind?: string; default?: boolean }>;
      };
      const hlsUrl = Array.isArray(data.sources) ? data.sources[0]?.file : data.sources?.file;
      if (hlsUrl && /^https?:\/\//i.test(hlsUrl) && !/tcdn\.one/i.test(hlsUrl)) {
        const subs = (data.tracks ?? [])
          .filter((t) => t.file && (!t.kind || t.kind === "captions" || t.kind === "subtitles"))
          .map((t) => ({
            url: t.file!,
            lang: t.label || "English",
            label: t.label || "English",
            default: Boolean(t.default),
          }));
        return [
          {
            id: `client-megaplay-hls:${lang}:0`,
            provider: "client-megaplay-hls",
            label: "MEGAPLAY DIRECT HD",
            lang,
            sources: [
              { url: hlsUrl, quality: "Auto", type: "hls", subtitles: subs },
              { url: embedUrl, quality: "Auto", type: "embed", verification: "embed" },
            ],
            subtitles: subs,
            headers: { Referer: "https://megaplay.buzz/", Origin: "https://megaplay.buzz" },
          },
        ];
      }
    } catch {
      // Fall back to verified embed below.
    }

    return [
      {
        id: `client-megaplay-ani:${lang}:0`,
        provider: "client-megaplay-ani",
        label: `MEGAPLAY EMBED (${lang.toUpperCase()})`,
        lang,
        sources: [{ url: embedUrl, quality: "Auto", type: "embed", verification: "embed" }],
        headers: { Referer: "https://megaplay.buzz/" },
      },
    ];
  } catch {
    return [];
  }
}

export async function resolveClientFallbackServers(
  animeId: number,
  episode: number,
  lang: "sub" | "dub"
): Promise<Server[]> {
  const cacheKey = `${animeId}:${episode}:${lang}`;
  const hit = clientServerCache.get(cacheKey);
  if (hit && Date.now() - hit.savedAt < CLIENT_CACHE_TTL_MS) {
    return hit.servers;
  }

  const out: Server[] = [];

  const indoTask = (async (): Promise<Server[]> => {
    if (lang !== "sub") return [];
    try {
      const media = await getAnimeById(animeId).catch(() => null);
      const extraSynonyms = (media as { synonyms?: string[] } | null)?.synonyms ?? [];
      const titles = Array.from(
        new Set(
          [media?.title?.romaji, media?.title?.english, ...extraSynonyms.slice(0, 6)].filter(
            (t): t is string => Boolean(t && t.trim())
          )
        )
      );
      if (titles.length === 0) return [];
      const queries = Array.from(
        new Set(
          titles
            .flatMap((t) => {
              const clean = t.replace(/[:\-–—()[\]!?]/g, " ").replace(/\s+/g, " ").trim();
              const words = clean.split(" ");
              return words.length > 3 ? [clean, words.slice(0, 3).join(" ")] : [clean];
            })
            .filter((q) => q.length >= 2)
        )
      );
      const isMovie = String(media?.format ?? "").toUpperCase() === "MOVIE";
      const [sh, op, ab] = await Promise.all([
        scrapeSamehadakuClient(titles, queries, episode, isMovie).catch(() => []),
        scrapeOploverzClient(titles, queries, episode, isMovie).catch(() => []),
        scrapeAnoboyClient(titles, queries, episode).catch(() => []),
      ]);
      return [...sh, ...op, ...ab];
    } catch {
      return [];
    }
  })();

  const [indoServers, mpServers] = await Promise.all([
    indoTask,
    scrapeMegaplayClientDirect(animeId, episode, lang).catch(() => []),
  ]);

  out.push(...mpServers, ...indoServers);
  if (out.length > 0) {
    clientServerCache.set(cacheKey, { savedAt: Date.now(), servers: out });
  }
  return out;
}

export function getCachedClientServerStream(
  animeId: number,
  episode: number,
  lang: "sub" | "dub",
  provider: string
): Server | null {
  const hit = clientServerCache.get(`${animeId}:${episode}:${lang}`);
  if (!hit) return null;
  return (
    hit.servers.find(
      (s) => s.provider.toLowerCase() === provider.toLowerCase() || s.id.toLowerCase().startsWith(provider.toLowerCase())
    ) ?? null
  );
}
