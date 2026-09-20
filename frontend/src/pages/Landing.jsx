import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import PulseConnector from "../components/PulseConnector.jsx";
import { getDisplayName, setDisplayName, getFingerprint } from "../lib/socket.js";
import { api } from "../lib/api.js";

const TAGLINES = [
  "meet someone new.",
  "make a real connection.",
  "just talk, freely.",
];

const AVATAR_COLORS = [
  "#4CC9F0",
  "#9D8DF1",
  "#FF6B6B",
  "#7BE0D6",
  "#F4B860",
  "#6FCF97",
];

/*
  Height-gated visibility.
  On phones the first screen must fit without scrolling, so extras only appear
  when the viewport is tall enough (or on desktop, lg+). Written out in full so
  Tailwind can see every class. Needs Tailwind 3.1+; on older versions the extras
  simply stay hidden on phones, which is the safe failure.
*/
const ROOMY_BLOCK = "hidden [@media(min-height:720px)]:block lg:block";
const ROOMY_FLEX = "hidden [@media(min-height:720px)]:flex lg:flex";
const ROOMY_INLINE_FLEX = "hidden [@media(min-height:720px)]:inline-flex lg:inline-flex";
const MID_INLINE_FLEX = "hidden [@media(min-height:620px)]:inline-flex lg:inline-flex";

