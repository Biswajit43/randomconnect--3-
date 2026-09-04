import { useEffect, useRef, useState } from "react";
import { loadYouTubeApi } from "../lib/youtubeApi.js";

export default function MusicPlayer({ music, isModerator, onStop }) {
  const audioRef = useRef(null);
  const youtubeContainerRef = useRef(null);
  const youtubePlayerRef = useRef(null);
  const syncTimerRef = useRef(null);
  const [needsEnable, setNeedsEnable] = useState(false);
  const isYouTube = music?.type === "youtube";

  function elapsedSeconds() {
    if (!music?.startedAt) return 0;
    if (music.status === "paused" && music.pausedAt) {
      return Math.max(0, (music.pausedAt - music.startedAt) / 1000);
    }
    const clockCorrection = music.serverNow && music.receivedAt ? music.serverNow - music.receivedAt : 0;
    return Math.max(0, (Date.now() + clockCorrection - music.startedAt) / 1000);
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
    const audio = audioRef.current;
    const player = youtubePlayerRef.current;
    if (!music || music.status !== "playing") return undefined;

    syncTimerRef.current = window.setInterval(() => {
      const expected = elapsedSeconds();
      if (audio && Math.abs(audio.currentTime - expected) > 0.4) audio.currentTime = expected;
      if (player?.getCurrentTime && Math.abs(player.getCurrentTime() - expected) > 0.6) player.seekTo(expected, true);
    }, 2000);

    return () => window.clearInterval(syncTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [music?.status, music?.startedAt, music?.serverNow, music?.receivedAt]);

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
          playerVars: { autoplay: 1, controls: 0, disablekb: 1, playsinline: 1, rel: 0, modestbranding: 1 },
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

  if (!music || music.status === "stopped") {
    return (
      <div className="flex items-center gap-2.5 bg-panel border border-signal/20 rounded-xl px-3 py-2.5 mb-3 text-xs">
        <span className="text-base" aria-hidden="true">🎵</span>
        <p className="text-mist truncate">
          <span className="text-white font-medium">Room music:</span> host types <code className="text-signal2">/play song</code> or pastes a YouTube link.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-panel border border-signal/25 rounded-2xl p-3 mb-3 shadow-[0_0_0_1px_rgba(76,201,240,0.04)]">
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
        {isModerator && music.status === "playing" && (
          <button onClick={onStop} className="px-3 py-1.5 rounded-lg bg-coral/15 text-coral text-xs whitespace-nowrap">
            Stop
          </button>
        )}
      </div>
      {isYouTube && <div ref={youtubeContainerRef} className="mt-3 w-full aspect-video rounded-lg overflow-hidden" />}
    </div>
  );
}