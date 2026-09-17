/**
 * Tokenless open-music fallback. Wikimedia Commons' MediaWiki API is public;
 * this adapter only accepts audio files whose metadata explicitly declares
 * Public Domain, CC0, CC BY, or CC BY-SA. NC/ND/unknown licenses are excluded
 * because this game may be deployed commercially and streams the unchanged
 * file to multiple room members.
 */

const API_URL = "https://commons.wikimedia.org/w/api.php";
const CACHE_TTL_MS = 5 * 60_000;
const cache = new Map();
const inflight = new Map();

function clean(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function queryParams(filters = {}) {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    generator: "search",
    gsrnamespace: "6",
    gsrlimit: String(Math.min(Math.max(Number(filters.limit) || 50, 1), 50)),
    gsrsearch: `filetype:audio incategory:"Audio files" ${String(filters.query || "").slice(0, 100)}`,
    prop: "imageinfo|categories",
    iiprop: "url|mime|size|duration|extmetadata|commonmetadata",
  });
  if (filters.offset) params.set("gsroffset", String(Math.max(0, Number(filters.offset) || 0)));
  return params;
}

async function request(filters = {}) {
  const url = `${API_URL}?${queryParams(filters)}`;
  const key = url;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (inflight.has(key)) return inflight.get(key);
  const promise = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal });
      if (!response.ok) throw new Error(`Wikimedia Commons returned ${response.status}`);
      const payload = await response.json();
      const pages = Object.values(payload?.query?.pages || {});
      cache.set(key, { value: pages, expiresAt: Date.now() + CACHE_TTL_MS });
      return pages;
    } finally {
      clearTimeout(timeout);
    }
  })();
  inflight.set(key, promise);
  try { return await promise; } finally { inflight.delete(key); }
}

async function requestByPageId(pageId) {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    pageids: String(pageId),
    prop: "imageinfo|categories",
    iiprop: "url|mime|size|duration|extmetadata|commonmetadata",
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${API_URL}?${params}`, { headers: { Accept: "application/json" }, signal: controller.signal });
    if (!response.ok) throw new Error(`Wikimedia Commons returned ${response.status}`);
    const payload = await response.json();
    return Object.values(payload?.query?.pages || {});
  } finally {
    clearTimeout(timeout);
  }
}

function allowedLicense(metadata) {
  const name = clean(metadata?.LicenseShortName?.value || metadata?.License?.value || "");
  const lower = name.toLowerCase();
  if (lower.includes("public domain") || lower.includes("cc0") || lower.includes("cc zero")) return name;
  if (/cc\s*by(?:-sa)?(?:\s|$)/i.test(name)) return name;
  return null;
}

function normalizePage(page) {
  const info = page?.imageinfo?.[0];
  const metadata = info?.extmetadata || {};
  const license = allowedLicense(metadata);
  const url = info?.url;
  const mime = String(info?.mime || "").toLowerCase();
  const rawTitle = clean(metadata.ObjectName?.value || page?.title?.replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, ""));
  const artist = clean(metadata.Artist?.value || metadata.Credit?.value || "");
  if (!page?.pageid || !url || !mime.startsWith("audio/") || !rawTitle || !artist || !license) return null;
  const categories = (page.categories || []).map((item) => clean(item.title?.replace(/^Category:/, "")));
  const releaseDate = clean(metadata.DateTimeOriginal?.value || metadata.DateTime?.value || "") || null;
  const licenseUrl = clean(metadata.LicenseUrl?.value || "") || null;
  return {
    id: `commons:${page.pageid}`,
    title: rawTitle,
    artist,
    album: null,
    artworkUrl: null,
    genre: categories.find((item) => /music|jazz|classical|folk|rock|electronic|soundtrack/i.test(item)) || null,
    releaseDate,
    streamUrl: url,
    source: "wikimedia-commons",
    license,
    licenseUrl,
    permalink: `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title).replace(/%2F/g, "/")}`,
  };
}

function localFilters(tracks, filters = {}) {
  const genre = String(filters.genre || "").toLowerCase();
  const decade = String(filters.decade || "");
  return tracks.filter((track) => {
    if (genre && !String(track.genre || "").toLowerCase().includes(genre)) return false;
    if (decade && decade !== "any") {
      const year = new Date(track.releaseDate || "").getUTCFullYear();
      if (!Number.isFinite(year) || Math.floor(year / 10) * 10 !== Number(decade)) return false;
    }
    return true;
  });
}

async function getPlayableTracks(filters = {}) {
  const pages = await request(filters);
  const tracks = localFilters(pages.map(normalizePage).filter(Boolean), filters);
  return [...tracks].sort(() => Math.random() - 0.5);
}

export const commonsProvider = {
  async searchTracks(filters = {}) { return getPlayableTracks(filters); },
  async getTrendingTracks(filters = {}) { return getPlayableTracks(filters); },
  async getRandomTracks(filters = {}) { return getPlayableTracks(filters); },
  async getPlayableTracks(filters = {}) { return getPlayableTracks(filters); },
  async getTrack(trackId) {
    const numericId = String(trackId || "").replace(/^commons:/, "");
    const pages = await requestByPageId(numericId);
    return pages.map(normalizePage).find((track) => track?.id === trackId) || null;
  },
  genres: ["Electronic", "Rock", "Jazz", "Classical", "Folk", "Soundtrack", "World", "Ambient"],
  supports: {
    trending: false,
    popular: false,
    random: "local shuffle of openly licensed audio search results",
    newReleases: false,
    genres: "best-effort category metadata",
    artists: "search query only",
    country: false,
    language: false,
    decades: "local filtering by releaseDate when metadata exists",
  },
};
