import AvatarStack from "./AvatarStack.jsx";

export default function RoomCard({ room, onJoin }) {
  const isLive = room.liveCount > 0;

  return (
    <button
      onClick={() => onJoin(room)}
      className="w-full text-left bg-panel hover:bg-panel2 border border-white/5 hover:border-signal/30 rounded-2xl p-4 transition group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-mono tracking-wider text-mist uppercase truncate">
            {room.mode === "video" ? "📹 video" : "🎙️ voice"} · {room.maxParticipants} max
          </p>
          <h3 className="font-display font-semibold text-white text-base mt-0.5 truncate group-hover:text-signal transition">
            {room.name}
          </h3>
          {room.topic && <p className="text-sm text-mist mt-1 line-clamp-2">{room.topic}</p>}
        </div>
        <AvatarStack names={Array.from({ length: room.liveCount }, (_, i) => `${i}`)} />
      </div>

      <div className="flex items-center gap-2 mt-3 text-xs font-mono">
        <span className={`w-1.5 h-1.5 rounded-full ${isLive ? "bg-signal animate-pulse" : "bg-mist/40"}`} />
        <span className={isLive ? "text-signal2" : "text-mist/60"}>
          {isLive ? `live · ${room.liveCount} ${room.liveCount === 1 ? "person" : "people"}` : "empty — be first in"}
        </span>
      </div>
    </button>
  );
}
