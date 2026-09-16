import mongoose from "mongoose";

const premiumGrantSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true, unique: true, index: true },
    fingerprint: { type: String, required: true, index: true },
    inviteId: { type: mongoose.Schema.Types.ObjectId, ref: "PremiumInvite", required: true },
    expiresAt: { type: Date, required: true, index: true },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

export default mongoose.model("PremiumGrant", premiumGrantSchema);
