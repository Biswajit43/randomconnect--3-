import { useEffect, useRef, useState } from "react";

export default function VideoTile({ stream, muted = false, label, mirrored = false }) {
  const videoRef = useRef(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream || null;
  }, [stream]);

  useEffect(() => {
    if (!stream?.getAudioTracks().length) {
      setIsSpeaking(false);
      return undefined;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return undefined;

    const audioContext = new AudioContextClass();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    const samples = new Uint8Array(analyser.fftSize);
    let noiseFloor = 0.02;
    let speakingUntil = 0;
    let speaking = false;

    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.65;
    source.connect(analyser);
    audioContext.resume().catch(() => { });

    const sampleAudio = () => {
      analyser.getByteTimeDomainData(samples);
      let energy = 0;
      for (const sample of samples) {
        const amplitude = (sample - 128) / 128;
        energy += amplitude * amplitude;
      }
      const volume = Math.sqrt(energy / samples.length);
      const now = Date.now();
      const startThreshold = Math.max(0.045, noiseFloor * 2.6);
      const stopThreshold = Math.max(0.032, noiseFloor * 1.6);

      // Learn each microphone's ambient level while it is quiet. Hysteresis
      // prevents borderline background noise from flickering the indicator.
      if (!speaking) noiseFloor = noiseFloor * 0.92 + volume * 0.08;
      if (!speaking && volume > startThreshold) {
        speaking = true;
        speakingUntil = now + 260;
      } else if (speaking && volume > stopThreshold) {
        speakingUntil = now + 220;
      } else if (speaking && now >= speakingUntil) {
        speaking = false;
      }
      setIsSpeaking(speaking);
    };

    const intervalId = window.setInterval(sampleAudio, 80);
    return () => {
      window.clearInterval(intervalId);
      source.disconnect();
      analyser.disconnect();
      audioContext.close().catch(() => { });
      setIsSpeaking(false);
    };
  }, [stream]);

  return (
    <div className={`relative rounded-2xl overflow-hidden bg-panel aspect-video transition-all duration-200 ${isSpeaking
      ? "border-2 border-emerald-400 shadow-[0_0_0_2px_rgba(52,211,153,0.2),0_0_22px_rgba(52,211,153,0.35)]"
      : "border border-white/5"
      }`}>
      {stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
          className={`w-full h-full object-cover ${mirrored ? "scale-x-[-1]" : ""}`}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <div className="w-14 h-14 rounded-full bg-panel2 animate-drift" />
        </div>
      )}
      {label && (
        <span className={`absolute bottom-3 left-3 text-xs font-mono px-2 py-1 rounded-md bg-black/60 backdrop-blur ${isSpeaking ? "text-emerald-300" : "text-mist"
          }`}>
          {label}
        </span>
      )}
      {isSpeaking && (
        <span className="absolute top-3 right-3 flex items-center gap-1.5 rounded-full bg-emerald-400 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-ink shadow-lg animate-pulse">
          <span className="h-1.5 w-1.5 rounded-full bg-ink" />
          Speaking
        </span>
      )}
    </div>
  );
}
