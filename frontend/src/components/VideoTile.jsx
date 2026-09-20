import { useEffect, useRef, useState } from "react";

export default function VideoTile({
  stream,
  muted = false,
  label,
  mirrored = false,
  role = "user",
  avatarUrl = "",
}) {
  const videoRef = useRef(null);

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceIntensity, setVoiceIntensity] = useState(0);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);

  /*
   * ------------------------------------------------------------
   * VIDEO PLAYBACK
   * ------------------------------------------------------------
   */

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.srcObject = stream || null;
    video.volume = 1;

    setPlaybackBlocked(false);

    const tryPlayback = async () => {
      if (!video.srcObject) return;

      try {
        await video.play();
        setPlaybackBlocked(false);
      } catch {
        // Browser autoplay policy may require user interaction.
        if (!muted) {
          setPlaybackBlocked(true);
        }
      }
    };

    const unlockPlayback = () => {
      if (!muted) {
        tryPlayback();
      }
    };

    video.addEventListener("loadedmetadata", tryPlayback);
    video.addEventListener("loadeddata", tryPlayback);
    video.addEventListener("canplay", tryPlayback);

    document.addEventListener("pointerdown", unlockPlayback, {
      once: true,
      passive: true,
    });

    tryPlayback();

    return () => {
      video.removeEventListener("loadedmetadata", tryPlayback);
      video.removeEventListener("loadeddata", tryPlayback);
      video.removeEventListener("canplay", tryPlayback);

      document.removeEventListener("pointerdown", unlockPlayback);
    };
  }, [stream, muted]);

  /*
   * ------------------------------------------------------------
   * SPEAKING DETECTION
   * ------------------------------------------------------------
   */

  useEffect(() => {
    const audioTrack = stream?.getAudioTracks?.()[0];

    if (!audioTrack) {
      setIsSpeaking(false);
      setVoiceIntensity(0);
      return;
    }

    const AudioContextClass =
      window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) return;

    let audioContext;
    let source;
    let analyser;

    try {
      audioContext = new AudioContextClass();

      analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.75;

      source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
    } catch {
      return;
    }

    const samples = new Uint8Array(analyser.fftSize);

    let noiseFloor = 0.015;
    let speaking = false;
    let lastSpeechTime = 0;
    let smoothedIntensity = 0;

    const SPEECH_HOLD_MS = 350;

    const sampleAudio = () => {
      if (!audioTrack.enabled || audioTrack.readyState !== "live") {
        speaking = false;
        smoothedIntensity = 0;

        setIsSpeaking(false);
        setVoiceIntensity(0);

        return;
      }

      analyser.getByteTimeDomainData(samples);

      let sumSquares = 0;

      for (let i = 0; i < samples.length; i += 1) {
        const normalized = (samples[i] - 128) / 128;
        sumSquares += normalized * normalized;
      }

      const volume = Math.sqrt(sumSquares / samples.length);

      if (!speaking) {
        noiseFloor = noiseFloor * 0.97 + volume * 0.03;
      }

      const startThreshold = Math.max(
        0.045,
        noiseFloor * 2.8
      );

      const stopThreshold = Math.max(
        0.032,
        noiseFloor * 1.7
      );

      const now = performance.now();

      if (!speaking) {
        if (volume > startThreshold) {
          speaking = true;
          lastSpeechTime = now;
        }
      } else {
        if (volume > stopThreshold) {
          lastSpeechTime = now;
        }

        if (now - lastSpeechTime > SPEECH_HOLD_MS) {
          speaking = false;
        }
      }

      const intensity = Math.min(
        1,
        Math.max(
          0,
          (volume - noiseFloor * 1.15) / 0.12
        )
      );

      const smoothing = speaking ? 0.18 : 0.1;

      smoothedIntensity =
        smoothedIntensity +
        (intensity - smoothedIntensity) * smoothing;

      if (smoothedIntensity < 0.025) {
        smoothedIntensity = 0;
      }

      setIsSpeaking(speaking);
      setVoiceIntensity(smoothedIntensity);
    };

    const intervalId = window.setInterval(sampleAudio, 50);

    audioContext.resume().catch(() => {});

    return () => {
      window.clearInterval(intervalId);

      try {
        source?.disconnect();
        analyser?.disconnect();
      } catch {
        // Ignore cleanup errors.
      }

      audioContext?.close?.().catch(() => {});

      setIsSpeaking(false);
      setVoiceIntensity(0);
    };
  }, [stream]);

  /*
   * ------------------------------------------------------------
   * VIDEO STATE
   * ------------------------------------------------------------
   */

  const hasLiveVideo = Boolean(
    stream?.getVideoTracks?.().some(
      (track) =>
        track.readyState === "live" &&
        track.enabled
    )
  );

  const waveHeights = [
    0.28,
    0.55,
    0.82,
    1,
    0.65,
    0.42,
    0.75,
    0.95,
    0.58,
    0.32,
  ];

  /*
   * ------------------------------------------------------------
   * ROLE COLORS
   * ------------------------------------------------------------
   */

  const roleConfig = {
    developer: {
      label: "DEVELOPER",
      badge:
        "border-cyan-300/30 bg-cyan-400/15 text-cyan-200 shadow-[0_0_18px_rgba(34,211,238,0.2)]",
      glow:
        "from-cyan-400/30 via-blue-500/10 to-transparent",
      avatar:
        "from-cyan-300 via-blue-500 to-violet-600",
    },

    admin: {
      label: "ADMIN",
      badge:
        "border-rose-300/30 bg-rose-400/15 text-rose-200 shadow-[0_0_18px_rgba(244,63,94,0.2)]",
      glow:
        "from-rose-400/30 via-pink-500/10 to-transparent",
      avatar:
        "from-rose-400 via-pink-500 to-violet-600",
    },

    premium: {
      label: "PREMIUM",
      badge:
        "border-amber-300/30 bg-amber-400/15 text-amber-100 shadow-[0_0_20px_rgba(251,191,36,0.25)]",
      glow:
        "from-amber-300/30 via-orange-500/10 to-transparent",
      avatar:
        "from-amber-200 via-orange-400 to-pink-500",
    },

    user: {
      label: "",
      badge:
        "border-white/10 bg-white/10 text-white/80",
      glow:
        "from-violet-500/20 via-blue-500/10 to-transparent",
      avatar:
        "from-violet-400 via-fuchsia-500 to-cyan-400",
    },
  };

  const currentRole =
    roleConfig[role] || roleConfig.user;

  return (
    <div
      className={`
        group relative
        isolate
        h-full
        w-full
        overflow-hidden
        rounded-[22px]
        bg-[#080b16]
        aspect-[4/3]
        sm:aspect-video

        border
        transition-all
        duration-300
        ease-out

        ${
          isSpeaking
            ? `
              border-cyan-300/60
              shadow-[0_0_0_1px_rgba(103,232,249,0.35),
              0_0_25px_rgba(34,211,238,0.25),
              0_0_60px_rgba(139,92,246,0.18)]
            `
            : `
              border-white/[0.08]
              shadow-[0_15px_50px_rgba(0,0,0,0.35)]
            `
        }
      `}
      style={{
        "--voice-intensity": voiceIntensity,
      }}
    >
      {/* -------------------------------------------------- */}
      {/* AMBIENT COLOR GLOW */}
      {/* -------------------------------------------------- */}

      <div
        className={`
          pointer-events-none
          absolute
          -inset-20
          -z-10
          bg-gradient-to-br
          ${currentRole.glow}
          blur-3xl
          transition-all
          duration-500
          ${
            isSpeaking
              ? "opacity-100 scale-110"
              : "opacity-40 scale-100"
          }
        `}
      />

      {/* -------------------------------------------------- */}
      {/* VIDEO */}
      {/* -------------------------------------------------- */}

      {stream && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
          className={`
            absolute
            inset-0
            h-full
            w-full
            object-cover
            bg-black
            transition-transform
            duration-500
            ${
              hasLiveVideo
                ? "opacity-100"
                : "h-px w-px opacity-0"
            }
            ${mirrored ? "-scale-x-100" : ""}
          `}
        />
      )}

      {/* -------------------------------------------------- */}
      {/* VIDEO COLOR TREATMENT */}
      {/* -------------------------------------------------- */}

      {hasLiveVideo && (
        <>
          <div
            className="
              pointer-events-none
              absolute
              inset-0
              bg-gradient-to-br
              from-violet-500/[0.08]
              via-transparent
              to-cyan-400/[0.08]
              mix-blend-screen
            "
          />

          <div
            className="
              pointer-events-none
              absolute
              inset-0
              bg-gradient-to-t
              from-black/80
              via-black/5
              to-black/20
            "
          />

          <div
            className="
              pointer-events-none
              absolute
              inset-0
              bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.12),transparent_45%)]
            "
          />
        </>
      )}

      {/* -------------------------------------------------- */}
      {/* CAMERA OFF */}
      {/* -------------------------------------------------- */}

      {!hasLiveVideo && (
        <div className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden bg-[#090d19]">
          <div
            className={`
              absolute
              inset-0
              bg-gradient-to-br
              ${currentRole.glow}
              opacity-70
            `}
          />

          {/* Decorative blobs */}
          <div className="absolute -left-12 -top-12 size-32 rounded-full bg-violet-500/20 blur-3xl" />
          <div className="absolute -right-12 bottom-0 size-32 rounded-full bg-cyan-400/15 blur-3xl" />

          <div
            className={`
              relative
              flex
              size-[88px]
              items-center
              justify-center
              rounded-full
              bg-gradient-to-br
              ${currentRole.avatar}
              p-[2px]
              shadow-[0_0_40px_rgba(139,92,246,0.25)]
            `}
          >
            <div className="flex size-full items-center justify-center rounded-full bg-[#0b0f1c]">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt=""
                  className="size-full rounded-full object-cover"
                />
              ) : (
                <svg
                  className="size-9 text-white/40"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                </svg>
              )}
            </div>
          </div>

          <span className="relative mt-4 rounded-full border border-white/10 bg-black/30 px-3 py-1 text-[10px] font-semibold tracking-[0.16em] text-white/45 backdrop-blur">
            CAMERA OFF
          </span>
        </div>
      )}

      {/* -------------------------------------------------- */}
      {/* TOP STATUS */}
      {/* -------------------------------------------------- */}

      <div className="absolute left-3 right-3 top-3 z-20 flex items-start justify-between">
        {/* Live indicator */}
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-2.5 py-1.5 backdrop-blur-xl">
          <span className="relative flex size-2">
            <span
              className={`
                absolute
                inline-flex
                size-full
                animate-ping
                rounded-full
                ${
                  isSpeaking
                    ? "bg-cyan-300"
                    : "bg-emerald-400"
                }
              `}
            />

            <span
              className={`
                relative
                inline-flex
                size-2
                rounded-full
                ${
                  isSpeaking
                    ? "bg-cyan-300"
                    : "bg-emerald-400"
                }
              `}
            />
          </span>

          <span className="text-[9px] font-bold tracking-[0.14em] text-white/70">
            LIVE
          </span>
        </div>

        {/* Role */}
        {role !== "user" && (
          <span
            className={`
              rounded-full
              border
              px-2.5
              py-1.5
              text-[9px]
              font-bold
              tracking-[0.12em]
              backdrop-blur-xl
              ${currentRole.badge}
            `}
          >
            {role === "developer" && "✦ "}
            {role === "premium" && "◆ "}
            {currentRole.label}
          </span>
        )}
      </div>

      {/* -------------------------------------------------- */}
      {/* SPEAKING RIPPLE */}
      {/* -------------------------------------------------- */}

      {isSpeaking && (
        <div className="pointer-events-none absolute inset-0 z-10">
          <div className="absolute inset-0 rounded-[22px] ring-1 ring-cyan-300/30" />

          <div
            className="
              absolute
              left-1/2
              top-1/2
              size-32
              -translate-x-1/2
              -translate-y-1/2
              rounded-full
              border
              border-cyan-300/10
              bg-cyan-300/[0.03]
              blur-sm
            "
            style={{
              transform: `translate(-50%, -50%) scale(${
                1 + voiceIntensity * 0.35
              })`,
            }}
          />
        </div>
      )}

      {/* -------------------------------------------------- */}
      {/* PLAYBACK BLOCKED */}
      {/* -------------------------------------------------- */}

      {playbackBlocked && stream && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/45 p-4 backdrop-blur-md">
          <button
            type="button"
            onClick={async () => {
              try {
                await videoRef.current?.play();
                setPlaybackBlocked(false);
              } catch {
                // Keep button visible if playback remains blocked.
              }
            }}
            className="
              group/play
              flex
              items-center
              gap-3
              rounded-full
              border
              border-cyan-300/30
              bg-[#0b1020]/90
              px-5
              py-3
              text-xs
              font-semibold
              text-white
              shadow-[0_0_35px_rgba(34,211,238,0.2)]
              backdrop-blur-xl
              transition
              hover:scale-105
              hover:border-cyan-300/60
              hover:bg-[#10172c]
              active:scale-95
            "
          >
            <span
              className="
                flex
                size-8
                items-center
                justify-center
                rounded-full
                bg-gradient-to-br
                from-cyan-300
                to-violet-500
                text-black
              "
            >
              <svg
                className="ml-0.5 size-4"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>

            <span>Tap to enable audio</span>
          </button>
        </div>
      )}

      {/* -------------------------------------------------- */}
      {/* BOTTOM INFORMATION */}
      {/* -------------------------------------------------- */}

      <div className="absolute inset-x-0 bottom-0 z-20 p-3">
        <div className="flex items-end justify-between gap-3">
          {/* Name */}
          {label && (
            <div className="min-w-0">
              <div className="flex max-w-[65%] items-center gap-2 rounded-xl border border-white/10 bg-black/45 px-3 py-2 backdrop-blur-xl">
                <span
                  className={`
                    size-1.5
                    shrink-0
                    rounded-full
                    ${
                      isSpeaking
                        ? "bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,0.9)]"
                        : "bg-white/30"
                    }
                  `}
                />

                <span
                  className={`
                    truncate
                    text-[11px]
                    font-semibold
                    ${
                      isSpeaking
                        ? "text-cyan-100"
                        : "text-white/80"
                    }
                  `}
                >
                  {label}
                </span>
              </div>
            </div>
          )}

          {/* Audio Visualizer */}
          <div
            className={`
              flex
              h-9
              shrink-0
              items-center
              gap-[3px]
              rounded-xl
              border
              px-2.5
              backdrop-blur-xl
              transition-all
              duration-300
              ${
                isSpeaking
                  ? "border-cyan-300/25 bg-cyan-300/[0.08] shadow-[0_0_20px_rgba(34,211,238,0.15)]"
                  : "border-white/10 bg-black/50"
              }
            `}
            role="img"
            aria-label={
              isSpeaking
                ? `${label || "Participant"} is speaking`
                : `${label || "Participant"} is quiet`
            }
          >
            {waveHeights.map((height, index) => (
              <span
                key={index}
                className={`
                  w-[2px]
                  rounded-full
                  transition-all
                  duration-75
                  sm:w-[3px]
                  ${
                    isSpeaking
                      ? "bg-gradient-to-t from-violet-400 via-cyan-300 to-white"
                      : "bg-white/20"
                  }
                `}
                style={{
                  height: isSpeaking
                    ? `${Math.max(
                        18,
                        height * (25 + voiceIntensity * 75)
                      )}%`
                    : "20%",
                  animationDelay: isSpeaking
                    ? `${index * -70}ms`
                    : "0ms",
                  boxShadow: isSpeaking
                    ? "0 0 8px rgba(103,232,249,0.5)"
                    : "none",
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* -------------------------------------------------- */}
      {/* PREMIUM BORDER HIGHLIGHT */}
      {/* -------------------------------------------------- */}

      <div
        className="
          pointer-events-none
          absolute
          inset-0
          rounded-[22px]
          border
          border-white/[0.04]
        "
      />

      {/* Top shine */}
      <div
        className="
          pointer-events-none
          absolute
          left-[10%]
          right-[10%]
          top-0
          h-px
          bg-gradient-to-r
          from-transparent
          via-white/30
          to-transparent
        "
      />

      {/* Speaking bottom glow */}
      {isSpeaking && (
        <div
          className="
            pointer-events-none
            absolute
            bottom-0
            left-1/4
            right-1/4
            h-12
            rounded-full
            bg-cyan-400/20
            blur-2xl
          "
        />
      )}
    </div>
  );
}