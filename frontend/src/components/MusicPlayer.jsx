import { useEffect, useRef, useState } from "react";
import { loadYouTubeApi } from "../lib/youtubeApi.js";

export default function MusicPlayer({ music, isModerator, onStop }) {
  const audioRef = useRef(null);
  const youtubeContainerRef = useRef(null);
  const youtubePlayerRef = useRef(null);
  const syncTimerRef = useRef(null);
  const musicRef = useRef(music);
  const [needsEnable, setNeedsEnable] = useState(false);
  const isYouTube = music?.type === "youtube";
  musicRef.current = music;

  function elapsedSeconds() {
    const currentMusic = musicRef.current;
    if (!currentMusic?.startedAt) return 0;
    if (currentMusic.status === "paused" && currentMusic.pausedAt) {
      return Math.max(0, (currentMusic.pausedAt - currentMusic.startedAt) / 1000);
    }
    const clockCorrection = currentMusic.serverNow && currentMusic.receivedAt ? currentMusic.serverNow - currentMusic.receivedAt : 0;
    return Math.max(0, (Date.now() + clockCorrection - currentMusic.startedAt) / 1000);
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
      if (audio) {
        if (Math.abs(audio.currentTime - expected) > 0.4) audio.currentTime = expected;
        if (audio.paused) audio.play().catch(() => setNeedsEnable(true));
      }
      if (player?.getCurrentTime) {
        if (Math.abs(player.getCurrentTime() - expected) > 0.6) player.seekTo(expected, true);
        const playerState = player.getPlayerState?.();
        if (playerState === 2 || playerState === 5) {
          try {
            player.seekTo(expected, true);
            player.playVideo();
          } catch {
            setNeedsEnable(true);
          }
        }
      }
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
          events: {
            onReady: startPlayback,
            onError: () => setNeedsEnable(true),
            onAutoplayBlocked: () => setNeedsEnable(true),
            onStateChange: (event) => {
              // A phone or browser can pause the iframe independently. If
              // the room is still playing, bring this listener back to the
              // shared timeline. Intentional room pause/stop is left alone.
              if (musicRef.current?.status !== "playing") return;
              const paused = event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.CUED;
              if (paused) {
                try {
                  event.target.seekTo(elapsedSeconds(), true);
                  event.target.playVideo();
                } catch {
                  setNeedsEnable(true);
                }
              }
            },
          },
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

  const stopped = !music || music.status === "stopped";

  return (
    <div className={stopped ? "relative" : "relative bg-panel border border-signal/25 rounded-2xl p-3 mb-3 shadow-[0_0_0_1px_rgba(76,201,240,0.04)]"}>
      {stopped ? (
        <div className="flex items-center gap-2.5 bg-panel border border-signal/20 rounded-xl px-3 py-2.5 mb-3 text-xs">
          <span className="text-base" aria-hidden="true">🎵</span>
          <p className="text-mist truncate">
            <span className="text-white font-medium">Room music:</span> host types <code className="text-signal2">/play song</code> or pastes a YouTube link.
          </p>
        </div>
      ) : (
        <div>
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
        </div>
      )}
      <YouTubeMount active={!stopped && isYouTube} containerRef={youtubeContainerRef} />
    </div>
  );
}

function YouTubeMount({ active, containerRef }) {
  return (
    <div
      ref={containerRef}
      aria-hidden={!active}
      className={active ? "mt-3 w-full aspect-video rounded-lg overflow-hidden" : "absolute w-px h-px overflow-hidden opacity-0 pointer-events-none"}
    />
  );
}