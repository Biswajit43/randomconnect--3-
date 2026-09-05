/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0E1220",       // base background — deep indigo-charcoal
        panel: "#161B2E",     // card/panel surface
        panel2: "#1E2440",    // elevated surface
        signal: "#4CC9F0",    // primary accent — "live signal" cyan
        signal2: "#7BE0D6",   // secondary signal tone
        coral: "#FF6B6B",     // stop / danger / skip
        violet: "#9D8DF1",    // secondary accent
        mist: "#8792B0",      // muted text
      },
      fontFamily: {
        display: ["'Space Grotesk'", "sans-serif"],
        body: ["'Inter'", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      keyframes: {
        pulseRing: {
          "0%": { transform: "scale(0.9)", opacity: "0.7" },
          "70%": { transform: "scale(1.6)", opacity: "0" },
          "100%": { transform: "scale(1.6)", opacity: "0" },
        },
        drift: {
          "0%,100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-6px)" },
        },
        fadeInUp: {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.8)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        spinSlow: {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        checklistIn: {
          "0%": { opacity: "0", transform: "translateX(-6px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(48px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        blink: {
          "0%,49%": { opacity: "1" },
          "50%,100%": { opacity: "0" },
        },
        bounceHint: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(6px)" },
        },
      },
      animation: {
        pulseRing: "pulseRing 1.8s cubic-bezier(0.2,0.6,0.4,1) infinite",
        drift: "drift 4s ease-in-out infinite",
        fadeInUp: "fadeInUp 0.7s cubic-bezier(0.16,1,0.3,1) both",
        scaleIn: "scaleIn 0.35s cubic-bezier(0.34,1.56,0.64,1) both",
        spinSlow: "spinSlow 7s linear infinite",
        checklistIn: "checklistIn 0.4s ease both",
        slideUp: "slideUp 0.65s cubic-bezier(0.16,1,0.3,1) both",
        blink: "blink 1s steps(1) infinite",
        bounceHint: "bounceHint 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};