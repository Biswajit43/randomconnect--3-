/**
 * Resolves a song name to a playable preview using Deezer's public search
 * API — no API key required for basic search.
 *
 * IMPORTANT LIMITATION: this returns a 30-second preview clip, not the full
 * track. That's the actual legal boundary for "free" access to mainstream
 * commercial music (e.g. "Shape of You") — a full-length copy of a licensed
 * commercial recording isn't available through any genuinely free/legal API,
 * "free" or otherwise. If full-length playback matters more than mainstream
 * catalog coverage, swap this for a Creative-Commons source like Jamendo,
 * which trades chart hits for full tracks under an open license.
 *
 * Uses Node's built-in global fetch (stable since Node 18, which is already
 * this project's minimum engine version) — no new HTTP dependency needed.
 */
export async function searchTrack(query) {
  const res = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=1`);
  if (!res.ok) throw new Error(`Deezer search failed with status ${res.status}`);

  const data = await res.json();
  const track = data?.data?.[0];
  if (track?.preview) {
    return {
      title: track.title,
      artist: track.artist?.name || "Unknown artist",
      previewUrl: track.preview,
      cover: track.album?.cover_medium || null,
    };
  }

  const fallbackRes = await fetch(
    `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=1`
  );
  if (!fallbackRes.ok) throw new Error(`iTunes search failed with status ${fallbackRes.status}`);

  const fallbackData = await fallbackRes.json();
  const fallbackTrack = fallbackData?.results?.find((item) => item.previewUrl);
  if (!fallbackTrack) return null;

  return {
    title: fallbackTrack.trackName,
    artist: fallbackTrack.artistName || "Unknown artist",
    previewUrl: fallbackTrack.previewUrl,
    cover: fallbackTrack.artworkUrl100 || null,
  };
}

export function parseYouTubeId(value) {
  const pastedUrl = String(value || "").match(/https?:\/\/[^\s<>]+/i)?.[0]?.replace(/[),.;!?]+$/, "");
  if (!pastedUrl) return null;

  try {
    const url = new URL(pastedUrl);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    if (hostname !== "youtu.be" && hostname !== "youtube.com" && !hostname.endsWith(".youtube.com")) return null;

    let videoId = url.searchParams.get("v");
    if (hostname === "youtu.be") videoId = url.pathname.split("/")[1];
    if (/^\/(shorts|live|embed)\//i.test(url.pathname)) videoId = url.pathname.split("/")[2];
    return videoId && /^[A-Za-z0-9_-]{11}$/.test(videoId) ? videoId : null;
  } catch {
    return null;
  }
}

export async function getYouTubeMetadata(videoId) {
  const res = await fetch(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`
  );
  if (!res.ok) return { title: "YouTube video", author: "Unknown" };
  const data = await res.json();
  return { title: data.title || "YouTube video", author: data.author_name || "Unknown" };
}

export async function resolveTrack(query) {
  const youtubeId = parseYouTubeId(query);
  if (youtubeId) {
    const metadata = await getYouTubeMetadata(youtubeId);
    return {
      type: "youtube",
      videoId: youtubeId,
      title: metadata.title,
      artist: metadata.author,
    };
  }
  return { type: "preview", ...(await searchTrack(query)) };
}