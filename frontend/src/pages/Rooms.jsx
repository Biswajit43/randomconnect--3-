import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import TelegramDrop from "../components/TelegramDrop.jsx";
import RoomCard from "../components/RoomCard.jsx";
import CreateRoomModal from "../components/CreateRoomModal.jsx";
import { api } from "../lib/api.js";
import {
  clearLocalSession,
  getFingerprint,
  getDisplayName,
  setDisplayName,
} from "../lib/socket.js";

const PREFERENCES = ["any", "male", "female"];
const QUICK_INTERESTS = ["music", "travel", "movies", "gaming"];

function greeting() {
  const hour = new Date().getHours();
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function Avatar({ name = "" }) {
  const colors = ["#4CC9F0", "#9D8DF1", "#FF6B6B", "#7BE0D6", "#F4B860"];
  const hash = [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const initial = Array.from(name.trim())[0]?.toUpperCase() || "?";

  return (
    <div
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-bold text-[#06101a]"
      style={{
        backgroundColor: name
          ? colors[hash % colors.length]
          : "rgba(255,255,255,.15)",
      }}
    >
      {initial}
    </div>
  );
}

function AppButton({ children, onClick, variant = "default", className = "" }) {
  const styles = {
    primary:
      "border border-signal/40 bg-signal text-ink hover:brightness-110 font-bold",
    violet:
      "border border-violet/30 bg-violet/15 text-violet hover:bg-violet/25",
    danger:
      "border border-coral/30 bg-coral/10 text-coral hover:bg-coral/20",
    default:
      "border border-white/10 bg-panel2 text-white hover:border-signal/40",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm transition ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

/* Popup window */

function AppWindow({ title, subtitle, onClose, children, wide = false }) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKey(event) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKey);

    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-panel shadow-2xl sm:rounded-3xl ${
          wide ? "sm:max-w-3xl" : "sm:max-w-lg"
        }`}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-bold text-white">
              {title}
            </h2>
            {subtitle && (
              <p className="mt-1 text-xs text-mist">{subtitle}</p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close window"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-panel2 text-xl text-white hover:border-signal/40"
          >
            ×
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
          {children}
        </div>
      </section>
    </div>
  );
}

export default function Rooms() {
  const navigate = useNavigate();

  const [name, setName] = useState(() => getDisplayName() || "");
  const [staffRole, setStaffRole] = useState(
    () => localStorage.getItem("rc_staff_role") || ""
  );

  const [rooms, setRooms] = useState([]);
  const [myRooms, setMyRooms] = useState([]);
  const [waitingCount, setWaitingCount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const [activeWindow, setActiveWindow] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const [query, setQuery] = useState("");
  const [preference, setPreference] = useState("any");
  const [interests, setInterests] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [roomBusy, setRoomBusy] = useState(false);

  const [notice, setNotice] = useState("");
  const [nameDraft, setNameDraft] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [allRooms, ownedRooms] = await Promise.all([
        api.listRooms(),
        api.listMyRooms(getFingerprint()),
      ]);

      setRooms(allRooms);
      setMyRooms(ownedRooms);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!getDisplayName()) {
      navigate("/");
      return;
    }

    refresh();

    const interval = window.setInterval(() => {
      if (!document.hidden) refresh();
    }, 8000);

    const onVisible = () => {
      if (!document.hidden) refresh();
    };

    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [navigate, refresh]);

  useEffect(() => {
    let mounted = true;

    const refreshStats = async () => {
      try {
        const stats = await api.stats();
        if (mounted) setWaitingCount(stats.waiting);
      } catch {
        // Live count is optional.
      }
    };

    refreshStats();
    const interval = window.setInterval(refreshStats, 10000);

    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const refreshStaff = async () => {
      try {
        const session = await api.adminSession();

        if (mounted && session?.role) {
          setStaffRole(session.role);
          localStorage.setItem("rc_staff_role", session.role);
        }
      } catch {
        // The normal dashboard works without a staff session.
      }
    };

    refreshStaff();

    return () => {
      mounted = false;
    };
  }, []);

  function showNotice(message) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3200);
  }

  function openWindow(windowName) {
    setMenuOpen(false);
    setActiveWindow(windowName);
  }

  function closeWindow() {
    setActiveWindow(null);
  }

  function startChat() {
    const parsedInterests = interests
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 5);

    setActiveWindow(null);

    navigate("/chat", {
      state: {
        interests: parsedInterests,
        preference,
      },
    });
  }

  function addInterest(value) {
    const current = interests
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    if (current.some((item) => item.toLowerCase() === value)) return;

    setInterests([...current, value].slice(0, 5).join(", "));
  }

  async function createRoom(payload) {
    setCreating(true);

    try {
      const room = await api.createRoom({
        ...payload,
        fingerprint: getFingerprint(),
      });

      setCreateOpen(false);
      setActiveWindow(null);
      navigate(`/rooms/${room._id}`, { state: { room } });
    } catch (error) {
      showNotice(error?.message || "Could not create the room.");
    } finally {
      setCreating(false);
    }
  }

  async function renameRoom(room) {
    const nextName = window.prompt("Enter a new room name:", room.name);

    if (nextName === null) return;

    const cleanName = nextName.trim();

    if (!cleanName || cleanName === room.name) return;

    setRoomBusy(true);

    try {
      await api.updateRoom(room._id, {
        name: cleanName,
        fingerprint: getFingerprint(),
      });

      await refresh();
      showNotice("Room renamed successfully.");
    } catch (error) {
      showNotice(error?.message || "Could not rename the room.");
    } finally {
      setRoomBusy(false);
    }
  }

  async function deleteRoom(room) {
    const confirmed = window.confirm(
      `Delete "${room.name}"? This action cannot be undone.`
    );

    if (!confirmed) return;

    setRoomBusy(true);

    try {
      await api.deleteRoom(room._id, getFingerprint());
      await refresh();
      showNotice("Room deleted.");
    } catch (error) {
      showNotice(error?.message || "Could not delete the room.");
    } finally {
      setRoomBusy(false);
    }
  }

  async function saveName() {
    const clean = nameDraft.replace(/\s+/g, " ").trim();

    if (!clean) {
      showNotice("Please enter a name.");
      return;
    }

    setDisplayName(clean);
    setName(clean);
    setActiveWindow(null);
    showNotice("Your name has been updated.");
  }

  async function logout() {
    if (staffRole) {
      await api.adminLogout().catch(() => {});
    }

    clearLocalSession();
    localStorage.removeItem("rc_staff_role");
    setStaffRole("");
    navigate("/");
  }

  const filteredRooms = useMemo(() => {
    const search = query.trim().toLowerCase();

    if (!search) return rooms;

    return rooms.filter((room) =>
      `${room.name || ""} ${room.description || ""}`
        .toLowerCase()
        .includes(search)
    );
  }, [rooms, query]);

  const firstName = name.trim().split(/\s+/)[0] || "there";

  return (
    <div className="min-h-screen overflow-x-clip bg-ink pb-24 text-white">
      {/* Compact app header */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-ink/90 backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <button
            type="button"
            onClick={() => {
              setActiveWindow(null);
              navigate("/rooms");
            }}
            className="flex items-center gap-2 font-display text-lg font-bold"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-signal/10 text-xl text-signal">
              ◉
            </span>
            <span>
              random<span className="text-signal">connect</span>
            </span>
          </button>

          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-2 rounded-full border border-signal/20 bg-signal/5 px-3 py-2 text-xs text-signal2 sm:flex">
              <span className="h-2 w-2 animate-pulse rounded-full bg-signal" />
              {waitingCount ?? "—"} waiting
            </span>

            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Open app menu"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-panel text-xl hover:border-signal/40"
            >
              ☰
            </button>
          </div>
        </div>
      </header>

      {/* Main compact dashboard */}
      <main className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 sm:py-8">
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-panel p-5 sm:p-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-signal/10 blur-3xl"
          />

          <div className="relative flex items-center gap-3">
            <Avatar name={name} />

            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-widest text-signal2">
                Your space
              </p>

              <h1 className="mt-1 break-words font-display text-2xl font-bold sm:text-3xl">
                {greeting()}, {firstName}
              </h1>

              <p className="mt-1 text-sm text-mist">
                {waitingCount > 0
                  ? `${waitingCount} people are looking to connect.`
                  : "Your next conversation starts here."}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setNameDraft(name);
                openWindow("profile");
              }}
              className="shrink-0 rounded-xl border border-white/10 px-3 py-2 text-xs text-mist hover:text-white"
            >
              Edit
            </button>
          </div>

          {staffRole && (
            <span className="mt-4 inline-flex rounded-full border border-violet/30 bg-violet/10 px-3 py-1 text-xs text-violet">
              {staffRole}
            </span>
          )}

          <div className="relative mt-6 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => openWindow("meet")}
              className="flex min-h-32 flex-col items-start justify-between rounded-2xl border border-signal/30 bg-signal/10 p-4 text-left transition hover:bg-signal/15 active:scale-[.98] sm:min-h-36 sm:p-5"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-signal text-xl text-ink">
                ↗
              </span>
              <span>
                <span className="block font-display text-base font-bold sm:text-lg">
                  Meet Someone
                </span>
                <span className="mt-1 block text-xs text-mist">
                  Start a 1-to-1 chat
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => openWindow("rooms")}
              className="flex min-h-32 flex-col items-start justify-between rounded-2xl border border-violet/30 bg-violet/10 p-4 text-left transition hover:bg-violet/15 active:scale-[.98] sm:min-h-36 sm:p-5"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet/20 text-xl text-violet">
                ◫
              </span>
              <span>
                <span className="block font-display text-base font-bold sm:text-lg">
                  Explore Rooms
                </span>
                <span className="mt-1 block text-xs text-mist">
                  Join a group conversation
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => openWindow("myrooms")}
              className="flex min-h-24 items-center gap-3 rounded-2xl border border-white/10 bg-panel2 p-4 text-left transition hover:border-white/20 active:scale-[.98]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-xl">
                ♧
              </span>
              <span className="min-w-0">
                <span className="block font-semibold">My Rooms</span>
                <span className="mt-1 block text-xs text-mist">
                  {myRooms.length} of 2 created
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => openWindow("telegram")}
              className="flex min-h-24 items-center gap-3 rounded-2xl border border-white/10 bg-panel2 p-4 text-left transition hover:border-white/20 active:scale-[.98]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-signal/10 text-xl">
                ✦
              </span>
              <span className="min-w-0">
                <span className="block font-semibold">Telegram Drop</span>
                <span className="mt-1 block text-xs text-mist">
                  Check today's drop
                </span>
              </span>
            </button>
          </div>
        </section>

        {/* Small summary instead of repeating every section */}
        <section className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/10 bg-panel/70 p-4">
            <p className="text-xs text-mist">Open rooms</p>
            <p className="mt-1 font-display text-2xl font-bold">
              {loading ? "…" : rooms.length}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-panel/70 p-4">
            <p className="text-xs text-mist">People waiting</p>
            <p className="mt-1 font-display text-2xl font-bold text-signal2">
              {waitingCount ?? "—"}
            </p>
          </div>
        </section>

        {loadFailed && (
          <p className="mt-4 rounded-xl border border-coral/30 bg-coral/10 p-3 text-sm text-coral">
            Couldn't load rooms. We'll retry automatically.
          </p>
        )}

        <section className="mt-5 rounded-2xl border border-dashed border-white/10 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold">Invite a friend</h2>
              <p className="mt-1 text-xs text-mist">
                Share RandomConnect with someone you know.
              </p>
            </div>

            <AppButton
              variant="violet"
              onClick={() => openWindow("invite")}
            >
              Share invite ↗
            </AppButton>
          </div>
        </section>
      </main>

      {/* Mobile bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-ink/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
        <div className="mx-auto grid max-w-xl grid-cols-4 px-2 py-2">
          {[
            { id: "home", label: "Home", icon: "⌂" },
            { id: "meet", label: "Meet", icon: "↗" },
            { id: "rooms", label: "Rooms", icon: "◫" },
            { id: "myrooms", label: "My Rooms", icon: "♧" },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (item.id === "home") {
                  setActiveWindow(null);
                } else {
                  openWindow(item.id);
                }
              }}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-xs transition ${
                (activeWindow || "home") === item.id
                  ? "text-signal2"
                  : "text-mist hover:text-white"
              }`}
            >
              <span className="text-xl leading-none">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Meet Someone window */}
      {activeWindow === "meet" && (
        <AppWindow
          title="Meet Someone"
          subtitle="Choose your matching preferences"
          onClose={closeWindow}
        >
          <div className="rounded-2xl border border-signal/20 bg-signal/5 p-4">
            <p className="font-display text-lg font-bold">One conversation away</p>
            <p className="mt-1 text-sm text-mist">
              Choose your preference and optional interests before matching.
            </p>
          </div>

          <label className="mb-2 mt-5 block text-xs font-semibold uppercase tracking-wider text-mist">
            Preference
          </label>

          <div className="grid grid-cols-3 gap-2">
            {PREFERENCES.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setPreference(option)}
                aria-pressed={preference === option}
                className={`rounded-xl border px-3 py-3 text-sm capitalize transition ${
                  preference === option
                    ? "border-signal bg-signal/10 text-signal2"
                    : "border-white/10 bg-panel2 text-mist"
                }`}
              >
                {option}
              </button>
            ))}
          </div>

          <label
            htmlFor="match-interests"
            className="mb-2 mt-5 block text-xs font-semibold uppercase tracking-wider text-mist"
          >
            Interests (optional)
          </label>

          <input
            id="match-interests"
            value={interests}
            onChange={(event) => setInterests(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") startChat();
            }}
            placeholder="Music, travel, movies..."
            enterKeyHint="go"
            className="w-full rounded-xl border border-white/10 bg-panel2 px-4 py-3 text-base text-white outline-none placeholder:text-mist/50 focus:border-signal/50"
          />

          <div className="mt-3 flex flex-wrap gap-2">
            {QUICK_INTERESTS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => addInterest(tag)}
                className="rounded-full border border-white/10 px-3 py-2 text-xs text-mist hover:border-signal/40 hover:text-white"
              >
                + {tag}
              </button>
            ))}
          </div>

          <AppButton
            variant="primary"
            onClick={startChat}
            className="mt-6 w-full"
          >
            Start 1-to-1 call →
          </AppButton>
        </AppWindow>
      )}

      {/* Explore Rooms window */}
      {activeWindow === "rooms" && (
        <AppWindow
          title="Explore Rooms"
          subtitle={`${rooms.length} rooms available`}
          onClose={closeWindow}
          wide
        >
          <AppButton
            variant="primary"
            onClick={() => setCreateOpen(true)}
            className="w-full"
          >
            + Create a room
          </AppButton>

          {rooms.length >= 1 && (
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search rooms..."
              aria-label="Search rooms"
              className="mt-4 w-full rounded-xl border border-white/10 bg-panel2 px-4 py-3 text-base text-white outline-none placeholder:text-mist/50 focus:border-signal/50"
            />
          )}

          {loading ? (
            <div className="py-10 text-center text-sm text-mist">
              Loading rooms…
            </div>
          ) : filteredRooms.length === 0 ? (
            <div className="py-10 text-center">
              <p className="font-semibold">
                {rooms.length ? "No matching rooms" : "No rooms yet"}
              </p>
              <p className="mt-2 text-sm text-mist">
                {rooms.length
                  ? "Try another search."
                  : "Create a room and start the conversation."}
              </p>
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="mt-3 text-sm text-signal2 underline"
                >
                  Clear search
                </button>
              )}
            </div>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {filteredRooms.map((room) => (
                <div key={room._id} className="min-w-0">
                  <RoomCard
                    room={room}
                    onJoin={(selectedRoom) =>
                      navigate(`/rooms/${selectedRoom._id}`, {
                        state: { room: selectedRoom },
                      })
                    }
                  />
                </div>
              ))}
            </div>
          )}
        </AppWindow>
      )}

      {/* My Rooms window */}
      {activeWindow === "myrooms" && (
        <AppWindow
          title="My Rooms"
          subtitle={`${myRooms.length} of 2 rooms created`}
          onClose={closeWindow}
          wide
        >
          <AppButton
            variant="primary"
            onClick={() => setCreateOpen(true)}
            disabled={myRooms.length >= 2}
            className="w-full disabled:cursor-not-allowed disabled:opacity-40"
          >
            {myRooms.length >= 2 ? "Room limit reached" : "+ Create a room"}
          </AppButton>

          {myRooms.length === 0 ? (
            <div className="py-10 text-center">
              <p className="font-semibold">You haven't created a room yet</p>
              <p className="mt-2 text-sm text-mist">
                Create a room to start your own group conversation.
              </p>
            </div>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {myRooms.map((room) => (
                <div key={room._id} className="min-w-0">
                  <RoomCard
                    room={room}
                    onJoin={(selectedRoom) =>
                      navigate(`/rooms/${selectedRoom._id}`, {
                        state: { room: selectedRoom },
                      })
                    }
                  />

                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <AppButton
                      onClick={() => renameRoom(room)}
                      disabled={roomBusy}
                    >
                      Rename
                    </AppButton>
                    <AppButton
                      variant="danger"
                      onClick={() => deleteRoom(room)}
                      disabled={roomBusy}
                    >
                      Delete
                    </AppButton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </AppWindow>
      )}

      {/* Telegram Drop window */}
      {activeWindow === "telegram" && (
        <AppWindow
          title="Telegram Drop"
          subtitle="Check the current drop"
          onClose={closeWindow}
        >
          <TelegramDrop />
        </AppWindow>
      )}

      {/* Profile window */}
      {activeWindow === "profile" && (
        <AppWindow
          title="Your Profile"
          subtitle="Personalize your display name"
          onClose={closeWindow}
        >
          <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-panel2 p-4">
            <Avatar name={nameDraft} />
            <div className="min-w-0">
              <p className="font-semibold">{nameDraft || "Your name"}</p>
              <p className="text-xs text-mist">Display name preview</p>
            </div>
          </div>

          <label
            htmlFor="display-name"
            className="mb-2 mt-5 block text-xs font-semibold uppercase tracking-wider text-mist"
          >
            Display name
          </label>

          <input
            id="display-name"
            value={nameDraft}
            onChange={(event) => setNameDraft(event.target.value.slice(0, 30))}
            maxLength={30}
            autoComplete="nickname"
            className="w-full rounded-xl border border-white/10 bg-panel2 px-4 py-3 text-base text-white outline-none focus:border-signal/50"
          />

          <p className="mt-2 text-right text-xs text-mist">
            {nameDraft.length}/30
          </p>

          <AppButton
            variant="primary"
            onClick={saveName}
            className="mt-4 w-full"
          >
            Save changes
          </AppButton>

          <AppButton
            onClick={() => {
              closeWindow();
              navigate("/profile");
            }}
            className="mt-3 w-full"
          >
            Open full profile →
          </AppButton>
        </AppWindow>
      )}

      {/* Invite window */}
      {activeWindow === "invite" && (
        <AppWindow
          title="Invite a Friend"
          subtitle="Share RandomConnect"
          onClose={closeWindow}
        >
          <div className="rounded-2xl border border-violet/20 bg-violet/5 p-5">
            <p className="font-display text-xl font-bold">
              Good conversations are better shared.
            </p>
            <p className="mt-2 text-sm text-mist">
              Invite someone to join you on RandomConnect.
            </p>
          </div>

          <AppButton
            variant="violet"
            onClick={async () => {
              try {
                const invite = await api.premiumReferral(getFingerprint());
                const url = `${window.location.origin}/?invite=${encodeURIComponent(
                  invite.code
                )}`;

                if (navigator.share) {
                  await navigator.share({
                    title: "Join me on RandomConnect",
                    text: "Let's connect on RandomConnect.",
                    url,
                  });
                } else {
                  await navigator.clipboard.writeText(url);
                  showNotice("Invite link copied.");
                  closeWindow();
                }
              } catch (error) {
                if (error?.name !== "AbortError") {
                  showNotice(error?.message || "Could not create invite.");
                }
              }
            }}
            className="mt-5 w-full"
          >
            Share invite link ↗
          </AppButton>
        </AppWindow>
      )}

      {/* App menu */}
      {menuOpen && (
        <AppWindow
          title="Menu"
          subtitle={name || "Your account"}
          onClose={() => setMenuOpen(false)}
        >
          <div className="mb-4 flex items-center gap-3 rounded-2xl border border-white/10 bg-panel2 p-4">
            <Avatar name={name} />
            <div className="min-w-0">
              <p className="truncate font-semibold">{name}</p>
              <button
                type="button"
                onClick={() => {
                  setNameDraft(name);
                  setMenuOpen(false);
                  setActiveWindow("profile");
                }}
                className="mt-1 text-xs text-signal2"
              >
                Edit display name
              </button>
            </div>
          </div>

          <div className="grid gap-2">
            {[
              ["Profile", "/profile"],
              ["Guide", "/guide"],
              ["Pricing", "/pricing"],
              ["About", "/about"],
              ["FAQ", "/faq"],
              ["Safety", "/safety"],
              ["Contact", "/contact"],
              ["Privacy", "/privacy"],
              ["Terms", "/terms"],
            ].map(([label, path]) => (
              <button
                key={path}
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  navigate(path);
                }}
                className="flex min-h-11 items-center justify-between rounded-xl border border-white/10 bg-panel2 px-4 text-left text-sm hover:border-white/20"
              >
                {label}
                <span className="text-mist">→</span>
              </button>
            ))}

            <AppButton
              variant="danger"
              onClick={() => {
                setMenuOpen(false);
                setActiveWindow("logout");
              }}
              className="mt-2 w-full"
            >
              Log out
            </AppButton>
          </div>
        </AppWindow>
      )}

      {/* Logout confirmation */}
      {activeWindow === "logout" && (
        <AppWindow
          title="Log out?"
          subtitle="You'll leave this device's session"
          onClose={closeWindow}
        >
          <p className="text-sm leading-relaxed text-mist">
            Are you sure you want to log out of RandomConnect?
          </p>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <AppButton onClick={closeWindow}>Cancel</AppButton>
            <AppButton variant="danger" onClick={logout}>
              Log out
            </AppButton>
          </div>
        </AppWindow>
      )}

      {/* Existing room creation component */}
      <CreateRoomModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={createRoom}
        creating={creating}
      />

      {/* Toast message */}
      {notice && (
        <div
          role="status"
          className="fixed bottom-24 left-1/2 z-[130] w-max max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-xl border border-white/10 bg-panel px-4 py-3 text-sm text-white shadow-2xl"
        >
          {notice}
        </div>
      )}
    </div>
  );
}