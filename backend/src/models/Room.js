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
    // Anyone promoted to moderator by the creator (or another moderator) can
    // mute, hold, or kick disruptive participants. The creator is always an
    // implicit moderator and doesn't need to appear in this list.
    moderatorFingerprints: { type: [String], default: [] },
    createdAt: { type: Date, default: Date.now },
    // The room list endpoint sorts by lastActiveAt and caps at 50 (see
    // routes/api.js) — old, inactive rooms sink to the bottom and eventually
    // fall off the page rather than being deleted outright. Live presence is
    // the real source of truth for "is anyone actually here right now" and
    // lives in roomState.js, not here.
    lastActiveAt: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false }
);

roomSchema.index({ lastActiveAt: -1 });

export default mongoose.model("Room", roomSchema);
