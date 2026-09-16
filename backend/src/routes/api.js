import { Router } from "express";
import Report from "../models/Report.js";
import BannedUser from "../models/BannedUser.js";
import AuditLog from "../models/AuditLog.js";
import PremiumInvite from "../models/PremiumInvite.js";
import PremiumGrant from "../models/PremiumGrant.js";
import Room from "../models/Room.js";
import AdminDevice from "../models/AdminDevice.js";
import { matchmaker } from "../services/matchmaker.js";
import { roomState } from "../services/roomState.js";
import { containsProfanity } from "../utils/profanityFilter.js";
import { connectedUsers, adminPresence, abuseSignals, disconnectMatching } from "../services/presence.js";
import { recordAudit } from "../services/audit.js";
import { addPremiumDays, createInviteCode, createReferralCode, hashPremiumValue } from "../services/premium.js";
import { getCommunityStatus, recordSuccessfulReferral } from "../services/community.js";
import {
  ADMIN_COOKIE,
  ADMIN_SESSION_MS,
  adminDeviceCookieName,
  adminSessionFromToken,
  createDeviceToken,
  deviceTokenFromCookieHeader,
  hashDeviceToken,
  isAdminCookieHeader,
  signAdminSession,
  staffAccountFromPassword,
  staffAccountFromSession,
} from "../services/adminAuth.js";

const MAX_ROOMS_PER_USER = 2;
const ADMIN_LEASE_MS = 2 * 60 * 1000;
const router = Router();

function hasValidAdminSession(req) {
  return isAdminCookieHeader(req.headers.cookie || "");
}

