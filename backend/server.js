import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";

import { connectDB } from "./src/config/db.js";
import apiRoutes from "./src/routes/api.js";
import { registerSignaling } from "./src/sockets/signaling.js";
import { registerGroupRooms } from "./src/sockets/groupRooms.js";
import { trackSocket } from "./src/services/presence.js";

dotenv.config();

// Last line of defense: if something still throws or rejects outside the
// per-route/per-socket-handler guards added throughout this codebase, log it
// loudly instead of letting the process die silently or leave a request
// hanging with no response. This should rarely fire — it's a safety net,
// not a substitute for the try/catch wrapping already in api.js,
// groupRooms.js, and signaling.js.
process.on("unhandledRejection", (reason) => {
  console.error("[server] unhandled promise rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[server] uncaught exception:", err);
});

const app = express();
const server = http.createServer(app);
app.set("trust proxy", 1);

// CLIENT_URL supports a comma-separated list — Vercel gives you a stable
// production domain (e.g. myapp.vercel.app) plus a fresh preview URL on
// every PR/branch deploy, and a single-origin CORS config would silently
// break every one of those preview links. A "*.vercel.app" style wildcard
// entry (matched as a suffix, not a regex) also covers unlisted previews.
//
// Trailing slashes are stripped on both sides before comparing — a browser's
// Origin header never includes one (it's always "https://x.com", never
// "https://x.com/"), so "https://x.com/" in CLIENT_URL would otherwise never
// match anything and silently break every request. This one bites almost
// everyone at least once, so it's normalized away here instead of trusting
// every future .env edit to get it right.
const stripTrailingSlash = (s) => s.replace(/\/+$/, "");

const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:5173")
  .split(",")
  .map((o) => stripTrailingSlash(o.trim()))
  .filter(Boolean);

function isOriginAllowed(origin) {
  if (!origin) return true; // same-origin / curl / server-to-server — no Origin header sent
  const normalized = stripTrailingSlash(origin);
  return allowedOrigins.some((allowed) =>
    allowed.startsWith("*.") ? normalized.endsWith(allowed.slice(1)) : normalized === allowed
  );
}

const corsOrigin = (origin, callback) => {
  const allowed = isOriginAllowed(origin);
  if (!allowed) {
    // Logged so a misconfigured CLIENT_URL shows up in Render's logs
    // immediately instead of only surfacing as a browser console error the
    // developer has to go hunting for.
    console.warn(`[server] blocked CORS request from origin "${origin}" — not in CLIENT_URL allowlist`);
  }
  callback(null, allowed);
};

app.use(helmet());
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.use("/api", apiRoutes);

const io = new Server(server, {
  cors: { origin: corsOrigin, methods: ["GET", "POST"], credentials: true },
  // Cap payloads — signaling messages are small; this blocks abuse of the
  // socket as a generic data channel.
  maxHttpBufferSize: 1e5,
});

io.on("connection", trackSocket);
registerSignaling(io);
registerGroupRooms(io);

const PORT = process.env.PORT || 5000;

connectDB().finally(() => {
  server.listen(PORT, () => console.log(`[server] listening on :${PORT}`));
});
