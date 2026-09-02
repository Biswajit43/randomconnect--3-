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
    <div className="min-h-screen flex flex-col">
      <header className="px-6 py-5 flex items-center justify-between">
        <span className="font-display font-bold text-lg tracking-tight text-white">
          random<span className="text-signal">connect</span>
        </span>
        <span className="text-xs font-mono text-mist">v1.0</span>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <p className="font-mono text-xs tracking-widest text-signal2 uppercase mb-4">
          one click. one stranger. zero signup.
        </p>
        <h1 className="font-display text-4xl md:text-6xl font-bold text-white max-w-2xl leading-tight">
          Talk to someone new,
          <br />
          <span className="text-signal">right now.</span>
        </h1>

        <PulseConnector label="two people, about to connect" />

        <div className="w-full max-w-sm space-y-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="What should people call you?"
            maxLength={30}
            className="w-full bg-panel border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-mist/50 outline-none focus-visible:outline-signal"
          />

          <input
            value={interests}
            onChange={(e) => setInterests(e.target.value)}
            placeholder="Interests (optional) — e.g. music, hiking, anime"
            className="w-full bg-panel border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-mist/50 outline-none focus-visible:outline-signal"
          />

          <label className="flex items-start gap-3 text-left text-sm text-mist">
            <input
              type="checkbox"
              checked={ageConfirmed}
              onChange={(e) => setAgeConfirmed(e.target.checked)}
              className="mt-1 accent-signal"
            />
            I confirm I am 18 years of age or older.
          </label>

          <label className="flex items-start gap-3 text-left text-sm text-mist">
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
            className="w-full py-3.5 rounded-xl bg-signal text-ink font-display font-semibold disabled:opacity-30 disabled:cursor-not-allowed hover:brightness-110 active:scale-[0.98] transition"
          >
            Start talking
          </button>
          {!name.trim() && (
            <p className="text-xs text-mist/60 -mt-2">A name is required so people know who they're talking to.</p>
          )}
        </div>
      </main>

      <footer className="px-6 py-6 text-center text-xs text-mist/60 font-mono">
        Moderated in real time · Report abuse anytime during a call
      </footer>
    </div>
  );
}
