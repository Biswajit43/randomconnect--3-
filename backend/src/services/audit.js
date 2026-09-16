import AuditLog from "../models/AuditLog.js";

export function recordAudit({ action, actor, targetId = "", roomId = "", metadata = {} }) {
  return AuditLog.create({
    action,
    actorId: actor?.accountId || "unknown",
    actorRole: actor?.role || "admin",
    targetId: String(targetId || ""),
    roomId: String(roomId || ""),
    metadata,
  }).catch((error) => {
    console.error("[audit] failed to record action:", error.message);
  });
}
