import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import PulseConnector from "../components/PulseConnector.jsx";
import { getDisplayName, setDisplayName } from "../lib/socket.js";
import { api } from "../lib/api.js";

const HEADLINE_WORDS = ["A", "better", "way", "to"];
const TAGLINES = ["meet someone new.", "make a real connection.", "just talk, freely."];
const AVATAR_COLORS = ["#4CC9F0", "#9D8DF1", "#FF6B6B", "#7BE0D6", "#F4B860", "#6FCF97"];

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
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [agreedRules, setAgreedRules] = useState(false);
  const [waitingCount, setWaitingCount] = useState(null);
  const [clearedNotice, setClearedNotice] = useState(false);
  const [taglineIndex, setTaglineIndex] = useState(0);
  const [detailsOpen, setDetailsOpen] = useState(false);

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

  function enter() {
    if (!canEnter) return;
    setDisplayName(name);
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
    setName("");
    setClearedNotice(true);
    setTimeout(() => setClearedNotice(false), 3500);
  }

  return (
    <div className="relative min-h-screen overflow-hidden flex flex-col">
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

      <header className="relative z-10 px-5 sm:px-6 py-5 flex items-center justify-between max-w-6xl w-full mx-auto animate-fadeInUp">
        <span className="font-display font-bold text-lg tracking-tight text-white">
          random<span className="text-signal">connect</span>
        </span>
        <div className="flex items-center gap-2 text-xs font-mono text-mist">
          <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)] animate-pulse" />
          private by default
        </div>
      </header>

      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-5 py-6 lg:py-8 text-center">
        <div className="w-full max-w-5xl grid lg:grid-cols-[1fr_390px] gap-8 lg:gap-16 items-center">
          <section className="text-center lg:text-left lg:pl-6">
            <p
              className="font-mono text-[11px] sm:text-xs tracking-[0.22em] text-signal2 uppercase mb-4 animate-fadeInUp"
              style={{ animationDelay: "80ms" }}
            >
              real people · no account · your choice
            </p>

            <h1 className="font-display text-[2.5rem] leading-[1.05] sm:text-5xl md:text-6xl font-bold text-white mx-auto lg:mx-0 max-w-2xl">
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
              className="mt-5 max-w-lg mx-auto lg:mx-0 text-base sm:text-lg leading-relaxed text-mist animate-fadeInUp"
              style={{ animationDelay: "560ms" }}
            >
              Drop into a respectful conversation, share an interest, and leave whenever you want. No profile to build and no personal details needed.
            </p>

            <div
              className="mt-7 flex flex-wrap justify-center lg:justify-start gap-2.5 max-w-xl mx-auto lg:mx-0 animate-fadeInUp"
              style={{ animationDelay: "650ms" }}
            >
              <TrustPill icon="◉" text="No signup" />
              <TrustPill icon="⌁" text="Mute, skip, or leave" />
              <TrustPill icon="⟲" text="Nothing lingers" />
            </div>

            {waitingCount !== null && (
              <p
                className="mt-5 font-mono text-xs text-mist flex items-center justify-center lg:justify-start gap-2 animate-fadeInUp"
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

            <div className="lg:hidden mt-6 flex justify-center text-mist/50 animate-bounceHint" aria-hidden="true">
              ▾
            </div>
          </section>

          <section className="relative w-full max-w-sm mx-auto animate-slideUp" style={{ animationDelay: "250ms" }}>
            <div
              className="absolute -inset-[1.5px] rounded-t-[28px] lg:rounded-2xl opacity-70 animate-spinSlow"
              style={{
                background: "conic-gradient(from 0deg, transparent, #4CC9F0, transparent 35%, transparent 65%, #9D8DF1, transparent)",
              }}
              aria-hidden="true"
            />

            <div className="relative text-left bg-panel/95 border border-white/10 rounded-t-[28px] lg:rounded-2xl p-5 sm:p-6 shadow-2xl shadow-black/40 backdrop-blur-sm">
              <div className="lg:hidden w-10 h-1 rounded-full bg-white/15 mx-auto mb-4" />

              <div className="mb-4">
                <p className="font-display text-xl font-semibold text-white">Set up your room</p>
                <p className="mt-1 text-sm text-mist">Takes a few seconds. Nothing else required.</p>
              </div>

              <div className="relative mb-3">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="What should people call you?"
                  maxLength={30}
                  autoFocus={false}
                  className="w-full bg-ink/60 border border-white/10 rounded-xl px-4 py-3.5 text-base sm:text-sm text-white placeholder:text-mist/50 outline-none focus-visible:border-signal/60 focus-visible:outline-signal transition"
                />

                {trimmedName.length > 0 && (
                  <div key={trimmedName} className="mt-2.5 flex items-center gap-2.5 animate-scaleIn origin-left">
                    <span
                      className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold text-ink shrink-0"
                      style={{ backgroundColor: colorForName(trimmedName) }}
                    >
                      {trimmedName.charAt(0).toUpperCase()}
                    </span>
                    <p className="text-sm text-white truncate">
                      Hi, <span className="font-semibold">{trimmedName}</span> 👋
                    </p>
                  </div>
                )}
              </div>

              <button
                onClick={() => setDetailsOpen((v) => !v)}
                className="lg:hidden w-full flex items-center justify-between text-xs text-mist mb-3 py-1"
              >
                <span>{detailsOpen ? "Hide details" : "Interests, music, and privacy"}</span>
                <span className={`transition-transform ${detailsOpen ? "rotate-180" : ""}`}>▾</span>
              </button>

              <div className={`${detailsOpen ? "block" : "hidden"} lg:block`}>
                <input
                  value={interests}
                  onChange={(e) => setInterests(e.target.value)}
                  placeholder="Interests (optional) — e.g. music, hiking, anime"
                  className="w-full bg-ink/60 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-mist/50 outline-none focus-visible:border-signal/60 focus-visible:outline-signal transition mb-3"
                />

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

              <label className="flex items-start gap-3 text-left text-sm text-mist leading-relaxed mb-2.5">
                <input
                  type="checkbox"
                  checked={ageConfirmed}
                  onChange={(e) => setAgeConfirmed(e.target.checked)}
                  className="mt-1 accent-signal w-4 h-4"
                />
                I confirm I am 18 years of age or older.
              </label>

              <label className="flex items-start gap-3 text-left text-sm text-mist leading-relaxed mb-4">
                <input
                  type="checkbox"
                  checked={agreedRules}
                  onChange={(e) => setAgreedRules(e.target.checked)}
                  className="mt-1 accent-signal w-4 h-4"
                />
                I agree not to share sexual content, harass others, or involve minors.
              </label>

              <button
                onClick={enter}
                disabled={!canEnter}
                className="w-full py-4 sm:py-3.5 rounded-xl bg-signal text-ink font-display font-semibold text-base sm:text-sm disabled:opacity-30 disabled:cursor-not-allowed hover:brightness-110 active:scale-[0.98] transition shadow-lg shadow-signal/20"
              >
                Continue securely <span aria-hidden="true">→</span>
              </button>
              {!trimmedName && (
                <p className="text-xs text-mist/60 mt-2 text-center">A name is required so people know who they're talking to.</p>
              )}
            </div>
          </section>
        </div>
      </main>

      <footer className="relative z-10 hidden lg:block px-6 py-5 text-center text-xs text-mist/60 font-mono">
        You share only what you choose · leave anytime · nothing follows you home
      </footer>
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