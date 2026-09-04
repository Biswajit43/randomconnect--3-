import { roomState } from "../services/roomState.js";
import Room from "../models/Room.js";
import { parseYouTubeId, resolveTrack } from "../services/musicService.js";

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

        // Late joiners hear whatever's already playing, roughly in sync —
        // the player seeks to (now - startedAt) on the client side.
        const currentMusic = roomState.getMusic(roomId);
        if (currentMusic) socket.emit("group:music-state", currentMusic);



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
    // --- Room-wide text chat, with moderator-only /play /pause /stop
    // commands intercepted before they ever reach the chat as plain text.
    // Moderator status is re-checked here server-side on every command —
    // never trust a "moderator" flag the frontend might send.
    socket.on(
      "group:chat-message",
      safeHandler("group:chat-message", async ({ roomId, text, clientMessageId }, ack) => {
        if (typeof ack === "function" && (!roomId || !socket.data.groupRooms?.has(roomId))) {
          ack({ ok: false, error: "You are not connected to this room." });
          return;
        }
        if (!text || text.length > 2000) {
          if (typeof ack === "function") ack({ ok: false, error: "Message is empty or too long." });
          return;
        }

        const playMatch = text.match(/^\/?play\s+(.+)/i);
        const pastedYouTubeUrl = parseYouTubeId(text.trim()) ? text.trim() : null;
        const isPauseOrStop = /^\/?(pause|stop)\s*$/i.test(text.trim());

        if (playMatch || pastedYouTubeUrl || isPauseOrStop) {
          console.log(`[groupRooms] music command received: ${text.trim()}`);
          const isMod = await isModeratorOfRoom(roomId, socket.data.fingerprint);
          if (!isMod) {
            console.warn("[groupRooms] music command rejected: sender is not a moderator");
            socket.emit("group:music-error", { message: "Only the host can control room music." });
            if (typeof ack === "function") ack({ ok: false, error: "Only the host can control room music." });
            return;
          }

          if (isPauseOrStop) {
            const status = text.trim().toLowerCase().replace(/^\//, "") === "pause" ? "paused" : "stopped";
            roomState.updateMusicStatus(roomId, status);
            io.to(roomId).emit("group:music-state", { status });
            if (typeof ack === "function") ack({ ok: true });
            return;
          }

          const query = playMatch ? playMatch[1].trim() : pastedYouTubeUrl;
          try {
            const track = await resolveTrack(query);
            if (!track) {
              socket.emit("group:music-error", { message: `Couldn't find a playable track for "${query}".` });
              if (typeof ack === "function") ack({ ok: false, error: "Track not found." });
              return;
            }
            const state = {
              ...track,
              status: "playing",
              startedAt: Date.now(),
              requestedBy: socket.data.groupMeta?.displayName || "Host",
            };
            roomState.setMusic(roomId, state);
            console.log(`[groupRooms] music started: ${track.title} by ${track.artist}`);
            io.to(roomId).emit("group:music-state", state);
          } catch (err) {
            console.error("[groupRooms] music search failed:", err.message);
            socket.emit("group:music-error", { message: "Music search failed — try again in a moment." });
            if (typeof ack === "function") ack({ ok: false, error: "Music search failed." });
            return;
          }
          if (typeof ack === "function") ack({ ok: true });
          return;
        }

        const message = {
          fromId: socket.id,
          displayName: socket.data.groupMeta?.displayName || "Guest",
          text,
          at: Date.now(),
          clientMessageId,
        };
        io.to(roomId).emit("group:chat-message", message);
        if (typeof ack === "function") ack({ ok: true, message });
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
