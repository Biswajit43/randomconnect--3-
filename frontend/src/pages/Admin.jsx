import { useEffect, useState } from "react";
import { api } from "../lib/api.js";

const reportStatuses = ["pending", "reviewed", "dismissed"];
const tabs = [
  { id: "reports", label: "Reports" },
  { id: "rooms", label: "Live rooms" },
  { id: "safety", label: "Bans & audit" },
  { id: "premium", label: "Premium invites" },
  { id: "feedback", label: "Feedback" },
];

export default function Admin() {
  const [authenticated, setAuthenticated] = useState(false);
  const [adminRole, setAdminRole] = useState(null);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [activeTab, setActiveTab] = useState("reports");
  const [status, setStatus] = useState("pending");
  const [reports, setReports] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [rooms, setRooms] = useState([]);
  const [bans, setBans] = useState([]);
  const [audit, setAudit] = useState([]);
  const [premiumInvites, setPremiumInvites] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [usage, setUsage] = useState({ connectedUsers: 0, activeUsers: 0, activeRooms: 0, waitingUsers: 0 });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [auditExpanded, setAuditExpanded] = useState(false);

  useEffect(() => {
    api.adminSession().then((session) => {
      setAdminRole(session.role);
      setAuthenticated(true);
    }).catch(() => {}).finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    if (!authenticated) return undefined;
    let active = true;
    async function refresh() {
      try {
        const [currentReports, pendingReports, roomData, usageData, banData, auditData, premiumInvitesData, feedbackData] = await Promise.all([
          api.adminReports(status), api.adminReports("pending"), api.adminRooms(), api.adminUsage(), api.adminBans(), api.adminAudit(), api.adminPremiumInvites(), api.adminFeedback(),
        ]);
        if (!active) return;
        setReports(currentReports); setPendingCount(usageData.pendingReports ?? pendingReports.length); setRooms(roomData); setUsage(usageData); setBans(banData); setAudit(auditData); setPremiumInvites(premiumInvitesData); setFeedback(feedbackData); setError("");
      } catch (requestError) { if (active) setError(requestError.message); }
    }
    refresh();
    const intervalId = window.setInterval(refresh, 10000);
    return () => { active = false; window.clearInterval(intervalId); };
  }, [authenticated, status, refreshTick]);

  async function login(event) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      const session = await api.adminLogin(password);
      setPassword(""); setAdminRole(session.role); setAuthenticated(true);
    } catch (requestError) { setError(requestError.message); } finally { setBusy(false); }
  }

  async function logout() {
    await api.adminLogout().catch(() => {});
    setAuthenticated(false); setAdminRole(null); setReports([]); setRooms([]); setBans([]); setAudit([]); setPremiumInvites([]); setFeedback([]);
  }

  async function updateReport(id, nextStatus) {
    try {
      await api.updateAdminReport(id, nextStatus);
      setReports((current) => current.filter((report) => report._id !== id));
      if (nextStatus !== "pending") setPendingCount((count) => Math.max(0, count - 1));
    } catch (requestError) { setError(requestError.message); }
  }

  async function approveAndBan(report, duration) {
    if (!window.confirm(`Approve this report and ban ${report.reportedDisplayName || "this user"} for ${duration === "permanent" ? "permanently" : duration}?`)) return;
    try {
      const result = await api.approveAdminReportBan(report._id, duration);
      setReports((current) => current.filter((item) => item._id !== report._id));
      setPendingCount((count) => Math.max(0, count - 1));
      setBans((current) => [result.ban, ...current]);
    } catch (requestError) { setError(requestError.message); }
  }

  async function editRoom(room) {
    const name = window.prompt("New group name", room.name)?.trim();
    if (!name || name === room.name) return;
    try {
      const updated = await api.updateAdminRoom(room._id, { name });
      setRooms((current) => current.map((item) => item._id === room._id ? { ...item, ...updated } : item));
    } catch (requestError) { setError(requestError.message); }
  }

  async function removeAllMembers(room) {
    if (!window.confirm(`Remove all ${room.members?.length || room.activeCount} members from "${room.name}"?`)) return;
    try {
      await api.removeAllAdminMembers(room._id);
      setRooms((current) => current.map((item) => item._id === room._id ? { ...item, activeCount: 0, members: [] } : item));
    } catch (requestError) { setError(requestError.message); }
  }

  async function deleteRoom(room) {
    if (!window.confirm(`Delete room "${room.name}" for everyone?`)) return;
    try { await api.deleteAdminRoom(room._id); setRooms((current) => current.filter((item) => item._id !== room._id)); }
    catch (requestError) { setError(requestError.message); }
  }

  async function removeBan(ban) {
    if (!window.confirm(`Remove the ban for ${ban.displayName || "this target"}?`)) return;
    try { await api.removeAdminBan(ban._id); setBans((current) => current.filter((item) => item._id !== ban._id)); }
    catch (requestError) { setError(requestError.message); }
  }

  async function createInvite(payload) {
    try {
      const invite = await api.createPremiumInvite(payload);
      setPremiumInvites((current) => [invite, ...current]);
      return invite;
    } catch (requestError) { setError(requestError.message); return null; }
  }

  if (checking) return <LoadingScreen text="Checking secure admin session…" />;
  if (!authenticated) {
    return <main className="min-h-screen grid place-items-center px-5"><form onSubmit={login} className="w-full max-w-sm rounded-3xl border border-white/10 bg-panel/90 p-6 surface-lift"><p className="font-mono text-xs uppercase tracking-[0.2em] text-signal">Private console</p><h1 className="mt-2 font-display text-2xl font-semibold text-white">Trust & safety</h1><p className="mt-2 text-sm leading-relaxed text-mist">Review reports, monitor live rooms, and apply bans only after human review.</p><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Admin password" autoComplete="current-password" className="mt-6 w-full rounded-xl border border-white/10 bg-panel2 px-3 py-3 text-white outline-none focus-visible:outline-signal" />{error && <p className="mt-3 text-sm text-coral">{error}</p>}<button disabled={busy || !password} className="mt-4 w-full rounded-xl bg-signal px-4 py-3 font-semibold text-ink disabled:opacity-50">{busy ? "Signing in…" : "Sign in securely"}</button></form></main>;
  }

  return <main className="min-h-screen px-4 py-5 sm:px-6 md:px-10"><header className="sticky top-0 z-30 mx-auto max-w-7xl border-b border-white/10 bg-ink/85 pb-4 backdrop-blur-xl"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-mono text-[11px] uppercase tracking-[0.2em] text-signal">Private console · {adminRole}</p><h1 className="mt-1 font-display text-2xl font-semibold text-white sm:text-3xl">Trust & safety</h1><p className="mt-1 text-sm text-mist">Review evidence first. Every destructive action is explicit and audited.</p></div><div className="flex items-center gap-2"><button onClick={() => setRefreshTick((value) => value + 1)} className="rounded-xl border border-white/10 px-3 py-2 text-sm text-mist hover:border-signal/40 hover:text-white">Refresh</button><button onClick={logout} className="rounded-xl border border-coral/30 px-3 py-2 text-sm text-coral hover:bg-coral/10">Sign out</button></div></div><nav className="mt-5 flex gap-1 overflow-x-auto rounded-xl border border-white/10 bg-panel/60 p-1" aria-label="Admin sections">{tabs.map((tab) => <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm transition ${activeTab === tab.id ? "bg-signal text-ink font-semibold" : "text-mist hover:bg-white/5 hover:text-white"}`}>{tab.label}{tab.id === "reports" && pendingCount > 0 && <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] ${activeTab === tab.id ? "bg-ink/20" : "bg-coral/20 text-coral"}`}>{pendingCount}</span>}</button>)}</nav></header><section className="mx-auto max-w-7xl pt-5"><div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Metric label="Pending reports" value={pendingCount} hint={pendingCount ? "Needs review" : "Queue is clear"} tone={pendingCount ? "coral" : "signal"} /><Metric label="People online" value={usage.connectedUsers} hint={`${usage.waitingUsers} waiting for a match`} /><Metric label="Live rooms" value={usage.activeRooms} hint={`${usage.activeUsers} active participants`} /><Metric label="Active bans" value={bans.length} hint="Admin-controlled only" tone="violet" /></div>{error && <div className="mt-4 rounded-xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral">{error}</div>}{activeTab === "reports" && <ReportsView status={status} setStatus={setStatus} reports={reports} pendingCount={pendingCount} updateReport={updateReport} approveAndBan={approveAndBan} />}{activeTab === "rooms" && <RoomsView rooms={rooms} editRoom={editRoom} removeAllMembers={removeAllMembers} deleteRoom={deleteRoom} />}{activeTab === "safety" && <SafetyView bans={bans} audit={audit} auditExpanded={auditExpanded} setAuditExpanded={setAuditExpanded} removeBan={removeBan} />}{activeTab === "premium" && <PremiumView invites={premiumInvites} createInvite={createInvite} />}{activeTab === "feedback" && <FeedbackView feedback={feedback} />}</section></main>;
}

