import { useEffect, useRef } from "react";

export default function VideoTile({ stream, muted = false, label, mirrored = false }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream || null;
  }, [stream]);

  return (
    <div className="relative rounded-2xl overflow-hidden bg-panel border border-white/5 aspect-video">
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
        <span className="absolute bottom-3 left-3 text-xs font-mono px-2 py-1 rounded-md bg-black/50 backdrop-blur text-mist">
          {label}
        </span>
      )}
    </div>
  );
}
