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

    const AudioContextClass =
      window.AudioContext || window.webkitAudioContext;

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

    // How long the signal must remain below the threshold
    // before we consider the person quiet.
    const SPEECH_HOLD_MS = 350;

    const sampleAudio = () => {
      if (
        !audioTrack.enabled ||
        audioTrack.readyState !== "live"
      ) {
        speaking = false;
        smoothedIntensity = 0;

        setIsSpeaking(false);
        setVoiceIntensity(0);

        return;
      }

      analyser.getByteTimeDomainData(samples);

      // ---------------------------------------
      // Calculate RMS volume
      // ---------------------------------------

      let sumSquares = 0;

      for (let i = 0; i < samples.length; i++) {
        const normalized = (samples[i] - 128) / 128;
        sumSquares += normalized * normalized;
      }

      const volume = Math.sqrt(
        sumSquares / samples.length
      );

      // ---------------------------------------
      // Learn background noise
      // ---------------------------------------

      if (!speaking) {
        noiseFloor =
          noiseFloor * 0.97 +
          volume * 0.03;
      }

      // ---------------------------------------
      // Dynamic speech thresholds
      // ---------------------------------------

      const startThreshold = Math.max(
        0.045,
        noiseFloor * 2.8
      );

      const stopThreshold = Math.max(
        0.032,
        noiseFloor * 1.7
      );

      const now = performance.now();

      // ---------------------------------------
      // Speaking detection
      // ---------------------------------------

      if (!speaking) {
        // Require a stronger signal to START speaking.
        if (volume > startThreshold) {
          speaking = true;
          lastSpeechTime = now;
        }
      } else {
        // Continue speaking while volume is above
        // the lower stop threshold.
        if (volume > stopThreshold) {
          lastSpeechTime = now;
        }

        // Don't instantly stop because of tiny gaps
        // between spoken words/syllables.
        if (
          now - lastSpeechTime >
          SPEECH_HOLD_MS
        ) {
          speaking = false;
        }
      }

      // ---------------------------------------
      // Calculate voice intensity
      // ---------------------------------------

      const intensity = Math.min(
        1,
        Math.max(
          0,
          (volume - noiseFloor * 1.15) / 0.12
        )
      );

      // ---------------------------------------
      // Smooth the visual intensity
      // ---------------------------------------

      const smoothing = speaking ? 0.18 : 0.10;

      smoothedIntensity =
        smoothedIntensity +
        (intensity - smoothedIntensity) *
          smoothing;

      // Completely kill tiny residual values.
      if (smoothedIntensity < 0.025) {
        smoothedIntensity = 0;
      }

      setIsSpeaking(speaking);
      setVoiceIntensity(smoothedIntensity);
    };

    const intervalId = window.setInterval(
      sampleAudio,
      50
    );

    // Some browsers suspend AudioContext until
    // user interaction. Try to resume it.
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

  const waveHeights = [
    0.35,
    0.58,
    0.82,
    1,
    0.72,
    0.48,
    0.68,
    0.92,
    0.62,
    0.38,
  ];
  const hasLiveVideo = Boolean(stream?.getVideoTracks?.().some((track) => track.readyState === "live" && track.enabled));

  return (
    <div
      className={`
        relative
        rounded-2xl
        overflow-hidden
        bg-panel
        aspect-video
        transition-all
        duration-200

        ${role === "developer" ? "role-developer" : role === "admin" ? "role-admin" : role === "premium" ? "role-premium" : ""}
        ${
          isSpeaking
            ? "border-2 border-signal shadow-[0_0_0_2px_rgba(76,201,240,0.25),0_0_24px_rgba(76,201,240,0.4)]"
            : "border border-white/5"
        }
      `}
      style={{
        "--voice-intensity": voiceIntensity,
      }}
    >
      {/* VIDEO */}
      {stream && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
          className={`
            ${hasLiveVideo ? "w-full h-full object-cover" : "absolute h-px w-px opacity-0"}
            ${mirrored ? "scale-x-[-1]" : ""}
          `}
        />
      )}
      {!hasLiveVideo && (
        <div className="w-full h-full flex items-center justify-center">
          {avatarUrl ? <img src={avatarUrl} alt="" className="h-20 w-20 rounded-full object-cover border-2 border-white/15 shadow-2xl" /> : <div className="w-14 h-14 rounded-full bg-panel2 animate-drift" />}
        </div>
      )}

      {playbackBlocked && stream && <button onClick={() => videoRef.current?.play().then(() => setPlaybackBlocked(false)).catch(() => {})} className="absolute inset-x-3 bottom-3 z-10 rounded-lg border border-signal/30 bg-black/75 px-3 py-2 text-xs font-semibold text-signal2 backdrop-blur">Tap to hear</button>}

      {role !== "user" && (
        <span className={`absolute top-3 left-3 rounded-md px-2 py-1 font-mono text-[10px] font-bold tracking-[0.14em] backdrop-blur ${role === "developer" ? "role-badge-developer" : role === "premium" ? "role-badge-premium" : "role-badge-admin"}`}>
          {role === "developer" ? "◈ DEVELOPER" : role === "premium" ? "PREMIUM" : "ADMIN"}
        </span>
      )}

      {/* LABEL */}
      {label && (
        <span
          className={`
            absolute
            bottom-3
            left-3
            text-xs
            font-mono
            px-2
            py-1
            rounded-md
            bg-black/60
            backdrop-blur

            ${
              isSpeaking
                ? "text-emerald-300"
                : "text-mist"
            }
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
          h-8
          items-center
          gap-0.5

          rounded-lg
          border
          border-white/10

          bg-black/65
          px-2
          backdrop-blur

          ${isSpeaking ? "is-active" : ""}
        `}
        style={{
          "--voice-intensity": voiceIntensity,
        }}
        aria-label={
          isSpeaking
            ? `${label || "Participant"} is speaking`
            : `${label || "Participant"} is quiet`
        }
      >
        {waveHeights.map((height, index) => (
          <span
            key={index}
            style={{
              "--wave-height": height,
              animationDelay: isSpeaking
                ? `${index * -70}ms`
                : "0ms",
            }}
          />
        ))}
      </div>
    </div>
  );
}