function ReportsView({ status, setStatus, reports, pendingCount, updateReport, approveAndBan }) {
  return <section className="mt-7"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="font-mono text-xs uppercase tracking-[0.18em] text-coral">Human review queue</p><h2 className="mt-1 font-display text-xl font-semibold text-white">Reports</h2><p className="mt-1 text-sm text-mist">{pendingCount ? `${pendingCount} report${pendingCount === 1 ? "" : "s"} waiting for a decision.` : "No pending reports. Reviewed history remains available below."}</p></div><div className="flex gap-1 rounded-xl border border-white/10 bg-panel/60 p-1">{reportStatuses.map((option) => <button key={option} onClick={() => setStatus(option)} className={`rounded-lg px-3 py-2 text-xs capitalize ${status === option ? "bg-white/10 text-white" : "text-mist hover:text-white"}`}>{option}</button>)}</div></div>{reports.length === 0 ? <EmptyPanel title={`No ${status} reports`} text={status === "pending" ? "New reports will appear here after they are submitted." : "Nothing to show in this section."} /> : <div className="mt-5 grid gap-4 xl:grid-cols-2">{reports.map((report) => <ReportCard key={report._id} report={report} status={status} updateReport={updateReport} approveAndBan={approveAndBan} />)}</div>}</section>;
}

