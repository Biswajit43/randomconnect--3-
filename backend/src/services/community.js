import CommunityProfile from "../models/CommunityProfile.js";

const LEVELS = [
  { min: 10, name: "Connection Leader", badge: "✦" },
  { min: 5, name: "Community Builder", badge: "◆" },
  { min: 1, name: "Friendly Connector", badge: "●" },
  { min: 0, name: "New Connector", badge: "○" },
];

export function communityLevel(referrals = 0) {
  return LEVELS.find((level) => referrals >= level.min) || LEVELS[LEVELS.length - 1];
}

export async function recordSuccessfulReferral(fingerprint) {
  const profile = await CommunityProfile.findOneAndUpdate(
    { fingerprint },
    { $inc: { successfulReferrals: 1 }, $set: { lastReferralAt: new Date(), updatedAt: new Date() } },
    { upsert: true, new: true }
  ).lean();
  return { ...profile, level: communityLevel(profile.successfulReferrals) };
}

export async function getCommunityStatus(fingerprint) {
  const profile = await CommunityProfile.findOne({ fingerprint }).lean();
  const successfulReferrals = profile?.successfulReferrals || 0;
  const level = communityLevel(successfulReferrals);
  const next = [...LEVELS].sort((a, b) => a.min - b.min).find((item) => item.min > successfulReferrals);
  return {
    successfulReferrals,
    level,
    nextLevel: next || null,
    progress: next ? Math.min(1, successfulReferrals / next.min) : 1,
  };
}
