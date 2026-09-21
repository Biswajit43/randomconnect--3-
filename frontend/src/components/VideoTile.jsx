import { useEffect, useLayoutEffect, useRef, useState } from "react";

/*
 * ============================================================
 * ROLE POWER RANKING
 * developer  >  admin  >  host  >  premium  >  user
 *
 * Each tier gets a stronger tile the higher it ranks:
 *   developer  animated rainbow frame, aurora, light sweep, spinning avatar ring
 *   admin      hot rose frame, light sweep, shield badge
 *   host       emerald frame, mic badge
 *   premium    gold frame, diamond badge
 *   user       plain glass tile
 * ============================================================
 */

export const ROLE_PRIORITY = ["developer", "admin", "host", "premium", "user"];

const RANK = { developer: 5, admin: 4, host: 3, premium: 2, user: 1 };

/** Highest rank in a role or a list of roles. Handy for sorting participants. */
export function getRoleRank(role) {
  const list = Array.isArray(role) ? role : [role];

  return list.reduce(
    (best, item) => Math.max(best, RANK[String(item || "").toLowerCase()] || 1),
    1
  );
}

/** Returns a new array with the most powerful roles first (stable for ties). */
export function sortByRolePriority(items, getRole = (item) => item?.role) {
  return items
    .map((item, index) => ({ item, index, rank: getRoleRank(getRole(item)) }))
    .sort((a, b) => b.rank - a.rank || a.index - b.index)
    .map(({ item }) => item);
}

/*
 * Every class is written out in full so Tailwind can see it.
 */
const TIERS = {
  developer: {
    label: "DEVELOPER",
    icon: "sparkle",
    frame: "vt-frame-developer",
    framePad: "p-[2px]",
    badge:
      "border-white/30 bg-gradient-to-r from-cyan-400/45 via-violet-500/45 to-pink-500/45 text-white shadow-[0_0_18px_rgba(139,92,246,0.6)]",
    glow: "from-cyan-400/35 via-violet-500/15 to-transparent",
    avatar: "vt-ring-developer",
    avatarGlow: "shadow-[0_0_55px_rgba(139,92,246,0.55)]",
    nameBorder: "border-violet-300/30",
    nameText:
      "bg-gradient-to-r from-white via-cyan-100 to-violet-200 bg-clip-text text-transparent",
    topLine: "via-cyan-200/80",
    aurora: true,
    sheen: true,
  },

  admin: {
    label: "ADMIN",
    icon: "shield",
    frame: "vt-frame-admin",
    framePad: "p-[2px]",
    badge:
      "border-rose-300/50 bg-gradient-to-r from-rose-500/50 to-red-600/45 text-rose-50 shadow-[0_0_14px_rgba(244,63,94,0.45)]",
    glow: "from-rose-500/30 via-red-600/10 to-transparent",
    avatar: "bg-gradient-to-br from-rose-400 via-red-500 to-violet-600",
    avatarGlow: "shadow-[0_0_48px_rgba(244,63,94,0.4)]",
    nameBorder: "border-rose-300/25",
    nameText: "text-white",
    topLine: "via-rose-200/70",
    aurora: false,
    sheen: true,
  },

  host: {
    label: "HOST",
    icon: "mic",
    frame: "vt-frame-host",
    framePad: "p-[1.5px]",
    badge:
      "border-emerald-300/40 bg-emerald-400/20 text-emerald-50 shadow-[0_0_12px_rgba(52,211,153,0.3)]",
    glow: "from-emerald-400/25 via-teal-500/10 to-transparent",
    avatar: "bg-gradient-to-br from-emerald-300 via-teal-400 to-cyan-500",
    avatarGlow: "shadow-[0_0_45px_rgba(52,211,153,0.35)]",
    nameBorder: "border-emerald-300/20",
    nameText: "text-white",
    topLine: "via-emerald-200/60",
    aurora: false,
    sheen: false,
  },

  premium: {
    label: "PREMIUM",
    icon: "diamond",
    frame: "vt-frame-premium",
    framePad: "p-[1.5px]",
    badge:
      "border-amber-300/40 bg-amber-400/20 text-amber-50 shadow-[0_0_12px_rgba(251,191,36,0.3)]",
    glow: "from-amber-300/25 via-orange-500/10 to-transparent",
    avatar: "bg-gradient-to-br from-amber-200 via-orange-400 to-pink-500",
    avatarGlow: "shadow-[0_0_45px_rgba(251,191,36,0.35)]",
    nameBorder: "border-amber-300/20",
    nameText: "text-white",
    topLine: "via-amber-200/70",
    aurora: false,
    sheen: false,
  },

  user: {
    label: "",
    icon: null,
    frame: "vt-frame-user",
    framePad: "p-px",
    badge: "",
    glow: "from-violet-500/20 via-blue-500/10 to-transparent",
    avatar: "bg-gradient-to-br from-violet-400 via-fuchsia-500 to-cyan-400",
    avatarGlow: "shadow-[0_0_45px_rgba(139,92,246,0.3)]",
    nameBorder: "border-white/15",
    nameText: "text-white/95",
    topLine: "via-white/30",
    aurora: false,
    sheen: false,
  },
};

