import { io } from "socket.io-client";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:5000";

if (import.meta.env.PROD && !import.meta.env.VITE_SERVER_URL) {
  // This is exactly the bug that causes "works locally, CORS error in
  // production": Vite bakes env vars into the bundle at BUILD time, not
  // runtime. If VITE_SERVER_URL wasn't set in Vercel's project settings
  // before the build ran, the app silently falls back to localhost and
  // every request in production 404s/CORS-fails against your own machine.
  console.error(
    "[randomconnect] VITE_SERVER_URL is not set — this build is pointed at localhost:5000. " +
      "Set it in your hosting platform's environment variables and trigger a new deploy (not just a restart)."
  );
}

// Lazily connected so we don't open a socket until the user actually
// consents (age gate) and lands in the queue.
export const socket = io(SERVER_URL, { autoConnect: false, withCredentials: true });

export { SERVER_URL };

/** A lightweight, non-cryptographic browser fingerprint. Not spoof-proof —
 * pair with server-side IP hashing for ban enforcement (see moderation.js). */
export function getFingerprint() {
  const key = "rc_fp";
  let fp = localStorage.getItem(key);
  if (!fp) {
    fp = crypto.randomUUID();
    localStorage.setItem(key, fp);
  }
  return fp;
}

/** The name the person entered on their way in — persisted so it carries
 * across the 1-to-1 call, every group room, and repeat visits. */
export function getDisplayName() {
  return localStorage.getItem("rc_name") || "";
}

export function setDisplayName(name) {
  const clean = (name || "").trim().slice(0, 30);
  if (clean) localStorage.setItem("rc_name", clean);
  return clean;
}
