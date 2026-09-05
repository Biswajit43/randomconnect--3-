import { useEffect, useState } from "react";
import { api } from "../lib/api.js";

const statuses = ["pending", "reviewed", "dismissed"];

export default function Admin() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("pending");
  const [reports, setReports] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.adminSession()
      .then(() => setAuthenticated(true))
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    setBusy(true);
    api.adminReports(status)
      .then(setReports)
      .catch((requestError) => setError(requestError.message))
      .finally(() => setBusy(false));
  }, [authenticated, status]);

  async function login(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api.adminLogin(password);
      setPassword("");
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
    setReports([]);
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
          <h1 className="mt-1 font-display text-2xl font-semibold text-white">Trust & safety</h1>
        </div>
        <button onClick={logout} className="rounded-lg border border-white/10 px-3 py-2 text-sm text-mist hover:text-white">Sign out</button>
      </header>

      <section className="mx-auto mt-6 max-w-6xl">
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
