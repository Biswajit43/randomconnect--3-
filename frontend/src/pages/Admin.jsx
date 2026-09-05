import { useEffect, useState } from "react";
import { api } from "../lib/api.js";

const statuses = ["pending", "reviewed", "dismissed"];

export default function Admin() {
  const [authenticated, setAuthenticated] = useState(false);
  const [adminRole, setAdminRole] = useState(null);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("pending");
  const [reports, setReports] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [usage, setUsage] = useState({ connectedUsers: 0, activeUsers: 0, activeRooms: 0, waitingUsers: 0 });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.adminSession()
      .then((session) => { setAdminRole(session.role); setAuthenticated(true); })
      .catch(() => {})
      .finally(() => setChecking(false));

    const heartbeat = window.setInterval(() => api.adminSession().catch(() => {}), 30000);
    return () => {
      window.clearInterval(heartbeat);
    };
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    setBusy(true);
    api.adminReports(status)
      .then(setReports)
      .catch((requestError) => setError(requestError.message))
      .finally(() => setBusy(false));
  }, [authenticated, status]);

  useEffect(() => {
    if (!authenticated) return;
    const refreshRooms = () => {
      api.adminRooms().then(setRooms).catch((requestError) => setError(requestError.message));
      api.adminUsage().then(setUsage).catch((requestError) => setError(requestError.message));
    };
    refreshRooms();
    const intervalId = window.setInterval(refreshRooms, 5000);
    return () => window.clearInterval(intervalId);
  }, [authenticated]);

  async function login(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const session = await api.adminLogin(password);
      setPassword("");
      setAdminRole(session.role);
      setAuthenticated(true);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function updateReport(id, nextStatus) {
    setError("");
    try {
      await api.updateAdminReport(id, nextStatus);
      setReports((current) => current.filter((report) => report._id !== id));
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function logout() {
    await api.adminLogout().catch(() => {});
    setAuthenticated(false);
    setAdminRole(null);
    setReports([]);
    setRooms([]);
    setUsage({ connectedUsers: 0, activeUsers: 0, activeRooms: 0, waitingUsers: 0 });
  }

  async function deleteRoom(room) {
    if (!window.confirm(`Delete room "${room.name}" for everyone?`)) return;
    try {
      await api.deleteAdminRoom(room._id);
      setRooms((current) => current.filter((item) => item._id !== room._id));
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  if (checking) return <main className="min-h-screen grid place-items-center text-mist">Checking admin session...</main>;

  if (!authenticated) {
    return (
      <main className="min-h-screen grid place-items-center px-5">
        <form onSubmit={login} className="w-full max-w-sm rounded-2xl border border-white/10 bg-panel/90 p-6 surface-lift">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-signal">Private console</p>
          <h1 className="mt-2 font-display text-2xl font-semibold text-white">Admin sign in</h1>
          <p className="mt-2 text-sm text-mist">Moderation access is server-protected.</p>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Admin password"
            autoComplete="current-password"
            className="mt-6 w-full rounded-lg border border-white/10 bg-panel2 px-3 py-2.5 text-white outline-none focus-visible:outline-signal"
          />
          {error && <p className="mt-3 text-sm text-coral">{error}</p>}
          <button disabled={busy || !password} className="mt-4 w-full rounded-lg bg-signal px-4 py-2.5 font-semibold text-ink disabled:opacity-50">
            {busy ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-5 py-6 md:px-10">
      <header className="mx-auto flex max-w-6xl items-center justify-between border-b border-white/10 pb-5">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-signal">Private console</p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-white">Trust & safety <span className="text-xs uppercase tracking-wider text-mist">{adminRole}</span></h1>
        </div>
        <button onClick={logout} className="rounded-lg border border-white/10 px-3 py-2 text-sm text-mist hover:text-white">Sign out</button>
      </header>

      <section className="mx-auto mt-6 max-w-6xl">
        <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <UsageCard label="People online" value={usage.connectedUsers} />
          <UsageCard label="Active rooms" value={usage.activeRooms} />
          <UsageCard label="Waiting for 1-to-1" value={usage.waitingUsers} />
        </div>
        <div className="mb-8">
          <h2 className="font-display text-lg text-white">Live rooms</h2>
          <p className="text-sm text-mist">Monitor activity and remove rooms that break the rules.</p>
          <div className="mt-4 grid gap-3">
            {rooms.length === 0 && <p className="rounded-xl border border-white/10 p-5 text-sm text-mist">No rooms found.</p>}
            {rooms.map((room) => (
              <article key={room._id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-panel/80 p-4">
                <div>
                  <p className="font-semibold text-white">{room.name}</p>
                  <p className="mt-1 text-xs text-mist">{room.activeCount} / {room.maxParticipants} active · creator fingerprint {room.createdByFingerprint}</p>
                  <p className="mt-1 text-xs text-mist/70">Created {new Date(room.createdAt).toLocaleString()}</p>
                </div>
                <button onClick={() => deleteRoom(room)} className="rounded-lg bg-coral/15 px-3 py-2 text-xs font-semibold text-coral hover:bg-coral/25">Delete room</button>
              </article>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg text-white">Reports</h2>
            <p className="text-sm text-mist">Review user safety reports and record the outcome.</p>
          </div>
          <div className="flex gap-1 rounded-lg border border-white/10 bg-panel2 p-1">
            {statuses.map((option) => (
              <button key={option} onClick={() => setStatus(option)} className={`rounded-md px-3 py-1.5 text-xs capitalize ${status === option ? "bg-signal text-ink" : "text-mist hover:text-white"}`}>
                {option}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="mt-4 text-sm text-coral">{error}</p>}
        {busy && <p className="mt-6 text-sm text-mist">Loading reports...</p>}
        {!busy && reports.length === 0 && <p className="mt-8 rounded-xl border border-white/10 p-6 text-sm text-mist">No {status} reports.</p>}
        <div className="mt-5 grid gap-3">
          {reports.map((report) => (
            <article key={report._id} className="rounded-xl border border-white/10 bg-panel/80 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold capitalize text-white">{report.reason} <span className="text-mist">· {report.severity}</span></p>
                  <p className="mt-1 text-xs text-mist">Room: {report.roomId} · {new Date(report.createdAt).toLocaleString()}</p>
                </div>
                <span className="rounded-full bg-coral/15 px-2 py-1 text-[11px] uppercase text-coral">{report.status}</span>
              </div>
              {report.details && <p className="mt-3 text-sm text-white/80">{report.details}</p>}
              <p className="mt-3 break-all font-mono text-[11px] text-mist/70">Reported user: {report.reportedFingerprint}</p>
              {status === "pending" && (
                <div className="mt-4 flex gap-2">
                  <button onClick={() => updateReport(report._id, "reviewed")} className="rounded-lg bg-signal px-3 py-2 text-xs font-semibold text-ink">Mark reviewed</button>
                  <button onClick={() => updateReport(report._id, "dismissed")} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-mist hover:text-white">Dismiss</button>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function UsageCard({ label, value }) {
  return (
    <div className="rounded-xl border border-white/10 bg-panel/80 p-4">
      <p className="text-xs uppercase tracking-wider text-mist">{label}</p>
      <p className="mt-2 font-display text-3xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs text-signal2">Live now</p>
    </div>
  );
}
