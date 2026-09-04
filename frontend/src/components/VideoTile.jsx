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
    let speakingUntil = 0;

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
      if (volume > 0.055) speakingUntil = Date.now() + 180;
      setIsSpeaking(Date.now() < speakingUntil);
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
    <div className={`relative rounded-2xl overflow-hidden bg-panel aspect-video transition-shadow duration-150 ${isSpeaking
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
          {isSpeaking && " · speaking"}
        </span>
      )}
    </div>
  );
}
