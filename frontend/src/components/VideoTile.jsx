import { useEffect, useRef, useState } from "react";

export default function VideoTile({
  stream,
  muted = false,
  label,
  mirrored = false,
  role = "user",
  subRole = "", // e.g., "MUSIC MOD"
  avatarUrl = "",
  onMuteUser,
  onRemoveUser,
  onReportUser,
}) {
  const videoRef = useRef(null);

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceIntensity, setVoiceIntensity] = useState(0);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Close menu when clicking outside (simple blur simulation)
  const handleMenuBlur = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setIsMenuOpen(false);
    }
  };

  /*
   * ============================================================
   * VIDEO PLAYBACK
   * ============================================================
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
        if (!muted) setPlaybackBlocked(true);
      }
    };

    const unlockPlayback = () => {
      if (!muted) tryPlayback();
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
   * ============================================================
   * SPEAKING DETECTION
   * ============================================================
   */

  useEffect(() => {
    const audioTrack = stream?.getAudioTracks?.()[0];
    if (!audioTrack) {
      setIsSpeaking(false);
      setVoiceIntensity(0);
      return;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
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

      const startThreshold = Math.max(0.045, noiseFloor * 2.8);
      const stopThreshold = Math.max(0.032, noiseFloor * 1.7);
      const now = performance.now();

      if (!speaking) {
        if (volume > startThreshold) {
          speaking = true;
          lastSpeechTime = now;
        }
      } else {
        if (volume > stopThreshold) lastSpeechTime = now;
        if (now - lastSpeechTime > SPEECH_HOLD_MS) speaking = false;
      }

      const intensity = Math.min(1, Math.max(0, (volume - noiseFloor * 1.15) / 0.12));
      const smoothing = speaking ? 0.18 : 0.1;
      smoothedIntensity = smoothedIntensity + (intensity - smoothedIntensity) * smoothing;
      if (smoothedIntensity < 0.025) smoothedIntensity = 0;

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
      } catch {}
      audioContext?.close?.().catch(() => {});
      setIsSpeaking(false);
      setVoiceIntensity(0);
    };
  }, [stream]);

  const hasLiveVideo = Boolean(
    stream?.getVideoTracks?.().some((track) => track.readyState === "live" && track.enabled)
  );

  const waveHeights = [0.28, 0.55, 0.82, 1, 0.65, 0.42, 0.75, 0.95, 0.58, 0.32];

  /*
   * ============================================================
   * HIERARCHY & ROLE CONFIGURATION
   * ============================================================
   */

  const roleConfig = {
    developer: {
      badge: "border-fuchsia-400/50 bg-fuchsia-500/20 text-fuchsia-100 hover:bg-fuchsia-500/30",
      glow: "from-fuchsia-600/40 via-purple-600/20 to-transparent",
      avatar: "from-fuchsia-500 via-purple-600 to-indigo-600",
      nameColor: "text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-300 via-cyan-300 to-fuchsia-300 animate-[pulse_3s_ease-in-out_infinite] font-extrabold drop-shadow-[0_0_8px_rgba(217,70,239,0.5)]",
      label: "DEVELOPER",
    },
    admin: {
      badge: "border-rose-400/50 bg-rose-500/20 text-rose-100 hover:bg-rose-500/30",
      glow: "from-rose-500/30 via-pink-600/15 to-transparent",
      avatar: "from-rose-400 via-pink-500 to-red-500",
      nameColor: "text-transparent bg-clip-text bg-gradient-to-r from-rose-300 to-pink-500 font-extrabold drop-shadow-[0_0_5px_rgba(244,63,94,0.4)]",
      label: "ADMIN",
    },
    host: {
      badge: "border-emerald-400/40 bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30",
      glow: "from-emerald-500/30 via-teal-600/15 to-transparent",
      avatar: "from-emerald-400 via-teal-500 to-cyan-500",
      nameColor: "text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 to-teal-400 font-bold",
      label: "HOST",
    },
    premium: {
      badge: "border-amber-300/30 bg-amber-400/15 text-amber-100 hover:bg-amber-400/25",
      glow: "from-amber-400/20 via-orange-500/10 to-transparent",
      avatar: "from-amber-300 via-orange-400 to-pink-500",
      nameColor: "text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-orange-400 font-bold",
      label: "PREMIUM",
    },
    user: {
      badge: "border-white/10 bg-white/10 text-white/80 hover:bg-white/20",
      glow: "from-violet-500/20 via-blue-500/10 to-transparent",
      avatar: "from-violet-400 via-fuchsia-500 to-cyan-400",
      nameColor: "text-white/95 font-semibold",
      label: "",
    },
  };

  const currentRole = roleConfig[role] || roleConfig.user;

  /*
   * ============================================================
   * RENDER
   * ============================================================
   */

  return (
    <div
      className={`
        group relative isolate h-full min-h-[220px] w-full overflow-hidden rounded-[22px] bg-[#080b16]
        border transition-all duration-300
        ${
          isSpeaking
            ? "border-cyan-300/60 shadow-[0_0_0_1px_rgba(103,232,249,0.35),0_0_28px_rgba(34,211,238,0.25),0_0_65px_rgba(139,92,246,0.18)]"
            : "border-white/[0.08] shadow-[0_18px_55px_rgba(0,0,0,0.35)]"
        }
      `}
      style={{ "--voice-intensity": voiceIntensity }}
    >
      {/* AMBIENT GLOW */}
      <div
        className={`pointer-events-none absolute -inset-24 -z-10 bg-gradient-to-br ${currentRole.glow} blur-3xl transition-all duration-500 ${
          isSpeaking ? "scale-110 opacity-100" : "scale-100 opacity-50"
        }`}
      />

      {/* VIDEO */}
      {stream && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
          className={`absolute inset-0 h-full w-full object-cover bg-black ${hasLiveVideo ? "opacity-100" : "h-px w-px opacity-0"} ${mirrored ? "-scale-x-100" : ""}`}
        />
      )}

      {/* VIDEO OVERLAYS */}
      {hasLiveVideo && (
        <>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-violet-500/[0.08] via-transparent to-cyan-400/[0.08] mix-blend-screen" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-black/20" />
        </>
      )}

      {/* CAMERA OFF AVATAR */}
      {!hasLiveVideo && (
        <div className="absolute inset-0 flex items-center justify-center overflow-hidden bg-[#090d19]">
          <div className={`absolute inset-0 bg-gradient-to-br ${currentRole.glow} opacity-70`} />
          <div className={`relative flex size-[76px] items-center justify-center rounded-full bg-gradient-to-br ${currentRole.avatar} p-[2px] shadow-[0_0_45px_rgba(139,92,246,0.3)] sm:size-[88px] lg:size-[96px]`}>
            <div className="flex size-full items-center justify-center overflow-hidden rounded-full bg-[#0b0f1c]">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="size-full object-cover" />
              ) : (
                <svg className="size-8 text-white/40 sm:size-9 lg:size-10" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                </svg>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ====================================================== */}
      {/* TOP BAR & MODERATION MENU */}
      {/* ====================================================== */}
      <div className="absolute left-3 right-3 top-3 z-40 flex items-start justify-between gap-2 sm:left-4 sm:right-4 sm:top-4">
        {/* LIVE BADGE */}
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/45 px-2.5 py-1.5 backdrop-blur-xl sm:px-3 sm:py-1.5">
          <span className="relative flex size-2">
            <span className={`absolute inline-flex size-full animate-ping rounded-full ${isSpeaking ? "bg-cyan-300" : "bg-emerald-400"}`} />
            <span className={`relative inline-flex size-2 rounded-full ${isSpeaking ? "bg-cyan-300" : "bg-emerald-400"}`} />
          </span>
          <span className="text-[9px] font-bold tracking-[0.14em] text-white/75 sm:text-[10px]">LIVE</span>
        </div>

        {/* ROLE TAG & DROPDOWN */}
        <div className="flex flex-col items-end gap-1.5" onBlur={handleMenuBlur}>
          {currentRole.label && (
            <div className="relative">
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[8px] font-bold tracking-[0.12em] backdrop-blur-xl transition-all duration-200 sm:px-3 sm:text-[9px] ${currentRole.badge} ${isMenuOpen ? "ring-2 ring-white/20" : ""}`}
              >
                {role === "developer" && "✦ "}
                {role === "premium" && "◆ "}
                {currentRole.label}
                <svg className={`size-3 transition-transform duration-200 ${isMenuOpen ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>

              {/* ACTION MENU */}
              {isMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-36 overflow-hidden rounded-xl border border-white/10 bg-gradient-to-b from-[#1a1f35]/95 to-[#0a0d17]/95 p-1 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-top-2">
                  <button onClick={onMuteUser} className="w-full rounded-md px-3 py-2 text-left text-xs font-semibold text-white/80 transition-colors hover:bg-white/10">
                    Mute Audio
                  </button>
                  <button onClick={onRemoveUser} className="w-full rounded-md px-3 py-2 text-left text-xs font-semibold text-white/80 transition-colors hover:bg-white/10">
                    Remove All
                  </button>
                  <div className="my-1 h-px w-full bg-white/5" />
                  <button onClick={onReportUser} className="w-full rounded-md px-3 py-2 text-left text-xs font-bold text-red-400 transition-colors hover:bg-red-500/20">
                    Report
                  </button>
                </div>
              )}
            </div>
          )}

          {/* SECONDARY TAG (e.g. MUSIC MOD) */}
          {subRole && (
            <span className="rounded bg-[#0c1222]/90 border border-emerald-400/30 px-2 py-1 text-[7px] font-extrabold uppercase tracking-widest text-emerald-300 backdrop-blur-md shadow-[0_0_10px_rgba(52,211,153,0.1)]">
              {subRole}
            </span>
          )}
        </div>
      </div>

      {/* ====================================================== */}
      {/* SPEAKING EFFECT & PLAYBACK UNBLOCK */}
      {/* ====================================================== */}
      {isSpeaking && (
        <div className="pointer-events-none absolute inset-0 z-10">
          <div className="absolute inset-0 rounded-[22px] ring-1 ring-cyan-300/30" />
          <div
            className="absolute left-1/2 top-1/2 size-32 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-300/10 bg-cyan-300/[0.03] blur-sm transition-transform duration-150"
            style={{ transform: `translate(-50%, -50%) scale(${1 + voiceIntensity * 0.35})` }}
          />
        </div>
      )}

      {playbackBlocked && stream && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-md">
          <button
            type="button"
            onClick={async () => {
              try {
                await videoRef.current?.play();
                setPlaybackBlocked(false);
              } catch {}
            }}
            className="flex items-center gap-3 rounded-full border border-cyan-300/30 bg-[#0b1020]/95 px-4 py-2.5 text-xs font-semibold text-white transition hover:scale-105 active:scale-95"
          >
            <span>Tap to enable audio</span>
          </button>
        </div>
      )}

      {/* ====================================================== */}
      {/* BOTTOM NAME + AUDIO */}
      {/* ====================================================== */}
      <div className="absolute inset-x-0 bottom-0 z-30 p-2.5 sm:p-3 md:p-4 lg:p-4">
        <div className="flex w-full items-end gap-2">
          {/* NAME */}
          {label && (
            <div className="min-w-0 flex-1">
              <div className={`flex min-w-0 w-fit max-w-full items-center gap-2.5 rounded-xl border border-white/15 bg-gradient-to-r from-black/80 via-black/65 to-black/35 px-3 py-2 shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:px-3.5 sm:py-2.5 ${isSpeaking ? "border-cyan-300/35 shadow-[0_0_22px_rgba(34,211,238,0.12)]" : ""}`}>
                <span className={`size-2 shrink-0 rounded-full ${isSpeaking ? "bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,1)]" : "bg-white/35"}`} />
                
                {/* DYNAMIC POWER HIERARCHY TEXT */}
                <span className={`min-w-0 truncate text-sm leading-tight tracking-[-0.01em] sm:text-base md:text-base lg:text-lg ${currentRole.nameColor}`} title={label}>
                  {label}
                </span>

                {isSpeaking && (
                  <span className="shrink-0 rounded-full bg-cyan-300/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.12em] text-cyan-200">
                    speaking
                  </span>
                )}
              </div>
            </div>
          )}

          {/* AUDIO VISUALIZER */}
          <div className={`flex h-9 shrink-0 items-center gap-[3px] rounded-xl border px-2.5 backdrop-blur-xl transition-all duration-300 sm:h-10 sm:px-3 ${isSpeaking ? "border-cyan-300/30 bg-cyan-300/[0.09] shadow-[0_0_22px_rgba(34,211,238,0.18)]" : "border-white/10 bg-black/55"}`}>
            {waveHeights.map((height, index) => (
              <span
                key={index}
                className={`w-[2px] rounded-full transition-all duration-75 sm:w-[3px] ${isSpeaking ? "bg-gradient-to-t from-violet-400 via-cyan-300 to-white" : "bg-white/20"}`}
                style={{
                  height: isSpeaking ? `${Math.max(18, height * (25 + voiceIntensity * 75))}%` : "20%",
                  boxShadow: isSpeaking ? "0 0 8px rgba(103,232,249,0.5)" : "none",
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}