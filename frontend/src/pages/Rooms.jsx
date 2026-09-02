import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";
import { getFingerprint, getDisplayName, setDisplayName } from "../lib/socket.js";
import RoomCard from "../components/RoomCard.jsx";
import CreateRoomModal from "../components/CreateRoomModal.jsx";

export default function Rooms() {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [preference, setPreference] = useState("any");
  const [interests, setInterests] = useState("");
  const [name, setName] = useState(() => getDisplayName());

  // Someone can land here directly (bookmark, back button) without having
  // gone through the name/age gate on Landing — send them back if so.
  useEffect(() => {
    if (!getDisplayName()) navigate("/");
  }, [navigate]);

  const refresh = useCallback(() => {
    api.listRooms().then(setRooms).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000); // light polling keeps live counts fresh
    return () => clearInterval(interval);
  }, [refresh]);

  async function handleCreate(payload) {
    setCreating(true);
    try {
      const room = await api.createRoom({ ...payload, fingerprint: getFingerprint() });
      navigate(`/rooms/${room._id}`, { state: { room } });
    } catch (err) {
      alert(err.message);
    } finally {
      setCreating(false);
    }
  }

  function start1to1() {
    const tags = interests.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 5);
    navigate("/chat", { state: { interests: tags, preference } });
  }

  return (
    <div className="min-h-screen">
      <header className="px-6 py-5 flex items-center justify-between gap-3">
        <span className="font-display font-bold text-lg tracking-tight text-white shrink-0">
          random<span className="text-signal">connect</span>
        </span>
        <NameBadge name={name} onChange={(n) => { setName(n); setDisplayName(n); }} />
        <span className="flex items-center gap-2 text-sm text-signal2 font-mono shrink-0">
          <span className="w-2 h-2 rounded-full bg-signal animate-pulse" /> live
        </span>
      </header>

      <main className="px-4 md:px-8 pb-16 grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6">
        {/* Left: 1-to-1 entry point */}
        <aside className="bg-panel border border-white/5 rounded-2xl p-6 h-fit lg:sticky lg:top-6">
          <p className="font-mono text-xs tracking-widest text-signal2 uppercase mb-2">1-to-1</p>
          <h2 className="font-display text-xl font-bold text-white mb-1">Talk to one stranger</h2>
          <p className="text-sm text-mist mb-5">Private call · instant match</p>

          <label className="block text-xs font-mono uppercase tracking-wide text-mist mb-1.5">Preference</label>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {["any", "male", "female"].map((p) => (
              <button
                key={p}
                onClick={() => setPreference(p)}
                className={`py-2 rounded-lg text-sm capitalize border ${
                  preference === p ? "bg-signal/15 border-signal text-signal2" : "bg-panel2 border-white/10 text-mist"
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          <input
            value={interests}
            onChange={(e) => setInterests(e.target.value)}
            placeholder="Interests (optional)"
            className="w-full bg-panel2 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-mist/50 outline-none focus-visible:outline-signal mb-4"
          />

          <button
            onClick={start1to1}
            className="w-full py-3 rounded-xl bg-signal text-ink font-display font-semibold hover:brightness-110 active:scale-[0.98] transition"
          >
            Start 1-to-1 call
          </button>
        </aside>

        {/* Right: group rooms — anyone can create, anyone can join */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="font-mono text-xs tracking-widest text-signal2 uppercase mb-1">group rooms</p>
              <h2 className="font-display text-xl font-bold text-white">Where people are actually talking</h2>
            </div>
            <h2>wait guyz some fixing is needed just 5 min... </h2>
            <button
              onClick={() => setModalOpen(true)}
              className="px-4 py-2.5 rounded-xl bg-violet/15 border border-violet/40 text-violet font-display font-semibold text-sm hover:bg-violet/25 transition whitespace-nowrap"
            >
              + Start a room
            </button>
          </div>

          {loading ? (
            <p className="text-mist text-sm font-mono">Loading rooms…</p>
          ) : rooms.length === 0 ? (
            <div className="bg-panel/40 border border-dashed border-white/10 rounded-2xl p-10 text-center">
              <p className="text-mist mb-3">No rooms yet — be the first to start one.</p>
              <button
                onClick={() => setModalOpen(true)}
                className="px-4 py-2 rounded-lg bg-signal text-ink text-sm font-semibold"
              >
                + Start a room
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {rooms.map((room) => (
                <RoomCard key={room._id} room={room} onJoin={(r) => navigate(`/rooms/${r._id}`, { state: { room: r } })} />
              ))}
            </div>
          )}
        </section>
      </main>

      <CreateRoomModal open={modalOpen} onClose={() => setModalOpen(false)} onCreate={handleCreate} creating={creating} />
    </div>
  );
}

function NameBadge({ name, onChange }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);

  function save() {
    const clean = draft.trim().slice(0, 30);
    if (clean) onChange(clean);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === "Enter" && save()}
        maxLength={30}
        className="bg-panel2 border border-signal/40 rounded-full px-3 py-1.5 text-sm text-white outline-none w-40 text-center"
      />
    );
  }

  return (
    <button
      onClick={() => {
        setDraft(name);
        setEditing(true);
      }}
      className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-panel border border-white/10 text-sm text-white/90 hover:border-signal/40 transition"
      title="Change your name"
    >
      <span className="w-5 h-5 rounded-full bg-signal/20 text-signal2 flex items-center justify-center text-[10px] font-semibold">
        {(name || "?").charAt(0).toUpperCase()}
      </span>
      {name || "Guest"}
      <span className="text-mist text-xs">✎</span>
    </button>
  );
}
