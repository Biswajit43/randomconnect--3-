import mongoose from "mongoose";

/**
 * A user report filed during or after a chat session.
 * Every report should be reviewable by a human moderator within minutes,
 * not days — response time is the single biggest lever on platform safety.
 */
const reportSchema = new mongoose.Schema(
  {
    reporterFingerprint: { type: String, required: true, index: true },
    reportedFingerprint: { type: String, required: true, index: true },
    roomId: { type: String, required: true },
    reason: {
      type: String,
      enum: [
        "nudity_sexual_content",
        "minor_endangerment",
        "harassment_abuse",
        "violence_graphic",
        "spam_scam",
        "other",
      ],
      required: true,
    },
    details: { type: String, maxlength: 1000 },
    // Store a short frame/thumbnail reference (object storage key), never raw
    // video, and only long enough to support a moderation decision.
    evidenceRef: { type: String },
    status: {
      type: String,
      enum: ["pending", "reviewing", "actioned", "dismissed"],
      default: "pending",
      index: true,
    },
    severity: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
    },
    createdAt: { type: Date, default: Date.now, index: true },
    reviewedAt: Date,
    reviewedBy: String,
  },
  { versionKey: false }
);

// Anything flagged as minor endangerment or CSAM-adjacent must be surfaced
// first and, in the US, reported to NCMEC's CyberTipline as required by law.
reportSchema.index({ severity: 1, status: 1 });

export default mongoose.model("Report", reportSchema);