const BADGE_TONES = {
  cyan: "border-cyan-300/25 bg-cyan-400/10 text-cyan-100",
  emerald: "border-emerald-300/25 bg-emerald-400/10 text-emerald-100",
  amber: "border-amber-300/25 bg-amber-400/10 text-amber-100",
  neutral: "border-white/15 bg-black/45 text-white/80",
};

/** Turns `role` (string or array) into a list of known roles, strongest first. */
function normalizeRoles(role) {
  const list = Array.isArray(role) ? role : [role];

  return [
    ...new Set(
      list
        .map((item) => String(item || "").toLowerCase())
        .filter((item) => item !== "user" && TIERS[item])
    ),
  ].sort((a, b) => RANK[b] - RANK[a]);
}

/*
 * ============================================================
 * STYLES (injected once for the whole page, not once per tile)
 * ============================================================
 */

const STYLE_ID = "vt-video-tile-styles";

const STYLES = `
@property --vt-angle {
  syntax: "<angle>";
  inherits: false;
  initial-value: 0deg;
}

.vt-frame {
  --vt-glow: rgba(103, 232, 249, 0.5);
  background: rgba(255, 255, 255, 0.09);
  box-shadow: 0 18px 55px rgba(0, 0, 0, 0.35);
  transition: box-shadow 0.3s ease;
}

.vt-frame[data-speaking="true"] {
  box-shadow:
    0 0 0 1px rgba(103, 232, 249, 0.3),
    0 0 30px var(--vt-glow),
    0 0 70px rgba(139, 92, 246, 0.2),
    0 18px 55px rgba(0, 0, 0, 0.35);
}

.vt-frame-user[data-speaking="true"] {
  background: linear-gradient(135deg, rgba(103, 232, 249, 0.85), rgba(139, 92, 246, 0.55));
}

.vt-frame-premium {
  --vt-glow: rgba(251, 191, 36, 0.5);
  background: linear-gradient(135deg, #fde68a, #f59e0b 55%, #fb923c);
  box-shadow: 0 0 20px rgba(251, 191, 36, 0.2), 0 18px 55px rgba(0, 0, 0, 0.35);
}

.vt-frame-host {
  --vt-glow: rgba(52, 211, 153, 0.5);
  background: linear-gradient(135deg, #6ee7b7, #14b8a6 55%, #22d3ee);
  box-shadow: 0 0 22px rgba(52, 211, 153, 0.24), 0 18px 55px rgba(0, 0, 0, 0.38);
}

.vt-frame-admin {
  --vt-glow: rgba(244, 63, 94, 0.55);
  background: linear-gradient(135deg, #fb7185, #e11d48 55%, #7c3aed);
  box-shadow: 0 0 26px rgba(244, 63, 94, 0.32), 0 18px 55px rgba(0, 0, 0, 0.4);
}

.vt-frame-developer {
  --vt-glow: rgba(139, 92, 246, 0.6);
  background: conic-gradient(from var(--vt-angle), #22d3ee, #8b5cf6, #ec4899, #f59e0b, #22d3ee);
  box-shadow:
    0 0 26px rgba(139, 92, 246, 0.38),
    0 0 64px rgba(34, 211, 238, 0.18),
    0 18px 55px rgba(0, 0, 0, 0.42);
  animation: vt-spin 6s linear infinite;
}

.vt-ring-developer {
  background: conic-gradient(from var(--vt-angle), #22d3ee, #8b5cf6, #ec4899, #f59e0b, #22d3ee);
  animation: vt-spin 5s linear infinite;
}

.vt-sheen {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.vt-sheen::before {
  content: "";
  position: absolute;
  top: -50%;
  bottom: -50%;
  left: 0;
  width: 60%;
  background: linear-gradient(105deg, transparent 20%, rgba(255, 255, 255, 0.16) 50%, transparent 80%);
  transform: translateX(-120%) skewX(-12deg);
  animation: vt-sweep 5.5s ease-in-out infinite;
}

.vt-aurora {
  position: absolute;
  border-radius: 9999px;
  filter: blur(48px);
  animation: vt-drift 9s ease-in-out infinite alternate;
}

@keyframes vt-spin {
  to { --vt-angle: 360deg; }
}

@keyframes vt-sweep {
  0%, 60% { transform: translateX(-120%) skewX(-12deg); }
  100% { transform: translateX(260%) skewX(-12deg); }
}

@keyframes vt-drift {
  from { transform: translate3d(-8%, -6%, 0) scale(1); }
  to { transform: translate3d(10%, 8%, 0) scale(1.15); }
}

@media (prefers-reduced-motion: reduce) {
  .vt-frame-developer,
  .vt-ring-developer,
  .vt-sheen::before,
  .vt-aurora {
    animation: none !important;
  }
}
`;

