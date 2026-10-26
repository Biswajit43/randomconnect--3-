import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate, useLocation } from "react-router-dom";
import TelegramDrop from "../components/TelegramDrop.jsx";
import { api } from "../lib/api.js";
import {
  clearLocalSession,
  getFingerprint,
  getDisplayName,
  setDisplayName,
} from "../lib/socket.js";
import RoomCard from "../components/RoomCard.jsx";
import CreateRoomModal from "../components/CreateRoomModal.jsx";

const NAME_MAX = 30;
const PREFERENCES = ["any", "male", "female"];
const QUICK_INTERESTS = ["music", "travel", "movies", "gaming"];

const AVATAR_COLORS = [
  "#4CC9F0",
  "#9D8DF1",
  "#FF6B6B",
  "#7BE0D6",
  "#F4B860",
  "#6FCF97",
];

const NAME_ADJECTIVES = [
  "Swift", "Calm", "Bright", "Lucky",
  "Cosmic", "Mellow", "Bold", "Sunny",
];

const NAME_NOUNS = [
  "Otter", "Comet", "Panda", "Falcon",
  "Maple", "Orbit", "Fox", "Koala",
];

function colorForName(text = "") {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = text.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initialOf(text = "") {
  const first = Array.from(text.trim())[0];
  return first ? first.toUpperCase() : "?";
}

function randomName() {
  return (
    NAME_ADJECTIVES[Math.floor(Math.random() * NAME_ADJECTIVES.length)] +
    NAME_NOUNS[Math.floor(Math.random() * NAME_NOUNS.length)]
  );
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function parseInterests(value = "") {
  return value
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 5);
}

/* ------------------------------ Toasts ------------------------------ */

function useToasts() {
  const [toasts, setToasts] = useState([]);

  const push = useCallback((message, tone = "info") => {
    const id = `${Date.now()}-${Math.random()}`;

    setToasts((current) => [
      ...current.slice(-2),
      { id, message, tone },
    ]);

    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 3500);
  }, []);

  return { toasts, push };
}

