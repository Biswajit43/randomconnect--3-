import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";
import {
  clearLocalSession,
  getFingerprint,
  getDisplayName,
  setDisplayName,
} from "../lib/socket.js";
import RoomCard from "../components/RoomCard.jsx";
import CreateRoomModal from "../components/CreateRoomModal.jsx";

/* ------------------------------------------------------------------ */
/*  Constants and helpers                                              */
/* ------------------------------------------------------------------ */

const NAME_MAX = 30;

const PREFERENCES = ["any", "male", "female"];

const QUICK_INTERESTS = ["music", "travel", "movies", "gaming"];

// Same palette and hash as the landing page, so a person's colour matches
// from the first screen to this one.
const AVATAR_COLORS = [
  "#4CC9F0",
  "#9D8DF1",
  "#FF6B6B",
  "#7BE0D6",
  "#F4B860",
  "#6FCF97",
];

const NAME_ADJECTIVES = [
  "Swift",
  "Calm",
  "Bright",
  "Lucky",
  "Cosmic",
  "Mellow",
  "Bold",
  "Sunny",
];

const NAME_NOUNS = [
  "Otter",
  "Comet",
  "Panda",
  "Falcon",
  "Maple",
  "Orbit",
  "Fox",
  "Koala",
];

function colorForName(text) {
  let hash = 0;

  for (let i = 0; i < text.length; i += 1) {
    hash = text.charCodeAt(i) + ((hash << 5) - hash);
  }

  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// Array.from keeps emoji whole. charAt(0) would cut them in half.
function initialOf(text) {
  const first = Array.from((text || "").trim())[0];

  return first ? first.toUpperCase() : "?";
}

function randomName() {
  const adjective =
    NAME_ADJECTIVES[Math.floor(Math.random() * NAME_ADJECTIVES.length)];
  const noun = NAME_NOUNS[Math.floor(Math.random() * NAME_NOUNS.length)];

  return `${adjective}${noun}`;
}

function greeting() {
  const hour = new Date().getHours();

  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";

  return "Good evening";
}

function parseInterests(value) {
  return value
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 5);
}

/* ------------------------------------------------------------------ */
/*  Toasts                                                             */
/* ------------------------------------------------------------------ */

function useToasts() {
  const [toasts, setToasts] = useState([]);

  const push = useCallback((message, tone = "info") => {
    const id = `${Date.now()}-${Math.random()}`;

    setToasts((current) => [...current.slice(-2), { id, message, tone }]);

    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 3800);
  }, []);

  return { toasts, push };
}

