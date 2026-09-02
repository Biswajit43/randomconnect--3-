import mongoose from "mongoose";

/**
 * Bans are keyed by device fingerprint + IP hash, not account id, since this
 * platform supports anonymous entry. Neither signal is unbeatable (VPNs,
 * new devices) but stacking both meaningfully raises the cost of re-offending.
 */
const bannedUserSchema = new mongoose.Schema(
  {
    fingerprint: { type: String, index: true },
    ipHash: { type: String, index: true },
    reason: { type: String, required: true },
    reportIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Report" }],
    expiresAt: { type: Date, default: null }, // null = permanent
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

bannedUserSchema.index({ fingerprint: 1, ipHash: 1 });

export default mongoose.model("BannedUser", bannedUserSchema);
