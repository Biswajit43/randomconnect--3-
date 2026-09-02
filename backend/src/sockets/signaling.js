import { v4 as uuid } from "uuid";
import { matchmaker } from "../services/matchmaker.js";
import { isBanned, hashIp, fileReport, autoBanOnRepeatedReports } from "../services/moderation.js";

// roomId -> { members: [socketId, socketId], fingerprints: {socketId: fp} }
const activeRooms = new Map();

function getPartner(io, socketId, roomId) {
  const room = activeRooms.get(roomId);
  if (!room) return null;
  const partnerId = room.members.find((id) => id !== socketId);
  return partnerId ? io.sockets.sockets.get(partnerId) : null;
}

function leaveRoom(io, socket, { notifyPartner = true, reason = "left" } = {}) {
  const roomId = socket.data.roomId;
  if (!roomId) return;

  const partner = getPartner(io, socket.id, roomId);
  if (partner && notifyPartner) {
    partner.emit("partner:left", { reason });
    partner.data.roomId = null;
  }
  activeRooms.delete(roomId);
  socket.data.roomId = null;
}

export function registerSignaling(io) {
  io.on("connection", async (socket) => {
    const ip = socket.handshake.address;
    const ipHash = hashIp(ip);
    socket.data.ipHash = ipHash;

    // A lightweight fingerprint the client generates (canvas/webgl hash etc.)
    // and sends on connect. Not spoof-proof, but raises the cost of evasion
    // when combined with IP hashing.
    socket.on("identify", async ({ fingerprint, displayName, ageConfirmed }) => {
      try {
        if (!ageConfirmed) {
          socket.emit("blocked", { reason: "age_confirmation_required" });
          socket.disconnect(true);
          return;
        }

        socket.data.fingerprint = fingerprint || uuid();
        socket.data.displayName = (displayName || "").trim().slice(0, 30) || "Guest";

        const banned = await isBanned({ fingerprint: socket.data.fingerprint, ipHash });
        if (banned) {
          socket.emit("blocked", { reason: "banned" });
          socket.disconnect(true);
          return;
        }

        socket.emit("identified", { ok: true });
      } catch (err) {
        // identify() is the entry point for both the 1-to-1 flow and group
        // rooms — if this silently fails, the client just hangs on
        // "connecting" forever with nothing to explain why. Always tell it.
        console.error("[signaling] identify failed:", err.message);
        socket.emit("blocked", { reason: "server_error" });
      }
    });

    socket.on("queue:join", ({ interests = [] } = {}) => {
      if (!socket.data.fingerprint) return; // must identify() first
      if (socket.data.roomId) leaveRoom(io, socket);

      const entry = { socketId: socket.id, interests, joinedAt: Date.now() };
      const match = matchmaker.findMatch(entry);

      if (match) {
        const roomId = uuid();
        const partnerSocket = io.sockets.sockets.get(match.socketId);
        if (!partnerSocket) {
          // Stale entry, retry queue for this user.
          matchmaker.addToQueue(entry);
          return;
        }

        socket.data.roomId = roomId;
        partnerSocket.data.roomId = roomId;
        activeRooms.set(roomId, { members: [socket.id, partnerSocket.id] });

        // One side initiates the WebRTC offer to avoid glare. Each side gets
        // the other's display name so the UI can show a real name instead of
        // a generic "Stranger" label.
        socket.emit("match:found", { roomId, initiator: true, partnerDisplayName: partnerSocket.data.displayName });
        partnerSocket.emit("match:found", { roomId, initiator: false, partnerDisplayName: socket.data.displayName });
      } else {
        matchmaker.addToQueue(entry);
        socket.emit("queue:waiting", { position: matchmaker.queueSize() });
      }
    });

    socket.on("queue:leave", () => matchmaker.removeFromQueue(socket.id));

    // --- WebRTC signaling relay (server never sees media, only handshake) ---
    socket.on("webrtc:offer", ({ roomId, sdp }) => {
      getPartner(io, socket.id, roomId)?.emit("webrtc:offer", { sdp });
    });
    socket.on("webrtc:answer", ({ roomId, sdp }) => {
      getPartner(io, socket.id, roomId)?.emit("webrtc:answer", { sdp });
    });
    socket.on("webrtc:ice-candidate", ({ roomId, candidate }) => {
      getPartner(io, socket.id, roomId)?.emit("webrtc:ice-candidate", { candidate });
    });

    // --- Text chat within the room ---
    socket.on("chat:message", ({ roomId, text }) => {
      if (!text || text.length > 2000) return;
      getPartner(io, socket.id, roomId)?.emit("chat:message", {
        text,
        displayName: socket.data.displayName || "Guest",
        at: Date.now(),
      });
    });

    socket.on("chat:typing", ({ roomId, isTyping }) => {
      getPartner(io, socket.id, roomId)?.emit("chat:typing", { isTyping });
    });

    // --- Skip / next partner ---
    socket.on("session:skip", () => {
      leaveRoom(io, socket, { reason: "skipped" });
    });

    // --- Reporting a partner (available at all times during a session) ---
    socket.on("session:report", async ({ roomId, reason, details }) => {
      try {
        const partner = getPartner(io, socket.id, roomId);
        const reportedFingerprint = partner?.data?.fingerprint || "unknown";

        const report = await fileReport({
          reporterFingerprint: socket.data.fingerprint,
          reportedFingerprint,
          roomId,
          reason,
          details,
        });

        const autoBanned = await autoBanOnRepeatedReports(reportedFingerprint, partner?.data?.ipHash);
        if (autoBanned && partner) {
          partner.emit("blocked", { reason: "banned" });
          partner.disconnect(true);
        }

        socket.emit("session:reported", { reportId: report._id });
        // Reporting always ends the current session for the reporter's safety.
        leaveRoom(io, socket, { reason: "reported" });
      } catch (err) {
        console.error("[signaling] session:report failed:", err.message);
        socket.emit("session:report-failed", { message: "Couldn't file the report — please try again." });
      }
    });

    socket.on("disconnect", () => {
      matchmaker.removeFromQueue(socket.id);
      leaveRoom(io, socket, { reason: "disconnected" });
    });
  });
}