function ToastStack({ toasts }) {
  if (!toasts.length) return null;

  const tones = {
    success: "border-emerald-400/30 text-emerald-300",
    error: "border-rose-400/30 text-rose-300",
    info: "border-white/15 text-white",
  };

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-20 z-[150] flex flex-col items-center gap-2 px-4 pb-safe lg:bottom-4"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`max-w-sm rounded-xl border bg-[#101a2c] px-4 py-3 text-sm shadow-2xl ${
            tones[toast.tone] || tones.info
          }`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------ Main page ------------------------------ */

export default function Rooms() {
  const navigate = useNavigate();
  const location = useLocation();
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

  const roomsRef = useRef(null);
  const matchRef = useRef(null);

  useEffect(() => {
    if (!getDisplayName()) navigate("/");
  }, [navigate]);

  /* Staff session */

  useEffect(() => {
    let active = true;

    const refreshStaffLease = async () => {
      try {
        const session = await api.adminSession();
        if (!active) return;

        setStaffRole(session.role);
        localStorage.setItem("rc_staff_role", session.role);
      } catch {
        // Staff status is optional.
      }
    };

    refreshStaffLease();
    const interval = window.setInterval(refreshStaffLease, 30000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  /* Room data */

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
    refresh();

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

  /* Waiting statistics */

  useEffect(() => {
    let active = true;

    const refreshWaiting = async () => {
      try {
        const stats = await api.stats();
        if (active) setWaitingCount(stats.waiting);
      } catch {
        // Statistics are optional.
      }
    };

    refreshWaiting();
    const interval = window.setInterval(refreshWaiting, 6000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  /* Actions */

  async function logout() {
    if (staffRole) {
      await api.adminLogout().catch(() => {});
    }

    clearLocalSession();
    localStorage.removeItem("rc_staff_role");
    setStaffRole(null);
    setName("");
    navigate("/");
  }

  const saveName = useCallback(
    (next) => {
      setName(next);
      setDisplayName(next);
      setNameEditorOpen(false);
      push(`Name changed to "${next}"`, "success");
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

      setModalOpen(false);
      navigate(`/rooms/${room._id}`, { state: { room } });
    } catch (error) {
      push(error?.message || "Could not create the room.", "error");
    } finally {
      setCreating(false);
    }
  }

  async function submitRename(nextName) {
    const room = renameTarget;
    if (!room) return;

    const clean = nextName.trim();

    if (!clean || clean === room.name) {
      setRenameTarget(null);
      return;
    }

    setRoomBusy(true);

    try {
      await api.updateRoom(room._id, {
        name: clean,
        fingerprint: getFingerprint(),
      });

      setRenameTarget(null);
      await refresh();
      push("Room renamed successfully.", "success");
    } catch (error) {
      push(error?.message || "Could not rename the room.", "error");
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
      await refresh();
      push("Room deleted.", "success");
    } catch (error) {
      push(error?.message || "Could not delete the room.", "error");
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

    if (current.some((item) => item.toLowerCase() === value)) return;

    setInterests([...current, value].slice(0, 5).join(", "));
  }

  const openRoom = useCallback(
    (room) => navigate(`/rooms/${room._id}`, { state: { room } }),
    [navigate]
  );

  const go = useCallback(
    (path) => {
      setMenuOpen(false);
      navigate(path);
    },
    [navigate]
  );

  function scrollToRooms() {
    roomsRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function scrollToMatch() {
    matchRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }

  /* Derived state */

  const interestTags = useMemo(
    () => parseInterests(interests),
    [interests]
  );

  const visibleRooms = useMemo(() => {
    const search = query.trim().toLowerCase();

    if (!search) return rooms;

    return rooms.filter((room) =>
      `${room.name || ""} ${room.description || ""}`
        .toLowerCase()
        .includes(search)
    );
  }, [rooms, query]);

  const firstName = (name || "").trim().split(/\s+/)[0] || "there";

  const subline =
    waitingCount > 0
      ? `${waitingCount} ${
          waitingCount === 1 ? "person is" : "people are"
        } looking for a conversation right now.`
      : "Meet someone new, discover a group, and start a conversation.";

  const optionsSummary = `${
    preference.charAt(0).toUpperCase() + preference.slice(1)
  }${interestTags.length ? ` · ${interestTags.join(", ")}` : ""}`;

  return (
    <div className="min-h-screen w-full min-w-0 overflow-x-clip bg-ink text-white">
      {/* Header */}

      <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-ink/85 backdrop-blur-2xl">
        <div className="mx-auto flex min-h-[66px] w-full max-w-[1440px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => navigate("/rooms")}
            aria-label="RandomConnect home"
            className="flex shrink-0 items-center gap-2 font-display text-lg font-bold tracking-tight sm:text-xl"
          >
            <BrandMark className="h-8 w-8" />
            <span>
              random<span className="text-signal">connect</span>
            </span>
          </button>

          <div className="hidden items-center gap-2 lg:flex">
            <NameChip
              name={name}
              onClick={() => setNameEditorOpen(true)}
            />

            <button
              type="button"
              onClick={() => navigate("/profile")}
              className="ui-button ui-button-muted px-3 text-xs"
            >
              Profile
            </button>

            <button
              type="button"
              onClick={() => navigate("/guide")}
              className="ui-button ui-button-muted px-3 text-xs"
            >
              Guide
            </button>

            <button
              type="button"
              onClick={() => setLogoutOpen(true)}
              className="ui-button ui-button-danger px-3 text-xs"
            >
              Log out
            </button>

            <LiveIndicator count={waitingCount} />
          </div>

          <div className="flex items-center gap-2 lg:hidden">
            <LiveIndicator count={waitingCount} compact />

            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={menuOpen}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-panel text-white transition hover:border-signal/40"
            >
              <MenuIcon />
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}

      <main className="mx-auto grid w-full max-w-[1440px] grid-cols-1 gap-5 px-3 py-4 pb-28 sm:gap-6 sm:px-5 sm:py-6 sm:pb-28 lg:grid-cols-[340px_minmax(0,1fr)] lg:px-8 lg:pb-10">
        {/* Welcome hero */}

        <section className="relative isolate overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#172b42] via-[#111d31] to-[#17152f] p-5 shadow-2xl sm:p-7 lg:col-span-2 lg:p-9">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-20 -top-24 -z-10 h-72 w-72 rounded-full bg-signal/15 blur-3xl"
          />

          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-32 left-1/3 -z-10 h-64 w-64 rounded-full bg-violet/15 blur-3xl"
          />

          <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="mb-4 flex items-center gap-3">
                <Avatar name={name} size="lg" />

                <div className="min-w-0">
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-signal2 sm:text-xs">
                    YOUR COMMUNITY, YOUR MOMENT
                  </p>
                  <p className="mt-1 text-sm text-white/70">
                    {greeting()}, {firstName}
                  </p>
                </div>
              </div>

              <h1 className="max-w-2xl break-words font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
                A stranger today.
                <span className="block bg-gradient-to-r from-signal to-violet bg-clip-text text-transparent">
                  A great conversation next.
                </span>
              </h1>

              <p className="mt-4 max-w-xl text-sm leading-6 text-slate-300 sm:text-base">
                {subline} Find your people, share your interests, and make
                the internet feel a little smaller.
              </p>

              {staffRole && (
                <span className="mt-4 inline-flex rounded-full border border-violet/30 bg-violet/10 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-violet">
                  {staffRole}
                </span>
              )}

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={scrollToMatch}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-signal px-5 py-3 text-sm font-bold text-ink shadow-lg shadow-signal/20 transition hover:-translate-y-0.5 hover:brightness-110"
                >
                  <ChatIcon />
                  Meet Someone
                  <span aria-hidden="true">→</span>
                </button>

                <button
                  type="button"
                  onClick={scrollToRooms}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-white transition hover:border-violet/50 hover:bg-white/[0.08]"
                >
                  Explore Rooms
                  <span aria-hidden="true">↗</span>
                </button>

                <button
                  type="button"
                  onClick={() => setNameEditorOpen(true)}
                  className="hidden items-center gap-2 rounded-xl px-3 py-3 text-sm text-slate-300 transition hover:text-white sm:inline-flex"
                >
                  <PencilIcon />
                  Edit name
                </button>
              </div>
            </div>

            <div className="hidden shrink-0 md:block">
              <HeroArtwork />
            </div>
          </div>

          <div className="relative mt-7 grid grid-cols-3 gap-2 border-t border-white/10 pt-5 sm:mt-8 sm:gap-4 sm:pt-6">
            <StatItem
              value={waitingCount == null ? "—" : waitingCount}
              label="Waiting to talk"
            />
            <StatItem
              value={loading ? "…" : rooms.length}
              label="Open rooms"
            />
            <StatItem value={myRooms.length} label="Your groups" />
          </div>
        </section>

        {/* Telegram drop */}

        <div className="min-w-0 lg:col-span-2">
          <TelegramDrop />
        </div>

        {/* Sidebar */}

        <div className="min-w-0 space-y-5 lg:sticky lg:top-24 lg:row-start-3 lg:self-start">
          <aside
            ref={matchRef}
            className="scroll-mt-24 rounded-2xl border border-white/10 bg-panel p-4 shadow-xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="mb-1 font-mono text-xs uppercase tracking-widest text-signal2">
                  PRIVATE MATCH
                </p>
                <h2 className="font-display text-xl font-bold">
                  Talk to one stranger
                </h2>
                <p className="mt-1 text-sm text-mist">
                  One-to-one chat · instant match
                </p>
              </div>

              <button
                type="button"
                onClick={() => setOptionsOpen((value) => !value)}
                aria-expanded={optionsOpen}
                aria-controls="one-to-one-options"
                className="rounded-full border border-white/10 bg-panel2 px-3 py-2 text-xs text-mist transition hover:text-white lg:hidden"
              >
                {optionsOpen ? "Hide options" : "Options"}
              </button>
            </div>

            <div
              id="one-to-one-options"
              className={`mt-5 ${
                optionsOpen ? "block" : "hidden"
              } lg:block`}
            >
              <label className="mb-2 block font-mono text-xs uppercase tracking-wide text-mist">
                Match preference
              </label>

              <div className="mb-4 grid grid-cols-3 gap-2">
                {PREFERENCES.map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={preference === option}
                    onClick={() => setPreference(option)}
                    className={`rounded-lg border py-2.5 text-xs capitalize transition sm:text-sm ${
                      preference === option
                        ? "border-signal bg-signal/10 text-signal2"
                        : "border-white/10 bg-panel2 text-mist hover:text-white"
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>

              <label
                htmlFor="rc-interests"
                className="mb-2 block font-mono text-xs uppercase tracking-wide text-mist"
              >
                Your interests
              </label>

              <input
                id="rc-interests"
                value={interests}
                onChange={(event) => setInterests(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") start1to1();
                }}
                placeholder="Music, travel, movies..."
                aria-label="Interests, optional"
                enterKeyHint="go"
                className="w-full rounded-xl border border-white/10 bg-panel2 px-3 py-3 text-sm text-white outline-none placeholder:text-mist/50 focus:border-signal/50"
              />

              <div className="mt-3 flex flex-wrap gap-2">
                {QUICK_INTERESTS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => addInterest(tag)}
                    className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-mist transition hover:border-signal/40 hover:text-signal2"
                  >
                    + {tag}
                  </button>
                ))}
              </div>
            </div>

            {!optionsOpen && (
              <p className="mt-3 truncate text-xs text-mist lg:hidden">
                {optionsSummary}
              </p>
            )}

            <button
              type="button"
              onClick={start1to1}
              className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-signal px-4 py-3 text-sm font-bold text-ink shadow-lg shadow-signal/10 transition hover:-translate-y-0.5 hover:brightness-110"
            >
              <ChatIcon />
              Meet Someone Now
            </button>

            <p className="mt-3 text-center text-xs text-mist">
              A new conversation is one click away.
            </p>
          </aside>

          <PremiumReferralCard />
        </div>

        {/* Rooms */}

        <section
          ref={roomsRef}
          className="min-w-0 scroll-mt-24 lg:row-start-3"
        >
          {loadFailed && !loading && (
            <div
              role="status"
              className="mb-4 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200"
            >
              Can't reach the rooms right now. Retrying automatically…
            </div>
          )}

          {myRooms.length > 0 && (
            <div className="mb-8 min-w-0">
              <div className="mb-4 flex items-end justify-between gap-3">
                <div>
                  <p className="mb-1 font-mono text-xs uppercase tracking-widest text-violet">
                    YOUR SPACE
                  </p>
                  <h2 className="font-display text-xl font-bold">
                    Your rooms
                    <span className="ml-2 text-sm font-normal text-mist">
                      {myRooms.length}/2
                    </span>
                  </h2>
                </div>
                <span className="text-xs text-mist">Manage your groups</span>
              </div>

              <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
                {myRooms.map((room) => (
                  <div key={room._id} className="min-w-0">
                    <RoomCard room={room} onJoin={openRoom} />

                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setRenameTarget(room)}
                        className="rounded-xl border border-white/10 bg-panel2 px-3 py-2.5 text-xs text-white transition hover:border-signal/40"
                      >
                        Edit name
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(room)}
                        className="rounded-xl border border-rose-400/25 bg-rose-400/5 px-3 py-2.5 text-xs text-rose-300 transition hover:bg-rose-400/10"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="mb-1 font-mono text-xs uppercase tracking-widest text-signal2">
                THE COMMUNITY
                {!loading && (
                  <span className="ml-2 text-mist">
                    · {rooms.length} rooms
                  </span>
                )}
              </p>
              <h2 className="font-display text-2xl font-bold tracking-tight">
                Explore group rooms
              </h2>
              <p className="mt-1 text-sm text-mist">
                Find a conversation that feels like you.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setModalOpen(true)}
              disabled={myRooms.length >= 2}
              title={
                myRooms.length >= 2
                  ? "Delete a group before creating another"
                  : "Start a group room"
              }
              className="flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl border border-violet/40 bg-violet/10 px-4 py-2.5 text-sm font-semibold text-violet transition hover:bg-violet/20 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
            >
              <span className="text-lg">+</span>
              {myRooms.length >= 2 ? "2 groups created" : "Create a room"}
            </button>
          </div>

          {rooms.length >= 4 && (
            <div className="relative mb-4">
              <SearchIcon />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search rooms by name or topic"
                aria-label="Search rooms"
                enterKeyHint="search"
                className="w-full rounded-xl border border-white/10 bg-panel py-3 pl-10 pr-10 text-sm text-white outline-none placeholder:text-mist/50 focus:border-signal/50"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-mist hover:text-white"
                >
                  ×
                </button>
              )}
            </div>
          )}

          {loading ? (
            <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
              {[0, 1, 2, 3].map((item) => (
                <RoomSkeleton key={item} />
              ))}
            </div>
          ) : rooms.length === 0 ? (
            <EmptyState
              title="It's quiet in here"
              description="Be the first to start a room. Someone might be looking for exactly the same conversation."
              action="Create the first room"
              onAction={() => setModalOpen(true)}
              disabled={myRooms.length >= 2}
            />
          ) : visibleRooms.length === 0 ? (
            <EmptyState
              title="No rooms found"
              description={`Nothing matches "${query.trim()}". Try another search.`}
              action="Clear search"
              onAction={() => setQuery("")}
            />
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

      {/* Mobile bottom navigation */}

      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0b1220]/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-2xl lg:hidden"
      >
        <div className="mx-auto grid max-w-md grid-cols-4 gap-1">
          <MobileNavItem
            label="Home"
            icon="home"
            active
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          />
          <MobileNavItem
            label="Meet"
            icon="chat"
            onClick={scrollToMatch}
          />
          <MobileNavItem
            label="Rooms"
            icon="rooms"
            onClick={scrollToRooms}
          />
          <MobileNavItem
            label="Profile"
            icon="user"
            onClick={() => navigate("/profile")}
          />
        </div>
      </nav>

      {/* Overlays */}

      {menuOpen && (
        <MobileMenu
          name={name}
          staffRole={staffRole}
          onClose={() => setMenuOpen(false)}
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
          onClose={() => setNameEditorOpen(false)}
        />
      )}

      {renameTarget && (
        <RenameRoomModal
          room={renameTarget}
          busy={roomBusy}
          onSubmit={submitRename}
          onClose={() => setRenameTarget(null)}
        />
      )}

      {deleteTarget && (
        <DeleteRoomModal
          room={deleteTarget}
          busy={roomBusy}
          onConfirm={confirmDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}

      {logoutOpen && (
        <LogoutModal
          onClose={() => setLogoutOpen(false)}
          onLogout={logout}
        />
      )}

      <CreateRoomModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreate={handleCreate}
        creating={creating}
      />

      <ToastStack toasts={toasts} />

      <style>{`
        html {
          scroll-behavior: smooth;
        }

        @keyframes rcSheetUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes rcSlideIn {
          from { opacity: 0; transform: translateX(24px); }
          to { opacity: 1; transform: translateX(0); }
        }

        @media (prefers-reduced-motion: reduce) {
          *,
          *::before,
          *::after {
            scroll-behavior: auto !important;
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
    </div>
  );
}

/* ------------------------------ UI components ------------------------------ */

function BrandMark({ className = "h-8 w-8" }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      className={className}
      aria-hidden="true"
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
      <circle cx="20" cy="20" r="2.4" fill="white" />
    </svg>
  );
}

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
      className={`flex shrink-0 select-none items-center justify-center rounded-full font-bold text-[#06101a] ${
        sizes[size] || sizes.md
      }`}
      style={{
        backgroundColor: clean
          ? colorForName(clean)
          : "rgba(255,255,255,.14)",
      }}
    >
      {initialOf(clean)}
    </span>
  );
}

function PencilIcon({ className = "h-4 w-4" }) {
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

function ChatIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l-1.5 2v-5A7.5 7.5 0 1 1 20 11.5Z" />
      <path d="M8 11h8M8 14h5" />
    </svg>
  );
}

function MenuIcon() {
  return (
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
  );
}

function SearchIcon() {
  return (
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
      <path d="m20 20-4-4" />
    </svg>
  );
}

function LiveIndicator({ count, compact = false }) {
  const label = count > 0 ? `${count} waiting` : "live";

  return (
    <span
      className={`flex shrink-0 items-center gap-1.5 font-mono text-xs text-signal2 ${
        compact
          ? "rounded-full border border-signal/20 bg-signal/5 px-2.5 py-2"
          : ""
      }`}
    >
      <span className="h-2 w-2 animate-pulse rounded-full bg-signal" />
      {label}
    </span>
  );
}

function NameChip({ name, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Signed in as ${name || "Guest"}. Change your name`}
      className="flex max-w-[14rem] min-w-0 items-center gap-2 rounded-full border border-white/10 bg-panel py-1 pl-1 pr-3 text-sm text-white transition hover:border-signal/40"
    >
      <Avatar name={name} size="sm" />
      <span className="truncate">{name || "Guest"}</span>
      <PencilIcon className="h-3.5 w-3.5 shrink-0 text-mist" />
    </button>
  );
}

function StatItem({ value, label }) {
  return (
    <div className="min-w-0">
      <p className="font-display text-xl font-bold text-white sm:text-2xl">
        {value}
      </p>
      <p className="mt-1 text-[10px] leading-snug text-slate-400 sm:text-xs">
        {label}
      </p>
    </div>
  );
}

function HeroArtwork() {
  return (
    <div
      aria-hidden="true"
      className="relative flex h-48 w-48 items-center justify-center"
    >
      <div className="absolute h-44 w-44 rounded-full border border-white/10" />
      <div className="absolute h-32 w-32 rounded-full border border-violet/30" />
      <div className="absolute h-20 w-20 rounded-full bg-signal/10 blur-xl" />

      <div className="absolute left-5 top-8 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-[#21364d] text-xl shadow-xl">
        ✦
      </div>
      <div className="absolute right-5 top-12 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-[#30284f] text-xl shadow-xl">
        ◉
      </div>
      <div className="absolute bottom-6 left-10 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-[#263b49] text-xl shadow-xl">
        ♡
      </div>
      <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl border border-signal/30 bg-[#142a3d] shadow-2xl shadow-signal/10">
        <BrandMark className="h-12 w-12" />
      </div>
    </div>
  );
}

function EmptyState({
  title,
  description,
  action,
  onAction,
  disabled = false,
}) {
  return (
    <div className="rounded-2xl border border-dashed border-white/15 bg-panel/50 px-5 py-10 text-center sm:px-8">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-panel2 text-2xl">
        ◌
      </div>
      <h3 className="mt-4 font-display text-xl font-semibold text-white">
        {title}
      </h3>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-mist">
        {description}
      </p>
      <button
        type="button"
        onClick={onAction}
        disabled={disabled}
        className="mt-5 rounded-xl bg-signal px-5 py-3 text-sm font-semibold text-ink transition hover:brightness-110 disabled:opacity-40"
      >
        {action}
      </button>
    </div>
  );
}

function RoomSkeleton() {
  return (
    <div
      className="animate-pulse rounded-2xl border border-white/5 bg-panel/60 p-4"
      aria-hidden="true"
    >
      <div className="h-3 w-24 rounded bg-white/10" />
      <div className="mt-3 h-5 w-2/3 rounded bg-white/10" />
      <div className="mt-2 h-3 w-full rounded bg-white/5" />
      <div className="mt-5 h-3 w-28 rounded bg-white/10" />
    </div>
  );
}

function MobileNavItem({ label, icon, active = false, onClick }) {
  const paths = {
    home: <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z" />,
    chat: (
      <>
        <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l-1.5 2v-5A7.5 7.5 0 1 1 20 11.5Z" />
        <path d="M8 11h8" />
      </>
    ),
    rooms: (
      <>
        <rect x="3" y="4" width="8" height="7" rx="2" />
        <rect x="13" y="4" width="8" height="7" rx="2" />
        <rect x="3" y="13" width="8" height="7" rx="2" />
        <rect x="13" y="13" width="8" height="7" rx="2" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[10px] transition ${
        active
          ? "bg-signal/10 text-signal2"
          : "text-slate-400 hover:bg-white/5 hover:text-white"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {paths[icon]}
      </svg>
      <span>{label}</span>
    </button>
  );
}

/* ------------------------------ Modal shell ------------------------------ */

function ModalShell({
  eyebrow,
  eyebrowClass = "text-signal2",
  title,
  description,
  onClose,
  children,
}) {
  const titleId = `modal-${useId()}`;

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
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
      <div className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-white/10 bg-panel p-5 shadow-2xl sm:rounded-3xl sm:p-6">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/15 sm:hidden" />

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
  );
}

/* ------------------------------ Name editor ------------------------------ */

function NameEditorModal({ currentName, onSave, onClose }) {
  const [draft, setDraft] = useState(currentName || "");
  const [touched, setTouched] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const clean = draft.replace(/\s+/g, " ").trim();
  const empty = !clean;
  const unchanged = clean === (currentName || "").trim();
  const canSave = !empty && !unchanged;

  function submit(event) {
    event.preventDefault();
    setTouched(true);
    if (canSave) onSave(clean);
  }

  return (
    <ModalShell
      eyebrow="Your identity"
      title="Change your name"
      description="This is how people see you in rooms and conversations."
      onClose={onClose}
    >
      <form onSubmit={submit} className="mt-5">
        <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-panel2 p-4">
          <Avatar name={clean} size="xl" />
          <div className="min-w-0">
            <p className="truncate font-display text-lg font-semibold">
              {clean || "Your name"}
            </p>
            <p className="text-xs text-mist">Live preview</p>
          </div>
        </div>

        <div className="mt-4 flex justify-between">
          <label
            htmlFor="rc-name-input"
            className="text-xs text-mist"
          >
            Display name
          </label>
          <span className="text-xs text-mist">
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
          className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-panel2 px-3 text-base text-white outline-none focus:border-signal/50"
        />

        {touched && empty && (
          <p role="alert" className="mt-2 text-xs text-rose-300">
            Your name can't be empty.
          </p>
        )}

        <button
          type="button"
          onClick={() => setDraft(randomName())}
          className="mt-3 text-xs font-medium text-signal2 underline underline-offset-4"
        >
          Suggest a name
        </button>

        <div className="mt-6 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 px-4 py-3 text-sm text-mist hover:text-white"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSave}
            className="rounded-xl bg-signal px-4 py-3 text-sm font-semibold text-ink disabled:opacity-40"
          >
            Save name
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/* ------------------------------ Room modals ------------------------------ */

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
    <ModalShell
      eyebrow="Your group"
      title="Rename group"
      onClose={onClose}
    >
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
          className="h-12 w-full rounded-xl border border-white/10 bg-panel2 px-3 text-base text-white outline-none focus:border-signal/50"
        />

        <div className="mt-6 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 px-4 py-3 text-sm text-mist"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSave}
            className="rounded-xl bg-signal px-4 py-3 text-sm font-semibold text-ink disabled:opacity-40"
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
      eyebrowClass="text-rose-300"
      title={`Delete "${room.name}"?`}
      description="This action can't be undone."
      onClose={onClose}
    >
      <div className="mt-6 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-white/10 px-4 py-3 text-sm text-mist"
        >
          Keep it
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="rounded-xl bg-rose-400 px-4 py-3 text-sm font-semibold text-slate-950 disabled:opacity-50"
        >
          {busy ? "Deleting…" : "Delete"}
        </button>
      </div>
    </ModalShell>
  );
}

/* ------------------------------ Mobile menu ------------------------------ */

const MENU_MAIN_LINKS = [
  ["Profile", "/profile"],
  ["Guide", "/guide"],
  ["Pricing", "/pricing"],
];

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

    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[90] lg:hidden"
      style={{ height: "100dvh" }}
      role="dialog"
      aria-modal="true"
      aria-label="Navigation menu"
    >
      <button
        type="button"
        aria-label="Close navigation menu"
        className="absolute inset-0 h-full w-full bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="absolute right-0 top-0 flex h-full w-[min(22rem,88vw)] flex-col overflow-hidden border-l border-white/10 bg-panel shadow-2xl">
        <div className="flex shrink-0 items-start gap-3 border-b border-white/10 p-4">
          <Avatar name={name} size="lg" />

          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-signal2">
              Account
            </p>
            <p className="mt-1 truncate font-semibold">
              {name || "Guest"}
            </p>

            {staffRole && (
              <p className="mt-1 inline-block rounded-full border border-violet/30 bg-violet/10 px-2 py-0.5 font-mono text-[10px] uppercase text-violet">
                {staffRole}
              </p>
            )}

            <button
              type="button"
              onClick={onEditName}
              className="mt-2 flex items-center gap-1.5 text-xs text-signal2"
            >
              <PencilIcon />
              Change name
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-mist"
          >
            ×
          </button>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="grid gap-1">
            {MENU_MAIN_LINKS.map(([label, path]) => (
              <button
                key={path}
                type="button"
                onClick={() => onNavigate(path)}
                className="flex w-full items-center justify-between rounded-xl px-4 py-3 text-left text-sm text-white/90 transition hover:bg-panel2"
              >
                {label}
                <span className="text-mist">→</span>
              </button>
            ))}
          </div>

          <div className="my-3 h-px bg-white/10" />

          <div className="grid grid-cols-2 gap-2">
            {MENU_MORE_LINKS.map(([label, path]) => (
              <button
                key={path}
                type="button"
                onClick={() => onNavigate(path)}
                className="rounded-lg border border-white/[0.06] px-3 py-3 text-left text-xs text-mist transition hover:bg-panel2 hover:text-white"
              >
                {label}
              </button>
            ))}
          </div>
        </nav>

        <div className="shrink-0 border-t border-white/10 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={onLogout}
            className="flex w-full items-center justify-between rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm font-semibold text-rose-300"
          >
            Log out
            <span aria-hidden="true">↗</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Logout modal ------------------------------ */

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
      eyebrowClass="text-rose-300"
      title="Log out of RandomConnect?"
      description="Your name and device session will be cleared. You can come back later."
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
            className="mt-3 rounded-lg border border-signal/30 px-3 py-2 text-xs font-semibold text-signal2"
          >
            {copied ? "Copied" : "Copy recovery code"}
          </button>
        </div>
      ) : (
        <p className="mt-4 rounded-lg border border-violet/20 bg-violet/5 px-3 py-2 text-xs text-mist">
          No recovery code saved. If you have Premium, create one from
          Profile before logging out.
        </p>
      )}

      <div className="mt-5 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-white/10 px-4 py-3 text-sm text-mist"
        >
          Stay
        </button>
        <button
          type="button"
          onClick={onLogout}
          className="rounded-xl bg-rose-400 px-4 py-3 text-sm font-semibold text-slate-950"
        >
          Log out
        </button>
      </div>
    </ModalShell>
  );
}

/* ------------------------------ Referral card ------------------------------ */

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
    <div className="min-w-0 rounded-2xl border border-violet/25 bg-gradient-to-br from-violet/10 to-transparent p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-violet/20 bg-violet/10 text-xl">
          ✦
        </div>
        <div>
          <p className="font-display font-semibold text-white">
            Invite a friend
          </p>
          <p className="text-xs text-violet">
            Share the good conversations
          </p>
        </div>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-mist">
        Invite a friend and you can both get 30 days of Premium free.
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
        className="mt-4 flex min-h-11 w-full items-center justify-center rounded-xl border border-white/10 bg-panel2 px-3 py-3 text-sm font-semibold text-white transition hover:border-violet/50 disabled:opacity-50"
      >
        {busy ? "Preparing invite…" : "Share invite link"}
      </button>

      {status && (
        <p role="status" className="mt-2 break-words text-xs text-signal2">
          {status}
        </p>
      )}

      <p className="mt-3 text-center text-[11px] text-mist">
        Track your Premium days in Profile.
      </p>
    </div>
  );
}