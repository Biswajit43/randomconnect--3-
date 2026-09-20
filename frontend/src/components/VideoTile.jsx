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

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream || null;
      setPlaybackBlocked(false);
      const media = videoRef.current;
      media.volume = 1;
      const tryPlayback = () => media.play().then(() => setPlaybackBlocked(false)).catch(() => setPlaybackBlocked(!muted));
      media.addEventListener("loadedmetadata", tryPlayback);
      media.addEventListener("canplay", tryPlayback);
      media.addEventListener("loadeddata", tryPlayback);
      const unlockPlayback = () => { if (!muted) tryPlayback(); };
      document.addEventListener("pointerdown", unlockPlayback, { once: true, passive: true });
      tryPlayback();
      return () => {
        media.removeEventListener("loadedmetadata", tryPlayback);
        media.removeEventListener("canplay", tryPlayback);
        media.removeEventListener("loadeddata", tryPlayback);
        document.removeEventListener("pointerdown", unlockPlayback);
      };
    }
  }, [muted, stream]);

  useEffect(() => {
    const audioTrack = stream?.getAudioTracks?.()[0];

    if (!audioTrack) {
      setIsSpeaking(false);
      setVoiceIntensity(0);
      return;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    const audioContext = new AudioContextClass();
    const analyser = audioContext.createAnalyser();

    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.75;

    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

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
      for (let i = 0; i < samples.length; i++) {
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

      const intensity = Math.min(1, Math.max(0, (volume - noiseFloor * 1.15) / 0.12));
      const smoothing = speaking ? 0.18 : 0.10;
      
      smoothedIntensity = smoothedIntensity + (intensity - smoothedIntensity) * smoothing;
      
      if (smoothedIntensity < 0.025) smoothedIntensity = 0;

      setIsSpeaking(speaking);
      setVoiceIntensity(smoothedIntensity);
    };

    const intervalId = window.setInterval(sampleAudio, 50);
    audioContext.resume().catch(() => {});

    return () => {
      window.clearInterval(intervalId);
      source.disconnect();
      analyser.disconnect();
      audioContext.close().catch(() => {});
      setIsSpeaking(false);
      setVoiceIntensity(0);
    };
  }, [stream]);

  const waveHeights = [0.35, 0.58, 0.82, 1, 0.72, 0.48, 0.68, 0.92, 0.62, 0.38];
  const hasLiveVideo = Boolean(stream?.getVideoTracks?.().some((track) => track.readyState === "live" && track.enabled));

  return (
    <div
      className={`
        relative
        w-full
        h-full
        rounded-2xl
        overflow-hidden
        bg-panel
        aspect-[4/3] sm:aspect-video
        transition-all
        duration-200
        group

        ${role === "developer" ? "role-developer" : role === "admin" ? "role-admin" : role === "premium" ? "role-premium" : ""}
        ${
          isSpeaking
            ? "border-2 border-signal shadow-[0_0_0_2px_rgba(76,201,240,0.25),0_0_24px_rgba(76,201,240,0.4)]"
            : "border border-white/5"
        }
      `}
      style={{ "--voice-intensity": voiceIntensity }}
    >
      {/* VIDEO */}
      {stream && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
          className={`
            ${hasLiveVideo ? "w-full h-full object-cover bg-black" : "absolute h-px w-px opacity-0"}
            ${mirrored ? "scale-x-[-1]" : ""}
          `}
        />
      )}
      
      {/* CAMERA OFF FALLBACK */}
      {!hasLiveVideo && (
        <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center bg-panel2">
          {avatarUrl ? (
            <img 
              src={avatarUrl} 
              alt="" 
              className="size-16 sm:size-20 rounded-full object-cover border-2 border-white/10 shadow-xl" 
            />
          ) : (
            <div className="size-14 sm:size-16 rounded-full bg-white/5 flex items-center justify-center border border-white/10 shadow-inner">
              <svg className="size-6 text-mist/40" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
              </svg>
            </div>
          )}
        </div>
      )}

      {/* LEGIBILITY GRADIENT OVERLAY */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-black/0 pointer-events-none" />

      {/* CENTERED TAP TO HEAR BUTTON (Fallback if iOS blocks audio) */}
      {playbackBlocked && stream && (
        <div className="absolute inset-0 flex items-center justify-center z-30 bg-black/40 backdrop-blur-sm">
          <button 
            onClick={() => videoRef.current?.play().then(() => setPlaybackBlocked(false)).catch(() => {})} 
            className="ui-button ui-button-muted flex items-center gap-2 border-signal/40 bg-black/80 px-4 text-xs text-signal2 shadow-xl sm:px-5 sm:text-sm"
          >
            <svg className="size-4" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            Tap to enable video
          </button>
        </div>
      )}

      {/* BADGE */}
      {role !== "user" && (
        <span className={`absolute top-3 left-3 rounded-md px-2 py-1 font-mono text-[9px] sm:text-[10px] font-bold tracking-[0.14em] backdrop-blur z-10 ${role === "developer" ? "role-badge-developer" : role === "premium" ? "role-badge-premium" : "role-badge-admin"}`}>
          {role === "developer" ? "◈ DEVELOPER" : role === "premium" ? "PREMIUM" : "ADMIN"}
        </span>
      )}

      {/* LABEL (Truncated to prevent overlap) */}
      {label && (
        <span
          className={`
            absolute
            bottom-3
            left-3
            text-[10px] sm:text-xs
            font-mono
            px-2
            py-1
            rounded-md
            bg-black/60
            backdrop-blur
            z-10
            max-w-[55%]
            truncate

            ${isSpeaking ? "text-emerald-300" : "text-mist"}
            ${role === "premium" ? "role-name-premium" : role === "developer" ? "role-name-developer" : ""}
          `}
        >
          {label}
        </span>
      )}

      {/* VOICE VISUALIZER */}
      <div
        className={`
          voice-wave
          absolute
          bottom-3
          right-3
          flex
          h-7 sm:h-8
          items-center
          gap-[1px] sm:gap-0.5
          rounded-lg
          border
          border-white/10
          bg-black/65
          px-2
          backdrop-blur
          z-10
          ${isSpeaking ? "is-active" : ""}
        `}
        style={{ "--voice-intensity": voiceIntensity }}
        aria-label={isSpeaking ? `${label || "Participant"} is speaking` : `${label || "Participant"} is quiet`}
      >
        {waveHeights.map((height, index) => (
          <span
            key={index}
            className="w-[2px] sm:w-[3px] bg-signal2 rounded-full transition-all duration-75"
            style={{
              height: isSpeaking ? `calc(${height} * 100%)` : '20%',
              "--wave-height": height,
              animationDelay: isSpeaking ? `${index * -70}ms` : "0ms",
            }}
          />
        ))}
      </div>
    </div>
  );
}