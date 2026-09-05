import { roomState } from "../services/roomState.js";
import Room from "../models/Room.js";
import { searchTrack, parseYouTubeId, getYouTubeMetadata } from "../services/musicService.js";

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
    const room = await Room.findById(roomId).select("createdByFingerprint moderatorFingerprints demotedModeratorFingerprints").lean();
    if (!room) return false;
    if (room.demotedModeratorFingerprints.includes(fingerprint)) return false;
    return room.createdByFingerprint === fingerprint || room.moderatorFingerprints.includes(fingerprint);
  } catch (err) {
    // Malformed roomId or a DB hiccup shouldn't crash the caller — fail
    // closed (treat as "not a moderator") rather than let the error bubble.
    console.error("[groupRooms] isModeratorOfRoom failed:", err.message);
    return false;
  }
}

function roleOf(socket) {
  return socket.data.role || "user";
}

async function canModerateRoom(socket, roomId) {
  if (!roomId || !socket.data.groupRooms?.has(roomId)) return false;
  const role = roleOf(socket);
  if (role === "developer" || role === "admin") return true;
  return isModeratorOfRoom(roomId, socket.data.fingerprint);
}

async function canActOnTarget(socket, roomId, target) {
  if (!roomId || !socket.data.groupRooms?.has(roomId)) return false;
  if (!target?.data?.groupMeta) return false;
  if (!target.data.groupRooms?.has(roomId)) return false;
  const actorRole = roleOf(socket);
  const targetRole = target.data.groupMeta.role || "user";
  if (targetRole === "developer") return false;
  if (actorRole === "admin") return targetRole === "user";
  if (actorRole === "developer") return true;
  return targetRole === "user" && isModeratorOfRoom(roomId, socket.data.fingerprint);
}

async function canControlMusic(socket, roomId) {
  if (!roomId || !socket.data.groupRooms?.has(roomId)) return false;
  if (roleOf(socket) === "developer" || roleOf(socket) === "admin") return true;
  return isModeratorOfRoom(roomId, socket.data.fingerprint);
}

