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
		reason: { type: String, required: true },
		details: { type: String, maxlength: 1000 },
		evidenceRef: { type: String },
		status: { type: String, default: "pending", index: true },
		severity: { type: String, default: "medium" },
		createdAt: { type: Date, default: Date.now, index: true },
		reviewedAt: Date,
		reviewedBy: String,
	},
	{ versionKey: false }
);

reportSchema.index({ severity: 1, status: 1 });
export default mongoose.model("Report", reportSchema);
