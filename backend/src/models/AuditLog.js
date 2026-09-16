import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true, index: true },
    actorId: { type: String, required: true },
    actorRole: { type: String, required: true },
    targetId: { type: String, default: "" },
    roomId: { type: String, default: "" },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false }
);

export default mongoose.model("AuditLog", auditLogSchema);