function ToastStack({ toasts }) {
  if (toasts.length === 0) return null;

  const tones = {
    success: "border-signal/30 text-signal2",
    error: "border-coral/40 text-coral",
    info: "border-white/15 text-white",
  };

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[120] flex flex-col items-center gap-2 px-4 pb-[env(safe-area-inset-bottom)]"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto max-w-sm rounded-xl border bg-panel px-4 py-3 text-sm font-medium shadow-2xl animate-[rmToastIn_.22s_ease-out] ${
            tones[toast.tone] || tones.info
          }`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function Rooms() {
  const navigate = useNavigate();
  const { toasts, push } = useToasts();

  const [rooms, setRooms] = useState([]);
  const [myRooms, setMyRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [waitingCount, setWaitingCount] = useState(null);
  const [query, setQuery] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const [preference, setPreference] = useState("any");
  const [interests, setInterests] = useState("");
  const [optionsOpen, setOptionsOpen] = useState(false);

  const [name, setName] = useState(() => getDisplayName());
  const [staffRole, setStaffRole] = useState(() =>
    localStorage.getItem("rc_staff_role")
  );

  const [nameEditorOpen, setNameEditorOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const [renameTarget, setRenameTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [roomBusy, setRoomBusy] = useState(false);

  const closeNameEditor = useCallback(() => setNameEditorOpen(false), []);
  const closeLogout = useCallback(() => setLogoutOpen(false), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const closeRename = useCallback(() => setRenameTarget(null), []);
  const closeDelete = useCallback(() => setDeleteTarget(null), []);

  useEffect(() => {
    if (!getDisplayName()) navigate("/");
  }, [navigate]);

  /* ---------- staff session ---------- */

  useEffect(() => {
    let active = true;

    const refreshStaffLease = () =>
      api
        .adminSession()
        .then((session) => {
          if (active) {
            setStaffRole(session.role);
            localStorage.setItem("rc_staff_role", session.role);
          }
        })
        .catch(() => {});

    refreshStaffLease();

    const intervalId = window.setInterval(refreshStaffLease, 30000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  /* ---------- rooms ---------- */

  const refresh = useCallback(() => {
    Promise.all([api.listRooms(), api.listMyRooms(getFingerprint())])
      .then(([allRooms, ownedRooms]) => {
        setRooms(allRooms);
        setMyRooms(ownedRooms);
        setLoadFailed(false);
      })
      .catch(() => setLoadFailed(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();

    // Skip polling while the tab is in the background, and catch up the
    // moment the person comes back.
    const interval = window.setInterval(() => {
      if (!document.hidden) refresh();
    }, 5000);

    const onVisible = () => {
      if (!document.hidden) refresh();
    };

    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  /* ---------- people waiting (same source as the landing page) ---------- */

  useEffect(() => {
    let mounted = true;

    async function refreshWaiting() {
      try {
        const stats = await api.stats();

        if (mounted) setWaitingCount(stats.waiting);
      } catch {
        // Optional UI.
      }
    }

    refreshWaiting();

    const interval = window.setInterval(refreshWaiting, 6000);

    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  /* ---------- actions ---------- */

  async function logout() {
    if (staffRole) await api.adminLogout().catch(() => {});

    clearLocalSession();
    setStaffRole(null);
    setName("");
    navigate("/");
  }

  const saveName = useCallback(
    (next) => {
      setName(next);
      setDisplayName(next);
      setNameEditorOpen(false);
      push(`Name changed to “${next}”`, "success");
    },
    [push]
  );

  async function handleCreate(payload) {
    setCreating(true);

    try {
      const room = await api.createRoom({
        ...payload,
        fingerprint: getFingerprint(),
      });

      navigate(`/rooms/${room._id}`, { state: { room } });
    } catch (err) {
      push(err?.message || "Could not create the room.", "error");
    } finally {
      setCreating(false);
    }
  }

  async function submitRename(nextName) {
    const room = renameTarget;

    if (!room) return;

    if (!nextName || nextName === room.name) {
      setRenameTarget(null);
      return;
    }

    setRoomBusy(true);

    try {
      await api.updateRoom(room._id, {
        name: nextName,
        fingerprint: getFingerprint(),
      });

      setRenameTarget(null);
      refresh();
      push("Room renamed", "success");
    } catch (err) {
      push(err?.message || "Could not rename the room.", "error");
    } finally {
      setRoomBusy(false);
    }
  }

  async function confirmDelete() {
    const room = deleteTarget;

    if (!room) return;

    setRoomBusy(true);

    try {
      await api.deleteRoom(room._id, getFingerprint());

      setDeleteTarget(null);
      refresh();
      push("Room deleted", "success");
    } catch (err) {
      push(err?.message || "Could not delete the room.", "error");
    } finally {
      setRoomBusy(false);
    }
  }

  function start1to1() {
    navigate("/chat", {
      state: {
        interests: parseInterests(interests),
        preference,
      },
    });
  }

  function addInterest(value) {
    const current = interests
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    if (current.map((item) => item.toLowerCase()).includes(value)) return;

    setInterests([...current, value].slice(0, 5).join(", "));
  }

  const go = useCallback(
    (path) => {
      setMenuOpen(false);
      navigate(path);
    },
    [navigate]
  );

  const openRoom = useCallback(
    (room) => navigate(`/rooms/${room._id}`, { state: { room } }),
    [navigate]
  );

  /* ---------- derived ---------- */

  const interestTags = useMemo(() => parseInterests(interests), [interests]);

  const visibleRooms = useMemo(() => {
    const search = query.trim().toLowerCase();

    if (!search) return rooms;

    return rooms.filter((room) =>
      `${room.name || ""} ${room.description || ""}`
        .toLowerCase()
        .includes(search)
    );
  }, [rooms, query]);

  const firstName = (name || "").trim().split(" ")[0] || "there";

  const subline =
    waitingCount > 0
      ? `${waitingCount} ${
          waitingCount === 1 ? "person is" : "people are"
        } looking for a conversation right now.`
      : "Start a call, or drop into a room where people are talking.";

  const optionsSummary = `${
    preference.charAt(0).toUpperCase() + preference.slice(1)
  }${interestTags.length ? ` · ${interestTags.join(", ")}` : ""}`;

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <div className="min-h-screen w-full min-w-0 overflow-x-clip">
      {/* HEADER */}
      <header className="sticky top-0 z-40 w-full border-b border-white/10 bg-ink/80 backdrop-blur-xl">
        <div className="mx-auto flex min-h-[64px] w-full max-w-[1440px] min-w-0 items-center justify-between gap-3 px-3 sm:px-5 md:px-8">
          {/* BRAND */}
          <button
            type="button"
            onClick={() => navigate("/rooms")}
            className="flex shrink-0 items-center gap-2 font-display text-lg font-bold tracking-tight text-white sm:text-xl"
            aria-label="RandomConnect, go to rooms"
          >
            <BrandMark className="h-7 w-7" />
            <span>
              random<span className="text-signal">connect</span>
            </span>
          </button>

          {/* DESKTOP NAV */}
          <div className="hidden min-w-0 items-center gap-2 lg:flex">
            <NameChip name={name} onClick={() => setNameEditorOpen(true)} />

            <button
              type="button"
              onClick={() => navigate("/profile")}
              className="ui-button ui-button-muted shrink-0 border-violet/30 px-3 text-xs text-violet"
            >
              Profile
            </button>

            <button
              type="button"
              onClick={() => navigate("/guide")}
              className="ui-button ui-button-muted shrink-0 px-3 text-xs"
            >
              Guide
            </button>

            <button
              type="button"
              onClick={() => setLogoutOpen(true)}
              className="ui-button ui-button-danger shrink-0 px-3 text-xs"
            >
              Log out
            </button>

            <LiveIndicator count={waitingCount} />
          </div>

          {/* MOBILE HEADER */}
          <div className="flex items-center gap-2 lg:hidden">
            <LiveIndicator count={waitingCount} compact />

            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={menuOpen}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-panel/80 text-white shadow-lg transition hover:border-signal/40 hover:bg-panel2"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* MAIN
          On phones the order is: greeting, 1-to-1, rooms, invite.
          On desktop the 1-to-1 card and the invite card sit together in a
          sticky left column. The wrapper uses `contents` on small screens so
          its children can be reordered against the rooms list. */}
      <main className="mx-auto grid w-full max-w-[1440px] min-w-0 grid-cols-1 gap-4 px-3 py-4 pb-20 sm:gap-6 sm:px-5 sm:py-6 lg:grid-cols-[340px_minmax(0,1fr)] lg:px-8">
        {/* GREETING */}
        <section className="relative min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-panel/70 px-4 py-4 sm:px-6 sm:py-5 lg:col-span-2">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-signal/10 blur-3xl"
          />

          <div className="relative flex items-center gap-3 sm:gap-4">
            <Avatar name={name} size="lg" />

            <div className="min-w-0">
              <h1 className="truncate font-display text-xl font-bold text-white sm:text-2xl">
                {greeting()}, {firstName}
              </h1>

              <p className="mt-0.5 text-sm leading-snug text-mist">
                {subline}
              </p>

              {staffRole && (
                <p className="mt-1.5 inline-block rounded-full border border-violet/30 bg-violet/10 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-violet">
                  {staffRole}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => setNameEditorOpen(true)}
              className="ui-button ui-button-muted ml-auto hidden shrink-0 px-3 text-xs sm:inline-flex"
            >
              Change name
            </button>
          </div>
        </section>

        <div className="contents lg:sticky lg:top-20 lg:order-1 lg:block lg:h-fit lg:space-y-5 lg:self-start">
          {/* 1-TO-1 */}
          <aside className="order-1 min-w-0 rounded-2xl border border-white/10 bg-panel/85 p-4 shadow-xl backdrop-blur-xl sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="mb-1 font-mono text-xs uppercase tracking-widest text-signal2">
                  1-to-1
                </p>

                <h2 className="font-display text-xl font-bold text-white">
                  Talk to one stranger
                </h2>

                <p className="mt-1 text-sm text-mist">
                  Private call · instant match
                </p>
              </div>

              <button
                type="button"
                onClick={() => setOptionsOpen((value) => !value)}
                aria-expanded={optionsOpen}
                aria-controls="one-to-one-options"
                className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-panel2 px-3 py-1.5 text-xs font-medium text-mist transition hover:text-white lg:hidden"
              >
                Options
                <svg
                  viewBox="0 0 24 24"
                  className={`h-3.5 w-3.5 transition-transform ${
                    optionsOpen ? "rotate-180" : ""
                  }`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
            </div>

            {/* Options: always open on desktop, collapsible on phones */}
            <div
              id="one-to-one-options"
              className={`${optionsOpen ? "block" : "hidden"} mt-5 lg:block`}
            >
              <label className="mb-1.5 block font-mono text-xs uppercase tracking-wide text-mist">
                Preference
              </label>

              <div className="mb-4 grid w-full grid-cols-3 gap-1.5 sm:gap-2">
                {PREFERENCES.map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={preference === option}
                    onClick={() => setPreference(option)}
                    className={`min-w-0 rounded-lg border py-2 text-xs capitalize transition sm:text-sm ${
                      preference === option
                        ? "border-signal bg-signal/15 text-signal2"
                        : "border-white/10 bg-panel2 text-mist hover:border-white/20 hover:text-white"
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>

              <input
                value={interests}
                onChange={(event) => setInterests(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") start1to1();
                }}
                placeholder="Interests (optional)"
                aria-label="Interests, optional"
                enterKeyHint="go"
                className="w-full min-w-0 rounded-lg border border-white/10 bg-panel2 px-3 py-2.5 text-sm text-white outline-none placeholder:text-mist/50 focus:border-signal/50"
              />

              <div className="mb-4 mt-2 flex flex-wrap gap-1.5">
                {QUICK_INTERESTS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => addInterest(tag)}
                    className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-mist transition hover:border-signal/40 hover:text-signal2"
                  >
                    + {tag}
                  </button>
                ))}
              </div>
            </div>

            {/* What the collapsed options currently say */}
            {!optionsOpen && (
              <p className="mt-3 truncate text-xs text-mist lg:hidden">
                {optionsSummary}
              </p>
            )}

            <button
              type="button"
              onClick={start1to1}
              className="ui-button ui-button-primary mt-4 w-full shadow-lg shadow-signal/15 lg:mt-0"
            >
              Start 1-to-1 call
            </button>
          </aside>

          {/* INVITE */}
          <div className="order-3 min-w-0">
            <PremiumReferralCard />
          </div>
        </div>

        {/* GROUP ROOMS */}
        <section className="order-2 min-w-0 lg:order-2">
          {loadFailed && !loading && (
            <div
              role="status"
              className="mb-4 flex items-center gap-2 rounded-xl border border-coral/30 bg-coral/10 px-3 py-2 text-xs text-coral"
            >
              <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-coral" />
              Can't reach the rooms right now. Retrying automatically…
            </div>
          )}

          {myRooms.length > 0 && (
            <div className="mb-8 min-w-0">
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                  <p className="mb-1 font-mono text-xs uppercase tracking-widest text-violet">
                    my groups
                  </p>

                  <h2 className="font-display text-xl font-bold text-white">
                    Your rooms · {myRooms.length}/2
                  </h2>
                </div>

                <span className="text-xs text-mist">rename or delete</span>
              </div>

              <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
                {myRooms.map((room) => (
                  <div key={room._id} className="min-w-0 rounded-2xl">
                    <RoomCard room={room} onJoin={openRoom} />

                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setRenameTarget(room)}
                        className="min-w-0 rounded-lg border border-white/10 bg-panel2 px-2 py-2.5 text-xs text-white transition hover:border-signal/50"
                      >
                        Edit name
                      </button>

                      <button
                        type="button"
                        onClick={() => setDeleteTarget(room)}
                        className="min-w-0 rounded-lg border border-coral/30 bg-coral/10 px-2 py-2.5 text-xs text-coral transition hover:bg-coral/20"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* GROUP HEADER */}
          <div className="mb-4 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="mb-1 font-mono text-xs uppercase tracking-widest text-signal2">
                group rooms
                {!loading && rooms.length > 0 && (
                  <span className="ml-2 text-mist">· {rooms.length} open</span>
                )}
              </p>

              <h2 className="font-display text-xl font-bold leading-tight text-white sm:text-2xl">
                Where people are actually talking
              </h2>
            </div>

            <button
              type="button"
              onClick={() => setModalOpen(true)}
              disabled={myRooms.length >= 2}
              title={
                myRooms.length >= 2
                  ? "Delete or edit an existing group before creating another"
                  : "Start a group room"
              }
              className="w-full shrink-0 rounded-xl border border-violet/40 bg-violet/15 px-4 py-3 text-sm font-semibold text-violet transition hover:bg-violet/25 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:py-2.5"
            >
              {myRooms.length >= 2 ? "2 groups created" : "+ Start a room"}
            </button>
          </div>

          {/* SEARCH (only worth showing once the list gets long) */}
          {rooms.length >= 4 && (
            <div className="relative mb-4">
              <svg
                viewBox="0 0 24 24"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mist"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="6.5" />
                <path d="M20 20l-4-4" />
              </svg>

              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search rooms"
                aria-label="Search rooms"
                enterKeyHint="search"
                className="w-full rounded-xl border border-white/10 bg-panel2 py-2.5 pl-9 pr-10 text-sm text-white outline-none placeholder:text-mist/50 focus:border-signal/50"
              />

              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-mist hover:text-white"
                >
                  ×
                </button>
              )}
            </div>
          )}

          {/* ROOMS */}
          {loading ? (
            <div
              className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2"
              aria-label="Loading rooms"
            >
              {[0, 1, 2, 3].map((item) => (
                <RoomSkeleton key={item} />
              ))}
            </div>
          ) : rooms.length === 0 ? (
            <div className="w-full min-w-0 rounded-2xl border border-dashed border-white/10 bg-panel/40 p-6 text-center sm:p-10">
              <p className="font-display text-lg font-semibold text-white">
                It's quiet in here
              </p>

              <p className="mb-4 mt-1 text-sm text-mist">
                No rooms yet. Start one and people will find you.
              </p>

              <button
                type="button"
                onClick={() => setModalOpen(true)}
                disabled={myRooms.length >= 2}
                className="w-full rounded-xl bg-signal px-4 py-3 text-sm font-semibold text-ink disabled:opacity-40 sm:w-auto"
              >
                + Start a room
              </button>
            </div>
          ) : visibleRooms.length === 0 ? (
            <div className="w-full min-w-0 rounded-2xl border border-dashed border-white/10 bg-panel/40 p-6 text-center sm:p-10">
              <p className="text-sm text-mist">
                No rooms match “{query.trim()}”.
              </p>

              <button
                type="button"
                onClick={() => setQuery("")}
                className="mt-3 text-sm font-medium text-signal2 underline underline-offset-4"
              >
                Clear search
              </button>
            </div>
          ) : (
            <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
              {visibleRooms.map((room) => (
                <div key={room._id} className="min-w-0">
                  <RoomCard room={room} onJoin={openRoom} />
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* OVERLAYS
          Everything below lives outside <header>. The header has a
          backdrop blur, and a blurred ancestor traps position:fixed children
          inside itself, which is why the old menu backdrop only covered the
          header bar. */}
      {menuOpen && (
        <MobileMenu
          name={name}
          staffRole={staffRole}
          onClose={closeMenu}
          onNavigate={go}
          onEditName={() => {
            setMenuOpen(false);
            setNameEditorOpen(true);
          }}
          onLogout={async () => {
            setMenuOpen(false);
            await logout();
          }}
        />
      )}

      {nameEditorOpen && (
        <NameEditorModal
          currentName={name}
          onSave={saveName}
          onClose={closeNameEditor}
        />
      )}

      {renameTarget && (
        <RenameRoomModal
          room={renameTarget}
          busy={roomBusy}
          onSubmit={submitRename}
          onClose={closeRename}
        />
      )}

      {deleteTarget && (
        <DeleteRoomModal
          room={deleteTarget}
          busy={roomBusy}
          onConfirm={confirmDelete}
          onClose={closeDelete}
        />
      )}

      {logoutOpen && <LogoutModal onClose={closeLogout} onLogout={logout} />}

      <CreateRoomModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreate={handleCreate}
        creating={creating}
      />

      <ToastStack toasts={toasts} />

      <style>{`
        @keyframes rmSheetUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes rmSlideIn {
          from { opacity: 0; transform: translateX(28px); }
          to { opacity: 1; transform: translateX(0); }
        }

        @keyframes rmToastIn {
          from { opacity: 0; transform: translateY(10px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        @media (prefers-reduced-motion: reduce) {
          *,
          *::before,
          *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Brand + avatar + name                                              */
/* ------------------------------------------------------------------ */

function BrandMark({ className = "h-7 w-7" }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <circle
        cx="15"
        cy="20"
        r="11"
        stroke="currentColor"
        strokeWidth="2.4"
        className="text-signal"
      />
      <circle
        cx="25"
        cy="20"
        r="11"
        stroke="currentColor"
        strokeWidth="2.4"
        className="text-violet"
      />
      <circle cx="20" cy="20" r="2.4" fill="currentColor" className="text-white" />
    </svg>
  );
}

/*
  The round letter badge. Fixes over the old one:
  - emoji-safe first letter (charAt(0) split emoji into a broken glyph)
  - colour comes from the name, matching the landing page
  - four sizes, so it can be reused in the header, menu and editor
*/
function Avatar({ name, size = "md" }) {
  const sizes = {
    sm: "h-7 w-7 text-xs",
    md: "h-9 w-9 text-sm",
    lg: "h-12 w-12 text-xl sm:h-14 sm:w-14 sm:text-2xl",
    xl: "h-16 w-16 text-3xl",
  };

  const clean = (name || "").trim();

  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 select-none items-center justify-center rounded-full font-bold text-[#06101a] transition-colors duration-200 ${
        sizes[size] || sizes.md
      }`}
      style={{
        backgroundColor: clean ? colorForName(clean) : "rgba(255,255,255,.14)",
      }}
    >
      {initialOf(clean)}
    </span>
  );
}

function PencilIcon({ className = "h-3.5 w-3.5" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 20h4L19 9l-4-4L4 16v4z" />
      <path d="M13.5 6.5l4 4" />
    </svg>
  );
}

function NameChip({ name, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Change your name"
      aria-label={`Signed in as ${name || "Guest"}. Change your name`}
      className="group flex min-w-0 max-w-[14rem] items-center gap-2 rounded-full border border-white/10 bg-panel py-1 pl-1 pr-3 text-sm text-white/90 transition hover:border-signal/40"
    >
      <Avatar name={name} size="sm" />

      <span className="min-w-0 truncate">{name || "Guest"}</span>

      <PencilIcon className="h-3.5 w-3.5 shrink-0 text-mist transition group-hover:text-signal2" />
    </button>
  );
}

function LiveIndicator({ count, compact = false }) {
  const label = count > 0 ? `${count} waiting` : "live";

  return (
    <span
      className={`flex shrink-0 items-center gap-1.5 font-mono text-xs font-medium text-signal2 ${
        compact
          ? "rounded-full border border-signal/20 bg-signal/5 px-2.5 py-1.5"
          : ""
      }`}
    >
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-signal sm:h-2 sm:w-2" />
      {label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Modal shell (bottom sheet on phones, dialog on larger screens)     */
/* ------------------------------------------------------------------ */

function ModalShell({
  eyebrow,
  eyebrowClass = "text-signal2",
  title,
  description,
  onClose,
  children,
}) {
  const titleId = useId();

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    function onKey(event) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", onKey);

    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-panel shadow-2xl animate-[rmSheetUp_.24s_ease-out] sm:rounded-3xl">
        <div className="overflow-y-auto overscroll-contain p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6">
          <div
            aria-hidden="true"
            className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/15 sm:hidden"
          />

          {eyebrow && (
            <p
              className={`font-mono text-[11px] uppercase tracking-[0.2em] ${eyebrowClass}`}
            >
              {eyebrow}
            </p>
          )}

          <h2
            id={titleId}
            className="mt-2 font-display text-xl font-semibold text-white"
          >
            {title}
          </h2>

          {description && (
            <p className="mt-2 text-sm leading-relaxed text-mist">
              {description}
            </p>
          )}

          {children}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Change name                                                        */
/*  Old behaviour: the badge turned into an input that saved on blur   */
/*  AND on Enter (so Enter saved twice), had no Escape, silently       */
/*  ignored empty names, and changed the header width while editing.   */
/*  Now it is one dialog with a live preview and a single save path.   */
/* ------------------------------------------------------------------ */

function NameEditorModal({ currentName, onSave, onClose }) {
  const [draft, setDraft] = useState(currentName || "");
  const [touched, setTouched] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const clean = draft.replace(/\s+/g, " ").trim();
  const empty = clean.length === 0;
  const unchanged = clean === (currentName || "").trim();
  const canSave = !empty && !unchanged;

  function submit(event) {
    event.preventDefault();
    setTouched(true);

    if (canSave) onSave(clean);
  }

  function suggest() {
    setDraft(randomName());
    setTouched(true);
    inputRef.current?.focus();
  }

  return (
    <ModalShell
      eyebrow="Your name"
      title="Change your name"
      description="This is how people see you in rooms and calls. Only stored on this device."
      onClose={onClose}
    >
      <form onSubmit={submit} className="mt-5">
        <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-panel2/60 p-4">
          <Avatar name={clean} size="xl" />

          <div className="min-w-0">
            <p className="truncate font-display text-lg font-semibold text-white">
              {clean || "Your name"}
            </p>

            <p className="text-xs text-mist">Preview</p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <label
            htmlFor="rc-name-input"
            className="font-mono text-xs uppercase tracking-wide text-mist"
          >
            Display name
          </label>

          <span className="font-mono text-xs text-mist">
            {draft.length}/{NAME_MAX}
          </span>
        </div>

        <input
          id="rc-name-input"
          ref={inputRef}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setTouched(true);
          }}
          maxLength={NAME_MAX}
          autoComplete="nickname"
          enterKeyHint="done"
          placeholder="What should people call you?"
          aria-invalid={touched && empty}
          aria-describedby={touched && empty ? "rc-name-error" : undefined}
          className={`mt-1.5 h-12 w-full rounded-xl border bg-panel2 px-3 text-base text-white outline-none placeholder:text-mist/50 ${
            touched && empty
              ? "border-coral/60"
              : "border-white/10 focus:border-signal/50"
          }`}
        />

        {touched && empty && (
          <p id="rc-name-error" role="alert" className="mt-1.5 text-xs text-coral">
            Your name can't be empty.
          </p>
        )}

        <button
          type="button"
          onClick={suggest}
          className="mt-3 text-xs font-medium text-signal2 underline underline-offset-4 transition hover:text-white"
        >
          Suggest a name
        </button>

        <div className="mt-6 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 px-4 py-3 text-sm text-mist transition hover:text-white sm:py-2.5"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={!canSave}
            className="rounded-xl bg-signal px-5 py-3 text-sm font-semibold text-ink transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 sm:py-2.5"
          >
            Save name
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/* ------------------------------------------------------------------ */
/*  Room rename / delete (replaces window.prompt and window.confirm)   */
/* ------------------------------------------------------------------ */

function RenameRoomModal({ room, busy, onSubmit, onClose }) {
  const [draft, setDraft] = useState(room.name || "");
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const clean = draft.trim();
  const canSave = clean.length > 0 && clean !== room.name && !busy;

  return (
    <ModalShell eyebrow="Your group" title="Rename group" onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();

          if (canSave) onSubmit(clean);
        }}
        className="mt-4"
      >
        <label htmlFor="rc-room-name" className="sr-only">
          Group name
        </label>

        <input
          id="rc-room-name"
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={80}
          enterKeyHint="done"
          className="h-12 w-full rounded-xl border border-white/10 bg-panel2 px-3 text-base text-white outline-none placeholder:text-mist/50 focus:border-signal/50"
        />

        <div className="mt-6 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 px-4 py-3 text-sm text-mist transition hover:text-white sm:py-2.5"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={!canSave}
            className="rounded-xl bg-signal px-5 py-3 text-sm font-semibold text-ink transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 sm:py-2.5"
          >
            {busy ? "Saving…" : "Save name"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function DeleteRoomModal({ room, busy, onConfirm, onClose }) {
  return (
    <ModalShell
      eyebrow="Delete group"
      eyebrowClass="text-coral"
      title={`Delete “${room.name}”?`}
      description="This can't be undone."
      onClose={onClose}
    >
      <div className="mt-6 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-white/10 px-4 py-3 text-sm text-mist transition hover:text-white sm:py-2.5"
        >
          Keep it
        </button>

        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="rounded-xl bg-coral px-5 py-3 text-sm font-semibold text-ink transition hover:brightness-110 disabled:opacity-50 sm:py-2.5"
        >
          {busy ? "Deleting…" : "Delete"}
        </button>
      </div>
    </ModalShell>
  );
}

/* ------------------------------------------------------------------ */
/*  Mobile menu (slide-in drawer)                                      */
/* ------------------------------------------------------------------ */

const MENU_MAIN_LINKS = [
  ["Profile", "/profile"],
  ["Guide", "/guide"],
  ["Pricing", "/pricing"],
];

// Secondary pages sit in a compact two-column grid so the whole menu,
// including Log out, fits on short phone screens.
const MENU_MORE_LINKS = [
  ["About", "/about"],
  ["FAQ", "/faq"],
  ["Safety", "/safety"],
  ["Contact", "/contact"],
  ["Privacy", "/privacy"],
  ["Terms", "/terms"],
];

function MobileMenu({
  name,
  staffRole,
  onClose,
  onNavigate,
  onEditName,
  onLogout,
}) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    function onKey(event) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", onKey);

    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  /*
    Why Log out was cut off: a fixed element sized with inset-0 can be taller
    than the part of the screen you can actually see (mobile browser toolbars,
    emulators). The drawer is now exactly 100dvh (the visible height), the links
    scroll inside their own area, and the footer with Log out never scrolls away.
  */
  return (
    <div
      className="fixed inset-0 z-[90] lg:hidden"
      style={{ height: "100dvh" }}
      role="dialog"
      aria-modal="true"
      aria-label="Navigation menu"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="absolute right-0 top-0 flex h-full w-[min(22rem,88vw)] flex-col overflow-hidden border-l border-white/10 bg-panel shadow-2xl animate-[rmSlideIn_.22s_ease-out]">
        {/* Account */}
        <div className="flex shrink-0 items-start gap-3 border-b border-white/10 p-4">
          <Avatar name={name} size="lg" />

          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-signal2">
              Account
            </p>

            <p className="mt-0.5 truncate font-semibold text-white">
              {name || "Guest"}
            </p>

            {staffRole && (
              <p className="mt-1 inline-block rounded-full border border-violet/30 bg-violet/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-violet">
                {staffRole}
              </p>
            )}

            <button
              type="button"
              onClick={onEditName}
              className="mt-2 flex items-center gap-1.5 text-xs font-medium text-signal2 transition hover:text-white"
            >
              <PencilIcon />
              Change name
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation menu"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 text-mist transition hover:text-white"
          >
            ×
          </button>
        </div>

        {/* Links: the only part that scrolls */}
        <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
          <div className="grid gap-1">
            {MENU_MAIN_LINKS.map(([label, path]) => (
              <button
                key={path}
                type="button"
                onClick={() => onNavigate(path)}
                className="flex w-full items-center justify-between rounded-xl border border-transparent px-4 py-2.5 text-left text-sm font-medium text-white/90 transition hover:border-white/10 hover:bg-panel2"
              >
                <span>{label}</span>
                <span className="text-mist/50">→</span>
              </button>
            ))}
          </div>

          <div className="my-3 h-px bg-white/10" />

          <div className="grid grid-cols-2 gap-1.5">
            {MENU_MORE_LINKS.map(([label, path]) => (
              <button
                key={path}
                type="button"
                onClick={() => onNavigate(path)}
                className="rounded-lg border border-white/[0.06] px-3 py-2 text-left text-xs font-medium text-mist transition hover:border-white/15 hover:bg-panel2 hover:text-white"
              >
                {label}
              </button>
            ))}
          </div>
        </nav>

        {/* Log out: always pinned to the bottom of the visible screen */}
        <div className="shrink-0 border-t border-white/10 bg-panel p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={onLogout}
            className="flex w-full items-center justify-between rounded-xl border border-coral/30 bg-coral/10 px-4 py-3 text-left text-sm font-semibold text-coral transition hover:bg-coral/20"
          >
            <span>Log out</span>
            <span aria-hidden="true">↗</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Logout                                                             */
/* ------------------------------------------------------------------ */

function LogoutModal({ onClose, onLogout }) {
  const recoveryCode = localStorage.getItem("rc_recovery_code") || "";
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    if (!recoveryCode) return;

    try {
      await navigator.clipboard.writeText(recoveryCode);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <ModalShell
      eyebrow="Leaving this device"
      eyebrowClass="text-coral"
      title="Log out of RandomConnect?"
      description="Your name and device session will be cleared. You can come back later and onboard again."
      onClose={onClose}
    >
      {recoveryCode ? (
        <div className="mt-4 rounded-xl border border-signal/20 bg-signal/5 p-3">
          <p className="text-xs text-signal2">
            Save your Premium recovery code first:
          </p>

          <p className="mt-2 break-all font-mono text-xs text-white">
            {recoveryCode}
          </p>

          <button
            type="button"
            onClick={copyCode}
            className="mt-3 rounded-lg border border-signal/30 px-3 py-2 text-xs font-semibold text-signal2 hover:bg-signal/10"
          >
            {copied ? "Copied" : "Copy recovery code"}
          </button>
        </div>
      ) : (
        <p className="mt-4 rounded-lg border border-violet/20 bg-violet/5 px-3 py-2 text-xs text-mist">
          No recovery code saved. Create one from Profile before logging out
          if you have Premium.
        </p>
      )}

      <div className="mt-5 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-white/10 px-4 py-3 text-sm text-mist hover:text-white sm:py-2.5"
        >
          Stay
        </button>

        <button
          type="button"
          onClick={onLogout}
          className="rounded-xl bg-coral px-4 py-3 text-sm font-semibold text-ink hover:brightness-110 sm:py-2.5"
        >
          Log out
        </button>
      </div>
    </ModalShell>
  );
}

/* ------------------------------------------------------------------ */
/*  Premium referral                                                   */
/* ------------------------------------------------------------------ */

function PremiumReferralCard() {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function shareInvite() {
    setBusy(true);
    setStatus("");

    try {
      const invite = await api.premiumReferral(getFingerprint());

      setCode(invite.code);

      const url = `${window.location.origin}/?invite=${encodeURIComponent(
        invite.code
      )}`;

      const shareData = {
        title: "Join me on RandomConnect",
        text: "Join me and we both get 30 days of Premium free.",
        url,
      };

      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(url);
        setStatus("Invite link copied.");
      }
    } catch (error) {
      if (error?.name !== "AbortError") {
        setStatus(error?.message || "Could not create invite.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full min-w-0 rounded-2xl border border-dashed border-violet/50 bg-violet/5 p-4">
      <p className="font-display font-semibold text-white">Invite a friend</p>

      <p className="mt-1 text-sm leading-relaxed text-mist">
        Both of you get 30 days of Premium free.
      </p>

      {code && (
        <p className="mt-3 break-all font-display text-lg font-bold tracking-wider text-violet">
          {code}
        </p>
      )}

      <button
        type="button"
        onClick={shareInvite}
        disabled={busy}
        className="mt-3 flex w-full min-w-0 items-center justify-center gap-2 rounded-xl border border-white/10 bg-panel2 px-3 py-3 text-sm font-semibold text-white transition hover:border-violet/50 disabled:opacity-50"
      >
        {busy ? "Preparing invite…" : "Share invite link"}
      </button>

      {status && (
        <p role="status" className="mt-2 break-words text-xs text-signal2">
          {status}
        </p>
      )}

      <p className="mt-2 text-center text-[11px] leading-relaxed text-mist">
        View your Premium days and community progress in Profile.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Skeleton                                                           */
/* ------------------------------------------------------------------ */

function RoomSkeleton() {
  return (
    <div
      className="w-full min-w-0 animate-pulse rounded-2xl border border-white/5 bg-panel/60 p-4"
      aria-hidden="true"
    >
      <div className="h-3 w-24 rounded bg-white/10" />
      <div className="mt-3 h-5 w-2/3 max-w-full rounded bg-white/10" />
      <div className="mt-2 h-3 w-full max-w-full rounded bg-white/5" />
      <div className="mt-5 h-3 w-28 rounded bg-white/10" />
    </div>
  );
}