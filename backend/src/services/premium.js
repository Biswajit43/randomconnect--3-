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

export function createRecoveryCode() {
  return `RC-RECOVER-${crypto.randomBytes(12).toString("hex").toUpperCase()}`;
}

export async function restorePremiumUntil(fingerprint, expiresAt) {
  const existing = await PremiumGrant.findOne({ fingerprint, expiresAt: { $gt: new Date() } }).sort({ expiresAt: -1 });
  if (existing) {
    if (new Date(expiresAt).getTime() > existing.expiresAt.getTime()) {
      existing.expiresAt = new Date(expiresAt);
      await existing.save();
    }
    return { token: null, expiresAt: existing.expiresAt };
  }
  const token = createPremiumToken();
  const grant = await PremiumGrant.create({ tokenHash: hashPremiumValue(token), fingerprint, expiresAt: new Date(expiresAt) });
  return { token, expiresAt: grant.expiresAt };
}

export function createReferralCode(fingerprint) {
  return `RC-REF-${crypto.randomBytes(8).toString("hex").toUpperCase()}`;
}

export async function addPremiumDays(fingerprint, inviteId, days = 30) {
  const now = Date.now();
  const existing = await PremiumGrant.findOne({ fingerprint, expiresAt: { $gt: new Date(now) } }).sort({ expiresAt: -1 });
  const expiresAt = new Date((existing ? existing.expiresAt.getTime() : now) + days * 24 * 60 * 60 * 1000);
  if (existing) {
    existing.expiresAt = expiresAt;
    await existing.save();
    return { token: null, expiresAt };
  }
  const token = createPremiumToken();
  await PremiumGrant.create({ tokenHash: hashPremiumValue(token), fingerprint, inviteId, expiresAt });
  return { token, expiresAt };
}

export async function verifyPremiumToken(token, fingerprint) {
  if (!fingerprint) return null;
  const query = { fingerprint, expiresAt: { $gt: new Date() } };
  if (token) query.tokenHash = hashPremiumValue(token);
  return PremiumGrant.findOne(query).lean().catch(() => null);
}