function colorForName(text) {
  let hash = 0;

  for (let i = 0; i < text.length; i += 1) {
    hash = text.charCodeAt(i) + ((hash << 5) - hash);
  }

  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function scrollToStart() {
  document.getElementById("start-talking")?.scrollIntoView({
    behavior: "smooth",
    block: "center",
  });

  // Put the cursor in the name field once the scroll has settled.
  window.setTimeout(() => {
    document.getElementById("display-name")?.focus({ preventScroll: true });
  }, 500);
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
  const [taglineIndex, setTaglineIndex] = useState(0);

  const [optionsOpen, setOptionsOpen] = useState(false);
  const [staffAccessOpen, setStaffAccessOpen] = useState(false);

  const closeOptions = useCallback(() => setOptionsOpen(false), []);
  const closeStaff = useCallback(() => setStaffAccessOpen(false), []);

  const trimmedName = name.trim();
  const confirmed = ageConfirmed && agreedRules;
  const canEnter = trimmedName.length > 0 && confirmed && !premiumBusy;
  const hasCode = premiumCode.trim().length > 0 || recoveryCode.trim().length > 0;
  const premiumIsError =
    premiumMessage.length > 0 &&
    !premiumMessage.startsWith("Premium activated") &&
    !premiumMessage.startsWith("Premium restored");

  // The button says what is missing instead of just going grey.
  const ctaLabel = premiumBusy
    ? "Activating premium…"
    : !trimmedName
      ? "Enter a name to start"
      : !confirmed
        ? "Tick both boxes to start"
        : "Start talking";

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const invite = params.get("invite");
    if (invite) {
      setPremiumCode(invite);
      setOptionsOpen(true);
    }

    const recovery = params.get("recover");

    if (recovery) {
      setRecoveryCode(recovery);
      setOptionsOpen(true);
    }

    if (
      !invite &&
      !recovery &&
      getDisplayName() &&
      localStorage.getItem("rc_onboarded") === "1"
    ) {
      navigate(state?.returnTo || "/rooms", { replace: true });
    }
  }, [navigate, state?.returnTo]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setTaglineIndex((index) => (index + 1) % TAGLINES.length);
    }, 3200);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function refreshWaitingCount() {
      try {
        const stats = await api.stats();

        if (mounted) {
          setWaitingCount(stats.waiting);
        }
      } catch {
        // Waiting count is optional UI.
      }
    }

    refreshWaitingCount();

    const interval = window.setInterval(refreshWaitingCount, 6000);

    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  async function enter() {
    if (!canEnter) return;

    if (recoveryCode.trim() || premiumCode.trim()) {
      setPremiumBusy(true);
      setPremiumMessage("");

      try {
        const result = recoveryCode.trim()
          ? await api.redeemPremiumRecovery(
              recoveryCode.trim(),
              getFingerprint(),
            )
          : await api.redeemPremium(
              premiumCode.trim(),
              getFingerprint(),
            );

        if (result.token) {
          localStorage.setItem("rc_premium_token", result.token);
        }

        setPremiumMessage(
          recoveryCode.trim()
            ? "Premium restored. You can view the details in Profile."
            : "Premium activated. You can view the details in Profile.",
        );
      } catch (error) {
        setPremiumMessage(error?.message || "Unable to activate premium.");
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
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 5);

    navigate(state?.returnTo || "/rooms", {
      state: {
        interests: tags,
      },
    });
  }

  function forgetMe() {
    localStorage.removeItem("rc_fp");
    localStorage.removeItem("rc_name");
    localStorage.removeItem("rc_onboarded");
    localStorage.removeItem("rc_age_confirmed");
    localStorage.removeItem("rc_rules_agreed");

    setName("");
    setInterests("");
  }

  function addInterest(value) {
    const current = interests
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    if (current.includes(value)) return;

    setInterests([...current, value].slice(0, 5).join(", "));
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#050816] text-white">
      {/* Atmospheric background */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 overflow-hidden"
      >
        <div className="absolute -left-40 -top-40 h-[32rem] w-[32rem] rounded-full bg-cyan-400/10 blur-[120px]" />

        <div className="absolute right-[-10rem] top-[15%] h-[30rem] w-[30rem] rounded-full bg-violet-500/10 blur-[120px]" />

        <div className="absolute bottom-[-12rem] left-[30%] h-[28rem] w-[28rem] rounded-full bg-cyan-500/5 blur-[120px]" />

        <div className="absolute inset-0 opacity-[0.035] [background-image:linear-gradient(rgba(255,255,255,.6)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.6)_1px,transparent_1px)] [background-size:64px_64px]" />

        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_25%,#050816_90%)]" />
      </div>

      {/*
        FIRST SCREEN
        Exactly one viewport tall (dvh follows the mobile browser toolbar).
        Header + hero + start card live here, so the name field, the checkboxes
        and the button are all visible without scrolling.
      */}
      <div
        className="relative z-10 flex min-h-screen flex-col"
        style={{ minHeight: "100dvh" }}
      >
        {/* Navigation */}
        <header className="relative z-20 mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3 sm:px-8 sm:py-5 lg:px-10">
          <Link
            to="/"
            className="group flex items-center gap-2"
            aria-label="RandomConnect home"
          >
            <span className="relative flex h-8 w-8 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/10">
              <span className="h-2.5 w-2.5 rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(76,201,240,.9)]" />
            </span>

            <span className="text-lg font-bold tracking-[-0.04em] text-white">
              random
              <span className="text-cyan-300">connect</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-7 text-sm text-slate-400 md:flex">
            <Link to="/about" className="transition hover:text-white">
              About
            </Link>

            <Link to="/safety" className="transition hover:text-white">
              Safety
            </Link>

            <Link to="/faq" className="transition hover:text-white">
              FAQ
            </Link>

            <Link to="/pricing" className="transition hover:text-white">
              Pricing
            </Link>
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-emerald-400/15 bg-emerald-400/5 px-3 py-1.5 text-xs text-emerald-300 sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,.8)]" />
              Private by default
            </div>

            <button
              type="button"
              onClick={() => setStaffAccessOpen(true)}
              className="min-h-[2.5rem] rounded-full px-3 text-xs text-slate-500 transition hover:bg-white/5 hover:text-slate-300"
            >
              Staff
            </button>
          </div>
        </header>

        {/*
          Phones / tablets: hero fills the leftover space, card sits at the bottom
          within thumb reach. Desktop (lg): two columns.
        */}
        <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-8 lg:grid lg:grid-cols-[1.05fr_.75fr] lg:items-center lg:gap-20 lg:px-10 lg:pb-16 lg:pt-6">
          {/* Hero */}
          <div className="flex flex-1 flex-col justify-center py-2 lg:block lg:max-w-3xl lg:py-0">
            <div
              className={`${ROOMY_INLINE_FLEX} mb-5 items-center gap-2 self-start rounded-full border border-cyan-300/15 bg-cyan-300/[0.05] px-3.5 py-2 text-xs text-cyan-200 lg:mb-6`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(76,201,240,.9)]" />
              Real conversations · no profile required
            </div>

            <h1 className="max-w-3xl text-[2.25rem] font-bold leading-[1] tracking-[-0.055em] text-white sm:text-6xl lg:text-[5.7rem] lg:leading-[.98]">
              Talk to
              <br />

              <span className="bg-gradient-to-r from-cyan-200 via-cyan-300 to-violet-300 bg-clip-text text-transparent">
                someone new.
              </span>
            </h1>

            <div
              key={taglineIndex}
              className="mt-2 min-h-[1.5em] text-base font-medium tracking-[-0.01em] text-slate-300 animate-[landingFade_.55s_ease-out] sm:mt-4 sm:text-2xl lg:mt-6 lg:text-3xl"
            >
              {TAGLINES[taglineIndex]}
            </div>

            <p
              className={`${ROOMY_BLOCK} mt-4 max-w-xl text-base leading-7 text-slate-400 lg:mt-6 lg:text-lg`}
            >
              Drop into a respectful conversation, share an interest,
              and leave whenever you want. No profile to build and no
              personal details needed.
            </p>

            {/* Trust row */}
            <div
              className={`${ROOMY_FLEX} mt-5 flex-wrap gap-2 lg:mt-8 lg:gap-2.5`}
            >
              <TrustPill icon="✦" text="No signup" />
              <TrustPill icon="↗" text="Skip anytime" />
              <TrustPill icon="◌" text="Camera starts off" />
            </div>

            {/* Waiting status */}
            {waitingCount !== null && (
              <div
                className={`${MID_INLINE_FLEX} mt-4 items-center gap-2.5 self-start rounded-full border border-white/10 bg-white/[0.025] px-3 py-1.5 text-xs text-slate-400 lg:mt-7 lg:px-4 lg:py-2.5 lg:text-sm`}
              >
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-300 opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-300" />
                </span>

                {waitingCount > 0
                  ? `${waitingCount} ${
                      waitingCount === 1 ? "person is" : "people are"
                    } looking for a conversation`
                  : "Be the first conversation waiting"}
              </div>
            )}

            {/* Product preview (desktop only, keeps small screens to one view) */}
            <div className="relative mt-12 hidden max-w-xl lg:block">
              <div className="absolute -inset-5 rounded-[2rem] bg-cyan-400/5 blur-3xl" />

              <div className="relative flex items-center gap-4 rounded-3xl border border-white/10 bg-white/[0.035] p-4 shadow-2xl shadow-black/30 backdrop-blur-xl">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-300 to-blue-500 text-lg font-bold text-[#031018]">
                  A
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white">
                      Someone is ready to talk
                    </span>

                    <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
                      live
                    </span>
                  </div>

                  <p className="mt-1 truncate text-sm text-slate-500">
                    Music · Travel · Movies
                  </p>
                </div>

                <div className="rounded-xl border border-cyan-300/15 bg-cyan-300/5 px-4 py-2 text-xs font-medium text-cyan-200">
                  Connecting
                </div>
              </div>

              <div className="absolute -bottom-7 -right-3 rounded-2xl border border-violet-300/15 bg-[#0b1022]/95 p-3 shadow-xl shadow-black/40 backdrop-blur-xl">
                <div className="flex items-center gap-3">
                  <div className="flex -space-x-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#0b1022] bg-cyan-300 text-xs font-bold text-[#031018]">
                      J
                    </div>

                    <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#0b1022] bg-violet-300 text-xs font-bold text-[#120c22]">
                      M
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-white">
                      Group room
                    </p>
                    <p className="text-[11px] text-slate-500">
                      people are talking
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-10 hidden lg:block">
              <PulseConnector label="A conversation is waiting" />
            </div>
          </div>

          {/* Start card */}
          <section
            id="start-talking"
            className="mx-auto w-full max-w-md lg:mx-0 lg:max-w-none lg:justify-self-end"
          >
            <div className="relative">
              <div className="absolute -inset-4 rounded-[2rem] bg-cyan-400/5 blur-3xl lg:-inset-6" />

              <div className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#0a1020]/90 shadow-2xl shadow-black/50 backdrop-blur-2xl lg:rounded-[2rem]">
                {/* Card header: one slim line on phones, full header on desktop */}
                <div className="px-4 pt-4 lg:border-b lg:border-white/[0.07] lg:px-7 lg:py-6">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p
                        className={`${ROOMY_BLOCK} text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300`}
                      >
                        Start here
                      </p>

                      <h2 className="text-xl font-bold tracking-[-0.035em] text-white lg:mt-2 lg:text-2xl">
                        Start talking
                      </h2>

                      <p
                        className={`${ROOMY_BLOCK} mt-1 text-sm text-slate-500 lg:mt-1.5`}
                      >
                        Choose a name and you're ready.
                      </p>
                    </div>

                    <div className="hidden h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] lg:flex">
                      <span className="text-lg">↗</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 px-4 pb-4 pt-3 lg:space-y-5 lg:p-7">
                  {/* Name */}
                  <div>
                    <label
                      htmlFor="display-name"
                      className="sr-only mb-0 block text-sm font-medium text-slate-300 lg:not-sr-only lg:mb-2"
                    >
                      Display name
                    </label>

                    <div className="relative">
                      <span
                        aria-hidden="true"
                        className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl text-sm font-bold text-[#06101a] lg:left-3.5 lg:h-9 lg:w-9"
                        style={{
                          backgroundColor: trimmedName
                            ? colorForName(trimmedName)
                            : "rgba(255,255,255,.08)",
                        }}
                      >
                        {trimmedName
                          ? trimmedName.charAt(0).toUpperCase()
                          : "?"}
                      </span>

                      <input
                        id="display-name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            enter();
                          }
                        }}
                        placeholder="What should people call you?"
                        maxLength={30}
                        autoComplete="nickname"
                        enterKeyHint="go"
                        className="h-12 w-full rounded-2xl border border-white/10 bg-black/20 pl-12 pr-4 text-base text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/50 focus:bg-cyan-300/[0.025] focus:ring-4 focus:ring-cyan-300/5 lg:h-14 lg:pl-16"
                      />
                    </div>
                  </div>

                  {/* Interests */}
                  <div>
                    <label
                      htmlFor="interests"
                      className="sr-only mb-0 block text-sm font-medium text-slate-300 lg:not-sr-only lg:mb-2"
                    >
                      Interests
                      <span className="ml-1 font-normal text-slate-600">
                        optional
                      </span>
                    </label>

                    <input
                      id="interests"
                      value={interests}
                      onChange={(event) =>
                        setInterests(event.target.value)
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          enter();
                        }
                      }}
                      placeholder="Interests (optional): music, travel..."
                      enterKeyHint="go"
                      className="h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-base text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/50 focus:bg-cyan-300/[0.025] focus:ring-4 focus:ring-cyan-300/5 lg:h-14"
                    />

                    <div
                      className={`${ROOMY_FLEX} mt-2 flex-wrap gap-2 lg:mt-2.5`}
                    >
                      {["Music", "Travel", "Movies", "Gaming"].map(
                        (interest) => (
                          <button
                            key={interest}
                            type="button"
                            onClick={() =>
                              addInterest(interest.toLowerCase())
                            }
                            className="rounded-full border border-white/10 bg-white/[0.025] px-3 py-1.5 text-xs text-slate-500 transition hover:border-cyan-300/20 hover:bg-cyan-300/5 hover:text-cyan-200"
                          >
                            + {interest}
                          </button>
                        ),
                      )}
                    </div>
                  </div>

                  {/* Options (opens a sheet so the page never grows or jumps) */}
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    onClick={() => setOptionsOpen(true)}
                    className="flex min-h-[2.75rem] w-full items-center justify-between gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] px-4 py-2.5 text-left transition hover:border-white/15 hover:bg-white/[0.04] lg:py-3.5"
                  >
                    <span>
                      <span className="block text-sm font-medium text-slate-300">
                        Options & privacy
                      </span>

                      <span
                        className={`${ROOMY_BLOCK} mt-0.5 text-xs text-slate-600`}
                      >
                        Premium, recovery, music and local data
                      </span>
                    </span>

                    <span className="flex shrink-0 items-center gap-2 text-slate-500">
                      {hasCode && (
                        <span className="text-[11px] font-medium text-emerald-300">
                          Code added
                        </span>
                      )}

                      <span
                        aria-hidden="true"
                        className="text-lg leading-none"
                      >
                        ›
                      </span>
                    </span>
                  </button>

                  {/* Confirmations */}
                  <div className="space-y-2.5 lg:space-y-3">
                    <label className="flex cursor-pointer items-start gap-3 text-xs leading-snug text-slate-400 lg:text-sm lg:leading-5">
                      <input
                        type="checkbox"
                        checked={ageConfirmed}
                        onChange={(event) =>
                          setAgeConfirmed(event.target.checked)
                        }
                        className="mt-px h-[18px] w-[18px] shrink-0 accent-cyan-400 lg:mt-0.5"
                      />

                      <span>
                        I confirm I am 18 years of age or older.
                      </span>
                    </label>

                    <label className="flex cursor-pointer items-start gap-3 text-xs leading-snug text-slate-400 lg:text-sm lg:leading-5">
                      <input
                        type="checkbox"
                        checked={agreedRules}
                        onChange={(event) =>
                          setAgreedRules(event.target.checked)
                        }
                        className="mt-px h-[18px] w-[18px] shrink-0 accent-cyan-400 lg:mt-0.5"
                      />

                      <span>
                        I agree not to share sexual content, harass
                        others, or involve minors.
                      </span>
                    </label>
                  </div>

                  {/* CTA: the label tells people what is still missing */}
                  <button
                    type="button"
                    onClick={enter}
                    disabled={!canEnter}
                    className="group flex h-12 w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-cyan-300 to-blue-400 text-sm font-bold text-[#041019] shadow-[0_12px_40px_rgba(76,201,240,.16)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_50px_rgba(76,201,240,.24)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 lg:h-14"
                  >
                    {ctaLabel}

                    {canEnter && (
                      <span
                        aria-hidden="true"
                        className="transition-transform group-hover:translate-x-1"
                      >
                        →
                      </span>
                    )}
                  </button>

                  {premiumIsError && (
                    <p
                      role="alert"
                      className="text-center text-xs text-red-300"
                    >
                      {premiumMessage}
                    </p>
                  )}

                  <p
                    className={`${ROOMY_BLOCK} text-center text-xs text-slate-600`}
                  >
                    Leave whenever you want. You stay in control.
                  </p>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>

      {/* BELOW THE FOLD */}
      <div className="relative z-10 mx-auto w-full max-w-7xl px-5 pb-16 sm:px-8 lg:px-10">
        {/* Product features */}
        <section className="border-t border-white/[0.06] py-14 sm:py-28">
          <div className="mb-10 max-w-2xl sm:mb-12">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
              Built for conversation
            </p>

            <h2 className="mt-4 text-3xl font-bold tracking-[-0.04em] text-white sm:text-5xl">
              Simple enough to start.
              <br />
              <span className="text-slate-500">
                Flexible enough to stay.
              </span>
            </h2>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <FeatureCard
              number="01"
              title="1-to-1 conversations"
              description="Choose your preferences, add interests if you want, and start a conversation."
              icon="↗"
            />

            <FeatureCard
              number="02"
              title="Live group rooms"
              description="Join rooms where people are already talking through voice and video."
              icon="◉"
            />

            <FeatureCard
              number="03"
              title="Stay in control"
              description="Mute, skip, leave, block or report when you need to."
              icon="⌁"
            />
          </div>
        </section>

        {/* Safety */}
        <section className="grid gap-8 rounded-[2rem] border border-white/[0.07] bg-white/[0.025] p-6 sm:gap-10 sm:p-10 lg:grid-cols-[.8fr_1.2fr] lg:p-14">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
              Safety first
            </p>

            <h2 className="mt-4 text-3xl font-bold tracking-[-0.04em] text-white sm:text-4xl">
              You decide when
              <br />
              the conversation ends.
            </h2>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <SafetyItem title="Leave anytime" />
            <SafetyItem title="Mute when needed" />
            <SafetyItem title="Block people" />
            <SafetyItem title="Report problems" />
          </div>
        </section>

        {/* FAQ preview */}
        <section className="py-14 sm:py-28">
          <div className="mx-auto max-w-3xl">
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
                FAQ
              </p>

              <h2 className="mt-4 text-3xl font-bold tracking-[-0.04em] text-white sm:text-5xl">
                Questions before you start?
              </h2>
            </div>

            <div className="mt-8 space-y-3 sm:mt-10">
              <FaqItem
                question="Do I need an account?"
                answer="The current experience can be started without an email or phone number. Your display name is handled locally by the application."
              />

              <FaqItem
                question="Can I leave a conversation?"
                answer="Yes. The communication interface is designed so that leaving the conversation remains readily accessible."
              />

              <FaqItem
                question="Can I join group rooms?"
                answer="Yes. Group rooms provide another way to join live conversations with other participants."
              />

              <FaqItem
                question="What about privacy?"
                answer="The application is designed around sharing only what you choose. Review the Privacy and Safety pages for the full details."
              />
            </div>

            <div className="mt-8 text-center">
              <Link
                to="/faq"
                className="text-sm font-medium text-cyan-300 transition hover:text-white"
              >
                View all questions →
              </Link>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="relative overflow-hidden rounded-[2rem] border border-cyan-300/10 bg-gradient-to-br from-cyan-300/[0.08] via-white/[0.025] to-violet-400/[0.08] px-6 py-14 text-center sm:px-10 sm:py-20">
          <div className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-300/10 blur-[100px]" />

          <div className="relative">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
              Your next conversation
            </p>

            <h2 className="mx-auto mt-4 max-w-2xl text-4xl font-bold tracking-[-0.05em] text-white sm:text-6xl">
              Ready to meet someone new?
            </h2>

            <p className="mx-auto mt-5 max-w-xl text-slate-400">
              No profile to perfect. No endless setup. Just choose a name
              and start talking.
            </p>

            <button
              type="button"
              onClick={scrollToStart}
              className="mt-8 h-12 rounded-2xl bg-white px-6 text-sm font-bold text-[#06101a] shadow-xl transition hover:-translate-y-0.5 hover:bg-cyan-50"
            >
              Start talking →
            </button>
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/[0.06]">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-8 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-10">
          <div>
            <div className="text-sm font-bold text-white">
              random<span className="text-cyan-300">connect</span>
            </div>

            <p className="mt-1 text-xs text-slate-600">
              Talk freely. Leave whenever you want.
            </p>
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">
            <Link className="transition hover:text-white" to="/about">
              About
            </Link>

            <Link className="transition hover:text-white" to="/safety">
              Safety
            </Link>

            <Link className="transition hover:text-white" to="/privacy">
              Privacy
            </Link>

            <Link className="transition hover:text-white" to="/terms">
              Terms
            </Link>

            <Link className="transition hover:text-white" to="/contact">
              Contact
            </Link>

            <Link className="transition hover:text-white" to="/faq">
              FAQ
            </Link>
          </div>
        </div>
      </footer>

      {optionsOpen && (
        <OptionsSheet
          onClose={closeOptions}
          premiumCode={premiumCode}
          setPremiumCode={setPremiumCode}
          recoveryCode={recoveryCode}
          setRecoveryCode={setRecoveryCode}
          premiumMessage={premiumMessage}
          premiumIsError={premiumIsError}
          onForget={forgetMe}
        />
      )}

      {staffAccessOpen && <StaffAccessModal onClose={closeStaff} />}

      <style>{`
        @keyframes landingFade {
          from {
            opacity: 0;
            transform: translateY(7px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes landingSheetUp {
          from {
            opacity: 0;
            transform: translateY(24px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          *,
          *::before,
          *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
            scroll-behavior: auto !important;
          }
        }
      `}</style>
    </div>
  );
}

