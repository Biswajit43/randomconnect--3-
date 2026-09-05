import { Component, useEffect, useRef, useState } from "react";
import { loadYouTubeApi } from "../lib/youtubeApi.js";

export default function MusicPlayer({ music, isModerator, onStop }) {
  const audioRef = useRef(null);
  const youtubeContainerRef = useRef(null);
  const youtubePlayerRef = useRef(null);
  const syncTimerRef = useRef(null);
  const musicRef = useRef(music);
  const [needsEnable, setNeedsEnable] = useState(false);
  const [localPaused, setLocalPaused] = useState(false);
  const isYouTube = music?.type === "youtube";
  const stopped = !music || music.status === "stopped";
  musicRef.current = music;

  useEffect(() => {
    setLocalPaused(false);
    setNeedsEnable(false);
  }, [music?.videoId, music?.previewUrl, music?.startedAt]);

  function elapsedSeconds() {
    const currentMusic = musicRef.current;
    if (!currentMusic?.startedAt) return 0;
    if (currentMusic.status === "paused" && currentMusic.pausedAt) {
      return Math.max(0, (currentMusic.pausedAt - currentMusic.startedAt) / 1000);
    }
    const clockCorrection = currentMusic.serverNow && currentMusic.receivedAt ? currentMusic.serverNow - currentMusic.receivedAt : 0;
    return Math.max(0, (Date.now() + clockCorrection - currentMusic.startedAt) / 1000);
  }

  function toggleLocalPlayback() {
    const player = youtubePlayerRef.current;
    if (localPaused || needsEnable) {
      const position = elapsedSeconds();
      if (isYouTube && player?.seekTo) {
        player.seekTo(position, true);
        player.playVideo();
      } else if (audioRef.current) {
        audioRef.current.currentTime = position;
        audioRef.current.play().catch(() => setNeedsEnable(true));
      }
      setLocalPaused(false);
      return;
    }
    if (isYouTube) player?.pauseVideo();
    else audioRef.current?.pause();
    setLocalPaused(true);
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
    if (!music || music.status !== "playing") return undefined;

    syncTimerRef.current = window.setInterval(() => {
      const expected = elapsedSeconds();
      if (audio) {
        if (Math.abs(audio.currentTime - expected) > 0.4) audio.currentTime = expected;
      }
      const player = youtubePlayerRef.current;
      if (player?.getCurrentTime) {
        if (player.getPlayerState?.() !== 1) return;
        const current = player.getCurrentTime();
        // Let YouTube play naturally. Only correct meaningful drift; seeking
        // for small differences makes playback visibly stutter.
        if (Math.abs(current - expected) > 1.5) player.seekTo(expected, true);
      }
    }, 1500);

    return () => window.clearInterval(syncTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [music?.status, music?.startedAt, music?.serverNow, music?.receivedAt]);

  useEffect(() => {
    if (!isYouTube || !music?.videoId) return;
    let cancelled = false;
    let retryFrame = 0;

    loadYouTubeApi().then((YT) => {
      if (cancelled) return;
      const mountPlayer = () => {
        if (cancelled) return;
        if (!youtubeContainerRef.current) {
          retryFrame = window.requestAnimationFrame(mountPlayer);
          return;
        }

        const startPlayback = () => {
          const player = youtubePlayerRef.current;
          if (!player) return;
          player.seekTo(elapsedSeconds(), true);
          if (musicRef.current?.status === "playing") {
            try {
              player.playVideo();
            } catch {
              setNeedsEnable(true);
            }
          } else {
            player.pauseVideo();
          }
        };

        if (!youtubePlayerRef.current) {
          youtubePlayerRef.current = new YT.Player(youtubeContainerRef.current, {
            videoId: music.videoId,
            width: "100%",
            height: "100%",
            playerVars: {
              autoplay: 0,
              controls: 0,
              disablekb: 1,
              fs: 0,
              iv_load_policy: 3,
              modestbranding: 1,
              playsinline: 1,
              rel: 0,
              start: Math.floor(elapsedSeconds()),
            },
            events: {
              onReady: startPlayback,
              onError: () => setNeedsEnable(true),
              onAutoplayBlocked: () => setNeedsEnable(true),
              onStateChange: (event) => {
                if (musicRef.current?.status !== "playing") return;
                const playing = event.data === YT.PlayerState.PLAYING;
                if (event.data === YT.PlayerState.PAUSED) setLocalPaused(true);
                else if (playing) setLocalPaused(false);
              },
            },
          });
        } else {
          youtubePlayerRef.current.loadVideoById(music.videoId);
          startPlayback();
        }
      };

      mountPlayer();
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(retryFrame);
      youtubePlayerRef.current?.destroy?.();
      youtubePlayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isYouTube, music?.videoId]);

  useEffect(() => {
    const player = youtubePlayerRef.current;
    if (!isYouTube || !player?.pauseVideo) return;
    if (music.status === "paused" || music.status === "stopped") player.pauseVideo();
    if (music.status === "playing") {
      player.seekTo(elapsedSeconds(), true);
      player.playVideo?.();
    }
    // A global resume changes startedAt so every YouTube listener seeks to
    // the exact shared pause position before playback continues.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isYouTube, music?.status, music?.startedAt]);

  useEffect(() => {
    if (!stopped || !audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
  }, [stopped]);

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
        {!isYouTube && (
          <audio
            ref={audioRef}
            src={music.previewUrl}
            preload="auto"
            onPause={() => setLocalPaused(true)}
            onPlay={() => setLocalPaused(false)}
          />
        )}
        <span className="text-lg shrink-0">🎵</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white truncate">{music.title || "Room music"} — {music.artist || "Unknown artist"}</p>
          <p className="text-xs text-mist">
            requested by {music.requestedBy || "Host"}
            {!isYouTube && " · 30s preview"}
            {isYouTube && " · YouTube"}
            {music.status === "paused" && " · paused"}
            {localPaused && music.status === "playing" && " · paused on this device"}
          </p>
        </div>
        {needsEnable && (
          <button
            onClick={() => {
              toggleLocalPlayback();
              setNeedsEnable(false);
            }}
            className="shrink-0 px-3 py-1.5 rounded-lg bg-signal text-ink text-xs font-semibold whitespace-nowrap"
          >
            Play here
          </button>
        )}
        <button
          onClick={toggleLocalPlayback}
          className="shrink-0 px-3 py-1.5 rounded-lg bg-panel2 text-mist text-xs font-semibold whitespace-nowrap hover:text-white"
        >
          {localPaused ? "Play" : "Pause"}
        </button>
        {isModerator && (
          <button onClick={onStop} className="px-3 py-1.5 rounded-lg bg-coral/15 text-coral text-xs whitespace-nowrap">
            Stop
          </button>
        )}
      </div>
        </div>
      )}
      {!stopped && isYouTube && <YouTubeMount containerRef={youtubeContainerRef} />}
    </div>
  );
}

export class MusicPlayerBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidUpdate(previousProps) {
    if (this.state.failed && previousProps.music?.videoId !== this.props.music?.videoId) {
      this.setState({ failed: false });
    }
  }

  render() {
    if (this.state.failed) {
      return <div className="bg-panel border border-coral/25 rounded-xl px-3 py-2.5 text-xs text-mist">Music is unavailable on this device. The room is still connected.</div>;
    }
    return <MusicPlayer {...this.props} />;
  }
}

function YouTubeMount({ containerRef }) {
  return (
    <div
      className="relative mt-3 mx-auto w-full max-w-2xl aspect-video overflow-hidden rounded-xl bg-black border border-white/10"
    >
      <div
        ref={containerRef}
        className="absolute inset-0 [&>iframe]:absolute [&>iframe]:inset-0 [&>iframe]:block [&>iframe]:w-full [&>iframe]:h-full"
      />
    </div>
  );
}