import { roomState } from "../services/roomState.js";
import Room from "../models/Room.js";
import { fileReport, autoBanOnRepeatedReports } from "../services/moderation.js";

/**
 * Group rooms use a full-mesh WebRTC topology: every participant opens a
 * direct peer connection to every other participant. Simplest to run with
 * zero extra infra, but bandwidth/CPU cost grows with the square of
 * participants — that's why maxParticipants is capped (see Room.js).
 *
 * MODERATION MODEL
 * -----------------------------------------------------------------------
 * The room creator is always a moderator. They can promote other current
 * participants to moderator too. Moderators can:
 *   - mute a participant — enforced two ways: we tell their client to
 *     disable its own mic (group:force-mute), AND every other client is
 *     told to locally silence audio *received from* that participant
 *     (group:peer-muted) — so a modified or non-compliant client can't
 *     just ignore the mute request and still be heard.
 *   - move a participant to the waiting room (group:mod-move-waiting) —
 *     pulls them out of the live call; a moderator can admit or deny them.
 *   - remove a participant (group:mod-remove) — kicks them and blocks them
 *     from rejoining this specific room for as long as it stays live.
 * None of this touches the global ban list — that's reserved for reports
 * that clear the auto-ban threshold in moderation.js. Room-level actions are
 * a lighter, room-owner-controlled tool for day-to-day spam/disruption.
 * -----------------------------------------------------------------------
 */

// Wraps an async socket handler so a rejected promise (DB down, bad roomId,
// etc.) gets logged instead of becoming a silent unhandled rejection that
// leaves the client waiting forever for a response that will never come.
function safeHandler(eventName, fn) {
  return async (...args) => {
    try {
      await fn(...args);
    } catch (err) {
      console.error(`[groupRooms] ${eventName} failed:`, err.message);
    }
  };
}

async function isModeratorOfRoom(roomId, fingerprint) {
  if (!fingerprint) return false;
  try {
    const room = await Room.findById(roomId).select("createdByFingerprint moderatorFingerprints").lean();
    if (!room) return false;
    return room.createdByFingerprint === fingerprint || room.moderatorFingerprints.includes(fingerprint);
  } catch (err) {
    // Malformed roomId or a DB hiccup shouldn't crash the caller — fail
    // closed (treat as "not a moderator") rather than let the error bubble.
    console.error("[groupRooms] isModeratorOfRoom failed:", err.message);
    return false;
  }
}

