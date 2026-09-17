/**
 * Audius provider adapter used by Room Arcade.
 *
 * Audius exposes a free API plan and a stream endpoint intended for music
 * players. We keep provider calls on the server, cache discovery responses,
 * retry transient failures, and only return tracks that have the metadata and
 * streamability needed by the game.
 */

function apiBase() {
  return (process.env.AUDIUS_API_BASE_URL || "https://api.audius.co/v1").replace(/\/$/, "");
}

function appName() {
  return process.env.AUDIUS_APP_NAME || "randomconnect-room-arcade";
}

function apiKey() {
  return process.env.AUDIUS_API_KEY || "";
}
const CACHE_TTL_MS = 60_000;
const MAX_LIMIT = 100;
const cache = new Map();
const inflight = new Map();

const AUDIOUS_GENRES = [
  "Electronic", "Rock", "Metal", "Alternative", "Hip-Hop/Rap", "Experimental", "Punk", "Folk", "Pop", "Ambient",
  "Soundtrack", "World", "Jazz", "Acoustic", "Funk", "R&B/Soul", "Devotional", "Classical", "Reggae", "Country",
  "Spoken Word", "Comedy", "Blues", "Kids", "Latin", "Lo-Fi", "Hyperpop", "Dancehall", "Techno", "Trap", "House",
  "Tech House", "Deep House", "Disco", "Electro", "Jungle", "Progressive House", "Hardstyle", "Glitch Hop", "Trance",
  "Future Bass", "Future House", "Tropical House", "Downtempo", "Drum & Bass", "Dubstep", "Jersey Club", "Vaporwave", "Moombahton",
];

function clampLimit(value) {
  return Math.min(Math.max(Number(value) || 25, 1), MAX_LIMIT);
}

function queryString(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) value.forEach((item) => search.append(key, item));
    else search.set(key, String(value));
  }
  search.set("app_name", appName());
  if (apiKey()) search.set("api_key", apiKey());
  return search.toString();
}

async function fetchJson(path, params = {}, attempts = 3) {
  const url = `${apiBase()}${path}?${queryString(params)}`;
  const secret = apiKey();
  const key = secret ? url.replace(secret, "[redacted]") : url;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (inflight.has(key)) return inflight.get(key);

  const request = (async () => {
    let lastError;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8_000);
      try {
        const response = await fetch(url, {
          headers: { Accept: "application/json", ...(apiKey() ? { "X-API-Key": apiKey() } : {}) },
          signal: controller.signal,
        });
        if (response.status === 429 || response.status >= 500) {
          const retryAfter = Number(response.headers.get("retry-after")) || 0;
          await new Promise((resolve) => setTimeout(resolve, Math.min(4_000, retryAfter * 1000 || 250 * (2 ** attempt))));
          throw new Error(`Audius request returned ${response.status}`);
        }
        if (!response.ok) throw new Error(`Audius request returned ${response.status}`);
        const payload = await response.json();
        const value = Array.isArray(payload?.data) ? payload.data : payload?.data || payload;
        cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
        return value;
      } catch (error) {
        lastError = error;
        if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 250 * (2 ** attempt)));
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastError || new Error("Audius request failed");
  })();
  inflight.set(key, request);
  try {
    return await request;
  } finally {
    inflight.delete(key);
  }
}

function streamUrl(id) {
  return `${apiBase()}/tracks/${encodeURIComponent(id)}/stream?${queryString()}`;
}

function normalizeTrack(track) {
  const id = track?.id || track?.trackId;
  const title = String(track?.title || "").trim();
  const artist = String(track?.user?.name || track?.user?.handle || track?.artist || "").trim();
  const isStreamable = track?.isStreamable === true || track?.isStreamable === "true" || track?.isStreamable === undefined;
  if (!id || !title || !artist || !isStreamable) return null;
  return {
    id: String(id),
    title,
    artist,
    album: track?.album?.name || track?.playlist_name || null,
    artworkUrl: track?.artwork?._480x480 || track?.artwork?._150x150 || null,
    genre: track?.genre || null,
    releaseDate: track?.releaseDate || null,
    streamUrl: streamUrl(id),
    source: "audius",
    // These fields stay server-side and are useful for filtering/diagnostics.
    duration: Number(track?.duration) || 0,
    playCount: Number(track?.playCount) || 0,
    tags: Array.isArray(track?.tags) ? track.tags : [],
    permalink: track?.permalink || null,
  };
}

