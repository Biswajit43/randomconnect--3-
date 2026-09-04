import mongoose from "mongoose";

/**
 * A group room is a persistent, joinable space — unlike the 1-to-1 queue,
 * these are named, browsable, and created by users. Anyone with the link
 * (or who finds it in the room list) can join while it's live.
 */
const roomSchema = new mongoose.Schema(
	{
		name: { type: String, required: true, trim: true, maxlength: 60 },
		topic: { type: String, trim: true, maxlength: 140, default: "" },
		mode: { type: String, enum: ["voice", "video"], default: "voice" },
		maxParticipants: { type: Number, default: 8, min: 2, max: 12 },
		createdByFingerprint: { type: String, required: true },
		moderatorFingerprints: { type: [String], default: [] },
		createdAt: { type: Date, default: Date.now },
		lastActiveAt: { type: Date, default: Date.now, index: true },
	},
	{ versionKey: false }
);

roomSchema.index({ lastActiveAt: -1 });
export default mongoose.model("Room", roomSchema);