export function registerGroupRooms(io) {
  io.on("connection", (socket) => {
    socket.on(
      "group:join",
      safeHandler("group:join", async ({ roomId, displayName }) => {
        if (!socket.data.fingerprint) return; // must identify() first (see signaling.js)

        if (roomState.isKicked(roomId, socket.data.fingerprint)) {
          socket.emit("group:removed", { reason: "You were removed from this room." });
          return;
        }

        const meta = { fingerprint: socket.data.fingerprint, displayName: displayName || "Guest" };
        const isModerator = await isModeratorOfRoom(roomId, socket.data.fingerprint);

        const existingPeerIds = roomState.join(roomId, socket.id, meta);
        socket.join(roomId);
        socket.data.groupRooms = socket.data.groupRooms || new Set();
        socket.data.groupRooms.add(roomId);
        socket.data.groupMeta = meta;
        socket.data.isModeratorByRoom = socket.data.isModeratorByRoom || {};
        socket.data.isModeratorByRoom[roomId] = isModerator;

        const existingPeers = existingPeerIds.map((id) => {
          const p = io.sockets.sockets.get(id);
          const peerFingerprint = p?.data?.groupMeta?.fingerprint;
          return {
            socketId: id,
            displayName: p?.data?.groupMeta?.displayName || "Guest",
            isModerator: p?.data?.isModeratorByRoom?.[roomId] || false,
            isMuted: roomState.isMuted(roomId, peerFingerprint),
          };
        });

        socket.emit("group:joined", { roomId, existingPeers, isModerator });

        socket.to(roomId).emit("group:peer-joined", {
          socketId: socket.id,
          displayName: meta.displayName,
          isModerator,
        });

        if (isModerator) {
          socket.emit("group:waiting-list", { waiting: roomState.waitingList(roomId) });
        }

        Room.findByIdAndUpdate(roomId, { lastActiveAt: new Date() }).catch((err) =>
          console.error("[groupRooms] lastActiveAt update failed:", err.message)
        );
      })
    );

    socket.on("group:leave", ({ roomId }) => leaveGroupRoom(io, socket, roomId));

    // --- Mesh WebRTC signaling, targeted at a specific peer (not broadcast) ---
    socket.on("group:webrtc-offer", ({ roomId, targetId, sdp }) => {
      io.to(targetId).emit("group:webrtc-offer", { roomId, fromId: socket.id, sdp });
    });
    socket.on("group:webrtc-answer", ({ targetId, sdp }) => {
      io.to(targetId).emit("group:webrtc-answer", { fromId: socket.id, sdp });
    });
    socket.on("group:webrtc-ice-candidate", ({ targetId, candidate }) => {
      io.to(targetId).emit("group:webrtc-ice-candidate", { fromId: socket.id, candidate });
    });

    // --- Room-wide text chat ---
    socket.on("group:chat-message", ({ roomId, text }) => {
      if (!text || text.length > 2000) return;
      io.to(roomId).emit("group:chat-message", {
        fromId: socket.id,
        displayName: socket.data.groupMeta?.displayName || "Guest",
        text,
        at: Date.now(),
      });
    });

    // --- Report a participant inside a group room ---
    socket.on(
      "group:report",
      safeHandler("group:report", async ({ roomId, targetId, reason, details }) => {
        try {
          const target = io.sockets.sockets.get(targetId);
          const reportedFingerprint = target?.data?.fingerprint || "unknown";

          const report = await fileReport({
            reporterFingerprint: socket.data.fingerprint,
            reportedFingerprint,
            roomId,
            reason,
            details,
          });

          const autoBanned = await autoBanOnRepeatedReports(reportedFingerprint, target?.data?.ipHash);
          if (autoBanned && target) {
            target.emit("blocked", { reason: "banned" });
            leaveGroupRoom(io, target, roomId);
            target.disconnect(true);
          }

          socket.emit("group:reported", { reportId: report._id });
        } catch (err) {
          // Reporting failing silently is worse than most bugs here — always
          // tell the client so they know to retry rather than assume it worked.
          console.error("[groupRooms] group:report failed:", err.message);
          socket.emit("group:report-failed", { message: "Couldn't file the report — please try again." });
        }
      })
    );

    // ---------------------------------------------------------------------
    // Moderator actions — each re-checks the *acting* socket's moderator
    // status fresh (not a cached flag) so a demotion takes effect right away.
    // ---------------------------------------------------------------------

    socket.on(
      "group:mod-promote",
      safeHandler("group:mod-promote", async ({ roomId, targetId }) => {
        if (!(await isModeratorOfRoom(roomId, socket.data.fingerprint))) return;

        const target = io.sockets.sockets.get(targetId);
        if (!target?.data?.fingerprint) return;

        await Room.findByIdAndUpdate(roomId, { $addToSet: { moderatorFingerprints: target.data.fingerprint } });
        target.data.isModeratorByRoom = target.data.isModeratorByRoom || {};
        target.data.isModeratorByRoom[roomId] = true;

        target.emit("group:promoted", {});
        io.to(roomId).emit("group:peer-promoted", { socketId: targetId });
      })
    );

    socket.on(
      "group:mod-mute",
      safeHandler("group:mod-mute", async ({ roomId, targetId }) => {
        if (!(await isModeratorOfRoom(roomId, socket.data.fingerprint))) return;

        const target = io.sockets.sockets.get(targetId);
        if (!target?.data?.fingerprint) return;

        roomState.mute(roomId, target.data.fingerprint);
        target.emit("group:force-mute", { roomId }); // ask their own client to disable its mic
        io.to(roomId).emit("group:peer-muted", { socketId: targetId }); // everyone else locally silences their audio too
      })
    );

    socket.on(
      "group:mod-unmute",
      safeHandler("group:mod-unmute", async ({ roomId, targetId }) => {
        if (!(await isModeratorOfRoom(roomId, socket.data.fingerprint))) return;

        const target = io.sockets.sockets.get(targetId);
        if (!target?.data?.fingerprint) return;

        roomState.unmute(roomId, target.data.fingerprint);
        target.emit("group:force-unmute", { roomId });
        io.to(roomId).emit("group:peer-unmuted", { socketId: targetId });
      })
    );

    socket.on(
      "group:mod-move-waiting",
      safeHandler("group:mod-move-waiting", async ({ roomId, targetId }) => {
        if (!(await isModeratorOfRoom(roomId, socket.data.fingerprint))) return;

        const target = io.sockets.sockets.get(targetId);
        if (!target?.data?.groupMeta) return;

        roomState.hold(roomId, targetId, target.data.groupMeta);
        target.leave(roomId);
        target.emit("group:moved-to-waiting", {});
        socket.to(roomId).emit("group:peer-left", { socketId: targetId });
        io.to(roomId).emit("group:waiting-list", { waiting: roomState.waitingList(roomId) });
      })
    );

    socket.on(
      "group:mod-admit",
      safeHandler("group:mod-admit", async ({ roomId, targetId }) => {
        if (!(await isModeratorOfRoom(roomId, socket.data.fingerprint))) return;

        roomState.admit(roomId, targetId);
        io.sockets.sockets.get(targetId)?.emit("group:admitted", {}); // client re-runs group:join
        io.to(roomId).emit("group:waiting-list", { waiting: roomState.waitingList(roomId) });
      })
    );

    socket.on(
      "group:mod-deny",
      safeHandler("group:mod-deny", async ({ roomId, targetId }) => {
        if (!(await isModeratorOfRoom(roomId, socket.data.fingerprint))) return;

        roomState.denyFromWaitingRoom(roomId, targetId);
        io.sockets.sockets.get(targetId)?.emit("group:removed", { reason: "The host didn't let you into this room." });
        io.to(roomId).emit("group:waiting-list", { waiting: roomState.waitingList(roomId) });
      })
    );

    socket.on(
      "group:mod-remove",
      safeHandler("group:mod-remove", async ({ roomId, targetId }) => {
        if (!(await isModeratorOfRoom(roomId, socket.data.fingerprint))) return;

        const target = io.sockets.sockets.get(targetId);
        if (!target?.data?.fingerprint) return;

        roomState.kick(roomId, targetId, target.data.fingerprint);
        target.leave(roomId);
        target.emit("group:removed", { reason: "You were removed from this room by a moderator." });
        socket.to(roomId).emit("group:peer-left", { socketId: targetId });
        io.to(roomId).emit("group:waiting-list", { waiting: roomState.waitingList(roomId) });
      })
    );

    socket.on("disconnect", () => {
      const affectedRooms = roomState.leaveAll(socket.id);
      affectedRooms.forEach((roomId) => {
        socket.to(roomId).emit("group:peer-left", { socketId: socket.id });
      });
    });
  });
}

function leaveGroupRoom(io, socket, roomId) {
  roomState.leave(roomId, socket.id);
  socket.leave(roomId);
  socket.data.groupRooms?.delete(roomId);
  socket.to(roomId).emit("group:peer-left", { socketId: socket.id });
}