/* Bottom sheet on phones, centered dialog on larger screens. */
function OptionsSheet({
  onClose,
  premiumCode,
  setPremiumCode,
  recoveryCode,
  setRecoveryCode,
  premiumMessage,
  premiumIsError,
  onForget,
}) {
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleEscape(event) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  function handleForget() {
    onForget();
    setCleared(true);
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="options-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="flex max-h-[88dvh] w-full max-w-md flex-col overflow-hidden rounded-t-[1.75rem] border border-white/10 bg-[#0a1020] shadow-2xl shadow-black/60 animate-[landingSheetUp_.25s_ease-out] sm:rounded-[1.75rem]">
        <div className="flex items-center justify-between gap-4 border-b border-white/[0.07] px-5 py-4">
          <div>
            <h2
              id="options-title"
              className="text-lg font-bold tracking-[-0.03em] text-white"
            >
              Options & privacy
            </h2>

            <p className="mt-0.5 text-xs text-slate-500">
              All optional. You can start without any of this.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="h-10 shrink-0 rounded-xl border border-white/10 px-4 text-sm font-medium text-slate-200 transition hover:bg-white/5"
          >
            Done
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
          {/* Premium */}
          <div>
            <p className="text-xs font-semibold text-violet-300">
              Premium / recovery
            </p>

            <input
              value={premiumCode}
              onChange={(event) =>
                setPremiumCode(event.target.value.toUpperCase())
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") onClose();
              }}
              placeholder="Premium code"
              aria-label="Premium code"
              autoCapitalize="characters"
              autoComplete="off"
              enterKeyHint="done"
              className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-base text-white outline-none placeholder:text-slate-600 focus:border-violet-300/40"
            />

            <input
              value={recoveryCode}
              onChange={(event) =>
                setRecoveryCode(event.target.value.toUpperCase())
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") onClose();
              }}
              placeholder="Recovery code"
              aria-label="Recovery code"
              autoCapitalize="characters"
              autoComplete="off"
              enterKeyHint="done"
              className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-base text-white outline-none placeholder:text-slate-600 focus:border-violet-300/40"
            />

            {premiumMessage && (
              <p
                className={`mt-2 text-xs ${
                  premiumIsError ? "text-red-300" : "text-emerald-300"
                }`}
              >
                {premiumMessage}
              </p>
            )}
          </div>

          {/* Music */}
          <div className="rounded-xl border border-cyan-300/10 bg-cyan-300/[0.035] p-3">
            <p className="text-xs leading-5 text-slate-400">
              In group rooms, hosts can play a song preview or a YouTube
              link for everyone at once.
            </p>
          </div>

          {/* Privacy */}
          <div>
            <p className="mb-2 text-xs font-semibold text-slate-300">
              Privacy
            </p>

            <div className="space-y-2 text-xs text-slate-500">
              <p>✓ No email or phone number required</p>
              <p>✓ Your display name stays on this device</p>
              <p>✓ Camera stays off until you enable it</p>
            </div>

            <button
              type="button"
              onClick={handleForget}
              className="mt-3 text-xs text-cyan-300 underline underline-offset-4 transition hover:text-white"
            >
              Forget me on this device
            </button>

            {cleared && (
              <p className="mt-2 text-xs text-emerald-300">
                Cleared. A fresh anonymous ID will be used next time.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TrustPill({ icon, text }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.025] px-3.5 py-2 text-xs text-slate-400">
      <span className="text-cyan-300" aria-hidden="true">
        {icon}
      </span>
      {text}
    </span>
  );
}

function FeatureCard({ number, title, description, icon }) {
  return (
    <div className="group rounded-3xl border border-white/[0.07] bg-white/[0.025] p-6 transition duration-300 hover:-translate-y-1 hover:border-cyan-300/15 hover:bg-white/[0.04]">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-slate-600">
          {number}
        </span>

        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-cyan-300">
          {icon}
        </span>
      </div>

      <h3 className="mt-8 text-lg font-semibold text-white sm:mt-10">
        {title}
      </h3>

      <p className="mt-2 text-sm leading-6 text-slate-500">
        {description}
      </p>
    </div>
  );
}

function SafetyItem({ title }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-black/10 p-4">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-400/10 text-sm text-emerald-300">
        ✓
      </span>

      <span className="text-sm font-medium text-slate-300">
        {title}
      </span>
    </div>
  );
}

