import mongoose from "mongoose";

const communityProfileSchema = new mongoose.Schema(
  {
    fingerprint: { type: String, required: true, unique: true, index: true },
    successfulReferrals: { type: Number, default: 0, min: 0 },
    lastReferralAt: { type: Date, default: null },
    updatedAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

export default mongoose.model("CommunityProfile", communityProfileSchema);
