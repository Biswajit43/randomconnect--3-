import { audiusProvider, providerStatus as audiusStatus } from "./audiusProvider.js";
import { commonsProvider } from "./commonsProvider.js";

function hasAudiusKey() {
  return Boolean(process.env.AUDIUS_API_KEY);
}

function activeProvider() {
  return hasAudiusKey() ? audiusProvider : commonsProvider;
}

async function withFallback(method, filters = {}) {
  if (!hasAudiusKey()) return commonsProvider[method](filters);
  try {
    return await audiusProvider[method](filters);
  } catch (error) {
    console.warn(`[music] Audius ${method} failed; using Wikimedia Commons fallback:`, error.message);
    return commonsProvider[method](filters);
  }
}

export const musicProvider = {
  searchTracks: (filters) => withFallback("searchTracks", filters),
  getTrendingTracks: (filters) => withFallback("getTrendingTracks", filters),
  getRandomTracks: (filters) => withFallback("getRandomTracks", filters),
  getPlayableTracks: (filters) => withFallback("getPlayableTracks", filters),
  getTrack: (trackId) => withFallback("getTrack", trackId),
  get genres() { return activeProvider().genres; },
};

export function musicProviderStatus() {
  if (!hasAudiusKey()) {
    return {
      provider: "Wikimedia Commons",
      apiBase: "https://commons.wikimedia.org/w/api.php",
      freePlan: "Public API; no token required",
      ...commonsProvider.supports,
      audiusOptional: true,
    };
  }
  return { ...audiusStatus(), fallback: "Wikimedia Commons (tokenless, open-license-only)" };
}