function dedupe(tracks) {
  const seen = new Set();
  return tracks.filter((track) => track && !seen.has(track.id) && seen.add(track.id));
}

function applyLocalFilters(tracks, filters = {}) {
  const genre = String(filters.genre || "").toLowerCase();
  const decade = String(filters.decade || "");
  return tracks.filter((track) => {
    if (genre && String(track.genre || "").toLowerCase() !== genre) return false;
    if (decade && decade !== "any") {
      const year = new Date(track.releaseDate || "").getUTCFullYear();
      if (!Number.isFinite(year) || Math.floor(year / 10) * 10 !== Number(decade)) return false;
    }
    return true;
  });
}

function randomize(tracks) {
  return [...tracks].sort(() => Math.random() - 0.5);
}

async function searchTracks(filters = {}) {
  const data = await fetchJson("/tracks/search", {
    query: String(filters.query || "").trim() || undefined,
    genre: filters.genre || undefined,
    sortMethod: filters.sortMethod || "relevant",
    limit: clampLimit(filters.limit),
    offset: Number(filters.offset) || 0,
  });
  return applyLocalFilters(dedupe(data.map(normalizeTrack).filter(Boolean)), filters);
}

async function getTrendingTracks(filters = {}) {
  const data = await fetchJson("/tracks/trending", {
    genre: filters.genre || undefined,
    time: filters.time || "allTime",
    limit: clampLimit(filters.limit),
    offset: Number(filters.offset) || 0,
  });
  return applyLocalFilters(dedupe(data.map(normalizeTrack).filter(Boolean)), filters);
}

async function getPopularTracks(filters = {}) {
  return searchTracks({ ...filters, sortMethod: "popular", query: filters.query || "" });
}

async function getRandomTracks(filters = {}) {
  const source = filters.genre ? await getTrendingTracks({ ...filters, limit: MAX_LIMIT }) : await getPopularTracks({ ...filters, limit: MAX_LIMIT });
  return randomize(source);
}

async function getPlayableTracks(filters = {}) {
  const category = filters.category || "random";
  let tracks;
  try {
    if (category === "trending") tracks = await getTrendingTracks(filters);
    else if (category === "popular") tracks = await getPopularTracks(filters);
    else if (category === "new") tracks = await searchTracks({ ...filters, sortMethod: "recent" });
    else if (category === "search") tracks = await searchTracks(filters);
    else tracks = await getRandomTracks(filters);
  } catch (error) {
    // Discovery endpoints can be rate limited. A cached/popular/random retry is
    // intentionally the fallback; filters unsupported by Audius are not faked.
    if (category !== "popular") {
      try { tracks = await getPopularTracks(filters); } catch { tracks = await getRandomTracks({ genre: filters.genre }); }
    } else throw error;
  }
  return dedupe(applyLocalFilters(tracks || [], filters)).slice(0, MAX_LIMIT);
}

async function getTrack(trackId) {
  const data = await fetchJson(`/tracks/${encodeURIComponent(String(trackId))}`);
  return normalizeTrack(data);
}

export const audiusProvider = {
  searchTracks,
  getTrendingTracks,
  getRandomTracks,
  getPlayableTracks,
  getTrack,
  getPopularTracks,
  genres: AUDIOUS_GENRES,
  supports: {
    trending: true,
    popular: true,
    random: "local shuffle of playable catalog",
    newReleases: true,
    genres: true,
    artists: "search query only",
    country: false,
    language: false,
    decades: "local filtering by releaseDate when metadata exists",
  },
};

export function providerStatus() {
  return { provider: "Audius", apiBase: apiBase(), freePlan: "10 requests/second; 500,000 requests/month", ...audiusProvider.supports };
}
