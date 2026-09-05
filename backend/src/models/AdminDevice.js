import mongoose from "mongoose";

const adminDeviceSchema = new mongoose.Schema(
  {
    _id: { type: String, default: "primary" },
    deviceHash: { type: String, required: true },
    claimedAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

export default mongoose.model("AdminDevice", adminDeviceSchema);
