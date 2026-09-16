import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";
import { getFingerprint } from "../lib/socket.js";

const badges = [
  ["○", "New Connector", "Start with a clean slate."],
  ["●", "Friendly Connector", "Complete 1 successful friend invite."],
  ["◆", "Community Builder", "Complete 5 successful friend invites."],
  ["✦", "Connection Leader", "Complete 10 successful friend invites."],
];

export default function Guide() {
  const navigate = useNavigate();
  const [category, setCategory] = useState("idea");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function sendFeedback(event) {
    event.preventDefault();
    if (message.trim().length < 8) { setStatus("Please share a little more so we can act on it."); return; }
    setBusy(true); setStatus("");
    try {
      await api.submitFeedback({ fingerprint: getFingerprint(), category, message: message.trim() });
      setMessage(""); setStatus("Thanks — your feedback has been sent to the team.");
    } catch (error) { setStatus(error.message || "Feedback could not be sent."); }
    finally { setBusy(false); }
  }

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 md:px-10">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between gap-3">
          <button onClick={() => navigate(-1)} className="text-sm text-mist hover:text-white">← Back</button>
          <button onClick={() => navigate("/")} className="font-display font-bold text-white">random<span className="text-signal">connect</span></button>
        </div>
        <header className="mt-10 max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-signal">The playbook</p>
          <h1 className="mt-2 font-display text-3xl font-bold text-white sm:text-5xl">Connect with confidence.</h1>
          <p className="mt-3 text-base leading-relaxed text-mist">A simple guide to getting the best conversations, earning community badges, and keeping every room welcoming.</p>
        </header>

        <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[['01', 'Choose your vibe', 'Add a name and a few interests so the room feels personal.'], ['02', 'Start talking', 'Your mic begins safely muted in group rooms. Turn it on when ready.'], ['03', 'Make it memorable', 'Be curious, share the space, and invite people you genuinely want here.'], ['04', 'Leave freely', 'Skip or leave at any time. Report only when something truly breaks the rules.']].map(([number, title, text]) => <article key={number} className="rounded-2xl border border-white/10 bg-panel/75 p-5 surface-lift"><span className="font-mono text-xs text-signal2">{number}</span><h2 className="mt-5 font-display text-lg font-semibold text-white">{title}</h2><p className="mt-2 text-sm leading-relaxed text-mist">{text}</p></article>)}
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[1fr_0.9fr]">
          <article className="rounded-2xl border border-violet/25 bg-violet/5 p-5 sm:p-6">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-violet">Community progression</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-white">Badges that mean something.</h2>
            <p className="mt-2 text-sm leading-relaxed text-mist">A badge unlocks from a real friend redeeming your invite — not from fake joins or spam. Every successful referral gives both people 30 days of Premium.</p>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">{badges.map(([icon, name, text]) => <div key={name} className="flex items-center gap-3 rounded-xl border border-white/10 bg-panel/60 p-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-violet/15 text-xl text-violet">{icon}</span><div><p className="text-sm font-semibold text-white">{name}</p><p className="text-xs text-mist">{text}</p></div></div>)}</div>
            <button onClick={() => navigate("/profile")} className="mt-5 rounded-xl bg-violet px-4 py-2.5 text-sm font-semibold text-ink hover:brightness-110">View my progress</button>
          </article>
          <article className="rounded-2xl border border-signal/20 bg-panel/75 p-5 sm:p-6">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-signal">Room rules</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-white">Make people want to return.</h2>
            <ul className="mt-5 space-y-3 text-sm text-mist"><li>• Treat strangers like future community members.</li><li>• Ask before recording, sharing, or moving a conversation elsewhere.</li><li>• No sexual content, threats, hate, doxxing, or harassment.</li><li>• Hosts can manage their room; only admins can approve platform bans.</li><li>• Use Report for a real safety issue — reports are reviewed by a human.</li></ul>
          </article>
        </section>

        <section className="mt-8 rounded-2xl border border-white/10 bg-panel/75 p-5 sm:p-6">
          <div className="max-w-2xl"><p className="font-mono text-xs uppercase tracking-[0.18em] text-signal2">Feedback loop</p><h2 className="mt-2 font-display text-2xl font-semibold text-white">Tell us what would make this your favorite place to talk.</h2><p className="mt-2 text-sm text-mist">Ideas, bugs, and safety concerns go directly to the team. Please never include passwords, tokens, or private personal information.</p></div>
          <form onSubmit={sendFeedback} className="mt-5 grid gap-3 sm:grid-cols-[180px_1fr_auto] sm:items-end"><label className="text-xs text-mist">Category<select value={category} onChange={(event) => setCategory(event.target.value)} className="mt-1.5 w-full rounded-xl border border-white/10 bg-panel2 px-3 py-3 text-sm text-white outline-none focus-visible:outline-signal"><option value="idea">Product idea</option><option value="bug">Bug report</option><option value="safety">Safety concern</option><option value="other">Other</option></select></label><label className="text-xs text-mist">Your feedback<textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={2000} rows={3} placeholder="What should we improve?" className="mt-1.5 w-full resize-y rounded-xl border border-white/10 bg-panel2 px-3 py-3 text-sm text-white placeholder:text-mist/60 outline-none focus-visible:outline-signal" /></label><button disabled={busy} className="rounded-xl bg-signal px-5 py-3 text-sm font-semibold text-ink hover:brightness-110 disabled:opacity-50">{busy ? "Sending…" : "Send feedback"}</button></form>
          {status && <p className="mt-3 text-sm text-signal2">{status}</p>}
        </section>
      </div>
    </main>
  );
}
