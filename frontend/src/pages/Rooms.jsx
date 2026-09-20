import { useEffect, useState, useCallback } from "react";
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
  const [staffRole, setStaffRole] = useState(() =>
    localStorage.getItem("rc_staff_role")
  );
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!getDisplayName()) navigate("/");
  }, [navigate]);

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

  useEffect(() => {
    document.body.style.overflowX = mobileMenuOpen ? "hidden" : "";

    return () => {
      document.body.style.overflowX = "";
    };
  }, [mobileMenuOpen]);

  async function logout() {
    if (staffRole) await api.adminLogout().catch(() => {});

    clearLocalSession();
    setStaffRole(null);
    setName("");
    navigate("/");
  }

  const refresh = useCallback(() => {
    Promise.all([
      api.listRooms(),
      api.listMyRooms(getFingerprint()),
    ])
      .then(([allRooms, ownedRooms]) => {
        setRooms(allRooms);
        setMyRooms(ownedRooms);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();

    const interval = setInterval(refresh, 5000);

    return () => clearInterval(interval);
  }, [refresh]);

  async function handleCreate(payload) {
    setCreating(true);

    try {
      const room = await api.createRoom({
        ...payload,
        fingerprint: getFingerprint(),
      });

      navigate(`/rooms/${room._id}`, {
        state: { room },
      });
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
      await api.updateRoom(room._id, {
        name,
        fingerprint: getFingerprint(),
      });

      refresh();
    } catch (err) {
      alert(err.message);
    }
  }

  async function deleteRoom(room) {
    if (
      !window.confirm(
        `Delete "${room.name}"? This cannot be undone.`
      )
    ) {
      return;
    }

    try {
      await api.deleteRoom(room._id, getFingerprint());
      refresh();
    } catch (err) {
      alert(err.message);
    }
  }

  function start1to1() {
    const tags = interests
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 5);

    navigate("/chat", {
      state: {
        interests: tags,
        preference,
      },
    });
  }

  const go = (path) => {
    setMobileMenuOpen(false);
    navigate(path);
  };

  return (
    <div className="min-h-screen w-full min-w-0 overflow-x-clip">
      {/* HEADER */}
      <header className="sticky top-0 z-40 w-full border-b border-white/10 bg-ink/80 backdrop-blur-xl">
        <div className="mx-auto flex min-h-[64px] w-full max-w-[1440px] min-w-0 items-center justify-between gap-3 px-3 sm:px-5 md:px-8">
          {/* BRAND */}
          <button
            onClick={() => navigate("/rooms")}
            className="shrink-0 font-display text-lg font-bold tracking-tight text-white sm:text-xl"
          >
            random<span className="text-signal">connect</span>
          </button>

          {/* DESKTOP NAV */}
          <div className="hidden min-w-0 items-center gap-2 lg:flex">
            <NameBadge
              name={name}
              onChange={(n) => {
                setName(n);
                setDisplayName(n);
              }}
            />

            <button
              onClick={() => navigate("/profile")}
              className="ui-button ui-button-muted shrink-0 border-violet/30 px-3 text-xs text-violet"
            >
              Profile
            </button>

            <button
              onClick={() => navigate("/guide")}
              className="ui-button ui-button-muted shrink-0 px-3 text-xs"
            >
              Guide
            </button>

            <button
              onClick={() => setLogoutOpen(true)}
              className="ui-button ui-button-danger shrink-0 px-3 text-xs"
            >
              Log out
            </button>

            <LiveIndicator />
          </div>

          {/* MOBILE HEADER */}
          <div className="flex items-center gap-2 lg:hidden">
            <LiveIndicator compact />

            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={mobileMenuOpen}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-panel/80 text-lg text-white shadow-lg transition hover:border-signal/40 hover:bg-panel2"
            >
              ☰
            </button>
          </div>
        </div>

        {/* MOBILE MENU */}
        {mobileMenuOpen && (
          <div className="lg:hidden">
            <div
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
              onClick={() => setMobileMenuOpen(false)}
            />

            <div className="absolute right-3 top-[70px] z-50 w-[calc(100%-24px)] max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-panel/95 shadow-2xl backdrop-blur-2xl">
              <div className="flex items-center justify-between border-b border-white/10 p-4">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-signal2">
                    Account
                  </p>

                  <p className="mt-1 truncate font-semibold text-white">
                    {name || "Guest"}
                  </p>
                </div>

                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 text-mist hover:text-white"
                  aria-label="Close navigation menu"
                >
                  ×
                </button>
              </div>

              <div className="grid gap-1 p-3">
                <MobileNavButton
                  label="Profile"
                  onClick={() => go("/profile")}
                />

                <MobileNavButton
                  label="Guide"
                  onClick={() => go("/guide")}
                />

                <MobileNavButton
                  label="Pricing"
                  onClick={() => go("/pricing")}
                />

                <MobileNavButton
                  label="About"
                  onClick={() => go("/about")}
                />

                <MobileNavButton
                  label="FAQ"
                  onClick={() => go("/faq")}
                />

                <MobileNavButton
                  label="Safety"
                  onClick={() => go("/safety")}
                />

                <MobileNavButton
                  label="Contact"
                  onClick={() => go("/contact")}
                />

                <MobileNavButton
                  label="Privacy"
                  onClick={() => go("/privacy")}
                />

                <MobileNavButton
                  label="Terms"
                  onClick={() => go("/terms")}
                />

                <div className="my-2 border-t border-white/10" />

                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setLogoutOpen(true);
                  }}
                  className="flex w-full items-center justify-between rounded-xl border border-coral/20 bg-coral/5 px-4 py-3 text-left text-sm font-semibold text-coral transition hover:bg-coral/10"
                >
                  <span>Log out</span>
                  <span>↗</span>
                </button>
              </div>

              <div className="border-t border-white/10 p-3">
                <NameBadge
                  name={name}
                  onChange={(n) => {
                    setName(n);
                    setDisplayName(n);
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </header>

      {/* MAIN */}
      <main className="mx-auto grid w-full max-w-[1440px] min-w-0 grid-cols-1 gap-5 px-3 py-5 pb-16 sm:gap-6 sm:px-5 sm:py-6 lg:grid-cols-[340px_minmax(0,1fr)] lg:px-8">
        {/* 1-TO-1 */}
        <aside className="min-w-0 rounded-2xl border border-white/10 bg-panel/85 p-4 shadow-xl backdrop-blur-xl sm:p-6 lg:sticky lg:top-20 lg:h-fit">
          <p className="mb-2 font-mono text-xs uppercase tracking-widest text-signal2">
            1-to-1
          </p>

          <h2 className="mb-1 font-display text-xl font-bold text-white">
            Talk to one stranger
          </h2>

          <p className="mb-5 text-sm text-mist">
            Private call · instant match
          </p>

          <label className="mb-1.5 block text-xs font-mono uppercase tracking-wide text-mist">
            Preference
          </label>

          <div className="mb-4 grid w-full grid-cols-3 gap-1.5 sm:gap-2">
            {["any", "male", "female"].map((p) => (
              <button
                key={p}
                onClick={() => setPreference(p)}
                className={`min-w-0 rounded-lg border py-2 text-xs capitalize transition sm:text-sm ${
                  preference === p
                    ? "border-signal bg-signal/15 text-signal2"
                    : "border-white/10 bg-panel2 text-mist hover:border-white/20 hover:text-white"
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
            className="mb-4 w-full min-w-0 rounded-lg border border-white/10 bg-panel2 px-3 py-2.5 text-sm text-white outline-none placeholder:text-mist/50 focus:border-signal/50"
          />

          <button
            onClick={start1to1}
            className="ui-button ui-button-primary w-full shadow-lg shadow-signal/15"
          >
            Start 1-to-1 call
          </button>

          <PremiumReferralCard />
        </aside>

        {/* GROUP ROOMS */}
        <section className="min-w-0">
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

                <span className="text-xs text-mist">
                  rename or delete
                </span>
              </div>

              <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
                {myRooms.map((room) => (
                  <div
                    key={room._id}
                    className="min-w-0 rounded-2xl"
                  >
                    <RoomCard
                      room={room}
                      onJoin={(r) =>
                        navigate(`/rooms/${r._id}`, {
                          state: { room: r },
                        })
                      }
                    />

                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button
                        onClick={() => renameRoom(room)}
                        className="min-w-0 rounded-lg border border-white/10 bg-panel2 px-2 py-2 text-xs text-white transition hover:border-signal/50"
                      >
                        Edit name
                      </button>

                      <button
                        onClick={() => deleteRoom(room)}
                        className="min-w-0 rounded-lg border border-coral/30 bg-coral/10 px-2 py-2 text-xs text-coral transition hover:bg-coral/20"
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
              </p>

              <h2 className="font-display text-xl font-bold leading-tight text-white sm:text-2xl">
                Where people are actually talking
              </h2>
            </div>

            <button
              onClick={() => setModalOpen(true)}
              disabled={myRooms.length >= 2}
              title={
                myRooms.length >= 2
                  ? "Delete or edit an existing group before creating another"
                  : "Start a group room"
              }
              className="w-full shrink-0 rounded-xl border border-violet/40 bg-violet/15 px-4 py-3 text-sm font-semibold text-violet transition hover:bg-violet/25 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:py-2.5"
            >
              {myRooms.length >= 2
                ? "2 groups created"
                : "+ Start a room"}
            </button>
          </div>

          {/* ROOMS */}
          {loading ? (
            <div
              className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2"
              aria-label="Loading rooms"
            >
              {[0, 1, 2].map((item) => (
                <RoomSkeleton key={item} />
              ))}
            </div>
          ) : rooms.length === 0 ? (
            <div className="w-full min-w-0 rounded-2xl border border-dashed border-white/10 bg-panel/40 p-6 text-center sm:p-10">
              <p className="mb-3 text-sm text-mist">
                No rooms yet — be the first to start one.
              </p>

              <button
                onClick={() => setModalOpen(true)}
                className="w-full rounded-xl bg-signal px-4 py-3 text-sm font-semibold text-ink sm:w-auto"
              >
                + Start a room
              </button>
            </div>
          ) : (
            <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
              {rooms.map((room) => (
                <div key={room._id} className="min-w-0">
                  <RoomCard
                    room={room}
                    onJoin={(r) =>
                      navigate(`/rooms/${r._id}`, {
                        state: { room: r },
                      })
                    }
                  />
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      <CreateRoomModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreate={handleCreate}
        creating={creating}
      />

      {logoutOpen && (
        <LogoutModal
          onClose={() => setLogoutOpen(false)}
          onLogout={logout}
        />
      )}
    </div>
  );
}

/* =========================
   LIVE INDICATOR
========================= */

function LiveIndicator({ compact = false }) {
  return (
    <span
      className={`flex shrink-0 items-center gap-1.5 font-mono text-xs font-medium text-signal2 ${
        compact ? "rounded-full border border-signal/20 bg-signal/5 px-2.5 py-1.5" : ""
      }`}
    >
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-signal sm:h-2 sm:w-2" />
      live
    </span>
  );
}

/* =========================
   MOBILE NAV BUTTON
========================= */

function MobileNavButton({ label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-xl border border-transparent px-4 py-3 text-left text-sm font-medium text-mist transition hover:border-white/10 hover:bg-panel2 hover:text-white"
    >
      <span>{label}</span>
      <span className="text-mist/50">→</span>
    </button>
  );
}

/* =========================
   LOGOUT MODAL
========================= */

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
    <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-black/70 px-4 py-5 backdrop-blur-sm">
      <div className="my-auto w-full max-w-md rounded-2xl border border-white/10 bg-panel p-5 shadow-2xl sm:p-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-coral">
          Leaving this device
        </p>

        <h2 className="mt-2 font-display text-xl font-semibold text-white">
          Log out of RandomConnect?
        </h2>

        <p className="mt-2 text-sm leading-relaxed text-mist">
          Your name and device session will be cleared. You can come back
          later and onboard again.
        </p>

        {recoveryCode ? (
          <div className="mt-4 rounded-xl border border-signal/20 bg-signal/5 p-3">
            <p className="text-xs text-signal2">
              Save your Premium recovery code first:
            </p>

            <p className="mt-2 break-all font-mono text-xs text-white">
              {recoveryCode}
            </p>

            <button
              onClick={copyCode}
              className="mt-3 rounded-lg border border-signal/30 px-3 py-2 text-xs font-semibold text-signal2 hover:bg-signal/10"
            >
              {copied ? "Copied" : "Copy recovery code"}
            </button>
          </div>
        ) : (
          <p className="mt-4 rounded-lg border border-violet/20 bg-violet/5 px-3 py-2 text-xs text-mist">
            No recovery code saved. Create one from Profile before logging
            out if you have Premium.
          </p>
        )}

        <div className="mt-5 grid grid-cols-1 gap-2 sm:flex sm:justify-end">
          <button
            onClick={onClose}
            className="rounded-lg border border-white/10 px-4 py-2.5 text-sm text-mist hover:text-white"
          >
            Stay
          </button>

          <button
            onClick={onLogout}
            className="rounded-lg bg-coral px-4 py-2.5 text-sm font-semibold text-ink hover:brightness-110"
          >
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}

/* =========================
   PREMIUM REFERRAL
========================= */

function PremiumReferralCard() {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function shareInvite() {
    setBusy(true);

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
        setStatus(
          error?.message || "Could not create invite."
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5 w-full min-w-0 rounded-2xl border border-dashed border-violet/50 bg-violet/5 p-4">
      <p className="font-display font-semibold text-white">
        Invite a friend
      </p>

      <p className="mt-1 text-sm leading-relaxed text-mist">
        Both of you get 30 days of Premium free.
      </p>

      {code && (
        <p className="mt-3 break-all font-display text-lg font-bold tracking-wider text-violet">
          {code}
        </p>
      )}

      <button
        onClick={shareInvite}
        disabled={busy}
        className="mt-3 flex w-full min-w-0 items-center justify-center gap-2 rounded-xl border border-white/10 bg-panel2 px-3 py-3 text-sm font-semibold text-white transition hover:border-violet/50 disabled:opacity-50"
      >
        {busy ? "Preparing invite…" : "♧ Share invite link"}
      </button>

      {status && (
        <p className="mt-2 break-words text-xs text-signal2">
          {status}
        </p>
      )}

      <p className="mt-2 text-center text-[11px] leading-relaxed text-mist">
        View your Premium days and community progress in Profile.
      </p>
    </div>
  );
}

/* =========================
   SKELETON
========================= */

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

/* =========================
   NAME BADGE
========================= */

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
        className="w-full min-w-0 rounded-full border border-signal/40 bg-panel2 px-3 py-2 text-center text-sm text-white outline-none sm:w-40"
      />
    );
  }

  return (
    <button
      onClick={() => {
        setDraft(name);
        setEditing(true);
      }}
      className="flex w-full min-w-0 items-center justify-center gap-2 rounded-full border border-white/10 bg-panel px-3 py-2 text-sm text-white/90 transition hover:border-signal/40"
      title="Change your name"
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-signal/20 text-[10px] font-semibold text-signal2">
        {(name || "?").charAt(0).toUpperCase()}
      </span>

      <span className="min-w-0 truncate">
        {name || "Guest"}
      </span>

      <span className="shrink-0 text-xs text-mist">✎</span>
    </button>
  );
}