function getAdminRole(req) {
  const cookie = (req.headers.cookie || "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ADMIN_COOKIE}=`));
  if (!cookie) return null;
  try {
    return adminSessionFromToken(decodeURIComponent(cookie.slice(ADMIN_COOKIE.length + 1)))?.role || null;
  } catch {
    return null;
  }
}

async function isRegisteredAdminDevice(cookieHeader) {
  const session = getAdminSessionFromCookieHeader(cookieHeader);
  const accountId = session?.accountId;
  const deviceToken = deviceTokenFromCookieHeader(cookieHeader, accountId);
  if (!deviceToken) return false;
  const registered = await AdminDevice.findById(accountId).lean();
  return Boolean(
    registered &&
    registered.deviceHash === hashDeviceToken(deviceToken) &&
    Date.now() - new Date(registered.lastSeenAt || registered.claimedAt).getTime() <= ADMIN_LEASE_MS
  );
}

async function touchAdminDevice(cookieHeader) {
  const session = getAdminSessionFromCookieHeader(cookieHeader);
  const accountId = session?.accountId;
  const deviceToken = deviceTokenFromCookieHeader(cookieHeader, accountId);
  if (!accountId || !deviceToken) return;
  await AdminDevice.updateOne(
    { _id: accountId, deviceHash: hashDeviceToken(deviceToken) },
    { $set: { lastSeenAt: new Date() } }
  );
}

function getAdminRoleFromCookieHeader(cookieHeader) {
  return getAdminSessionFromCookieHeader(cookieHeader)?.role || null;
}

function getAdminSessionFromCookieHeader(cookieHeader) {
  const cookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ADMIN_COOKIE}=`));
  if (!cookie) return null;
  try {
    return adminSessionFromToken(decodeURIComponent(cookie.slice(ADMIN_COOKIE.length + 1))) || null;
  } catch {
    return null;
  }
}

async function requireAdmin(req, res, next) {
  try {
    if (!hasValidAdminSession(req) || !(await isRegisteredAdminDevice(req.headers.cookie || ""))) {
      return res.status(401).json({ error: "Admin authentication required on the registered device" });
    }
  } catch (err) {
    console.error("[api] admin device check failed:", err.message);
    return res.status(503).json({ error: "Admin authentication is temporarily unavailable" });
  }
  req.adminSession = getAdminSessionFromCookieHeader(req.headers.cookie || "");
  req.adminAccount = staffAccountFromSession(req.adminSession) || { id: req.adminSession?.accountId, role: req.adminSession?.role, displayName: "Admin" };
  req.adminSession = { ...req.adminSession, displayName: req.adminAccount.displayName };
  await touchAdminDevice(req.headers.cookie || "");
  next();
}

function requireDeveloper(req, res, next) {
  if (getAdminRole(req) !== "developer") return res.status(403).json({ error: "Developer permission required" });
  next();
}

// Wraps an async route handler so a rejected promise (bad input, DB down,
// invalid ObjectId, etc.) turns into a proper JSON error response instead of
// an unhandled rejection that leaves the request hanging with no reply.
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get("/health", (_req, res) => res.json({ ok: true }));

router.get("/stats", (_req, res) => {
  res.json({ waiting: matchmaker.queueSize() });
});

router.post("/admin/login", asyncRoute(async (req, res) => {
  const { password } = req.body || {};
  const account = staffAccountFromPassword(password);
  if (!process.env.ADMIN_SESSION_SECRET) {
    return res.status(503).json({ error: "Admin access is not configured" });
  }
  if (!account) return res.status(401).json({ error: "Incorrect staff password" });
  const { role, id: accountId, displayName } = account;

  const cookieHeader = req.headers.cookie || "";
  let deviceToken = deviceTokenFromCookieHeader(cookieHeader, accountId);
  const registeredDevice = await AdminDevice.findById(accountId).lean();
  const registeredIsActive = registeredDevice && Date.now() - new Date(registeredDevice.lastSeenAt || registeredDevice.claimedAt).getTime() <= ADMIN_LEASE_MS;
  if (registeredIsActive && (!deviceToken || registeredDevice.deviceHash !== hashDeviceToken(deviceToken))) {
    return res.status(403).json({ error: "Admin access is locked to the registered device" });
  }
  if (!registeredDevice || !registeredIsActive) {
    deviceToken = createDeviceToken();
    await AdminDevice.findOneAndUpdate(
      { _id: accountId },
      { deviceHash: hashDeviceToken(deviceToken), claimedAt: new Date(), lastSeenAt: new Date() },
      { upsert: true, new: true }
    );
  } else {
    await AdminDevice.updateOne({ _id: accountId }, { $set: { lastSeenAt: new Date() } });
  }

  const issuedAt = Date.now();
  const token = `${issuedAt}.${role}.${accountId}.${signAdminSession(issuedAt, role, accountId)}`;
  const crossOrigin = process.env.NODE_ENV === "production";
  res.setHeader("Set-Cookie", [
    `${ADMIN_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${ADMIN_SESSION_MS / 1000}; SameSite=${crossOrigin ? "None; Secure" : "Lax"}`,
    `${adminDeviceCookieName(accountId)}=${encodeURIComponent(deviceToken)}; HttpOnly; Path=/; Max-Age=31536000; SameSite=${crossOrigin ? "None; Secure" : "Lax"}`,
  ]);
  res.json({ ok: true, role, displayName, expiresAt: issuedAt + ADMIN_SESSION_MS });
}));

router.post("/admin/logout", asyncRoute(async (req, res) => {
  if (hasValidAdminSession(req) && await isRegisteredAdminDevice(req.headers.cookie || "")) {
    await AdminDevice.deleteOne({ _id: getAdminSessionFromCookieHeader(req.headers.cookie || "")?.accountId });
  }
  const accountId = getAdminSessionFromCookieHeader(req.headers.cookie || "")?.accountId || "admin";
  res.setHeader("Set-Cookie", [
    `${ADMIN_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`,
    `${adminDeviceCookieName(accountId)}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`,
  ]);
  res.json({ ok: true });
}));

router.get("/admin/session", requireAdmin, (req, res) => res.json({ authenticated: true, role: getAdminRole(req) }));

router.get("/admin/premium-invites", requireAdmin, asyncRoute(async (_req, res) => {
  res.json(await PremiumInvite.find().sort({ createdAt: -1 }).limit(100).lean());
}));

router.post("/admin/premium-invites", requireAdmin, asyncRoute(async (req, res) => {
  const { label, maxUses, days = 30 } = req.body || {};
  const safeDays = Math.min(Math.max(Number(days) || 30, 1), 30);
  const safeMaxUses = Math.min(Math.max(Number(maxUses) || 10, 1), 1000);
  const code = createInviteCode();
  const invite = await PremiumInvite.create({
    codeHash: hashPremiumValue(code),
    label: String(label || "Premium invite").trim().slice(0, 80),
    createdBy: req.adminSession?.accountId || "admin",
    kind: "admin",
    maxUses: safeMaxUses,
    expiresAt: new Date(Date.now() + safeDays * 24 * 60 * 60 * 1000),
  });
  await recordAudit({ action: "premium.invite_created", actor: req.adminSession, targetId: invite._id.toString(), metadata: { maxUses: safeMaxUses, days: safeDays } });
  res.status(201).json({ ...invite.toObject(), code });
}));

router.post("/premium/referral", asyncRoute(async (req, res) => {
  const { fingerprint } = req.body || {};
  if (!fingerprint) return res.status(400).json({ error: "Device identity is required" });
  const code = createReferralCode(fingerprint);
  const codeHash = hashPremiumValue(code);
  const invite = await PremiumInvite.create({
    codeHash,
    kind: "referral",
    label: "Friend referral",
    createdBy: fingerprint,
    ownerFingerprint: fingerprint,
    maxUses: 1,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });
  const community = await getCommunityStatus(fingerprint).catch((error) => {
    console.error("[community] status lookup failed:", error.message);
    return null;
  });
  res.status(201).json({ code, expiresAt: invite.expiresAt, uses: 0, maxUses: 1, community });
}));

router.get("/community/status", asyncRoute(async (req, res) => {
  const fingerprint = String(req.query.fingerprint || "");
  if (!fingerprint) return res.status(400).json({ error: "Device identity is required" });
  res.json(await getCommunityStatus(fingerprint));
}));

router.get("/premium/status", asyncRoute(async (req, res) => {
  const fingerprint = String(req.query.fingerprint || "");
  if (!fingerprint) return res.status(400).json({ error: "Device identity is required" });
  const grant = await PremiumGrant.findOne({ fingerprint, expiresAt: { $gt: new Date() } }).sort({ expiresAt: -1 }).lean();
  res.json({ active: Boolean(grant), expiresAt: grant?.expiresAt || null });
}));

router.post("/premium/redeem", asyncRoute(async (req, res) => {
  const { code, fingerprint } = req.body || {};
  if (!code || !fingerprint) return res.status(400).json({ error: "Invite code and device identity are required" });
  const now = new Date();
  const candidate = await PremiumInvite.findOne({ codeHash: hashPremiumValue(code), expiresAt: { $gt: now } }).lean();
  if (!candidate) return res.status(400).json({ error: "Invite is invalid or expired" });
  if (candidate.kind === "referral" && candidate.ownerFingerprint === fingerprint) return res.status(400).json({ error: "You cannot redeem your own invite" });
  const invite = await PremiumInvite.findOneAndUpdate(
    { _id: candidate._id, expiresAt: { $gt: now }, $expr: { $lt: ["$uses", "$maxUses"] } },
    { $inc: { uses: 1 } },
    { new: true }
  );
  if (!invite) return res.status(400).json({ error: "Invite is invalid, expired, or fully used" });
  const recipientGrant = await addPremiumDays(fingerprint, invite._id, 30);
  let ownerGrant = null;
  if (invite.kind === "referral" && invite.ownerFingerprint && invite.ownerFingerprint !== fingerprint) {
    ownerGrant = await addPremiumDays(invite.ownerFingerprint, invite._id, 30);
    // Premium activation must not fail if the separate community-progress write has a transient DB issue.
    await recordSuccessfulReferral(invite.ownerFingerprint).catch((error) => {
      console.error("[community] referral tracking failed:", error.message);
    });
  }
  res.json({ ok: true, token: recipientGrant.token, expiresAt: recipientGrant.expiresAt, ownerExpiresAt: ownerGrant?.expiresAt || null });
}));

router.get("/admin/audit", requireAdmin, asyncRoute(async (_req, res) => {
  res.json(await AuditLog.find().sort({ createdAt: -1 }).limit(200).lean());
}));

router.get("/admin/bans", requireAdmin, asyncRoute(async (_req, res) => {
  res.json(await BannedUser.find().sort({ createdAt: -1 }).limit(200).lean());
}));

router.post("/admin/bans", requireAdmin, asyncRoute(async (req, res) => {
  const { fingerprint, ipHash, reason, duration } = req.body || {};
  if (!fingerprint && !ipHash) return res.status(400).json({ error: "A user/device or IP target is required" });
  if (ipHash && String(ipHash).length !== 64) return res.status(400).json({ error: "Invalid IP target" });
  const allowedDurations = { "5m": 5, "10m": 10, "30m": 30, "1h": 60, permanent: null };
  if (!Object.hasOwn(allowedDurations, duration)) return res.status(400).json({ error: "Invalid ban duration" });
  const minutes = allowedDurations[duration];
  const ban = await BannedUser.create({
    fingerprint: fingerprint ? String(fingerprint).slice(0, 200) : undefined,
    ipHash: ipHash || undefined,
    matchMode: fingerprint ? "fingerprint" : "ip",
    reason: String(reason || "Admin moderation action").slice(0, 500),
    createdBy: req.adminSession?.accountId || "admin",
    expiresAt: minutes === null ? null : new Date(Date.now() + minutes * 60 * 1000),
  });
  const disconnected = disconnectMatching({ fingerprint, ipHash });
  await recordAudit({ action: "ban.created", actor: req.adminSession, targetId: fingerprint || ipHash, metadata: { duration, disconnected } });
  res.status(201).json({ ...ban.toObject(), disconnected });
}));

router.delete("/admin/bans/:id", requireAdmin, asyncRoute(async (req, res) => {
  const ban = await BannedUser.findByIdAndDelete(req.params.id).lean();
  if (!ban) return res.status(404).json({ error: "Ban not found" });
  await recordAudit({ action: "ban.removed", actor: req.adminSession, targetId: ban.fingerprint || ban.ipHash });
  res.json({ ok: true });
}));

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
    if (containsProfanity(name) || containsProfanity(topic || "")) {
      return res.status(400).json({
        error: "Warning: abusive words are not allowed in room names or topics. Please choose respectful words. Repeated abuse may lead to a ban.",
        warning: true,
      });
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

router.get(
  "/admin/rooms",
  requireAdmin,
  asyncRoute(async (_req, res) => {
    const rooms = await Room.find().sort({ lastActiveAt: -1 }).limit(100).lean();
    const liveCounts = roomState.liveCounts();
    const members = adminPresence();
    res.json(rooms.map((room) => ({
      ...room,
      activeCount: liveCounts[room._id.toString()] || 0,
      members: (members[room._id.toString()] || []).map((member) => ({
        name: member.name,
        role: member.role,
        signals: abuseSignals(member.fingerprint, member.ipHash),
      })),
    })));
  })
);

router.get(
  "/admin/usage",
  requireAdmin,
  asyncRoute(async (_req, res) => {
    res.json({
      connectedUsers: connectedUsers(),
      ...roomState.liveSummary(),
      waitingUsers: matchmaker.queueSize(),
      pendingReports: await Report.countDocuments({ status: "pending" }),
    });
  })
);

router.delete(
  "/admin/rooms/:id",
  requireAdmin,
  asyncRoute(async (req, res) => {
    const room = await Room.findByIdAndDelete(req.params.id).lean();
    if (!room) return res.status(404).json({ error: "Room not found" });
    roomState.removeRoom(req.params.id);
    await recordAudit({ action: "room.deleted", actor: req.adminSession, roomId: req.params.id, metadata: { name: room.name } });
    res.json({ ok: true, warning: "Room deleted by an administrator." });
  })
);

router.patch("/admin/rooms/:id", requireAdmin, asyncRoute(async (req, res) => {
  const { name, topic } = req.body || {};
  const room = await Room.findById(req.params.id);
  if (!room) return res.status(404).json({ error: "Room not found" });
  if (name !== undefined) {
    if (!String(name).trim() || containsProfanity(name)) return res.status(400).json({ error: "Invalid room name" });
    room.name = String(name).trim().slice(0, 60);
  }
  if (topic !== undefined) room.topic = String(topic).trim().slice(0, 140);
  await room.save();
  await recordAudit({ action: "room.updated", actor: req.adminSession, roomId: req.params.id, metadata: { name: room.name, topic: room.topic } });
  res.json(room);
}));

router.post("/admin/rooms/:id/remove-all", requireAdmin, asyncRoute(async (req, res) => {
  if (req.body?.confirm !== true) return res.status(400).json({ error: "Explicit confirmation is required" });
  const memberList = adminPresence()[req.params.id] || [];
  for (const member of memberList) disconnectMatching({ fingerprint: member.fingerprint });
  roomState.removeRoom(req.params.id);
  await recordAudit({ action: "room.members_removed", actor: req.adminSession, roomId: req.params.id, metadata: { count: memberList.length } });
  res.json({ ok: true, removed: memberList.length });
}));

// Admin report endpoints are protected by the server-side session above.
router.get(
  "/admin/reports",
  requireAdmin,
  asyncRoute(async (req, res) => {
    const status = req.query.status || "pending";
    const reports = await Report.find({ status }).sort({ severity: -1, createdAt: -1 }).limit(100).lean();
    const counts = await Report.aggregate([
      { $match: { status: { $in: ["pending", "reviewed"] } } },
      { $group: { _id: "$reportedFingerprint", reportCount: { $sum: 1 }, reporters: { $addToSet: "$reporterFingerprint" }, reporterIps: { $addToSet: "$reporterIpHash" } } },
    ]);
    const countByFingerprint = new Map(counts.map((item) => [item._id, item]));
    res.json(reports.map((report) => ({
      ...report,
      reportCount: countByFingerprint.get(report.reportedFingerprint)?.reportCount || 1,
      uniqueReporterCount: countByFingerprint.get(report.reportedFingerprint)?.reporters?.filter(Boolean).length || 1,
      uniqueReporterIpCount: countByFingerprint.get(report.reportedFingerprint)?.reporterIps?.filter(Boolean).length || 0,
      signals: abuseSignals(report.reportedFingerprint, report.reportedIpHash),
    })));
  })
);

router.post("/admin/reports/:id/approve-ban", requireAdmin, asyncRoute(async (req, res) => {
  const { duration } = req.body || {};
  const allowedDurations = { "2m": 2, "5m": 5, "10m": 10, "30m": 30, "1h": 60, permanent: null };
  if (!Object.hasOwn(allowedDurations, duration)) return res.status(400).json({ error: "Invalid ban duration" });
  const report = await Report.findById(req.params.id);
  if (!report) return res.status(404).json({ error: "Report not found" });
  if (report.status !== "pending") return res.status(409).json({ error: "This report has already been reviewed" });
  const minutes = allowedDurations[duration];
  const ban = await BannedUser.create({
    fingerprint: report.reportedFingerprint,
    ipHash: report.reportedIpHash || undefined,
    matchMode: "fingerprint",
    displayName: report.reportedDisplayName || "",
    locationLabel: report.reportedLocation || "",
    reason: `Approved report: ${report.reason}`,
    createdBy: req.adminSession?.accountId || "admin",
    expiresAt: minutes === null ? null : new Date(Date.now() + minutes * 60 * 1000),
    reportIds: [report._id],
  });
  report.status = "reviewed";
  report.reviewedAt = new Date();
  report.reviewedBy = req.adminSession?.accountId || "admin";
  await report.save();
  const disconnected = disconnectMatching({ fingerprint: report.reportedFingerprint });
  await recordAudit({ action: "report.approved_and_banned", actor: req.adminSession, targetId: report.reportedFingerprint, roomId: report.roomId, metadata: { reportId: report._id.toString(), duration, disconnected } });
  res.json({ ok: true, ban, disconnected, report });
}));

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
      { status, reviewedAt: new Date(), reviewedBy: req.adminSession?.accountId || "admin" },
      { new: true }
    );
    if (!report) return res.status(404).json({ error: "Report not found" });
    await recordAudit({ action: `report.${status}`, actor: req.adminSession, targetId: report.reportedFingerprint, roomId: report.roomId, metadata: { reportId: report._id.toString() } });
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
