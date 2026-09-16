import mongoose from "mongoose";

const premiumRecoverySchema = new mongoose.Schema(
  {
    codeHash: { type: String, required: true, unique: true, index: true },
    ownerFingerprint: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true, index: true },
    uses: { type: Number, default: 0, min: 0 },
    maxUses: { type: Number, default: 5, min: 1 },
  },
  { timestamps: true, versionKey: false }
);

export default mongoose.model("PremiumRecovery", premiumRecoverySchema);
