import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import PulseConnector from "../components/PulseConnector.jsx";
import { getDisplayName, setDisplayName } from "../lib/socket.js";

export default function Landing() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const [name, setName] = useState(() => getDisplayName());
  const [interests, setInterests] = useState("");
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [agreedRules, setAgreedRules] = useState(false);

  const canEnter = name.trim().length > 0 && ageConfirmed && agreedRules;

  function enter() {
    if (!canEnter) return;
    setDisplayName(name);
    const tags = interests
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 5);
    // If they got here via the "you need a name first" redirect from a
    // direct room link, send them back to that room instead of the general
    // rooms hub. Otherwise the hub lets them choose 1-to-1 or a group room.
    navigate(state?.returnTo || "/rooms", { state: { interests: tags } });
  }

  return (
    <div className="relative min-h-screen overflow-hidden flex flex-col">
      <div className="pointer-events-none absolute inset-0 opacity-60" aria-hidden="true">
        <div className="absolute -left-24 top-24 h-72 w-72 rounded-full border border-signal/10" />
        <div className="absolute -left-12 top-36 h-48 w-48 rounded-full border border-signal/10" />
        <div className="absolute -right-32 bottom-20 h-96 w-96 rounded-full border border-violet/10" />
      </div>

      <header className="relative z-10 px-6 py-5 flex items-center justify-between max-w-6xl w-full mx-auto">
        <span className="font-display font-bold text-lg tracking-tight text-white">
          random<span className="text-signal">connect</span>
        </span>
        <div className="flex items-center gap-2 text-xs font-mono text-mist">
          <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
          private by default
        </div>
      </header>

      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-5 py-8 text-center">
        <div className="w-full max-w-5xl grid lg:grid-cols-[1fr_390px] gap-10 lg:gap-16 items-center">
          <section className="text-left lg:pl-6">
            <p className="font-mono text-xs tracking-[0.22em] text-signal2 uppercase mb-5">
              real people · no account · your choice
            </p>
            <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-bold text-white max-w-2xl leading-[1.04]">
              A better way to
              <br />
              <span className="text-signal">meet someone new.</span>
            </h1>
            <p className="mt-5 max-w-lg text-base sm:text-lg leading-relaxed text-mist">
              Drop into a respectful conversation, share an interest, and leave whenever you want. No profile to build and no personal details needed.
            </p>

            <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-xl">
              <TrustPoint icon="◉" title="No signup" text="Choose a display name" />
              <TrustPoint icon="⌁" title="In your control" text="Mute, skip, or leave" />
              <TrustPoint icon="✓" title="Moderated" text="Report problems anytime" />
            </div>
            <PulseConnector label="A conversation is waiting" />
          </section>

          <section className="w-full max-w-sm mx-auto text-left bg-panel/90 border border-white/10 rounded-2xl p-5 sm:p-6 shadow-2xl shadow-black/20 backdrop-blur-sm">
            <div className="mb-5">
              <p className="font-display text-xl font-semibold text-white">Set up your room</p>
              <p className="mt-1 text-sm text-mist">It takes a few seconds to get started.</p>
            </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="What should people call you?"
            maxLength={30}
            className="w-full bg-ink/60 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-mist/50 outline-none focus-visible:border-signal/60 focus-visible:outline-signal"
          />

          <input
            value={interests}
            onChange={(e) => setInterests(e.target.value)}
            placeholder="Interests (optional) — e.g. music, hiking, anime"
            className="w-full bg-ink/60 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-mist/50 outline-none focus-visible:border-signal/60 focus-visible:outline-signal"
          />

          <div className="flex items-start gap-2.5 rounded-lg border border-signal/15 bg-signal/5 px-3 py-2.5 text-left">
            <span className="text-base leading-none text-signal" aria-hidden="true">♪</span>
            <p className="text-xs text-mist">
              In group rooms, hosts can play a preview or YouTube link for everyone.
            </p>
          </div>

          <label className="flex items-start gap-3 text-left text-sm text-mist leading-relaxed">
            <input
              type="checkbox"
              checked={ageConfirmed}
              onChange={(e) => setAgeConfirmed(e.target.checked)}
              className="mt-1 accent-signal"
            />
            I confirm I am 18 years of age or older.
          </label>

          <label className="flex items-start gap-3 text-left text-sm text-mist leading-relaxed">
            <input
              type="checkbox"
              checked={agreedRules}
              onChange={(e) => setAgreedRules(e.target.checked)}
              className="mt-1 accent-signal"
            />
            I agree not to share sexual content, harass others, or involve
            minors, and understand sessions may be moderated and reported to
            authorities where required by law.
          </label>

          <button
            onClick={enter}
            disabled={!canEnter}
            className="w-full py-3.5 rounded-xl bg-signal text-ink font-display font-semibold disabled:opacity-30 disabled:cursor-not-allowed hover:brightness-110 active:scale-[0.98] transition shadow-lg shadow-signal/10"
          >
            Continue securely <span aria-hidden="true">→</span>
          </button>
          {!name.trim() && (
            <p className="text-xs text-mist/60 -mt-2">A name is required so people know who they're talking to.</p>
          )}
          </section>
        </div>
      </main>

      <footer className="relative z-10 px-6 py-5 text-center text-xs text-mist/60 font-mono">
        You share only what you choose · moderated in real time · leave anytime
      </footer>
    </div>
  );
}

function TrustPoint({ icon, title, text }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-white/5 bg-white/[0.025] px-3 py-2.5">
      <span className="text-signal text-sm" aria-hidden="true">{icon}</span>
      <span>
        <span className="block text-xs font-semibold text-white">{title}</span>
        <span className="block mt-0.5 text-[11px] text-mist/80">{text}</span>
      </span>
    </div>
  );
}