function getMusicPosition(music, now) {
  if (!music?.startedAt) return 0;
  return Math.max(0, (now - music.startedAt) / 1000);
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

        const meta = {
          fingerprint: socket.data.fingerprint,
          displayName: socket.data.displayName || "Guest",
          role: socket.data.role || "user",
        };
        // The socket is added to groupRooms just below this line, so the
        // normal moderator check cannot be used during the first join.
        // Resolve the initial host state directly from the verified role or
        // the room creator/moderator record.
        const isModerator = roleOf(socket) === "developer" || roleOf(socket) === "admin"
          ? true
          : await isModeratorOfRoom(roomId, socket.data.fingerprint);

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
            role: p?.data?.groupMeta?.role || "user",
            isModerator: p?.data?.isModeratorByRoom?.[roomId] || false,
            isMuted: roomState.isMuted(roomId, peerFingerprint),
          };
        });

        socket.emit("group:joined", { roomId, existingPeers, isModerator, role: meta.role });

        // Late joiners hear whatever's already playing, roughly in sync —
        // the player seeks to (now - startedAt) on the client side.
        const currentMusic = roomState.getMusic(roomId);
        if (currentMusic) socket.emit("group:music-state", { ...currentMusic, serverNow: Date.now() });



        socket.to(roomId).emit("group:peer-joined", {
          socketId: socket.id,
          displayName: meta.displayName,
          role: meta.role,
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

    socket.on("group:music-pause", safeHandler("group:music-pause", async ({ roomId }, ack) => {
      if (!(await canControlMusic(socket, roomId))) {
        if (typeof ack === "function") ack({ ok: false, error: "Only a host can control room music." });
        return;
      }
      const currentMusic = roomState.getMusic(roomId);
      if (!currentMusic || currentMusic.status !== "playing") return;
      const now = Date.now();
      const pausedMusic = {
        ...currentMusic,
        status: "paused",
        pausedAt: now,
        pausedPosition: getMusicPosition(currentMusic, now),
        serverNow: now,
      };
      roomState.setMusic(roomId, pausedMusic);
      io.to(roomId).emit("group:music-state", pausedMusic);
      if (typeof ack === "function") ack({ ok: true, music: true });
    }));

    socket.on("group:music-resume", safeHandler("group:music-resume", async ({ roomId }, ack) => {
      if (!(await canControlMusic(socket, roomId))) {
        if (typeof ack === "function") ack({ ok: false, error: "Only a host can control room music." });
        return;
      }
      const currentMusic = roomState.getMusic(roomId);
      if (!currentMusic || currentMusic.status !== "paused") return;
      const now = Date.now();
      const resumedMusic = {
        ...currentMusic,
        status: "playing",
        startedAt: now - ((currentMusic.pausedPosition || 0) * 1000),
        serverNow: now,
      };
      delete resumedMusic.pausedAt;
      delete resumedMusic.pausedPosition;
      roomState.setMusic(roomId, resumedMusic);
      io.to(roomId).emit("group:music-state", resumedMusic);
      if (typeof ack === "function") ack({ ok: true, music: true });
    }));

    // Playback controls have their own event so stopping music can never
    // interfere with the normal room-chat message flow.
    socket.on("group:music-stop", safeHandler("group:music-stop", async ({ roomId }, ack) => {
      if (!roomId || !socket.data.groupRooms?.has(roomId)) {
        if (typeof ack === "function") ack({ ok: false, error: "You are not connected to this room." });
        return;
      }
      if (!(await canControlMusic(socket, roomId))) {
        socket.emit("group:music-error", { message: "Only the host can control room music." });
        if (typeof ack === "function") ack({ ok: false, error: "Only the host can control room music." });
        return;
      }
      const now = Date.now();
      roomState.clearMusic(roomId);
      io.to(roomId).emit("group:music-state", { status: "stopped", serverNow: now });
      if (typeof ack === "function") ack({ ok: true, music: true });
    }));

    // --- Mesh WebRTC signaling, targeted at a specific peer (not broadcast) ---
    socket.on("group:webrtc-offer", ({ roomId, targetId, sdp }) => {
      const target = io.sockets.sockets.get(targetId);
      if (!socket.data.groupRooms?.has(roomId) || !target?.data?.groupRooms?.has(roomId)) return;
      target.emit("group:webrtc-offer", { roomId, fromId: socket.id, sdp });
    });
    socket.on("group:webrtc-answer", ({ roomId, targetId, sdp }) => {
      const target = io.sockets.sockets.get(targetId);
      if (!socket.data.groupRooms?.has(roomId) || !target?.data?.groupRooms?.has(roomId)) return;
      target.emit("group:webrtc-answer", { roomId, fromId: socket.id, sdp });
    });
    socket.on("group:webrtc-ice-candidate", ({ roomId, targetId, candidate }) => {
      const target = io.sockets.sockets.get(targetId);
      if (!socket.data.groupRooms?.has(roomId) || !target?.data?.groupRooms?.has(roomId)) return;
      target.emit("group:webrtc-ice-candidate", { roomId, fromId: socket.id, candidate });
    });

    // --- Room-wide text chat ---
    // --- Room-wide text chat, with moderator-only /play /pause /stop
    // commands intercepted before they ever reach the chat as plain text.
    // Moderator status is re-checked here server-side on every command —
    // never trust a "moderator" flag the frontend might send.
    socket.on(
      "group:chat-message",
      safeHandler("group:chat-message", async ({ roomId, text, clientMessageId }, ack) => {
        if (!roomId || !socket.data.groupRooms?.has(roomId)) {
          if (typeof ack === "function") ack({ ok: false, error: "You are not connected to this room." });
          return;
        }
        if (!text || text.length > 2000) {
          if (typeof ack === "function") ack({ ok: false, error: "Message is empty or too long." });
          return;
        }

        const playMatch = text.match(/^\/?play\s+(.+)/i);
        const pastedYouTubeUrl = parseYouTubeId(text.trim()) ? text.trim() : null;
        const isPauseOrStop = /^\/?(pause|stop|resume)\s*$/i.test(text.trim());

        if (playMatch || pastedYouTubeUrl || isPauseOrStop) {
          console.log(`[groupRooms] music command received: ${text.trim()}`);
          const isMod = await canModerateRoom(socket, roomId);
          if (!isMod) {
            console.warn("[groupRooms] music command rejected: sender is not a moderator");
            socket.emit("group:music-error", { message: "Only the host can control room music." });
            if (typeof ack === "function") ack({ ok: false, error: "Only the host can control room music." });
            return;
          }

          if (isPauseOrStop) {
            const command = text.trim().toLowerCase().replace(/^\//, "");
            const now = Date.now();
            const currentMusic = roomState.getMusic(roomId);
            if (command === "stop") roomState.clearMusic(roomId);
            if (command === "pause" && currentMusic) {
              roomState.setMusic(roomId, {
                ...currentMusic,
                status: "paused",
                pausedAt: now,
                pausedPosition: getMusicPosition(currentMusic, now),
                serverNow: now,
              });
            }
            if (command === "resume" && currentMusic?.status === "paused") {
              const resumedMusic = {
                ...currentMusic,
                status: "playing",
                startedAt: now - ((currentMusic.pausedPosition || 0) * 1000),
                serverNow: now,
              };
              delete resumedMusic.pausedAt;
              delete resumedMusic.pausedPosition;
              roomState.setMusic(roomId, resumedMusic);
            }
            const nextState = command === "stop"
              ? { status: "stopped", serverNow: now }
              : roomState.getMusic(roomId);
            if (!nextState) {
              if (typeof ack === "function") ack({ ok: true, music: true });
              return;
            }
            io.to(roomId).emit("group:music-state", nextState);
            if (typeof ack === "function") ack({ ok: true, music: true });
            return;
          }
 
          const query = playMatch ? playMatch[1].trim() : pastedYouTubeUrl;
          try {
            const youtubeId = parseYouTubeId(query);
            let track;

            if (youtubeId) {
              const metadata = await getYouTubeMetadata(youtubeId);
              track = { type: "youtube", videoId: youtubeId, title: metadata.title, artist: metadata.author };
            } else {
              const preview = await searchTrack(query);
              track = preview ? { type: "preview", ...preview } : null;
            }

            if (!track) {
              socket.emit("group:music-error", { message: `Couldn't find a playable track for "${query}".` });
              if (typeof ack === "function") ack({ ok: false, error: "Track not found." });
              return;
            }
            const now = Date.now();
            const state = {
              ...track,
              status: "playing",
              startedAt: now,
              serverNow: now,
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
          if (typeof ack === "function") ack({ ok: true, music: true });
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
        const target = io.sockets.sockets.get(targetId);
        if (!(await canActOnTarget(socket, roomId, target))) return;

        await Room.findByIdAndUpdate(roomId, {
          $addToSet: { moderatorFingerprints: target.data.fingerprint },
          $pull: { demotedModeratorFingerprints: target.data.fingerprint },
        });
        target.data.isModeratorByRoom = target.data.isModeratorByRoom || {};
        target.data.isModeratorByRoom[roomId] = true;

        target.emit("group:promoted", {});
        io.to(roomId).emit("group:peer-promoted", { socketId: targetId });
      })
    );

    socket.on(
      "group:mod-demote",
      safeHandler("group:mod-demote", async ({ roomId, targetId }) => {
        const actorRole = roleOf(socket);
        if (actorRole !== "developer" && actorRole !== "admin") return;
        const target = io.sockets.sockets.get(targetId);
        if (!target?.data?.groupMeta || target.data.groupMeta.role !== "user") return;
        if (!target.data.groupRooms?.has(roomId) || !socket.data.groupRooms?.has(roomId)) return;

        await Room.findByIdAndUpdate(roomId, {
          $pull: { moderatorFingerprints: target.data.fingerprint },
          $addToSet: { demotedModeratorFingerprints: target.data.fingerprint },
        });
        target.data.isModeratorByRoom = target.data.isModeratorByRoom || {};
        target.data.isModeratorByRoom[roomId] = false;
        io.to(roomId).emit("group:peer-demoted", { socketId: targetId });
      })
    );

    socket.on(
      "group:mod-mute",
      safeHandler("group:mod-mute", async ({ roomId, targetId }) => {
        const target = io.sockets.sockets.get(targetId);
        if (!(await canActOnTarget(socket, roomId, target))) return;

        roomState.mute(roomId, target.data.fingerprint);
        target.emit("group:force-mute", { roomId }); // ask their own client to disable its mic
        io.to(roomId).emit("group:peer-muted", { socketId: targetId }); // everyone else locally silences their audio too
      })
    );

    socket.on(
      "group:mod-unmute",
      safeHandler("group:mod-unmute", async ({ roomId, targetId }) => {
        const target = io.sockets.sockets.get(targetId);
        if (!(await canActOnTarget(socket, roomId, target))) return;

        roomState.unmute(roomId, target.data.fingerprint);
        target.emit("group:force-unmute", { roomId });
        io.to(roomId).emit("group:peer-unmuted", { socketId: targetId });
      })
    );

    socket.on(
      "group:mod-move-waiting",
      safeHandler("group:mod-move-waiting", async ({ roomId, targetId }) => {
        const target = io.sockets.sockets.get(targetId);
        if (!(await canActOnTarget(socket, roomId, target))) return;

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
        if (!(await canModerateRoom(socket, roomId))) return;

        roomState.admit(roomId, targetId);
        io.sockets.sockets.get(targetId)?.emit("group:admitted", {}); // client re-runs group:join
        io.to(roomId).emit("group:waiting-list", { waiting: roomState.waitingList(roomId) });
      })
    );

    socket.on(
      "group:mod-deny",
      safeHandler("group:mod-deny", async ({ roomId, targetId }) => {
        if (!(await canModerateRoom(socket, roomId))) return;

        roomState.denyFromWaitingRoom(roomId, targetId);
        io.sockets.sockets.get(targetId)?.emit("group:removed", { reason: "The host didn't let you into this room." });
        io.to(roomId).emit("group:waiting-list", { waiting: roomState.waitingList(roomId) });
      })
    );

    socket.on(
      "group:mod-remove",
      safeHandler("group:mod-remove", async ({ roomId, targetId }) => {
        const target = io.sockets.sockets.get(targetId);
        if (!(await canActOnTarget(socket, roomId, target))) return;

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
