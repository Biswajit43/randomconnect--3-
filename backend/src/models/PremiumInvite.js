import mongoose from "mongoose";

const premiumInviteSchema = new mongoose.Schema(
  {
    codeHash: { type: String, required: true, unique: true, index: true },
    label: { type: String, default: "Premium invite", maxlength: 80 },
    kind: { type: String, enum: ["admin", "referral"], default: "admin", index: true },
    createdBy: { type: String, required: true },
    ownerFingerprint: { type: String, default: "", index: true },
    maxUses: { type: Number, default: 10, min: 1, max: 1000 },
    uses: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true, index: true },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

export default mongoose.model("PremiumInvite", premiumInviteSchema);
