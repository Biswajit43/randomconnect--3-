import crypto from "crypto";
import PremiumGrant from "../models/PremiumGrant.js";

export function hashPremiumValue(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

export function createInviteCode() {
  return `RC-PREMIUM-${crypto.randomBytes(4).toString("hex").toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

export function createPremiumToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function createReferralCode(fingerprint) {
  const period = Math.floor(Date.now() / (30 * 24 * 60 * 60 * 1000));
  const secret = process.env.PREMIUM_INVITE_SECRET || process.env.ADMIN_SESSION_SECRET || "randomconnect-premium-invite";
  const digest = crypto.createHmac("sha256", secret).update(`${fingerprint}:${period}`).digest("hex").slice(0, 16).toUpperCase();
  return `RC-REF-${digest}`;
}

export async function verifyPremiumToken(token, fingerprint) {
  if (!fingerprint) return null;
  const query = { fingerprint, expiresAt: { $gt: new Date() } };
  if (token) query.tokenHash = hashPremiumValue(token);
  return PremiumGrant.findOne(query).lean().catch(() => null);
}
