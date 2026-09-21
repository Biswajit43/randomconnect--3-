import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { getDisplayName, setDisplayName, getFingerprint } from "../lib/socket.js";
import { api } from "../lib/api.js";

/* ------------------------------------------------------------------ */
/*  Design tokens                                                      */
/*  Base colours come from the rooms page: deep navy + cyan + violet.  */
/*  --a / --b are the "live" accent pair. They change with each        */
/*  tagline and fade smoothly (see @property in the style block), so   */
/*  the logo, button, glows and icons all shift colour together.       */
/* ------------------------------------------------------------------ */

const SLIDES = [
  { tagline: "meet someone new.", a: "#4CC9F0", b: "#9D8DF1" },
  { tagline: "make a real connection.", a: "#7BE0D6", b: "#4CC9F0" },
  { tagline: "just talk, freely.", a: "#9D8DF1", b: "#FF8FB1" },
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
  Tailwind can see every class. Needs Tailwind 3.1+.
*/
const ROOMY_BLOCK = "hidden [@media(min-height:720px)]:block lg:block";
const ROOMY_FLEX = "hidden [@media(min-height:720px)]:flex lg:flex";

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

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);

    update();
    query.addEventListener?.("change", update);

    return () => query.removeEventListener?.("change", update);
  }, []);

  return reduced;
}

/* ------------------------------------------------------------------ */
/*  Icons (24x24, stroke based, inherit currentColor)                  */
/* ------------------------------------------------------------------ */

const ICONS = {
  lock: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2.5" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8.5h3l1.6-2.5h6.8L17 8.5h3V19H4z" />
      <circle cx="12" cy="13.5" r="3.2" />
      <path d="M3 3l18 18" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l7.5 3v5.5c0 4.6-3.1 8-7.5 9.5-4.4-1.5-7.5-4.9-7.5-9.5V6L12 3z" />
      <path d="M9 12l2.2 2.2L15.5 10" />
    </>
  ),
  skip: (
    <>
      <path d="M5 5l9 7-9 7V5z" />
      <path d="M18 5v14" />
    </>
  ),
  flag: (
    <>
      <path d="M6 21V4" />
      <path d="M6 5h11l-2 3.5 2 3.5H6" />
    </>
  ),
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
};