function ReportCard({ report, status, updateReport, approveAndBan }) {
  return <article className="rounded-2xl border border-white/10 bg-panel/75 p-4 shadow-xl shadow-black/10 transition hover:border-white/20"><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-coral/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-coral">{report.severity}</span><span className="text-xs text-mist">{formatDate(report.createdAt)}</span></div><h3 className="mt-2 font-display text-lg font-semibold capitalize text-white">{report.reason.replaceAll("_", " ")}</h3></div><span className="rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase text-mist">{report.status}</span></div><div className="mt-4 grid grid-cols-2 gap-2 text-xs"><Info label="Reported user" value={report.reportedDisplayName || "Unknown"} /><Info label="Reports" value={`${report.reportCount || 1} total`} /><Info label="Room / group" value={report.reportedRoomName || report.roomId || "Unknown"} /><Info label="Location" value={report.reportedLocation || "Unavailable"} /></div><p className="mt-3 break-all rounded-lg bg-black/15 px-3 py-2 font-mono text-[11px] text-mist">ID: {report.reportedFingerprint}</p>{report.details && <p className="mt-3 text-sm leading-relaxed text-white/80">{report.details}</p>}<p className="mt-3 text-xs leading-relaxed text-mist">Signals: {report.uniqueReporterCount || 1} reporter IDs · {report.uniqueReporterIpCount || 0} reporter networks · {report.signals?.ipMatchCount || 0} current IP matches · {report.signals?.repeatedJoins || 0} repeated joins</p>{status === "pending" && <div className="mt-4 border-t border-white/10 pt-3"><p className="mb-2 text-[11px] font-mono uppercase tracking-wide text-mist">Decision</p><div className="flex flex-wrap gap-1.5"><span className="self-center text-[11px] text-coral">Approve + ban:</span>{["2m", "5m", "10m", "30m", "1h", "permanent"].map((duration) => <button key={duration} onClick={() => approveAndBan(report, duration)} className="rounded-lg bg-coral/15 px-2.5 py-2 text-[11px] font-semibold text-coral hover:bg-coral/25">{duration}</button>)}<button onClick={() => updateReport(report._id, "reviewed")} className="rounded-lg bg-signal/15 px-2.5 py-2 text-[11px] font-semibold text-signal2 hover:bg-signal/25">Review, no ban</button><button onClick={() => updateReport(report._id, "dismissed")} className="rounded-lg border border-white/10 px-2.5 py-2 text-[11px] text-mist hover:text-white">Dismiss</button></div></div>}</article>;
}

