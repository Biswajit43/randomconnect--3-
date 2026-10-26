
import { useEffect, useState } from "react";

const TELEGRAM_URL = "https://t.me/voisabot";
const DROP_DURATION = 60 * 1000; // 1 minute

// Generate 4 consistent random drop times per local calendar day.
function getDailyDrops(date) {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);

  const seedText = `${day.getFullYear()}-${day.getMonth() + 1}-${day.getDate()}`;

  let seed = [...seedText].reduce(
    (value, char) => (value * 31 + char.charCodeAt(0)) >>> 0,
    7
  );

  function random() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  }

  const minutes = new Set();

  // Four different times, spread throughout the day.
  for (let slot = 0; slot < 4; slot++) {
    let minute;

    do {
      minute = slot * 360 + Math.floor(random() * 360);
    } while (minutes.has(minute));

    minutes.add(minute);
  }

  return [...minutes]
    .sort((a, b) => a - b)
    .map((minute) => {
      const drop = new Date(day);
      drop.setMinutes(minute);
      return drop;
    });
}

function getDropStatus(now) {
  const drops = [];

  for (let offset = -1; offset <= 2; offset++) {
    const date = new Date(now);
    date.setDate(date.getDate() + offset);
    drops.push(...getDailyDrops(date));
  }

  drops.sort((a, b) => a.getTime() - b.getTime());

  const active = drops.find((drop) => {
    const elapsed = now.getTime() - drop.getTime();
    return elapsed >= 0 && elapsed < DROP_DURATION;
  });

  const next = active
    ? active
    : drops.find((drop) => drop.getTime() > now.getTime());

  return { active, next };
}

function formatCountdown(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(
    remainingSeconds
  ).padStart(2, "0")}`;
}

function formatTime(date) {
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function TelegramDrop() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 250);

    return () => window.clearInterval(timer);
  }, []);

  const { active, next } = getDropStatus(now);

  const remaining = active
    ? active.getTime() + DROP_DURATION - now.getTime()
    : next
      ? next.getTime() - now.getTime()
      : 0;

  return (
    <section
      aria-label="Random Telegram Drop"
      className="relative isolate overflow-hidden rounded-2xl border border-cyan-400/25 bg-slate-950 p-5 shadow-xl sm:p-6"
    >
      {/* Ambient glow */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full blur-3xl transition-colors ${
          active ? "bg-emerald-400/20" : "bg-cyan-400/10"
        }`}
      />

      <div className="relative">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 text-2xl text-cyan-300">
            ➤
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-300">
              RandomConnect Exclusive
            </p>

            <h2 className="mt-1 text-lg font-bold text-white sm:text-xl">
              Random Telegram Drop
            </h2>

            <p className="mt-1 text-xs text-slate-400">
              4 surprise drops • 1 minute each
            </p>
          </div>

          <span
            className={`shrink-0 rounded-full border px-3 py-1 text-[10px] font-bold tracking-wider ${
              active
                ? "animate-pulse border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
                : "border-white/10 bg-white/5 text-slate-400"
            }`}
          >
            {active ? "● LIVE NOW" : "● LOCKED"}
          </span>
        </div>

        {/* Countdown */}
        <div className="mt-5 rounded-xl border border-white/10 bg-black/30 px-3 py-5 text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400">
            {active ? "Drop closes in" : "Next drop starts in"}
          </p>

          <p
            className={`my-2 font-mono text-5xl font-bold tabular-nums tracking-wider ${
              active ? "text-emerald-300" : "text-cyan-300"
            }`}
            role="timer"
            aria-label={
              active ? "Time remaining in current drop" : "Time until next drop"
            }
          >
            {formatCountdown(remaining)}
          </p>

          <p className="text-xs text-slate-400">
            {active
              ? "Your 60-second window is open!"
              : next
                ? `Next surprise at ${formatTime(next)}`
                : "Waiting for the next drop"}
          </p>
        </div>

        {/* Telegram button */}
        {active ? (
          <a
            href={TELEGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-300 to-blue-400 px-4 py-3 text-sm font-extrabold text-slate-950 shadow-lg shadow-cyan-400/10 transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-cyan-300"
          >
            <span aria-hidden="true">➤</span>
            Open Telegram Bot
          </a>
        ) : (
          <button
            type="button"
            disabled
            className="mt-4 flex min-h-12 w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-500"
          >
            🔒 Link locked — wait for the drop
          </button>
        )}

        {/* Footer */}
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/10 pt-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          <span>4 drops per day</span>
          <span>60 seconds per drop</span>
        </div>
      </div>
    </section>
  );
}
