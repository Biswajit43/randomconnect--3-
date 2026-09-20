import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import PulseConnector from "../components/PulseConnector.jsx";
import { getDisplayName, setDisplayName, getFingerprint } from "../lib/socket.js";
import { api } from "../lib/api.js";

const HEADLINE_WORDS = ["A", "better", "way", "to"];
const TAGLINES = ["meet someone new.", "make a real connection.", "just talk, freely."];
const AVATAR_COLORS = ["#4CC9F0", "#9D8DF1", "#FF6B6B", "#7BE0D6", "#F4B860", "#6FCF97"];

// Secondary content is hidden on short screens so the form always fits without
// scrolling. It appears when the viewport is at least 720px tall, or on desktop.
// (If your Tailwind is older than 3.1 these stay hidden on phones, which is safe.)
const ROOMY_BLOCK = "hidden [@media(min-height:720px)]:block lg:block";
const ROOMY_FLEX = "hidden [@media(min-height:720px)]:flex lg:flex";

function colorForName(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = text.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default function Landing() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const [name, setName] = useState(() => getDisplayName());
  const [interests, setInterests] = useState("");
  const [premiumCode, setPremiumCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [premiumMessage, setPremiumMessage] = useState("");
  const [premiumBusy, setPremiumBusy] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [agreedRules, setAgreedRules] = useState(false);
  const [waitingCount, setWaitingCount] = useState(null);
  const [clearedNotice, setClearedNotice] = useState(false);
  const [taglineIndex, setTaglineIndex] = useState(0);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [staffAccessOpen, setStaffAccessOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const invite = params.get("invite");
    if (invite) setPremiumCode(invite);
    const recovery = params.get("recover");
    if (recovery) { setRecoveryCode(recovery); setDetailsOpen(true); }
    if (!invite && !recovery && getDisplayName() && localStorage.getItem("rc_onboarded") === "1") {
      navigate(state?.returnTo || "/rooms", { replace: true });
    }
  }, [navigate, state?.returnTo]);

  const canEnter = name.trim().length > 0 && ageConfirmed && agreedRules;
  const trimmedName = name.trim();

  useEffect(() => {
    const id = setInterval(() => setTaglineIndex((i) => (i + 1) % TAGLINES.length), 2600);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    function refresh() {
      api.stats().then((s) => setWaitingCount(s.waiting)).catch(() => {});
    }
    refresh();
    const interval = setInterval(refresh, 6000);
    return () => clearInterval(interval);
  }, []);

  async function enter() {
    if (!canEnter) return;
    if (recoveryCode.trim() || premiumCode.trim()) {
      setPremiumBusy(true);
      try {
        const result = recoveryCode.trim()
          ? await api.redeemPremiumRecovery(recoveryCode.trim(), getFingerprint())
          : await api.redeemPremium(premiumCode.trim(), getFingerprint());
        if (result.token) localStorage.setItem("rc_premium_token", result.token);
        setPremiumMessage(recoveryCode.trim() ? "Premium restored. You can view the details in Profile." : "Premium activated. You can view the details in Profile.");
      } catch (error) {
        setPremiumMessage(error.message);
        setPremiumBusy(false);
        return;
      }
      setPremiumBusy(false);
    }
    setDisplayName(name);
    localStorage.setItem("rc_onboarded", "1");
    localStorage.setItem("rc_age_confirmed", "1");
    localStorage.setItem("rc_rules_agreed", "1");
    const tags = interests
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 5);
    navigate(state?.returnTo || "/rooms", { state: { interests: tags } });
  }

  function forgetMe() {
    localStorage.removeItem("rc_fp");
    localStorage.removeItem("rc_name");
    localStorage.removeItem("rc_onboarded");
    localStorage.removeItem("rc_age_confirmed");
    localStorage.removeItem("rc_rules_agreed");
    setName("");
    setClearedNotice(true);
    setTimeout(() => setClearedNotice(false), 3500);
  }

  return (
    <div
      className="relative min-h-screen overflow-hidden flex flex-col"
      // dvh tracks the real visible height on mobile browsers (address bar in/out).
      // Browsers without dvh drop this value and fall back to min-h-screen above.
      style={{ minHeight: "100dvh" }}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -left-28 top-6 h-80 w-80 sm:h-96 sm:w-96 rounded-full bg-signal/15 sm:bg-signal/10 blur-3xl animate-drift" />
        <div
          className="absolute -right-24 top-1/4 h-72 w-72 sm:h-80 sm:w-80 rounded-full bg-violet/15 sm:bg-violet/10 blur-3xl animate-drift"
          style={{ animationDelay: "1.2s", animationDuration: "5.5s" }}
        />
        <div
          className="absolute left-1/4 bottom-0 h-64 w-64 sm:h-72 sm:w-72 rounded-full bg-signal2/15 sm:bg-signal2/10 blur-3xl animate-drift"
          style={{ animationDelay: "2s", animationDuration: "6s" }}
        />
      </div>

      {/* Header: slimmer on phones, label hidden so it never overflows on 360px screens */}
      <header className="relative z-10 px-5 sm:px-6 py-3 sm:py-5 flex items-center justify-between max-w-6xl w-full mx-auto animate-fadeInUp">
        <span className="font-display font-bold text-lg tracking-tight text-white">
          random<span className="text-signal">connect</span>
        </span>
        <div className="flex items-center gap-3 text-xs font-mono text-mist">
          <Link to="/about" className="hidden sm:inline text-mist hover:text-white">About</Link>
          <Link to="/safety" className="hidden sm:inline text-mist hover:text-white">Safety</Link>
          <Link to="/faq" className="hidden sm:inline text-mist hover:text-white">FAQ</Link>
          <button
            onClick={() => setStaffAccessOpen(true)}
            className="ui-button ui-button-quiet min-h-9 px-3 text-xs text-signal2 underline underline-offset-2"
          >
            Staff access
          </button>
          <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)] animate-pulse" />
          <span className="hidden sm:inline">private by default</span>
        </div>
      </header>

      {/*
        Phones: hero on top (fills leftover space), form anchored to the bottom like a
        sheet, so the name field is on screen immediately and within thumb reach.
        Tablets: both centered. Desktop (lg): two columns, as before.
      */}
      <main className="landing-main relative z-10 flex-1 flex flex-col items-center text-center sm:justify-center sm:px-6 sm:py-6 lg:px-5 lg:py-8">
        <div className="landing-layout flex w-full max-w-5xl flex-1 flex-col sm:flex-none sm:gap-6 lg:grid lg:grid-cols-[1fr_390px] lg:items-center lg:gap-16">
          <section className="flex flex-1 flex-col justify-center px-5 py-2 text-center sm:flex-none sm:px-0 sm:py-0 lg:pl-6 lg:text-left">
            <p
              className={`${ROOMY_BLOCK} font-mono text-[11px] sm:text-xs tracking-[0.22em] text-signal2 uppercase mb-3 lg:mb-4 animate-fadeInUp`}
              style={{ animationDelay: "80ms" }}
            >
              real people · no account · your choice
            </p>

            <h1 className="font-display text-[1.75rem] leading-[1.1] sm:text-5xl md:text-6xl font-bold text-white mx-auto lg:mx-0 max-w-2xl">
              {HEADLINE_WORDS.map((word, i) => (
                <span
                  key={word}
                  className="inline-block mr-[0.25em] animate-fadeInUp"
                  style={{ animationDelay: `${150 + i * 90}ms` }}
                >
                  {word}
                </span>
              ))}
              <br />
              <span
                key={taglineIndex}
                className="text-signal inline-block animate-fadeInUp min-h-[1.1em]"
                style={{ animationDelay: taglineIndex === 0 ? "510ms" : "0ms", animationDuration: "0.5s" }}
              >
                {TAGLINES[taglineIndex]}
                <span className="inline-block w-[3px] h-[0.85em] bg-signal ml-1 align-middle animate-blink" />
              </span>
            </h1>

            <p
              className={`${ROOMY_BLOCK} mt-3 lg:mt-5 max-w-lg mx-auto lg:mx-0 text-base sm:text-lg leading-relaxed text-mist animate-fadeInUp`}
              style={{ animationDelay: "560ms" }}
            >
              Drop into a respectful conversation, share an interest, and leave whenever you want. No profile to build and no personal details needed.
            </p>

            <div
              className={`${ROOMY_FLEX} mt-4 lg:mt-7 flex-wrap justify-center lg:justify-start gap-2 lg:gap-2.5 max-w-xl mx-auto lg:mx-0 animate-fadeInUp`}
              style={{ animationDelay: "650ms" }}
            >
              <TrustPill icon="◉" text="No signup" />
              <TrustPill icon="⌁" text="Mute, skip, or leave" />
              <TrustPill icon="⟲" text="Nothing lingers" />
            </div>

            {waitingCount !== null && (
              <p
                className="mt-3 lg:mt-5 font-mono text-xs text-mist flex items-center justify-center lg:justify-start gap-2 animate-fadeInUp"
                style={{ animationDelay: "720ms" }}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-signal animate-pulse" />
                {waitingCount > 0
                  ? `${waitingCount} ${waitingCount === 1 ? "person is" : "people are"} looking for a match right now`
                  : "Be the first one looking for a match right now"}
              </p>
            )}

            <div className="hidden lg:block">
              <PulseConnector label="A conversation is waiting" />
            </div>
          </section>

          <section className="landing-form-wrap relative w-full mx-auto sm:max-w-sm animate-slideUp" style={{ animationDelay: "250ms" }}>
            <div
              className="absolute -inset-[1.5px] rounded-t-[28px] sm:rounded-2xl opacity-70 animate-spinSlow"
              style={{
                background: "conic-gradient(from 0deg, transparent, #4CC9F0, transparent 35%, transparent 65%, #9D8DF1, transparent)",
              }}
              aria-hidden="true"
            />

            <div className="landing-form-card relative text-left bg-panel/95 border border-white/10 border-x-0 sm:border-x rounded-t-[28px] sm:rounded-2xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6 shadow-2xl shadow-black/40 backdrop-blur-sm">
              <div className="mb-3 sm:mb-4">
                <p className="font-display text-lg sm:text-xl font-semibold text-white">Set up your room</p>
                <p className={`${ROOMY_BLOCK} mt-1 text-sm text-mist`}>Takes a few seconds. Nothing else required.</p>
              </div>

              {/* Name field: the avatar preview lives inside the input, so no extra row appears while typing */}
              <div className="relative mb-2.5 sm:mb-3">
                <span
                  aria-hidden="true"
                  className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors ${trimmedName ? "text-ink" : "text-mist"}`}
                  style={{ backgroundColor: trimmedName ? colorForName(trimmedName) : "rgba(255,255,255,0.08)" }}
                >
                  {trimmedName ? trimmedName.charAt(0).toUpperCase() : "?"}
                </span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") enter(); }}
                  placeholder="What should people call you?"
                  aria-label="Your display name"
                  maxLength={30}
                  autoComplete="nickname"
                  enterKeyHint="go"
                  autoFocus={false}
                  className="w-full bg-ink/60 border border-white/10 rounded-xl pl-12 pr-4 py-3 text-base sm:text-sm text-white placeholder:text-mist/50 outline-none focus-visible:border-signal/60 focus-visible:outline-signal transition"
                />
              </div>

              {/* text-base on phones stops iOS Safari from zooming the page on focus (which pushed the layout around) */}
              <input
                value={interests}
                onChange={(e) => setInterests(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") enter(); }}
                placeholder="Interests (optional): music, hiking"
                aria-label="Interests, optional"
                enterKeyHint="go"
                className="w-full bg-ink/60 border border-white/10 rounded-xl px-4 py-2.5 sm:py-3 text-base sm:text-sm text-white placeholder:text-mist/50 outline-none focus-visible:border-signal/60 focus-visible:outline-signal transition mb-2.5 sm:mb-3"
              />

              <button
                type="button"
                aria-expanded={detailsOpen}
                aria-controls="landing-details"
                onClick={() => setDetailsOpen((v) => !v)}
                className="landing-details-toggle ui-button ui-button-quiet w-full justify-between px-3 text-xs text-mist mb-2.5 sm:mb-3"
              >
                <span>{detailsOpen ? "Hide optional details" : "Premium, music, and privacy"}</span>
                <span className={`landing-chevron ${detailsOpen ? "is-open" : ""}`} aria-hidden="true" />
              </button>

              <div id="landing-details" className={`landing-details ${detailsOpen ? "is-open" : ""}`}>
                <div className="mb-3 rounded-xl border border-violet/20 bg-violet/5 p-3">
                  <label className="block text-[11px] font-mono uppercase tracking-wide text-violet">✨ Redeem or recover Premium</label>
                  <input
                    value={premiumCode}
                    onChange={(e) => setPremiumCode(e.target.value.toUpperCase())}
                    placeholder="RC-PREMIUM-..."
                    inputMode="text"
                    autoCapitalize="characters"
                    autoComplete="off"
                    enterKeyHint="done"
                    onKeyDown={(e) => { if (e.key === "Enter") enter(); }}
                    className="mt-2 w-full min-h-11 bg-ink/60 border border-white/10 rounded-lg px-3 py-2.5 text-base sm:text-sm text-white placeholder:text-mist/50 outline-none focus-visible:border-violet/60 transition"
                  />
                  <p className="mt-1.5 text-[11px] text-mist">Invite access lasts 30 days and never opens the admin panel.</p>
                  <input
                    value={recoveryCode}
                    onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
                    placeholder="Recovery code after clearing browser data"
                    inputMode="text"
                    autoCapitalize="characters"
                    autoComplete="off"
                    enterKeyHint="done"
                    onKeyDown={(e) => { if (e.key === "Enter") enter(); }}
                    className="mt-2 w-full min-h-11 bg-ink/60 border border-white/10 rounded-lg px-3 py-2.5 text-base sm:text-sm text-white placeholder:text-mist/50 outline-none focus-visible:border-signal/60 transition"
                  />
                  {premiumMessage && <p className={`mt-1.5 text-[11px] ${premiumMessage.startsWith("Premium activated") || premiumMessage.startsWith("Premium restored") ? "text-signal2" : "text-coral"}`}>{premiumMessage}</p>}
                </div>

                <div className="flex items-start gap-2.5 rounded-lg border border-signal/15 bg-signal/5 px-3 py-2.5 text-left mb-3">
                  <span className="text-base leading-none text-signal" aria-hidden="true">♪</span>
                  <p className="text-xs text-mist">
                    In group rooms, hosts can play a song preview or a YouTube link for everyone at once.
                  </p>
                </div>

                <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-3 mb-3">
                  <p className="text-xs font-mono uppercase tracking-wide text-mist mb-2">Privacy, actually</p>
                  <ul className="space-y-1.5">
                    {[
                      "No email or phone number, ever",
                      "Your name lives only on this device",
                      "Camera stays off until you turn it on",
                    ].map((line, i) => (
                      <li
                        key={line}
                        className="flex items-start gap-2 text-xs text-mist animate-checklistIn"
                        style={{ animationDelay: `${i * 90}ms` }}
                      >
                        <span className="text-signal2 mt-0.5">✓</span>
                        {line}
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={forgetMe}
                    className="mt-2.5 text-[11px] font-mono text-signal2 hover:text-signal underline underline-offset-2"
                  >
                    Forget me on this device
                  </button>
                  {clearedNotice && (
                    <p className="mt-1.5 text-[11px] text-signal2 animate-scaleIn origin-left">
                      Cleared — a fresh anonymous ID will be used next time.
                    </p>
                  )}
                </div>
              </div>

              <label className="flex items-start gap-2.5 sm:gap-3 text-left text-xs sm:text-sm text-mist leading-snug sm:leading-relaxed mb-2">
                <input
                  type="checkbox"
                  checked={ageConfirmed}
                  onChange={(e) => setAgeConfirmed(e.target.checked)}
                  className="mt-0.5 sm:mt-1 accent-signal w-4 h-4 shrink-0"
                />
                I confirm I am 18 years of age or older.
              </label>

              <label className="flex items-start gap-2.5 sm:gap-3 text-left text-xs sm:text-sm text-mist leading-snug sm:leading-relaxed mb-3 sm:mb-4">
                <input
                  type="checkbox"
                  checked={agreedRules}
                  onChange={(e) => setAgreedRules(e.target.checked)}
                  className="mt-0.5 sm:mt-1 accent-signal w-4 h-4 shrink-0"
                />
                I agree not to share sexual content, harass others, or involve minors.
              </label>

              <button
                onClick={enter}
                disabled={!canEnter || premiumBusy}
                className="ui-button ui-button-primary w-full py-3.5 text-base shadow-lg shadow-signal/20 sm:text-sm disabled:opacity-30"
              >
                {premiumBusy ? "Activating premium…" : "Continue securely"} <span aria-hidden="true">→</span>
              </button>
              {!trimmedName && (
                <p className="hidden sm:block text-xs text-mist/60 mt-2 text-center">A name is required so people know who they're talking to.</p>
              )}
            </div>
          </section>
        </div>
      </main>

      <footer className="relative z-10 hidden lg:block px-6 py-5 text-center text-xs text-mist/60 font-mono">
        You share only what you choose · leave anytime · nothing follows you home
        <span className="mx-3 text-white/15">|</span>
        <Link to="/privacy" className="text-signal2 hover:text-signal underline underline-offset-2">Privacy</Link>
        <Link to="/terms" className="ml-3 text-signal2 hover:text-signal underline underline-offset-2">Terms</Link>
        <Link to="/contact" className="ml-3 text-signal2 hover:text-signal underline underline-offset-2">Contact</Link>
        <button
          onClick={() => setStaffAccessOpen(true)}
          className="ml-4 text-signal2 hover:text-signal underline underline-offset-2"
        >
          Staff access
        </button>
      </footer>

      {staffAccessOpen && <StaffAccessModal onClose={() => setStaffAccessOpen(false)} />}
    </div>
  );
}


function StaffAccessModal({ onClose }) {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const session = await api.adminLogin(password);
      localStorage.setItem("rc_name", session.displayName);
      localStorage.setItem("rc_staff_role", session.role);
      localStorage.setItem("rc_onboarded", "1");
      localStorage.setItem("rc_age_confirmed", "1");
      localStorage.setItem("rc_rules_agreed", "1");
      navigate("/rooms");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-viewport z-50 bg-black/70 backdrop-blur-sm">
      <form onSubmit={signIn} className="modal-panel max-w-sm rounded-xl border border-white/10 bg-panel p-5 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-signal">Private access</p>
            <h2 className="mt-1 font-display text-xl font-semibold text-white">Enter as staff</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close staff access" className="ui-icon-button h-11 w-11 text-xl text-mist hover:text-white">×</button>
        </div>
        <p className="mt-2 text-sm text-mist">The server verifies your account, role, and registered device before you enter.</p>

        <input
          autoFocus
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Staff password"
          autoComplete="current-password"
          className="mt-4 w-full rounded-lg border border-white/10 bg-ink/60 px-3 py-3 text-white outline-none focus-visible:outline-signal"
        />
        {error && <p className="mt-3 text-sm text-coral">{error}</p>}
        <button disabled={busy || !password} className="ui-button ui-button-primary mt-4 w-full px-4 text-sm disabled:opacity-40">
          {busy ? "Verifying..." : "Continue securely"}
        </button>
      </form>
    </div>
  );
}

function TrustPill({ icon, text }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-mist">
      <span className="text-signal" aria-hidden="true">{icon}</span>
      {text}
    </span>
  );
}