function RoomsView({ rooms, editRoom, removeAllMembers, deleteRoom }) {
  return <section className="mt-7"><div><p className="font-mono text-xs uppercase tracking-[0.18em] text-violet">Live activity</p><h2 className="mt-1 font-display text-xl font-semibold text-white">Rooms</h2><p className="mt-1 text-sm text-mist">See who is present and manage room-level actions.</p></div>{rooms.length === 0 ? <EmptyPanel title="No rooms found" text="There are no saved rooms right now." /> : <div className="mt-5 grid gap-4 lg:grid-cols-2">{rooms.map((room) => <article key={room._id} className="rounded-2xl border border-white/10 bg-panel/75 p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate font-display text-lg font-semibold text-white">{room.name}</h3><p className="mt-1 text-xs text-mist">{room.activeCount} / {room.maxParticipants} active · {room.mode} · {formatDate(room.createdAt)}</p></div><span className={`rounded-full px-2 py-1 text-[10px] uppercase ${room.activeCount ? "bg-signal/15 text-signal2" : "bg-white/5 text-mist"}`}>{room.activeCount ? "live" : "empty"}</span></div>{room.topic && <p className="mt-3 rounded-lg bg-black/15 px-3 py-2 text-sm text-white/75">{room.topic}</p>}<div className="mt-4"><p className="text-[11px] font-mono uppercase tracking-wide text-mist">Members</p>{room.members?.length ? <div className="mt-2 flex flex-wrap gap-1.5">{room.members.map((member, index) => <span key={`${member.name}-${index}`} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/80">{member.name}{member.role !== "user" ? ` · ${member.role}` : ""}</span>)} </div> : <p className="mt-2 text-sm text-mist">No one is currently inside.</p>}</div><div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-3"><button onClick={() => editRoom(room)} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-mist hover:text-white">Edit name</button><button onClick={() => removeAllMembers(room)} disabled={!room.activeCount} className="rounded-lg border border-coral/30 px-3 py-2 text-xs text-coral hover:bg-coral/10 disabled:opacity-40">Remove all</button><button onClick={() => deleteRoom(room)} className="rounded-lg bg-coral/15 px-3 py-2 text-xs font-semibold text-coral hover:bg-coral/25">Delete room</button></div></article>)}</div>}</section>;
}

function SafetyView({ bans, audit, auditExpanded, setAuditExpanded, removeBan }) {
  return <section className="mt-7 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]"><div><p className="font-mono text-xs uppercase tracking-[0.18em] text-coral">Enforcement</p><h2 className="mt-1 font-display text-xl font-semibold text-white">Active bans</h2><p className="mt-1 text-sm text-mist">Only explicit admin-approved bans should appear here.</p><div className="mt-4 space-y-3">{bans.length === 0 ? <EmptyPanel title="No active bans" text="The system is currently clear." /> : bans.map((ban) => <article key={ban._id} className="rounded-2xl border border-coral/20 bg-panel/75 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-white">{ban.displayName || "Unknown user"}</h3><p className="mt-1 text-xs text-mist">{ban.locationLabel || "Location unavailable"} · {ban.expiresAt ? `until ${formatDate(ban.expiresAt)}` : "permanent"}</p></div><span className="rounded-full bg-coral/15 px-2 py-1 text-[10px] uppercase text-coral">{ban.matchMode === "ip" ? "IP only" : "device"}</span></div><p className="mt-3 text-sm text-white/75">{ban.reason}</p><button onClick={() => removeBan(ban)} className="mt-3 rounded-lg border border-white/10 px-3 py-2 text-xs text-mist hover:text-white">Remove ban</button></article>)}</div></div><div><div className="flex items-end justify-between gap-3"><div><p className="font-mono text-xs uppercase tracking-[0.18em] text-signal">Accountability</p><h2 className="mt-1 font-display text-xl font-semibold text-white">Audit log</h2><p className="mt-1 text-sm text-mist">Admin actions with the responsible manager name.</p></div>{audit.length > 6 && <button onClick={() => setAuditExpanded((value) => !value)} className="text-xs text-signal2 hover:text-white">{auditExpanded ? "Show less" : "Show more"}</button>}</div><div className={`${auditExpanded ? "max-h-[32rem]" : "max-h-[24rem]"} mt-4 space-y-2 overflow-y-auto rounded-2xl border border-white/10 bg-panel/75 p-4`}>{audit.length === 0 ? <p className="text-sm text-mist">No actions recorded yet.</p> : audit.map((entry) => <div key={entry._id} className="border-b border-white/5 pb-2 last:border-0"><p className="text-sm text-white">{entry.action}</p><p className="mt-1 text-xs text-mist">{entry.actorName || entry.actorId} · {formatDate(entry.createdAt)}</p></div>)}</div></div></section>;
}

function PremiumView({ invites, createInvite }) {
  const [label, setLabel] = useState("Community premium");
  const [maxUses, setMaxUses] = useState(10);
  const [newCode, setNewCode] = useState("");

  async function submit(event) {
    event.preventDefault();
    const invite = await createInvite({ label, maxUses, days: 30 });
    if (invite?.code) setNewCode(invite.code);
  }

  return <section className="mt-7"><div><p className="font-mono text-xs uppercase tracking-[0.18em] text-violet">Access management</p><h2 className="mt-1 font-display text-xl font-semibold text-white">Premium invites</h2><p className="mt-1 max-w-2xl text-sm text-mist">Create a shareable 30-day invite. Premium users can manage normal users in rooms, but never access this admin console or control hosts.</p></div><div className="mt-5 grid gap-5 lg:grid-cols-[360px_1fr]"><form onSubmit={submit} className="rounded-2xl border border-violet/25 bg-panel/75 p-5"><p className="font-display text-white">Create invite</p><label className="mt-4 block text-xs text-mist">Invite label<input value={label} onChange={(event) => setLabel(event.target.value)} maxLength={80} className="mt-1.5 w-full rounded-lg border border-white/10 bg-panel2 px-3 py-2.5 text-sm text-white outline-none focus-visible:outline-violet" /></label><label className="mt-3 block text-xs text-mist">Maximum users<input type="number" min="1" max="1000" value={maxUses} onChange={(event) => setMaxUses(Number(event.target.value))} className="mt-1.5 w-full rounded-lg border border-white/10 bg-panel2 px-3 py-2.5 text-sm text-white outline-none focus-visible:outline-violet" /></label><p className="mt-3 text-xs text-mist">Duration is fixed at 30 days.</p><button className="mt-4 w-full rounded-lg bg-violet px-4 py-2.5 text-sm font-semibold text-ink hover:brightness-110">Generate invite</button>{newCode && <div className="mt-4 rounded-lg border border-signal/30 bg-signal/10 p-3"><p className="text-[11px] uppercase tracking-wide text-signal2">Copy this code</p><p className="mt-1 break-all font-mono text-sm text-white">{newCode}</p></div>}</form><div className="rounded-2xl border border-white/10 bg-panel/75 p-5"><div className="flex items-center justify-between gap-3"><div><p className="font-display text-white">Issued invites</p><p className="mt-1 text-xs text-mist">Codes are shown only when generated.</p></div><span className="rounded-full bg-violet/15 px-2 py-1 text-xs text-violet">{invites.length} total</span></div>{invites.length === 0 ? <EmptyPanel title="No invites yet" text="Create one when you are ready to share Premium access." /> : <div className="mt-4 space-y-2">{invites.map((invite) => <div key={invite._id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/5 bg-black/10 p-3"><div><p className="text-sm text-white">{invite.label}</p><p className="mt-1 text-xs text-mist">{invite.uses} / {invite.maxUses} used · expires {formatDate(invite.expiresAt)}</p></div><span className={`rounded-full px-2 py-1 text-[10px] uppercase ${invite.uses >= invite.maxUses ? "bg-coral/15 text-coral" : "bg-signal/15 text-signal2"}`}>{invite.uses >= invite.maxUses ? "full" : "active"}</span></div>)}</div>}</div></div></section>;
}

function FeedbackView({ feedback }) {
  return <section className="mt-7"><p className="font-mono text-xs uppercase tracking-[0.18em] text-signal2">Product loop</p><h2 className="mt-1 font-display text-xl font-semibold text-white">Community feedback</h2><p className="mt-1 text-sm text-mist">Ideas and safety notes from users. No raw device identity is shown here.</p>{feedback.length === 0 ? <EmptyPanel title="No feedback yet" text="User suggestions will appear here." /> : <div className="mt-5 grid gap-3 lg:grid-cols-2">{feedback.map((item) => <article key={item._id} className="rounded-2xl border border-white/10 bg-panel/75 p-4"><div className="flex items-center justify-between gap-3"><span className="rounded-full bg-signal/15 px-2 py-1 text-[10px] uppercase text-signal2">{item.category}</span><span className="text-xs text-mist">{formatDate(item.createdAt)}</span></div><p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-white/85">{item.message}</p></article>)}</div>}</section>;
}

function Metric({ label, value, hint, tone = "signal" }) { const color = tone === "coral" ? "text-coral" : tone === "violet" ? "text-violet" : "text-signal2"; return <div className="rounded-2xl border border-white/10 bg-panel/70 p-4"><p className="text-[11px] uppercase tracking-wider text-mist">{label}</p><p className={`mt-2 font-display text-3xl font-semibold ${color}`}>{value}</p><p className="mt-1 text-xs text-mist">{hint}</p></div>; }
function Info({ label, value }) { return <div className="rounded-lg border border-white/5 bg-black/10 p-2.5"><p className="text-[10px] uppercase tracking-wide text-mist">{label}</p><p className="mt-1 truncate text-sm text-white">{value}</p></div>; }
function EmptyPanel({ title, text }) { return <div className="mt-5 rounded-2xl border border-dashed border-white/10 bg-panel/40 p-8 text-center"><p className="font-display text-white">{title}</p><p className="mt-1 text-sm text-mist">{text}</p></div>; }
function LoadingScreen({ text }) { return <main className="min-h-screen grid place-items-center text-sm text-mist"><div className="rounded-2xl border border-white/10 bg-panel/70 px-6 py-5">{text}</div></main>; }
function formatDate(value) { return value ? new Date(value).toLocaleString() : "Unknown time"; }
