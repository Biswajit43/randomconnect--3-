import { useState } from "react";

export default function CreateRoomModal({ open, onClose, onCreate, creating }) {
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [mode, setMode] = useState("voice");
  const [maxParticipants, setMaxParticipants] = useState(8);

  if (!open) return null;

  function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    onCreate({ name: name.trim(), topic: topic.trim(), mode, maxParticipants });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <form onSubmit={submit} className="w-full max-w-md bg-panel rounded-2xl border border-white/10 p-6">
        <h3 className="font-display text-lg font-semibold text-white mb-1">Start a room</h3>
        <p className="text-sm text-mist mb-5">Anyone can join while it's live. Give it a name people will recognize.</p>

        <label className="block text-xs font-mono uppercase tracking-wide text-mist mb-1.5">Room name</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Late night lo-fi & chill"
          maxLength={60}
          className="w-full bg-panel2 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-mist/50 outline-none focus-visible:outline-signal mb-4"
        />

        <label className="block text-xs font-mono uppercase tracking-wide text-mist mb-1.5">Topic (optional)</label>
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="What's this room about?"
          maxLength={140}
          className="w-full bg-panel2 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-mist/50 outline-none focus-visible:outline-signal mb-4"
        />

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-xs font-mono uppercase tracking-wide text-mist mb-1.5">Mode</label>
            <div className="flex rounded-lg overflow-hidden border border-white/10">
              {["voice", "video"].map((m) => (
                <button
                  type="button"
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex-1 py-2 text-sm capitalize ${mode === m ? "bg-signal text-ink font-semibold" : "bg-panel2 text-mist"}`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-mono uppercase tracking-wide text-mist mb-1.5">Max people</label>
            <select
              value={maxParticipants}
              onChange={(e) => setMaxParticipants(Number(e.target.value))}
              className="w-full bg-panel2 rounded-lg px-3 py-2 text-sm text-white outline-none focus-visible:outline-signal h-[38px]"
            >
              {[4, 6, 8, 10, 12].map((n) => (
                <option key={n} value={n}>{n} people</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-mist hover:text-white">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim() || creating}
            className="px-4 py-2 rounded-lg bg-signal text-ink text-sm font-semibold disabled:opacity-40 hover:brightness-110 active:scale-95 transition"
          >
            {creating ? "Creating…" : "Create & join"}
          </button>
        </div>
      </form>
    </div>
  );
}
