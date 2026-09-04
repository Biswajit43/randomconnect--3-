import { useEffect, useRef, useState } from "react";
import { loadYouTubeApi } from "../lib/youtubeApi.js";

export default function MusicPlayer({ music, isModerator, onStop }) {
  const audioRef = useRef(null);
  const youtubeContainerRef = useRef(null);
  const youtubePlayerRef = useRef(null);
  const [needsEnable, setNeedsEnable] = useState(false);
  const isYouTube = music?.type === "youtube";

  function elapsedSeconds() {
    return music?.startedAt ? Math.max(0, (Date.now() - music.startedAt) / 1000) : 0;
  }

  useEffect(() => {
    const audio = audioRef.current;
    if (isYouTube || !audio || !music?.previewUrl) return;

    if (music.status === "playing") {
      audio.currentTime = elapsedSeconds();
      audio.play().catch(() => setNeedsEnable(true));
    } else {
      audio.pause();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isYouTube, music?.previewUrl, music?.startedAt, music?.status]);

  useEffect(() => {
    if (!isYouTube || !music?.videoId || !youtubeContainerRef.current) return;
    let cancelled = false;

    loadYouTubeApi().then((YT) => {
      if (cancelled) return;
      const startPlayback = () => {
        const player = youtubePlayerRef.current;
        if (!player || music.status !== "playing") return;
        player.seekTo(elapsedSeconds(), true);
        try {
          player.playVideo();
        } catch {
          setNeedsEnable(true);
        }
      };

      if (!youtubePlayerRef.current) {
        youtubePlayerRef.current = new YT.Player(youtubeContainerRef.current, {
          videoId: music.videoId,
          width: "100%",
          height: "100%",
          playerVars: { autoplay: 1, controls: 1, playsinline: 1, rel: 0, modestbranding: 1 },
          events: { onReady: startPlayback, onError: () => setNeedsEnable(true) },
        });
      } else {
        youtubePlayerRef.current.loadVideoById(music.videoId);
        startPlayback();
      }
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isYouTube, music?.videoId]);

  useEffect(() => {
    const player = youtubePlayerRef.current;
    if (!isYouTube || !player?.pauseVideo) return;
    if (music.status === "paused" || music.status === "stopped") player.pauseVideo();
    if (music.status === "playing") player.playVideo?.();
  }, [isYouTube, music?.status]);

  useEffect(() => {
    if ((!music || music.status === "stopped") && youtubePlayerRef.current?.destroy) {
      youtubePlayerRef.current.destroy();
      youtubePlayerRef.current = null;
    }
  }, [music]);

  if (!music || music.status === "stopped") return null;

  return (
    <div className="bg-panel border border-white/5 rounded-xl p-3 mb-3">
      <div className="flex items-center gap-3">
        {!isYouTube && <audio ref={audioRef} src={music.previewUrl} preload="auto" />}
        <span className="text-lg shrink-0">🎵</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white truncate">{music.title} — {music.artist}</p>
          <p className="text-xs text-mist">
            requested by {music.requestedBy}
            {!isYouTube && " · 30s preview"}
            {isYouTube && " · YouTube"}
            {music.status === "paused" && " · paused"}
          </p>
        </div>
        {needsEnable && (
          <button
            onClick={() => {
              if (isYouTube) youtubePlayerRef.current?.playVideo();
              else audioRef.current?.play();
              setNeedsEnable(false);
            }}
            className="px-3 py-1.5 rounded-lg bg-signal text-ink text-xs font-semibold whitespace-nowrap"
          >
            Enable Music
          </button>
        )}
        {isModerator && (
          <button onClick={onStop} className="px-3 py-1.5 rounded-lg bg-coral/15 text-coral text-xs whitespace-nowrap">
            Stop
          </button>
        )}
      </div>
      {isYouTube && <div ref={youtubeContainerRef} className="mt-3 w-full aspect-video rounded-lg overflow-hidden" />}
    </div>
  );
}