function FaqItem({ question, answer }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-5 px-5 py-5 text-left"
      >
        <span className="text-sm font-medium text-white">
          {question}
        </span>

        <span
          className={`shrink-0 text-slate-500 transition-transform ${
            open ? "rotate-45" : ""
          }`}
          aria-hidden="true"
        >
          +
        </span>
      </button>

      {open && (
        <div className="border-t border-white/[0.06] px-5 pb-5 pt-4">
          <p className="text-sm leading-6 text-slate-500">
            {answer}
          </p>
        </div>
      )}
    </div>
  );
}

function StaffAccessModal({ onClose }) {
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    function handleEscape(event) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

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
      setError(
        requestError?.message || "Unable to verify staff access.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="staff-access-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <form
        onSubmit={signIn}
        className="w-full max-w-md overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#0a1020] shadow-2xl shadow-black/60"
      >
        <div className="border-b border-white/[0.07] px-5 py-5 sm:px-6 sm:py-6">
          <div className="flex items-start justify-between gap-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
                Private access
              </p>

              <h2
                id="staff-access-title"
                className="mt-2 text-2xl font-bold tracking-[-0.035em] text-white"
              >
                Enter as staff
              </h2>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close staff access"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 text-xl text-slate-500 transition hover:bg-white/5 hover:text-white"
            >
              ×
            </button>
          </div>

          <p className="mt-3 text-sm leading-6 text-slate-500">
            The server verifies your account, role, and registered
            device before entry.
          </p>
        </div>

        <div className="p-5 sm:p-6">
          <label
            htmlFor="staff-password"
            className="mb-2 block text-sm font-medium text-slate-300"
          >
            Staff password
          </label>

          <input
            id="staff-password"
            autoFocus
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            placeholder="Enter password"
            className="h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-base text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/40 focus:ring-4 focus:ring-cyan-300/5"
          />

          {error && (
            <p
              role="alert"
              className="mt-3 rounded-xl border border-red-400/10 bg-red-400/5 px-3 py-2 text-sm text-red-300"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || !password}
            className="mt-5 flex h-12 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-cyan-300 to-blue-400 px-4 text-sm font-bold text-[#041019] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Verifying..." : "Continue securely"}
          </button>
        </div>
      </form>
    </div>
  );
}