function Icon({ name, className = "h-5 w-5" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {ICONS[name]}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Logo mark                                                          */
/*  Two linked rings = two people connecting. The lens where they      */
/*  overlap holds the "connected" pulse. Outlined like the X mark,     */
/*  with a light sweep, a pulse and two orbiting sparks.               */
/* ------------------------------------------------------------------ */

function LogoMark({
  className = "",
  animated = true,
  strokeWidth = 3,
  detail = true,
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const baseId = `rcBase${uid}`;
  const shineId = `rcShine${uid}`;
  const glowId = `rcGlow${uid}`;
  const coreId = `rcCore${uid}`;

  const R = 104;
  const LEFT = 150;
  const RIGHT = 250;

  return (
    <svg
      viewBox="0 0 400 400"
      fill="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient
          id={baseId}
          gradientUnits="userSpaceOnUse"
          x1="40"
          y1="80"
          x2="360"
          y2="320"
        >
          <stop offset="0" style={{ stopColor: "var(--a)" }} />
          <stop offset="1" style={{ stopColor: "var(--b)" }} />
        </linearGradient>

        <linearGradient
          id={shineId}
          gradientUnits="userSpaceOnUse"
          x1="-300"
          y1="40"
          x2="-100"
          y2="360"
        >
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.95" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />

          {animated && (
            <>
              <animate
                attributeName="x1"
                values="-300;-300;500"
                keyTimes="0;0.3;1"
                dur="5.5s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="x2"
                values="-100;-100;700"
                keyTimes="0;0.3;1"
                dur="5.5s"
                repeatCount="indefinite"
              />
            </>
          )}
        </linearGradient>

        <radialGradient id={coreId}>
          <stop
            offset="0"
            style={{ stopColor: "var(--a)", stopOpacity: 0.55 }}
          />
          <stop
            offset="1"
            style={{ stopColor: "var(--a)", stopOpacity: 0 }}
          />
        </radialGradient>

        <filter id={glowId} x="-25%" y="-25%" width="150%" height="150%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </defs>

      {/* soft outer glow */}
      <g
        stroke={`url(#${baseId})`}
        strokeWidth={strokeWidth * 3}
        opacity="0.4"
        filter={`url(#${glowId})`}
      >
        <circle cx={LEFT} cy="200" r={R} />
        <circle cx={RIGHT} cy="200" r={R} />
      </g>

      {/* the lens where the two people meet */}
      <path
        d="M200 108.8 A104 104 0 0 1 200 291.2 A104 104 0 0 1 200 108.8 Z"
        fill={`url(#${coreId})`}
      />

      {/* inner hairline rings, the "double outline" */}
      {detail && (
        <g stroke={`url(#${baseId})`} strokeWidth="1.5" opacity="0.3">
          <circle cx={LEFT} cy="200" r={R - 22} />
          <circle cx={RIGHT} cy="200" r={R - 22} />
        </g>
      )}

      {/* main outline */}
      <g stroke={`url(#${baseId})`} strokeWidth={strokeWidth}>
        <circle cx={LEFT} cy="200" r={R} />
        <circle cx={RIGHT} cy="200" r={R} />
      </g>

      {/* light sweep across the outline */}
      {animated && (
        <g stroke={`url(#${shineId})`} strokeWidth={strokeWidth + 0.5}>
          <circle cx={LEFT} cy="200" r={R} />
          <circle cx={RIGHT} cy="200" r={R} />
        </g>
      )}

      {/* connection pulse */}
      {animated && (
        <circle
          cx="200"
          cy="200"
          r="7"
          fill="none"
          strokeWidth="2"
          style={{ stroke: "var(--a)" }}
        >
          <animate
            attributeName="r"
            values="7;54"
            dur="2.8s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="0.9;0"
            dur="2.8s"
            repeatCount="indefinite"
          />
        </circle>
      )}

      <circle cx="200" cy="200" r="16" style={{ fill: "var(--a)" }} opacity="0.2" />
      <circle cx="200" cy="200" r="7" fill="#fff" />

      {/* two sparks, one orbiting each ring */}
      {animated && (
        <>
          <g>
            <circle
              cx={LEFT + R}
              cy="200"
              r="9"
              style={{ fill: "var(--a)" }}
              opacity="0.25"
            />
            <circle cx={LEFT + R} cy="200" r="4.5" fill="#fff" />
            <animateTransform
              attributeName="transform"
              type="rotate"
              from={`0 ${LEFT} 200`}
              to={`360 ${LEFT} 200`}
              dur="10s"
              repeatCount="indefinite"
            />
          </g>

          <g>
            <circle
              cx={RIGHT - R}
              cy="200"
              r="9"
              style={{ fill: "var(--b)" }}
              opacity="0.25"
            />
            <circle cx={RIGHT - R} cy="200" r="4.5" fill="#fff" />
            <animateTransform
              attributeName="transform"
              type="rotate"
              from={`360 ${RIGHT} 200`}
              to={`0 ${RIGHT} 200`}
              dur="12s"
              repeatCount="indefinite"
            />
          </g>
        </>
      )}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function Landing() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const reducedMotion = usePrefersReducedMotion();
  const rootRef = useRef(null);

  const [name, setName] = useState(() => getDisplayName());
  const [interests, setInterests] = useState("");
  const [interestsOpen, setInterestsOpen] = useState(false);
  const [premiumCode, setPremiumCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [premiumMessage, setPremiumMessage] = useState("");
  const [premiumBusy, setPremiumBusy] = useState(false);

  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [agreedRules, setAgreedRules] = useState(false);

  const [waitingCount, setWaitingCount] = useState(null);
  const [slideIndex, setSlideIndex] = useState(0);

  const [optionsOpen, setOptionsOpen] = useState(false);
  const [staffAccessOpen, setStaffAccessOpen] = useState(false);

  const closeOptions = useCallback(() => setOptionsOpen(false), []);
  const closeStaff = useCallback(() => setStaffAccessOpen(false), []);

  const slide = SLIDES[slideIndex % SLIDES.length];

  const trimmedName = name.trim();
  const confirmed = ageConfirmed && agreedRules;
  const canEnter = trimmedName.length > 0 && confirmed && !premiumBusy;
  const hasCode = premiumCode.trim().length > 0 || recoveryCode.trim().length > 0;
  const showInterests = interestsOpen || interests.length > 0;
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

  // Rotate tagline + accent colours together.
  useEffect(() => {
    if (reducedMotion) return undefined;

    const interval = window.setInterval(() => {
      setSlideIndex((index) => (index + 1) % SLIDES.length);
    }, 4200);

    return () => window.clearInterval(interval);
  }, [reducedMotion]);

  // Gentle logo parallax on desktop (mouse only, skipped for reduced motion).
  useEffect(() => {
    if (reducedMotion) return undefined;

    const element = rootRef.current;

    if (!element || !window.matchMedia("(pointer: fine)").matches) {
      return undefined;
    }

    function onMove(event) {
      const x = (event.clientX / window.innerWidth - 0.5) * 2;
      const y = (event.clientY / window.innerHeight - 0.5) * 2;

      element.style.setProperty("--px", x.toFixed(3));
      element.style.setProperty("--py", y.toFixed(3));
    }

    window.addEventListener("pointermove", onMove, { passive: true });

    return () => window.removeEventListener("pointermove", onMove);
  }, [reducedMotion]);

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

  const liveLabel =
    waitingCount !== null && waitingCount > 0
      ? `${waitingCount} waiting`
      : "live";

  return (
    <div
      ref={rootRef}
      className="rc-root relative min-h-screen overflow-x-hidden bg-[#050816] text-white"
      style={{ "--a": slide.a, "--b": slide.b }}
    >
      {/* Background: two soft glows that follow the live accent colours */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 overflow-hidden"
      >
        <div className="rc-glow-a absolute -left-48 -top-48 h-[44rem] w-[44rem]" />
        <div className="rc-glow-b absolute -right-56 top-[10%] h-[46rem] w-[46rem]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_35%,#050816_95%)]" />
      </div>

      {/*
        FIRST SCREEN
        One viewport tall (dvh follows the mobile browser toolbar).
        Name field, both checkboxes and the button are visible without scrolling.
      */}
      <div
        className="relative z-10 flex min-h-screen flex-col"
        style={{ minHeight: "100dvh" }}
      >
        {/* Phones and tablets: the logo sits big and faint behind the content */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-32 top-16 z-0 w-[26rem] opacity-25 lg:hidden"
        >
          <LogoMark className="h-auto w-full" animated={!reducedMotion} />
        </div>

        {/* Navigation */}
        <header className="relative z-20 mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3 sm:px-8 sm:py-5 lg:px-10">
          <Link
            to="/"
            className="flex items-center gap-2.5"
            aria-label="RandomConnect home"
          >
            <LogoMark
              className="h-9 w-9"
              animated={false}
              detail={false}
              strokeWidth={16}
            />

            <span className="rc-display text-xl font-bold tracking-[-0.04em] text-white">
              random<span className="rc-accent">connect</span>
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

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setStaffAccessOpen(true)}
              className="hidden text-xs text-slate-400 transition hover:text-white sm:block"
            >
              Staff access
            </button>

            <div className="hidden items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/5 px-3 py-1.5 text-xs text-emerald-300 sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Private by default
            </div>

            <div className="flex items-center gap-2 font-mono text-xs text-slate-300">
              <span className="rc-dot h-2 w-2 rounded-full" />
              {liveLabel}
            </div>
          </div>
        </header>

        <main className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 flex-col justify-center gap-4 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-8 lg:grid lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)] lg:items-center lg:gap-10 lg:px-10 lg:pb-14 xl:gap-16">
          {/* Left: headline + entry, stacked like a classic sign-in page */}
          <div className="flex flex-col gap-4 sm:gap-6">
            <div>
              <h1 className="rc-display text-[2.6rem] font-bold leading-[0.98] tracking-[-0.045em] text-white sm:text-6xl lg:text-[4.4rem] xl:text-[5rem]">
                Talk to
                <br />
                someone new.
              </h1>

              <div
                key={slideIndex}
                className="rc-accent mt-2 min-h-[1.5em] text-lg font-medium animate-[rcFade_.5s_ease-out] sm:mt-4 sm:text-2xl"
              >
                {slide.tagline}
              </div>
            </div>

            {/* Start card */}
            <section id="start-talking" className="w-full max-w-md">
              <div className="rc-panel rounded-[1.75rem] p-4 sm:p-6">
                <h2
                  className={`${ROOMY_BLOCK} rc-display mb-4 text-xl font-bold tracking-[-0.03em] text-white`}
                >
                  Pick a name and go.
                </h2>

                <div className="space-y-3">
                  {/* Name: floating label, like the X sign-in field */}
                  <div className="rc-field relative rounded-2xl">
                    <span
                      aria-hidden="true"
                      className="absolute left-2.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl text-sm font-bold text-[#06101a] transition-colors"
                      style={{
                        backgroundColor: trimmedName
                          ? colorForName(trimmedName)
                          : "rgba(255,255,255,.1)",
                      }}
                    >
                      {trimmedName ? trimmedName.charAt(0).toUpperCase() : "?"}
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
                      placeholder=" "
                      maxLength={30}
                      autoComplete="nickname"
                      enterKeyHint="go"
                      className="peer h-14 w-full rounded-2xl bg-transparent pl-14 pr-4 pt-4 text-base text-white outline-none"
                    />

                    <label
                      htmlFor="display-name"
                      className="pointer-events-none absolute left-14 top-2 text-[11px] font-medium text-slate-500 transition-all duration-150 peer-placeholder-shown:top-4 peer-placeholder-shown:text-base peer-focus:top-2 peer-focus:text-[11px] peer-focus:text-[color:var(--a)]"
                    >
                      What should people call you?
                    </label>
                  </div>

                  {/* Interests (optional, tucked away until wanted) */}
                  {showInterests ? (
                    <div>
                      <div className="rc-field rounded-2xl">
                        <input
                          id="interests"
                          value={interests}
                          onChange={(event) => setInterests(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              enter();
                            }
                          }}
                          aria-label="Interests, optional"
                          placeholder="Interests (optional): music, travel..."
                          enterKeyHint="go"
                          className="h-12 w-full rounded-2xl bg-transparent px-4 text-base text-white outline-none placeholder:text-slate-500"
                        />
                      </div>

                      <div className={`${ROOMY_FLEX} mt-2 flex-wrap gap-2`}>
                        {["Music", "Travel", "Movies", "Gaming"].map(
                          (interest) => (
                            <button
                              key={interest}
                              type="button"
                              onClick={() => addInterest(interest.toLowerCase())}
                              className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-slate-400 transition hover:border-white/30 hover:text-white"
                            >
                              + {interest}
                            </button>
                          ),
                        )}
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setInterestsOpen(true)}
                      className="inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-white"
                    >
                      <span className="rc-accent text-base leading-none">+</span>
                      Add interests
                      <span className="text-slate-600">optional</span>
                    </button>
                  )}

                  {/* Confirmations */}
                  <div className="space-y-2.5 pt-1">
                    <label className="flex cursor-pointer items-start gap-3 text-xs leading-snug text-slate-400 lg:text-sm lg:leading-5">
                      <input
                        type="checkbox"
                        checked={ageConfirmed}
                        onChange={(event) =>
                          setAgeConfirmed(event.target.checked)
                        }
                        className="mt-px h-[18px] w-[18px] shrink-0 lg:mt-0.5"
                        style={{ accentColor: "var(--a)" }}
                      />

                      <span>I confirm I am 18 years of age or older.</span>
                    </label>

                    <label className="flex cursor-pointer items-start gap-3 text-xs leading-snug text-slate-400 lg:text-sm lg:leading-5">
                      <input
                        type="checkbox"
                        checked={agreedRules}
                        onChange={(event) =>
                          setAgreedRules(event.target.checked)
                        }
                        className="mt-px h-[18px] w-[18px] shrink-0 lg:mt-0.5"
                        style={{ accentColor: "var(--a)" }}
                      />

                      <span>
                        I agree not to share sexual content, harass others, or
                        involve minors.
                      </span>
                    </label>
                  </div>

                  {/* Main button: the label says what is still missing */}
                  <button
                    type="button"
                    onClick={enter}
                    disabled={!canEnter}
                    className="rc-btn group flex h-12 w-full items-center justify-center gap-2 rounded-full text-[0.95rem] font-bold transition duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:hover:translate-y-0 lg:h-14"
                  >
                    {ctaLabel}

                    {canEnter && (
                      <Icon
                        name="arrow"
                        className="h-4 w-4 transition-transform group-hover:translate-x-1"
                      />
                    )}
                  </button>

                  {premiumIsError && (
                    <p role="alert" className="text-center text-xs text-red-300">
                      {premiumMessage}
                    </p>
                  )}

                  {/* "or" divider, same rhythm as the X page */}
                  <div
                    className={`${ROOMY_FLEX} items-center gap-3 text-xs text-slate-600`}
                    aria-hidden="true"
                  >
                    <span className="h-px flex-1 bg-white/10" />
                    or
                    <span className="h-px flex-1 bg-white/10" />
                  </div>

                  {/* Secondary pill: premium, recovery, privacy */}
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    onClick={() => setOptionsOpen(true)}
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-full border border-white/20 text-sm font-semibold text-slate-200 transition hover:bg-white/5"
                  >
                    <Icon name="sliders" className="h-4 w-4" />
                    Premium, recovery & privacy
                    {hasCode && (
                      <span className="text-[11px] font-medium text-emerald-300">
                        Code added
                      </span>
                    )}
                  </button>

                  <p
                    className={`${ROOMY_BLOCK} text-center text-[11px] leading-4 text-slate-500`}
                  >
                    By continuing, you agree to our{" "}
                    <Link to="/terms" className="text-slate-300 hover:text-white">
                      Terms
                    </Link>
                    ,{" "}
                    <Link to="/privacy" className="text-slate-300 hover:text-white">
                      Privacy Policy
                    </Link>{" "}
                    and{" "}
                    <Link to="/safety" className="text-slate-300 hover:text-white">
                      Safety rules
                    </Link>
                    .
                  </p>
                </div>
              </div>

              {/* Trust row, always visible under the card */}
              <ul className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px] text-slate-400 sm:text-xs lg:justify-start">
                <li className="flex items-center gap-1.5">
                  <Icon name="lock" className="rc-accent h-3.5 w-3.5" />
                  No signup
                </li>
                <li className="flex items-center gap-1.5">
                  <Icon name="camera" className="rc-accent h-3.5 w-3.5" />
                  Camera starts off
                </li>
                <li className="flex items-center gap-1.5">
                  <Icon name="skip" className="rc-accent h-3.5 w-3.5" />
                  Skip anytime
                </li>
              </ul>
            </section>
          </div>

          {/* Right (desktop): the big shining logo, like the X page */}
          <div className="relative hidden lg:block" aria-hidden="true">
            <div className="rc-tilt relative mx-auto aspect-square w-full max-w-[38rem]">
              <LogoMark className="h-full w-full" animated={!reducedMotion} />

              <FloatChip className="left-[-4%] top-[12%]">
                <span className="rc-dot h-2 w-2 rounded-full" />
                {waitingCount !== null && waitingCount > 0
                  ? `${waitingCount} ${waitingCount === 1 ? "person is" : "people are"
                  } looking for a chat`
                  : "Be the first one waiting"}
              </FloatChip>

              <FloatChip className="right-[-2%] top-[34%]">
                <Icon name="camera" className="rc-accent h-4 w-4" />
                Camera starts off
              </FloatChip>

              <FloatChip className="left-[2%] bottom-[14%]">
                <Icon name="skip" className="rc-accent h-4 w-4" />
                Skip anytime
              </FloatChip>

              <FloatChip className="right-[6%] bottom-[6%]">
                <Icon name="flag" className="rc-accent h-4 w-4" />
                Block and report
              </FloatChip>
            </div>
          </div>
        </main>
      </div>

      {/* BELOW THE FOLD */}
      <div className="relative z-10 mx-auto w-full max-w-7xl px-5 pb-16 sm:px-8 lg:px-10">
        {/* Trust: a plain list, not a wall of cards */}
        <section className="grid gap-8 border-t border-white/[0.07] py-16 sm:py-24 lg:grid-cols-[.8fr_1.2fr] lg:gap-16">
          <div>
            <h2 className="rc-display text-3xl font-bold tracking-[-0.04em] text-white sm:text-5xl">
              Built so you can relax and talk.
            </h2>

            <p className="mt-4 max-w-md text-slate-400">
              You decide who you talk to, what you share, and when it ends.
            </p>
          </div>

          <ul className="divide-y divide-white/[0.07] border-y border-white/[0.07]">
            <TrustRow
              icon="lock"
              title="No signup"
              text="No email or phone number needed. Your display name stays on this device."
            />

            <TrustRow
              icon="camera"
              title="Camera starts off"
              text="Nothing is shown until you decide to turn your camera on."
            />

            <TrustRow
              icon="sliders"
              title="You control every call"
              text="Mute, skip, leave, block or report whenever you need to."
            />

            <TrustRow
              icon="shield"
              title="18+ and clear rules"
              text="Everyone confirms they're 18 or older and agrees not to share sexual content, harass others, or involve minors."
            />
          </ul>
        </section>

        {/* How it works: this one really is a sequence */}
        <section className="pb-16 sm:pb-24">
          <h2 className="rc-display max-w-2xl text-3xl font-bold tracking-[-0.04em] text-white sm:text-5xl">
            Three steps to your first conversation.
          </h2>

          <ol className="relative mt-10 grid gap-8 md:grid-cols-3 md:gap-6">
            <div
              aria-hidden="true"
              className="rc-line absolute left-4 right-4 top-4 hidden h-px opacity-40 md:block"
            />

            <Step
              number="1"
              title="Pick a name"
              text="That's all you need. Add interests if you like."
            />

            <Step
              number="2"
              title="Talk one-to-one or join a room"
              text="Get an instant private call, or drop into a group room where people are already talking."
            />

            <Step
              number="3"
              title="Leave whenever you want"
              text="Skip, mute, block or report at any point. You stay in control."
            />
          </ol>
        </section>

        {/* FAQ preview */}
        <section className="border-t border-white/[0.07] py-16 sm:py-24">
          <div className="mx-auto max-w-3xl">
            <h2 className="rc-display text-center text-3xl font-bold tracking-[-0.04em] text-white sm:text-5xl">
              Questions before you start?
            </h2>

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
                className="rc-accent text-sm font-medium transition hover:text-white"
              >
                View all questions
              </Link>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="rc-panel flex flex-col items-center rounded-[2rem] px-6 py-14 text-center sm:px-10 sm:py-20">
          <LogoMark className="h-24 w-24" animated={!reducedMotion} />

          <h2 className="rc-display mx-auto mt-6 max-w-2xl text-4xl font-bold tracking-[-0.045em] text-white sm:text-6xl">
            Ready to meet someone new?
          </h2>

          <p className="mx-auto mt-5 max-w-xl text-slate-400">
            No profile to perfect. No endless setup. Just choose a name and
            start talking.
          </p>

          <button
            type="button"
            onClick={scrollToStart}
            className="rc-btn mt-8 inline-flex h-12 items-center gap-2 rounded-full px-7 text-sm font-bold transition hover:-translate-y-0.5"
          >
            Start talking
            <Icon name="arrow" className="h-4 w-4" />
          </button>
        </section>
      </div>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/[0.07]">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-8 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-10">
          <div>
            <div className="rc-display text-sm font-bold text-white">
              random<span className="rc-accent">connect</span>
            </div>

            <p className="mt-1 text-xs text-slate-500">
              Talk freely. Leave whenever you want.
            </p>
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-400">
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

            <button
              type="button"
              onClick={() => setStaffAccessOpen(true)}
              className="text-slate-500 transition hover:text-white"
            >
              Staff access
            </button>
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
        @import url("https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&display=swap");

        /* Registered so the accent colours can fade instead of snapping. */
        @property --a {
          syntax: "<color>";
          inherits: true;
          initial-value: #4CC9F0;
        }

        @property --b {
          syntax: "<color>";
          inherits: true;
          initial-value: #9D8DF1;
        }

        .rc-root {
          transition: --a 1.4s ease, --b 1.4s ease;
        }

        .rc-display {
          font-family: "Space Grotesk", ui-sans-serif, system-ui, -apple-system,
            "Segoe UI", Roboto, sans-serif;
        }

        .rc-accent { color: var(--a); }

        .rc-dot {
          background: var(--a);
          box-shadow: 0 0 12px var(--a);
        }

        .rc-glow-a {
          background: radial-gradient(closest-side,
            color-mix(in srgb, var(--a) 15%, transparent), transparent);
        }

        .rc-glow-b {
          background: radial-gradient(closest-side,
            color-mix(in srgb, var(--b) 13%, transparent), transparent);
        }

        .rc-line {
          background: linear-gradient(90deg, var(--a), var(--b));
        }

        .rc-btn {
          color: #041019;
          background-image: linear-gradient(100deg, var(--a), var(--b));
          box-shadow: 0 14px 44px color-mix(in srgb, var(--a) 24%, transparent);
        }

        .rc-btn:hover:not(:disabled) {
          box-shadow: 0 18px 56px color-mix(in srgb, var(--a) 34%, transparent);
        }

        .rc-btn:disabled {
          color: #7c8aa5;
          background-image: none;
          background-color: rgba(255, 255, 255, 0.08);
          box-shadow: none;
        }

        .rc-panel {
          position: relative;
          background: linear-gradient(180deg,
            rgba(16, 26, 52, 0.82), rgba(9, 15, 32, 0.88));
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 30px 80px rgba(0, 0, 0, 0.45);
          backdrop-filter: blur(18px);
        }

        .rc-panel::before {
          content: "";
          position: absolute;
          inset: 0 28px auto 28px;
          height: 1px;
          background: linear-gradient(90deg,
            transparent, var(--a), var(--b), transparent);
          opacity: 0.7;
        }

        .rc-field {
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(0, 0, 0, 0.28);
          transition: border-color 0.15s, box-shadow 0.15s;
        }

        .rc-field:focus-within {
          border-color: color-mix(in srgb, var(--a) 75%, transparent);
          box-shadow: 0 0 0 4px color-mix(in srgb, var(--a) 12%, transparent);
        }

        .rc-icon {
          color: var(--a);
          background: color-mix(in srgb, var(--a) 12%, transparent);
          border: 1px solid color-mix(in srgb, var(--a) 26%, transparent);
        }

        .rc-tilt {
          transform: perspective(1100px)
            rotateY(calc(var(--px, 0) * 7deg))
            rotateX(calc(var(--py, 0) * -7deg));
          transition: transform 0.25s ease-out;
        }

        .rc-root a:focus-visible,
        .rc-root button:focus-visible,
        .rc-root input[type="checkbox"]:focus-visible {
          outline: 2px solid var(--a);
          outline-offset: 2px;
        }

        @keyframes rcFade {
          from { opacity: 0; transform: translateY(7px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes landingSheetUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
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

          .rc-tilt { transform: none !important; }
        }
      `}</style>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Small pieces                                                       */
/* ------------------------------------------------------------------ */

function FloatChip({ className = "", children }) {
  return (
    <div
      className={`absolute hidden items-center gap-2 rounded-full border border-white/10 bg-[#0a1020]/85 px-3.5 py-2 text-xs text-slate-200 shadow-xl shadow-black/40 backdrop-blur-xl xl:flex ${className}`}
    >
      {children}
    </div>
  );
}

function TrustRow({ icon, title, text }) {
  return (
    <li className="flex items-start gap-4 py-5 sm:gap-5 sm:py-6">
      <span className="rc-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-xl">
        <Icon name={icon} />
      </span>

      <div>
        <h3 className="text-base font-semibold text-white sm:text-lg">
          {title}
        </h3>

        <p className="mt-1 max-w-xl text-sm leading-6 text-slate-400">
          {text}
        </p>
      </div>
    </li>
  );
}

function Step({ number, title, text }) {
  return (
    <li className="relative flex gap-4 md:block">
      <span className="rc-icon relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#050816] text-sm font-bold">
        {number}
      </span>

      <div className="md:mt-5">
        <h3 className="text-lg font-semibold text-white">{title}</h3>

        <p className="mt-2 max-w-sm text-sm leading-6 text-slate-400">
          {text}
        </p>
      </div>
    </li>
  );
}

function FaqItem({ question, answer }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-5 px-5 py-5 text-left"
      >
        <span className="text-sm font-medium text-white">{question}</span>

        <span
          className={`shrink-0 text-slate-500 transition-transform ${open ? "rotate-45" : ""
            }`}
          aria-hidden="true"
        >
          +
        </span>
      </button>

      {open && (
        <div className="border-t border-white/[0.06] px-5 pb-5 pt-4">
          <p className="text-sm leading-6 text-slate-400">{answer}</p>
        </div>
      )}
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
              className="rc-display text-lg font-bold tracking-[-0.03em] text-white"
            >
              Premium, recovery & privacy
            </h2>

            <p className="mt-0.5 text-xs text-slate-500">
              All optional. You can start without any of this.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="h-10 shrink-0 rounded-full border border-white/15 px-4 text-sm font-medium text-slate-200 transition hover:bg-white/5"
          >
            Done
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
          {/* Premium */}
          <div>
            <p className="rc-accent text-xs font-semibold">
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
              className="rc-field mt-2 h-12 w-full rounded-xl px-3 text-base text-white outline-none placeholder:text-slate-600"
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
              className="rc-field mt-2 h-12 w-full rounded-xl px-3 text-base text-white outline-none placeholder:text-slate-600"
            />

            {premiumMessage && (
              <p
                className={`mt-2 text-xs ${premiumIsError ? "text-red-300" : "text-emerald-300"
                  }`}
              >
                {premiumMessage}
              </p>
            )}
          </div>

          {/* Music */}
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
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

            <div className="space-y-2 text-xs text-slate-400">
              <p>✓ No email or phone number required</p>
              <p>✓ Your display name stays on this device</p>
              <p>✓ Camera stays off until you enable it</p>
            </div>

            <button
              type="button"
              onClick={handleForget}
              className="rc-accent mt-3 text-xs underline underline-offset-4 transition hover:text-white"
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
      setError(requestError?.message || "Unable to verify staff access.");
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
            <h2
              id="staff-access-title"
              className="rc-display text-2xl font-bold tracking-[-0.035em] text-white"
            >
              Enter as staff
            </h2>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close staff access"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 text-xl text-slate-500 transition hover:bg-white/5 hover:text-white"
            >
              ×
            </button>
          </div>

          <p className="mt-3 text-sm leading-6 text-slate-400">
            The server verifies your account, role, and registered device
            before entry.
          </p>
        </div>

        <div className="p-5 sm:p-6">
          <label
            htmlFor="staff-password"
            className="mb-2 block text-sm font-medium text-slate-300"
          >
            Staff password
          </label>

          <div className="rc-field rounded-2xl">
            <input
              id="staff-password"
              autoFocus
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              placeholder="Enter password"
              className="h-12 w-full rounded-2xl bg-transparent px-4 text-base text-white outline-none placeholder:text-slate-600"
            />
          </div>

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
            className="rc-btn mt-5 flex h-12 w-full items-center justify-center rounded-full px-4 text-sm font-bold transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:hover:translate-y-0"
          >
            {busy ? "Verifying..." : "Continue securely"}
          </button>
        </div>
      </form>
    </div>
  );
}