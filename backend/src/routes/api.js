import { Router } from "express";
import crypto from "crypto";
import Report from "../models/Report.js";
import Room from "../models/Room.js";
import { matchmaker } from "../services/matchmaker.js";
import { roomState } from "../services/roomState.js";
import { containsProfanity } from "../utils/profanityFilter.js";

const MAX_ROOMS_PER_USER = 2;
const ADMIN_COOKIE = "randomconnect_admin";
const ADMIN_SESSION_MS = 8 * 60 * 60 * 1000;

const router = Router();

function signAdminSession(issuedAt) {
  return crypto
    .createHmac("sha256", process.env.ADMIN_SESSION_SECRET || "")
    .update(String(issuedAt))
    .digest("base64url");
}

function hasValidAdminSession(req) {
  const cookieHeader = req.headers.cookie || "";
  const cookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ADMIN_COOKIE}=`));
  if (!cookie) return false;

  let value;
  try {
    value = decodeURIComponent(cookie.slice(ADMIN_COOKIE.length + 1));
  } catch {
    return false;
  }
  const [issuedAt, signature] = value.split(".");
  const issued = Number(issuedAt);
  if (!Number.isSafeInteger(issued) || Date.now() - issued > ADMIN_SESSION_MS || Date.now() < issued) return false;

  const expected = signAdminSession(issuedAt);
  const actualBuffer = Buffer.from(signature || "");
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function requireAdmin(req, res, next) {
  if (!hasValidAdminSession(req)) return res.status(401).json({ error: "Admin authentication required" });
  next();
}

function passwordsMatch(candidate, configured) {
  const candidateBuffer = Buffer.from(String(candidate || ""));
  const configuredBuffer = Buffer.from(configured);
  return candidateBuffer.length === configuredBuffer.length && crypto.timingSafeEqual(candidateBuffer, configuredBuffer);
}

// Wraps an async route handler so a rejected promise (bad input, DB down,
// invalid ObjectId, etc.) turns into a proper JSON error response instead of
// an unhandled rejection that leaves the request hanging with no reply.
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get("/health", (_req, res) => res.json({ ok: true }));

router.get("/stats", (_req, res) => {
  res.json({ waiting: matchmaker.queueSize() });
});

router.post("/admin/login", (req, res) => {
  const { password } = req.body || {};
  if (!process.env.ADMIN_PASSWORD || !process.env.ADMIN_SESSION_SECRET) {
    return res.status(503).json({ error: "Admin access is not configured" });
  }
  if (!passwordsMatch(password, process.env.ADMIN_PASSWORD)) {
    return res.status(401).json({ error: "Incorrect admin password" });
  }

  const issuedAt = Date.now();
  const token = `${issuedAt}.${signAdminSession(issuedAt)}`;
  const crossOrigin = process.env.NODE_ENV === "production";
  res.setHeader(
    "Set-Cookie",
    `${ADMIN_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/api/admin; Max-Age=${ADMIN_SESSION_MS / 1000}; SameSite=${crossOrigin ? "None; Secure" : "Lax"}`
  );
  res.json({ ok: true, expiresAt: issuedAt + ADMIN_SESSION_MS });
});

router.post("/admin/logout", (_req, res) => {
  res.setHeader("Set-Cookie", `${ADMIN_COOKIE}=; HttpOnly; Path=/api/admin; Max-Age=0; SameSite=Lax`);
  res.json({ ok: true });
});

router.get("/admin/session", requireAdmin, (_req, res) => res.json({ authenticated: true }));

// --- Group rooms -----------------------------------------------------------

// Anyone can create a room — no auth required, matching the anonymous,
// drop-in nature of the rest of the product. Rate limiting (server.js)
// keeps this from being spammed.
router.post(
  "/rooms",
  asyncRoute(async (req, res) => {
    const { name, topic, mode, maxParticipants, fingerprint } = req.body || {};

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Room name is required" });
    }
    if (!fingerprint) {
      return res.status(400).json({ error: "Missing fingerprint" });
    }
    if (containsProfanity(name)) {
      return res.status(400).json({ error: "This group name is not allowed. Please choose a different name." });
    }

    // Enforced here, not just in the UI — a direct API call can't bypass
    // this. Uses the same fingerprint-based ownership already used for room
    // moderator checks elsewhere, rather than a separate identity system.
    const existingCount = await Room.countDocuments({ createdByFingerprint: fingerprint });
    if (existingCount >= MAX_ROOMS_PER_USER) {
      return res.status(403).json({
        error: `You can create a maximum of ${MAX_ROOMS_PER_USER} groups. Please edit or delete an existing group before creating another.`,
      });
    }

    const room = await Room.create({
      name: name.trim().slice(0, 60),
      topic: (topic || "").trim().slice(0, 140),
      mode: mode === "video" ? "video" : "voice",
      maxParticipants: Math.min(Math.max(Number(maxParticipants) || 8, 2), 12),
      createdByFingerprint: fingerprint,
    });

    res.status(201).json(room);
  })
);

// Lists rooms with at least one person live in them first, then recently
// created empty rooms, so the list always feels alive rather than showing
// ghost towns.
router.get(
  "/rooms",
  asyncRoute(async (_req, res) => {
    const rooms = await Room.find().sort({ lastActiveAt: -1 }).limit(50).lean();
    const liveCounts = roomState.liveCounts();

    const withPresence = rooms
      .map((r) => ({ ...r, liveCount: liveCounts[r._id.toString()] || 0 }))
      .sort((a, b) => b.liveCount - a.liveCount || new Date(b.lastActiveAt) - new Date(a.lastActiveAt));

    res.json(withPresence);
  })
);

router.get(
  "/rooms/mine",
  asyncRoute(async (req, res) => {
    const { fingerprint } = req.query;
    if (!fingerprint) return res.status(400).json({ error: "Missing fingerprint" });

    const rooms = await Room.find({ createdByFingerprint: fingerprint })
      .sort({ createdAt: -1 })
      .lean();
    const liveCounts = roomState.liveCounts();
    res.json(rooms.map((room) => ({ ...room, liveCount: liveCounts[room._id.toString()] || 0 })));
  })
);

router.get(
  "/rooms/:id",
  asyncRoute(async (req, res) => {
    const room = await Room.findById(req.params.id).lean();
    if (!room) return res.status(404).json({ error: "Room not found" });
    res.json({ ...room, liveCount: roomState.participantCount(req.params.id) });
  })
);
// Editing does NOT count against the 2-group limit — only creation does.
router.patch(
  "/rooms/:id",
  asyncRoute(async (req, res) => {
    const { name, topic, fingerprint } = req.body || {};
    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ error: "Room not found" });
    if (room.createdByFingerprint !== fingerprint) {
      return res.status(403).json({ error: "Only the creator can edit this group." });
    }

    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ error: "Room name is required" });
      if (containsProfanity(name)) {
        return res.status(400).json({ error: "This group name is not allowed. Please choose a different name." });
      }
      room.name = name.trim().slice(0, 60);
    }
    if (topic !== undefined) room.topic = topic.trim().slice(0, 140);

    await room.save();
    res.json(room);
  })
);

// fingerprint passed as a query param rather than a DELETE body — some
// proxies/clients strip request bodies on DELETE, so this avoids that class
// of bug entirely rather than relying on every client sending it correctly.
router.delete(
  "/rooms/:id",
  asyncRoute(async (req, res) => {
    const { fingerprint } = req.query;
    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ error: "Room not found" });
    if (room.createdByFingerprint !== fingerprint) {
      return res.status(403).json({ error: "Only the creator can delete this group." });
    }

    await Room.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  })
);

// Admin report endpoints are protected by the server-side session above.
router.get(
  "/admin/reports",
  requireAdmin,
  asyncRoute(async (req, res) => {
    const status = req.query.status || "pending";
    const reports = await Report.find({ status }).sort({ severity: -1, createdAt: -1 }).limit(100);
    res.json(reports);
  })
);

router.patch(
  "/admin/reports/:id",
  requireAdmin,
  asyncRoute(async (req, res) => {
    const { status } = req.body || {};
    if (!["pending", "reviewed", "dismissed"].includes(status)) {
      return res.status(400).json({ error: "Invalid report status" });
    }
    const report = await Report.findByIdAndUpdate(
      req.params.id,
      { status, reviewedAt: new Date(), reviewedBy: "admin" },
      { new: true }
    );
    if (!report) return res.status(404).json({ error: "Report not found" });
    res.json(report);
  })
);

// Catches: Mongoose CastError (bad ObjectId), validation errors, DB
// connection failures, and anything else forwarded via next(err) above —
// turns them into a JSON response instead of Express's default HTML error
// page or a silently hanging connection.
router.use((err, _req, res, _next) => {
  console.error("[api] unhandled route error:", err.message);
  const status = err.name === "CastError" || err.name === "ValidationError" ? 400 : 500;
  res.status(status).json({ error: status === 400 ? "Invalid request" : "Internal server error" });
});

export default router;