function useTileStyles() {
  useLayoutEffect(() => {
    if (document.getElementById(STYLE_ID)) return;

    const element = document.createElement("style");
    element.id = STYLE_ID;
    element.textContent = STYLES;
    document.head.appendChild(element);
  }, []);
}

/*
 * ============================================================
 * SMALL PIECES
 * ============================================================
 */

function TierIcon({ name, className = "size-3" }) {
  const shapes = {
    sparkle: (
      <path d="M12 2l2.2 6.8L21 11l-6.8 2.2L12 20l-2.2-6.8L3 11l6.8-2.2L12 2z" />
    ),
    shield: <path d="M12 2l8 3v6c0 5-3.4 9-8 11-4.6-2-8-6-8-11V5l8-3z" />,
    mic: (
      <>
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path
          d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21"
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </>
    ),
    diamond: <path d="M12 3l7 9-7 9-7-9 7-9z" />,
  };

  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {shapes[name]}
    </svg>
  );
}

/**
 * Compact button for the tile's top-right corner.
 * Pass it through the `actions` prop so it never overlaps the badges:
 *   <VideoTile actions={<TileActionButton onClick={report}>Report</TileActionButton>} />
 */
export function TileActionButton({
  tone = "danger",
  className = "",
  children,
  ...props
}) {
  const tones = {
    danger:
      "border-rose-300/25 bg-rose-500/15 text-rose-100 hover:bg-rose-500/30",
    neutral: "border-white/15 bg-black/45 text-white/85 hover:bg-white/10",
  };

  return (
    <button
      type="button"
      {...props}
      className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-[11px] font-semibold backdrop-blur-xl transition active:scale-95 ${
        tones[tone] || tones.neutral
      } ${className}`}
    >
      {children}
    </button>
  );
}

/*
 * ============================================================
 * VIDEO TILE
 *
 * Props
 *   stream, muted, label, mirrored, avatarUrl   as before
 *   role      "developer" | "admin" | "host" | "premium" | "user"
 *             or an array such as ["host", "premium"]. The strongest
 *             role decides how the whole tile looks.
 *   badges    extra chips beside the role, e.g. ["MUSIC MOD"] or
 *             [{ label: "MUSIC MOD", tone: "cyan" }]
 *   actions   anything for the top-right corner (Report button, menu...)
 * ============================================================
 */

export default function VideoTile({
  stream,
  muted = false,
  label,
  mirrored = false,
  role = "user",
  avatarUrl = "",
  badges = [],
  actions = null,
}) {
  useTileStyles();

  const videoRef = useRef(null);

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceIntensity, setVoiceIntensity] = useState(0);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);

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

      const startThreshold = Math.max(0.045, noiseFloor * 2.8);
      const stopThreshold = Math.max(0.032, noiseFloor * 1.7);

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
        Math.max(0, (volume - noiseFloor * 1.15) / 0.12)
      );

      const smoothing = speaking ? 0.18 : 0.1;

      smoothedIntensity =
        smoothedIntensity + (intensity - smoothedIntensity) * smoothing;

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
   * ============================================================
   * DERIVED STATE
   * ============================================================
   */

  const hasLiveVideo = Boolean(
    stream?.getVideoTracks?.().some(
      (track) => track.readyState === "live" && track.enabled
    )
  );

  const waveHeights = [0.28, 0.55, 0.82, 1, 0.65, 0.42, 0.75, 0.95, 0.58, 0.32];

  const roles = normalizeRoles(role);
  const tierKey = roles[0] || "user";
  const tier = TIERS[tierKey];

  const extraBadges = (Array.isArray(badges) ? badges : [badges])
    .filter(Boolean)
    .map((item) => (typeof item === "string" ? { label: item } : item));

  /*
   * ============================================================
   * RENDER
   * ============================================================
   */

  return (
    <div
      className={`vt-frame ${tier.frame} ${tier.framePad} relative h-full min-h-[220px] w-full rounded-[24px]`}
      data-speaking={isSpeaking ? "true" : "false"}
      data-tier={tierKey}
      style={{ "--voice-intensity": voiceIntensity }}
    >
      <div className="group relative isolate h-full min-h-[216px] w-full overflow-hidden rounded-[22px] bg-[#080b16]">
        {/* ====================================================== */}
        {/* AMBIENT GLOW */}
        {/* ====================================================== */}

        <div
          className={`pointer-events-none absolute -inset-24 -z-10 bg-gradient-to-br ${tier.glow} blur-3xl transition-all duration-500 ${
            isSpeaking ? "scale-110 opacity-100" : "scale-100 opacity-60"
          }`}
        />

        {/* Developer only: slow moving aurora */}
        {tier.aurora && (
          <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
            <div className="vt-aurora -left-10 -top-10 size-44 bg-cyan-400/25" />
            <div
              className="vt-aurora -bottom-12 -right-8 size-48 bg-violet-500/25"
              style={{ animationDelay: "-3s" }}
            />
            <div
              className="vt-aurora left-1/3 top-1/2 size-36 bg-pink-500/15"
              style={{ animationDelay: "-6s" }}
            />
          </div>
        )}

        {/* ====================================================== */}
        {/* VIDEO */}
        {/* ====================================================== */}

        {stream && (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={muted}
            className={`bg-black object-cover ${
              hasLiveVideo
                ? "absolute inset-0 h-full w-full opacity-100"
                : "pointer-events-none absolute left-0 top-0 h-px w-px opacity-0"
            } ${mirrored ? "-scale-x-100" : ""}`}
          />
        )}

        {/* ====================================================== */}
        {/* VIDEO COLOR OVERLAY */}
        {/* ====================================================== */}

        {hasLiveVideo && (
          <>
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-violet-500/[0.08] via-transparent to-cyan-400/[0.08] mix-blend-screen" />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-black/30" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.12),transparent_45%)]" />
          </>
        )}

        {/* ====================================================== */}
        {/* CAMERA OFF AVATAR */}
        {/* ====================================================== */}

        {!hasLiveVideo && (
          <div className="absolute inset-0 flex items-center justify-center overflow-hidden bg-[#090d19] pb-14 pt-10">
            <div
              className={`absolute inset-0 bg-gradient-to-br ${tier.glow} opacity-70`}
            />

            <div className="absolute -left-16 -top-16 size-40 rounded-full bg-violet-500/20 blur-3xl" />
            <div className="absolute -bottom-16 -right-16 size-40 rounded-full bg-cyan-400/15 blur-3xl" />

            <div
              className={`relative flex size-[76px] items-center justify-center rounded-full p-[2px] sm:size-[88px] lg:size-[96px] ${tier.avatar} ${tier.avatarGlow}`}
            >
              <div className="flex size-full items-center justify-center overflow-hidden rounded-full bg-[#0b0f1c]">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  <svg
                    className="size-8 text-white/40 sm:size-9 lg:size-10"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                  </svg>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Developer / admin: a slow light sweep across the tile */}
        {tier.sheen && <div className="vt-sheen z-10" aria-hidden="true" />}

        {/* ====================================================== */}
        {/* TOP BAR                                                  */}
        {/*                                                          */}
        {/* One flex row, so nothing can sit on top of anything else. */}
        {/* Left: LIVE + role + extra badges (wraps if the tile is    */}
        {/* narrow). Right: actions such as Report.                   */}
        {/* ====================================================== */}

        <div className="absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-2 p-2.5 sm:p-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            {/* LIVE */}
            <div className="flex h-7 items-center gap-2 rounded-full border border-white/10 bg-black/45 px-2.5 backdrop-blur-xl">
              <span className="relative flex size-2">
                <span
                  className={`absolute inline-flex size-full animate-ping rounded-full ${
                    isSpeaking ? "bg-cyan-300" : "bg-emerald-400"
                  }`}
                />
                <span
                  className={`relative inline-flex size-2 rounded-full ${
                    isSpeaking ? "bg-cyan-300" : "bg-emerald-400"
                  }`}
                />
              </span>

              <span className="text-[9px] font-bold tracking-[0.14em] text-white/75 sm:text-[10px]">
                LIVE
              </span>
            </div>

            {/* Strongest role, full badge */}
            {roles[0] && (
              <span
                className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[9px] font-bold tracking-[0.12em] backdrop-blur-xl sm:text-[10px] ${TIERS[roles[0]].badge}`}
              >
                <TierIcon name={TIERS[roles[0]].icon} />
                {TIERS[roles[0]].label}
              </span>
            )}

            {/* Any other roles, icon only, so they never crowd the row */}
            {roles.slice(1).map((extraRole) => (
              <span
                key={extraRole}
                title={TIERS[extraRole].label}
                aria-label={TIERS[extraRole].label}
                className={`inline-flex size-7 items-center justify-center rounded-full border backdrop-blur-xl ${TIERS[extraRole].badge}`}
              >
                <TierIcon name={TIERS[extraRole].icon} />
              </span>
            ))}

            {/* Extra chips from the parent (e.g. MUSIC MOD) */}
            {extraBadges.map((item) => (
              <span
                key={item.label}
                className={`inline-flex h-7 items-center rounded-full border px-2.5 text-[9px] font-bold tracking-[0.12em] backdrop-blur-xl sm:text-[10px] ${
                  BADGE_TONES[item.tone] || BADGE_TONES.cyan
                }`}
              >
                {item.label}
              </span>
            ))}
          </div>

          {actions && (
            <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
          )}
        </div>

        {/* ====================================================== */}
        {/* SPEAKING EFFECT */}
        {/* ====================================================== */}

        {isSpeaking && (
          <div className="pointer-events-none absolute inset-0 z-10">
            <div className="absolute inset-0 rounded-[22px] ring-1 ring-cyan-300/30" />

            <div
              className="absolute left-1/2 top-1/2 size-32 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-300/10 bg-cyan-300/[0.03] blur-sm transition-transform duration-150"
              style={{
                transform: `translate(-50%, -50%) scale(${
                  1 + voiceIntensity * 0.35
                })`,
              }}
            />
          </div>
        )}

        {/* ====================================================== */}
        {/* PLAYBACK */}
        {/* ====================================================== */}

        {playbackBlocked && stream && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-md">
            <button
              type="button"
              onClick={async () => {
                try {
                  await videoRef.current?.play();
                  setPlaybackBlocked(false);
                } catch {
                  // Keep visible if browser still blocks playback.
                }
              }}
              className="flex items-center gap-3 rounded-full border border-cyan-300/30 bg-[#0b1020]/95 px-4 py-2.5 text-xs font-semibold text-white shadow-[0_0_35px_rgba(34,211,238,0.2)] transition hover:scale-105 hover:border-cyan-300/60 active:scale-95 sm:px-5 sm:py-3"
            >
              <span className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-cyan-300 to-violet-500 text-black">
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

        {/* ====================================================== */}
        {/* BOTTOM NAME + AUDIO */}
        {/* ====================================================== */}

        <div className="absolute inset-x-0 bottom-0 z-30 p-2.5 sm:p-3 md:p-4">
          <div className="flex w-full flex-col items-stretch gap-2 sm:flex-row sm:items-end">
            {label && (
              <div className="min-w-0 flex-1">
                <div
                  className={`flex w-full min-w-0 max-w-full items-center gap-2.5 overflow-x-auto rounded-xl border bg-gradient-to-r from-black/80 via-black/65 to-black/35 px-3 py-2 shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:w-fit sm:overflow-visible sm:px-3.5 sm:py-2.5 md:px-4 ${
                    isSpeaking
                      ? "border-cyan-300/35 shadow-[0_0_22px_rgba(34,211,238,0.12)]"
                      : tier.nameBorder
                  }`}
                >
                  <span
                    className={`size-2 shrink-0 rounded-full ${
                      isSpeaking
                        ? "bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,1)]"
                        : "bg-white/35"
                    }`}
                  />

                  <span
                    className={`min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-xs font-bold leading-tight tracking-[-0.01em] sm:flex-none sm:overflow-visible sm:truncate sm:text-base lg:text-lg ${tier.nameText}`}
                    title={label}
                  >
                    {label}
                  </span>

                  {isSpeaking && (
                    <span className="hidden shrink-0 rounded-full bg-cyan-300/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.12em] text-cyan-200 sm:inline-flex sm:text-[9px]">
                      speaking
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* AUDIO VISUALIZER */}
            <div
              className={`flex h-9 shrink-0 items-center gap-[3px] rounded-xl border px-2.5 backdrop-blur-xl transition-all duration-300 sm:h-10 sm:px-3 ${
                isSpeaking
                  ? "border-cyan-300/30 bg-cyan-300/[0.09] shadow-[0_0_22px_rgba(34,211,238,0.18)]"
                  : "border-white/10 bg-black/55"
              }`}
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
                  className={`w-[2px] rounded-full transition-all duration-75 sm:w-[3px] ${
                    isSpeaking
                      ? "bg-gradient-to-t from-violet-400 via-cyan-300 to-white"
                      : "bg-white/20"
                  }`}
                  style={{
                    height: isSpeaking
                      ? `${Math.max(
                          18,
                          height * (25 + voiceIntensity * 75)
                        )}%`
                      : "20%",

                    boxShadow: isSpeaking
                      ? "0 0 8px rgba(103,232,249,0.5)"
                      : "none",
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* ====================================================== */}
        {/* TOP LIGHT (tinted per tier) */}
        {/* ====================================================== */}

        <div
          className={`pointer-events-none absolute left-[8%] right-[8%] top-0 h-px bg-gradient-to-r from-transparent ${tier.topLine} to-transparent`}
        />

        {/* SPEAKING BOTTOM GLOW */}

        {isSpeaking && (
          <div className="pointer-events-none absolute bottom-0 left-1/4 right-1/4 h-14 rounded-full bg-cyan-400/20 blur-2xl" />
        )}
      </div>
    </div>
  );
}