import mongoose from "mongoose";

const feedbackSchema = new mongoose.Schema(
  {
    fingerprintHash: { type: String, required: true, index: true },
    category: { type: String, enum: ["idea", "bug", "safety", "other"], default: "other" },
    message: { type: String, required: true, maxlength: 2000 },
  },
  { timestamps: true, versionKey: false }
);

export default mongoose.model("Feedback", feedbackSchema);
