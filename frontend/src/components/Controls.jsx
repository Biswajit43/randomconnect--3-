export default function Controls({
  micOn,
  camOn,
  onToggleMic,
  onToggleCam,
  onFlipCamera,
  onSkip,
  onStop,
  onReport,
}) {
  return (
    <div className="flex items-center justify-center flex-wrap gap-2 sm:gap-3 py-4">
      <IconButton active={micOn} onClick={onToggleMic} label={micOn ? "Mute mic" : "Unmute mic"}>
        {micOn ? "🎙️" : "🔇"}
      </IconButton>
      <IconButton active={camOn} onClick={onToggleCam} label={camOn ? "Turn camera off" : "Turn camera on"}>
        {camOn ? "📹" : "🚫"}
      </IconButton>
      {onFlipCamera && <IconButton active={false} onClick={onFlipCamera} disabled={!camOn} label="Switch front and rear camera">↔</IconButton>}

      <button
        onClick={onSkip}
        className="px-4 sm:px-5 py-3 rounded-full bg-signal text-ink font-display font-semibold text-sm hover:brightness-110 active:scale-95 transition"
      >
        Next →
      </button>

      <button
        onClick={onStop}
        className="px-4 sm:px-5 py-3 rounded-full bg-panel2 text-mist font-display font-medium text-sm border border-white/10 hover:text-white active:scale-95 transition"
      >
        Stop
      </button>

      {onReport && (
        <button
          onClick={onReport}
          className="px-4 sm:px-5 py-3 rounded-full bg-coral/10 text-coral font-display font-medium text-sm border border-coral/30 hover:bg-coral/20 active:scale-95 transition"
        >
          Report
        </button>
      )}

    </div>
  );
}

function IconButton({ active, disabled = false, onClick, label, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`w-12 h-12 shrink-0 rounded-full flex items-center justify-center border active:scale-95 transition ${
        disabled ? "bg-panel2/50 border-white/5 text-mist/40 cursor-not-allowed" : active ? "bg-panel2 border-white/10 text-white" : "bg-coral/10 border-coral/30 text-coral"
      }`}
    >
      {children}
    </button>
  );
}
