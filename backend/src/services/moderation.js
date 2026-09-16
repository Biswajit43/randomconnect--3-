import crypto from "crypto";
import BannedUser from "../models/BannedUser.js";
import Report from "../models/Report.js";

/**
 * TRUST & SAFETY LAYER
 * ---------------------------------------------------------------------------
 * This is the part of the product that determines whether it's legally and
 * ethically viable to run at all. Random-stranger video chat has a well
 * documented history of exposing minors to sexual content, which is exactly
 * why Omegle shut down in 2023 under legal pressure. Do not treat this file
 * as optional scaffolding — wire a real provider in before any public launch.
 *
 * Recommended real-time moderation providers (frame-sampling nudity/CSAM
 * detection on the live video stream): Hive Moderation, Amazon Rekognition
 * Content Moderation, Microsoft Azure Content Moderator + PhotoDNA (PhotoDNA
 * specifically for known CSAM hash-matching — enrolling requires an
 * application to Microsoft/NCMEC and is a legal, not just technical, step).
 *
 * In the US, any suspected CSAM MUST be reported to NCMEC's CyberTipline
 * (https://report.cybertip.org) — this is a legal obligation for US-based
 * providers under 18 U.S.C. § 2258A, not a feature choice.
 * ---------------------------------------------------------------------------
 */

export function hashIp(ip) {
  return crypto.createHash("sha256").update(ip + (process.env.IP_SALT || "salt")).digest("hex");
}

export async function isBanned({ fingerprint, ipHash }) {
  const identityMatches = [];
  if (fingerprint) identityMatches.push({ fingerprint, matchMode: { $ne: "ip" } });
  if (ipHash) {
    identityMatches.push({ ipHash, matchMode: "ip" });
    // Legacy IP-only bans had no matchMode. Do not treat a legacy ban that
    // also has a fingerprint as an IP ban, otherwise shared networks break.
    identityMatches.push({ ipHash, fingerprint: { $in: [null, ""] }, matchMode: { $exists: false } });
  }
  if (!identityMatches.length) return false;
  const ban = await BannedUser.findOne({
    $or: identityMatches,
    $and: [{ $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] }],
  }).catch(() => null);
  return Boolean(ban);
}

/**
 * Placeholder hook for real-time frame moderation. In production this should
 * receive periodic sampled frames from the WebRTC stream (e.g. via a small
 * SFU or a client-side capture posted over a signed upload URL — never trust
 * the client to self-report), run them through the chosen provider, and
 * return a verdict. Wire this up before launch; it is currently a stub that
 * always passes so the demo runs, and that is NOT safe for production.
 */
export async function moderateFrame(_frameBuffer) {
  console.warn(
    "[moderation] moderateFrame() is a stub — no real content moderation is active."
  );
  return { flagged: false, categories: [] };
}

export async function fileReport({ reporterFingerprint, reporterIpHash, reporterDisplayName, reportedFingerprint, reportedDisplayName, reportedIpHash, reportedRoomName, roomId, reason, details }) {
  const severity = ["minor_endangerment", "nudity_sexual_content"].includes(reason)
    ? "critical"
    : "medium";

  const report = await Report.create({
		reporterFingerprint,
		reporterIpHash: reporterIpHash || "",
		reporterDisplayName: String(reporterDisplayName || "").slice(0, 30),
		reportedFingerprint,
		reportedDisplayName: String(reportedDisplayName || "").slice(0, 30),
		reportedIpHash: reportedIpHash || "",
		reportedRoomName: String(reportedRoomName || "").slice(0, 60),
    roomId,
    reason,
    details,
    severity,
  });

  // Critical reports should page a human moderator immediately, not sit in a
  // queue. Wire this to Slack/PagerDuty/email in production.
  if (severity === "critical") {
    console.error(`[moderation] CRITICAL report filed: ${report._id} reason=${reason}`);
  }

  return report;
}
