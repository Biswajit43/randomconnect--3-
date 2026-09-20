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
        className="ui-button ui-button-primary px-4 sm:px-5"
      >
        Next →
      </button>

      <button
        onClick={onStop}
        className="ui-button ui-button-muted px-4 sm:px-5"
      >
        Stop
      </button>

      {onReport && (
        <button
          onClick={onReport}
          className="ui-button ui-button-danger px-4 sm:px-5"
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
      className={`ui-icon-button w-12 h-12 shrink-0 flex items-center justify-center border ${
        disabled ? "bg-panel2/50 border-white/5 text-mist/40 cursor-not-allowed" : active ? "bg-panel2 border-white/10 text-white" : "bg-coral/10 border-coral/30 text-coral"
      }`}
    >
      {children}
    </button>
  );
}
