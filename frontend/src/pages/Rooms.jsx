import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";
import { getFingerprint, getDisplayName, setDisplayName } from "../lib/socket.js";
import RoomCard from "../components/RoomCard.jsx";
import CreateRoomModal from "../components/CreateRoomModal.jsx";

export default function Rooms() {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState([]);
  const [myRooms, setMyRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [preference, setPreference] = useState("any");
  const [interests, setInterests] = useState("");
  const [name, setName] = useState(() => getDisplayName());
  const [staffRole, setStaffRole] = useState(() => localStorage.getItem("rc_staff_role"));

  // Someone can land here directly (bookmark, back button) without having
  // gone through the name/age gate on Landing — send them back if so.
  useEffect(() => {
    if (!getDisplayName()) navigate("/");
  }, [navigate]);

  useEffect(() => {
    let active = true;
    const refreshStaffLease = () => api.adminSession().then((session) => {
      if (active) {
        setStaffRole(session.role);
        localStorage.setItem("rc_staff_role", session.role);
      }
    }).catch(() => {
      // Keep the control visible during a transient Render/network failure.
      // The server still enforces the session on the actual sign-out request.
    });
    refreshStaffLease();
    const intervalId = window.setInterval(refreshStaffLease, 30000);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  async function signOutStaff() {
    await api.adminLogout().catch(() => {});
    setStaffRole(null);
    localStorage.removeItem("rc_staff_role");
    localStorage.removeItem("rc_name");
    setName("");
    navigate("/");
  }

  const refresh = useCallback(() => {
    Promise.all([api.listRooms(), api.listMyRooms(getFingerprint())])
      .then(([allRooms, ownedRooms]) => {
        setRooms(allRooms);
        setMyRooms(ownedRooms);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
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

  async function renameRoom(room) {
    const name = window.prompt("New group name", room.name)?.trim();
    if (!name || name === room.name) return;
    try {
      await api.updateRoom(room._id, { name, fingerprint: getFingerprint() });
      refresh();
    } catch (err) {
      alert(err.message);
    }
  }

  async function deleteRoom(room) {
    if (!window.confirm(`Delete "${room.name}"? This cannot be undone.`)) return;
    try {
      await api.deleteRoom(room._id, getFingerprint());
      refresh();
    } catch (err) {
      alert(err.message);
    }
  }

  function start1to1() {
    const tags = interests.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 5);
    navigate("/chat", { state: { interests: tags, preference } });
  }

  return (
    <div className="min-h-screen">
      <header className="px-4 sm:px-5 md:px-8 py-4 sm:py-5 flex flex-wrap items-center justify-between gap-3 border-b border-white/5 bg-ink/30 backdrop-blur-md">
        <span className="font-display font-bold text-lg tracking-tight text-white shrink-0">
          random<span className="text-signal">connect</span>
        </span>
        <div className="flex items-center gap-2 ml-auto min-w-0 max-w-full">
        <NameBadge name={name} onChange={(n) => { setName(n); setDisplayName(n); }} />
        <button onClick={() => navigate("/profile")} className="shrink-0 rounded-lg border border-violet/30 px-2.5 py-2 text-xs text-violet hover:bg-violet/10" aria-label="Open profile and rewards" title="Profile and rewards">Profile</button>
        {staffRole && <button onClick={signOutStaff} className="shrink-0 rounded-lg border border-coral/30 px-2.5 py-2 text-xs text-coral hover:bg-coral/10" aria-label="Sign out staff" title="Sign out staff">Sign out</button>}
        <span className="flex items-center gap-2 text-sm text-signal2 font-mono shrink-0">
          <span className="w-2 h-2 rounded-full bg-signal animate-pulse" /> live
        </span>
        </div>
      </header>

      <main className="px-4 md:px-8 py-6 pb-16 grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6 max-w-[1440px] mx-auto">
        {/* Left: 1-to-1 entry point */}
        <aside className="bg-panel/85 border border-white/10 rounded-2xl p-6 h-fit lg:sticky lg:top-6 surface-lift animate-enter">
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
            className="w-full py-3 rounded-xl bg-signal text-ink font-display font-semibold hover:brightness-110 active:scale-[0.98] transition shadow-lg shadow-signal/15"
          >
            Start 1-to-1 call
          </button>
          <PremiumReferralCard />
        </aside>

        {/* Right: group rooms — anyone can create, anyone can join */}
        <section>
          {myRooms.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-mono text-xs tracking-widest text-violet uppercase mb-1">my groups</p>
                  <h2 className="font-display text-xl font-bold text-white">Your rooms · {myRooms.length}/2</h2>
                </div>
                <span className="text-xs text-mist">rename or delete</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {myRooms.map((room) => (
                  <div key={room._id} className="relative">
                    <RoomCard room={room} onJoin={(r) => navigate(`/rooms/${r._id}`, { state: { room: r } })} />
                    <div className="absolute top-3 right-3 flex gap-1.5">
                      <button
                        onClick={() => renameRoom(room)}
                        className="px-2 py-1 rounded-md bg-panel2/90 border border-white/10 text-xs text-white hover:border-signal/50"
                      >
                        Edit name
                      </button>
                      <button
                        onClick={() => deleteRoom(room)}
                        className="px-2 py-1 rounded-md bg-coral/15 border border-coral/30 text-xs text-coral hover:bg-coral/25"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="font-mono text-xs tracking-widest text-signal2 uppercase mb-1">group rooms</p>
              <h2 className="font-display text-xl font-bold text-white">Where people are actually talking</h2>
            </div>
            <button
              onClick={() => setModalOpen(true)}
              disabled={myRooms.length >= 2}
              title={myRooms.length >= 2 ? "Delete or edit an existing group before creating another" : "Start a group room"}
              className="px-4 py-2.5 rounded-xl bg-violet/15 border border-violet/40 text-violet font-display font-semibold text-sm hover:bg-violet/25 transition whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {myRooms.length >= 2 ? "2 groups created" : "+ Start a room"}
            </button>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" aria-label="Loading rooms">
              {[0, 1, 2].map((item) => <RoomSkeleton key={item} />)}
            </div>
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

function PremiumReferralCard() {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function shareInvite() {
    setBusy(true);
    try {
      const invite = await api.premiumReferral(getFingerprint());
      setCode(invite.code);
      const url = `${window.location.origin}/?invite=${encodeURIComponent(invite.code)}`;
      const shareData = { title: "Join me on RandomConnect", text: "Join me and we both get 30 days of Premium free.", url };
      if (navigator.share) await navigator.share(shareData);
      else {
        await navigator.clipboard.writeText(url);
        setStatus("Invite link copied.");
      }
    } catch (error) {
      if (error?.name !== "AbortError") setStatus(error.message || "Could not create invite.");
    } finally { setBusy(false); }
  }

  return <div className="mt-5 rounded-2xl border border-dashed border-violet/50 bg-violet/5 p-4"><p className="font-display font-semibold text-white">Invite a friend</p><p className="mt-1 text-sm text-mist">Both of you get 30 days of Premium free.</p>{code && <p className="mt-3 font-display text-lg font-bold tracking-wider text-violet">{code}</p>}<button onClick={shareInvite} disabled={busy} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-panel2 px-3 py-3 text-sm font-semibold text-white hover:border-violet/50 disabled:opacity-50">{busy ? "Preparing invite…" : "♧ Share invite link"}</button>{status && <p className="mt-2 text-xs text-signal2">{status}</p>}<p className="mt-2 text-center text-[11px] text-mist">View your Premium days and community progress in Profile.</p></div>;
}

function RoomSkeleton() {
  return (
    <div className="rounded-2xl border border-white/5 bg-panel/60 p-4 animate-pulse" aria-hidden="true">
      <div className="h-3 w-24 rounded bg-white/10" />
      <div className="mt-3 h-5 w-2/3 rounded bg-white/10" />
      <div className="mt-2 h-3 w-full rounded bg-white/5" />
      <div className="mt-5 h-3 w-28 rounded bg-white/10" />
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
