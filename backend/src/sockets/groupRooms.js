import { roomState } from "../services/roomState.js";
import Room from "../models/Room.js";
import { searchTrack, parseYouTubeId, getYouTubeMetadata } from "../services/musicService.js";
import { allowAction } from "../services/abuse.js";
import { noteJoin } from "../services/presence.js";
import { fileReport } from "../services/moderation.js";
import { v4 as uuid } from "uuid";

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
  if (role === "developer" || role === "admin" || role === "premium") return true;
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
  if (actorRole === "premium") return targetRole === "user" && !target.data.isModeratorByRoom?.[roomId];
  return targetRole === "user" && isModeratorOfRoom(roomId, socket.data.fingerprint);
}

async function canControlMusic(socket, roomId) {
  if (!roomId || !socket.data.groupRooms?.has(roomId)) return false;
  if (["developer", "admin", "premium"].includes(roleOf(socket))) return true;
  return isModeratorOfRoom(roomId, socket.data.fingerprint);
}

function getMusicPosition(music, now) {
  if (!music?.startedAt) return 0;
  return Math.max(0, (now - music.startedAt) / 1000);
}

const roomGames = new Map();
const GAME_ROUNDS = 5;
const DRAW_WORDS = ["cat", "dog", "sun", "moon", "tree", "house", "car", "ball", "apple", "fish", "book", "phone", "star", "flower", "pizza", "rocket", "rainbow", "snowman"];

function publicGame(game) {
  if (!game) return null;
  const players = Object.values(game.players)
    .sort((a, b) => b.score - a.score || b.streak - a.streak || a.displayName.localeCompare(b.displayName))
    .map((player) => ({ socketId: player.socketId, displayName: player.displayName, score: player.score, streak: player.streak }));
  const winner = players.find((player) => player.socketId === game.winnerId);
  return {
    gameId: game.gameId,
    title: game.type === "trivia" ? "Trivia Rush" : "Pulse Clash",
    type: game.type,
    status: game.status,
    round: game.round,
    totalRounds: game.totalRounds,
    roundToken: game.roundToken,
    countdownEndsAt: game.countdownEndsAt || null,
    liveAt: game.liveAt || null,
    roundEndsAt: game.roundEndsAt || null,
    winnerName: winner?.displayName || null,
    finalWinnerName: game.finalWinnerName || null,
    question: game.type === "trivia" ? game.question || null : null,
    answers: game.type === "trivia" ? game.answers || [] : [],
    questionToken: game.type === "trivia" ? game.questionToken || null : null,
    answeredCount: game.type === "trivia" ? game.answered?.size || 0 : 0,
    correctAnswer: game.status === "result" || game.status === "finished" ? game.correctAnswer || null : null,
    roundWinnerName: game.roundWinnerName || null,
    drawerId: game.type === "draw" ? game.drawerId || null : null,
    drawerName: game.type === "draw" ? game.drawerName || null : null,
    maskedWord: game.type === "draw" ? game.maskedWord || null : null,
    drawStrokes: game.type === "draw" ? game.drawStrokes || [] : [],
    players,
  };
}

function emitGame(io, roomId) {
  io.to(roomId).emit("group:game-state", publicGame(roomGames.get(roomId)));
}

function clearGameTimer(game) {
  if (game?.timer) clearTimeout(game.timer);
  if (game) game.timer = null;
}

function finishGame(io, roomId) {
  const game = roomGames.get(roomId);
  if (!game) return;
  clearGameTimer(game);
  game.status = "finished";
  const winner = Object.values(game.players).sort((a, b) => b.score - a.score || b.streak - a.streak)[0];
  game.finalWinnerName = winner?.score ? winner.displayName : null;
  emitGame(io, roomId);
  game.timer = setTimeout(() => {
    if (roomGames.get(roomId) === game) roomGames.delete(roomId);
  }, 8000);
}

function finishRound(io, roomId, winnerId = null) {
  const game = roomGames.get(roomId);
  if (!game || game.status !== "live") return;
  clearGameTimer(game);
  game.status = "result";
  game.winnerId = winnerId;
  Object.values(game.players).forEach((player) => {
    if (winnerId && player.socketId === winnerId) {
      player.score += 1;
      player.streak += 1;
    } else if (!winnerId || player.socketId !== winnerId) {
      player.streak = 0;
    }
  });
  emitGame(io, roomId);
  game.timer = setTimeout(() => {
    if (roomGames.get(roomId) !== game) return;
    if (game.round >= game.totalRounds) finishGame(io, roomId);
    else startGameRound(io, roomId);
  }, 2200);
}

function decodeTriviaValue(value) {
  try { return decodeURIComponent(value); } catch { return String(value || ""); }
}

function shuffle(values) {
  return [...values].sort(() => Math.random() - 0.5);
}

async function startTriviaRound(io, roomId) {
  const game = roomGames.get(roomId);
  if (!game) return;
  clearGameTimer(game);
  try {
    const response = await fetch("https://opentdb.com/api.php?amount=1&type=multiple&encode=url3986");
    if (!response.ok) throw new Error(`Open Trivia DB returned ${response.status}`);
    const payload = await response.json();
    const result = payload.results?.[0];
    if (!result) throw new Error("No trivia question returned");
    const correctAnswer = decodeTriviaValue(result.correct_answer);
    game.round += 1;
    game.status = "question";
    game.questionToken = uuid();
    game.question = decodeTriviaValue(result.question);
    game.answers = shuffle([correctAnswer, ...(result.incorrect_answers || []).map(decodeTriviaValue)]);
    game.correctAnswer = correctAnswer;
    game.answered = new Set();
    game.roundWinnerName = null;
    game.roundEndsAt = Date.now() + 15000;
    emitGame(io, roomId);
    game.timer = setTimeout(() => finishTriviaRound(io, roomId), 15000);
  } catch (error) {
    console.error("[groupRooms] trivia question failed:", error.message);
    clearGameTimer(game);
    roomGames.delete(roomId);
    io.to(roomId).emit("group:game-state", null);
    io.to(roomId).emit("group:game-error", { message: "Trivia is temporarily unavailable. Pulse Clash is still ready to play." });
  }
}

function finishTriviaRound(io, roomId) {
  const game = roomGames.get(roomId);
  if (!game || game.type !== "trivia" || game.status !== "question") return;
  clearGameTimer(game);
  game.status = "result";
  emitGame(io, roomId);
  game.timer = setTimeout(() => {
    if (roomGames.get(roomId) !== game) return;
    if (game.round >= game.totalRounds) finishGame(io, roomId);
    else startTriviaRound(io, roomId);
  }, 2400);
}

function finishDrawRound(io, roomId) {
  const game = roomGames.get(roomId);
  if (!game || game.type !== "draw" || game.status !== "drawing") return;
  clearGameTimer(game);
  game.status = "result";
  game.correctAnswer = game.word;
  emitGame(io, roomId);
  game.timer = setTimeout(() => {
    if (roomGames.get(roomId) !== game) return;
    if (game.round >= game.totalRounds) finishGame(io, roomId);
    else startGameRound(io, roomId);
  }, 3000);
}

function startDrawRound(io, roomId) {
  const game = roomGames.get(roomId);
  if (!game) return;
  clearGameTimer(game);
  const players = Object.values(game.players);
  if (!players.length) return;
  const drawer = players[(game.round) % players.length];
  game.round += 1;
  game.status = "drawing";
  game.drawerId = drawer.socketId;
  game.drawerName = drawer.displayName;
  game.word = DRAW_WORDS[Math.floor(Math.random() * DRAW_WORDS.length)].trim();
  game.maskedWord = game.word.replace(/[a-z]/gi, "_ ").trim();
  game.drawStrokes = [];
  game.roundWinnerName = null;
  game.answered = new Set();
  game.roundEndsAt = Date.now() + 45000;
  emitGame(io, roomId);
  io.to(game.drawerId).emit("group:draw-word", { gameId: game.gameId, word: game.word });
  game.timer = setTimeout(() => finishDrawRound(io, roomId), 45000);
}

function startGameRound(io, roomId) {
  const game = roomGames.get(roomId);
  if (!game) return;
  if (game.type === "draw") {
    startDrawRound(io, roomId);
    return;
  }
  if (game.type === "trivia") {
    startTriviaRound(io, roomId);
    return;
  }
  clearGameTimer(game);
  game.round += 1;
  game.status = "countdown";
  game.roundToken = uuid();
  game.tapped = new Set();
  game.winnerId = null;
  game.countdownEndsAt = Date.now() + 2600;
  game.liveAt = null;
  game.roundEndsAt = null;
  emitGame(io, roomId);
  game.timer = setTimeout(() => {
    if (roomGames.get(roomId) !== game || game.status !== "countdown") return;
    game.status = "live";
    game.liveAt = Date.now();
    game.roundEndsAt = game.liveAt + 6500;
    emitGame(io, roomId);
    game.timer = setTimeout(() => finishRound(io, roomId), 6500);
  }, 2600);
}

function startRoomGame(io, roomId, type = "pulse") {
  const players = [...(io.sockets.adapter.rooms.get(roomId) || [])]
    .map((socketId) => io.sockets.sockets.get(socketId))
    .filter((peer) => peer?.data?.groupRooms?.has(roomId));
  const game = {
    gameId: uuid(),
    type: ["trivia", "draw"].includes(type) ? type : "pulse",
    status: "countdown",
    round: 0,
    totalRounds: GAME_ROUNDS,
    players: Object.fromEntries(players.map((peer) => [peer.id, { socketId: peer.id, displayName: peer.data.displayName || "Guest", score: 0, streak: 0 }])),
    tapped: new Set(),
    drawStrokes: [],
    timer: null,
  };
  roomGames.set(roomId, game);
  startGameRound(io, roomId);
}

function removeGamePlayer(io, roomId, socketId) {
  const game = roomGames.get(roomId);
  if (!game) return;
  delete game.players[socketId];
  game.tapped?.delete(socketId);
  if (Object.keys(game.players).length === 0) {
    clearGameTimer(game);
    roomGames.delete(roomId);
    return;
  }
  emitGame(io, roomId);
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
          avatarUrl: socket.data.avatarUrl || null,
        };
        // The socket is added to groupRooms just below this line, so the
        // normal moderator check cannot be used during the first join.
        // Resolve the initial host state directly from the verified role or
        // the room creator/moderator record.
        const isModerator = ["developer", "admin", "premium"].includes(roleOf(socket))
          ? true
          : await isModeratorOfRoom(roomId, socket.data.fingerprint);

        const existingPeerIds = roomState.join(roomId, socket.id, meta);
        noteJoin(socket);
        socket.join(roomId);
        socket.data.groupRooms = socket.data.groupRooms || new Set();
        socket.data.groupRooms.add(roomId);
        socket.data.groupMeta = meta;
        socket.data.isModeratorByRoom = socket.data.isModeratorByRoom || {};
        socket.data.isModeratorByRoom[roomId] = isModerator;

        const activeGame = roomGames.get(roomId);
        if (activeGame) {
          activeGame.players[socket.id] ||= { socketId: socket.id, displayName: socket.data.displayName || "Guest", score: 0, streak: 0 };
        }

        const existingPeers = existingPeerIds.map((id) => {
          const p = io.sockets.sockets.get(id);
          const peerFingerprint = p?.data?.groupMeta?.fingerprint;
          return {
            socketId: id,
            displayName: p?.data?.groupMeta?.displayName || "Guest",
            role: p?.data?.groupMeta?.role || "user",
            avatarUrl: p?.data?.groupMeta?.avatarUrl || null,
            isModerator: p?.data?.isModeratorByRoom?.[roomId] || false,
            isMuted: roomState.isMuted(roomId, peerFingerprint),
          };
        });

        socket.emit("group:joined", { roomId, existingPeers, isModerator, role: meta.role });
        if (activeGame) socket.emit("group:game-state", publicGame(activeGame));

        // Late joiners hear whatever's already playing, roughly in sync —
        // the player seeks to (now - startedAt) on the client side.
        const currentMusic = roomState.getMusic(roomId);
        if (currentMusic) socket.emit("group:music-state", { ...currentMusic, serverNow: Date.now() });



        socket.to(roomId).emit("group:peer-joined", {
          socketId: socket.id,
          displayName: meta.displayName,
          role: meta.role,
          avatarUrl: meta.avatarUrl,
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

    socket.on("group:game-start", safeHandler("group:game-start", async ({ roomId, mode = "pulse" }, ack) => {
      if (!(await canModerateRoom(socket, roomId))) {
        ack?.({ ok: false, error: "Only a host or music moderator can start a game." });
        return;
      }
      const participants = [...(io.sockets.adapter.rooms.get(roomId) || [])].filter((socketId) => io.sockets.sockets.get(socketId)?.data?.groupRooms?.has(roomId));
      if (participants.length < 2) {
        ack?.({ ok: false, error: "At least two people are needed to start a game." });
        return;
      }
      const existing = roomGames.get(roomId);
      if (existing && existing.status !== "finished") {
        ack?.({ ok: false, error: "A game is already running." });
        return;
      }
      if (existing) { clearGameTimer(existing); roomGames.delete(roomId); }
      startRoomGame(io, roomId, mode);
      ack?.({ ok: true });
    }));

    socket.on("group:game-tap", safeHandler("group:game-tap", async ({ roomId, gameId, roundToken }, ack) => {
      const game = roomGames.get(roomId);
      if (!game || game.gameId !== gameId || game.status !== "live" || game.roundToken !== roundToken || !socket.data.groupRooms?.has(roomId)) {
        ack?.({ ok: false });
        return;
      }
      if (!game.players[socket.id] || game.tapped.has(socket.id)) {
        ack?.({ ok: false });
        return;
      }
      game.tapped.add(socket.id);
      finishRound(io, roomId, socket.id);
      ack?.({ ok: true });
    }));

    socket.on("group:game-answer", safeHandler("group:game-answer", async ({ roomId, gameId, questionToken, answer }, ack) => {
      const game = roomGames.get(roomId);
      if (game?.type === "draw") {
        if (game.gameId !== gameId || game.status !== "drawing" || !socket.data.groupRooms?.has(roomId) || socket.id === game.drawerId || game.answered.has(socket.id)) { ack?.({ ok: false }); return; }
        const player = game.players[socket.id];
        if (!player) { ack?.({ ok: false }); return; }
        game.answered.add(socket.id);
        const correct = String(answer || "").trim().toLowerCase() === game.word.toLowerCase();
        if (correct) {
          player.score += 1;
          player.streak += 1;
          game.roundWinnerName = player.displayName;
          emitGame(io, roomId);
          finishDrawRound(io, roomId);
          ack?.({ ok: true, correct: true });
        } else {
          player.streak = 0;
          ack?.({ ok: true, correct: false });
        }
        return;
      }
      if (!game || game.gameId !== gameId || game.type !== "trivia" || game.status !== "question" || game.questionToken !== questionToken || !socket.data.groupRooms?.has(roomId)) {
        ack?.({ ok: false });
        return;
      }
      const player = game.players[socket.id];
      if (!player || game.answered.has(socket.id)) {
        ack?.({ ok: false });
        return;
      }
      game.answered.add(socket.id);
      const isCorrect = answer === game.correctAnswer;
      if (isCorrect) {
        player.score += 1;
        player.streak += 1;
        if (!game.roundWinnerName) game.roundWinnerName = player.displayName;
      } else {
        player.streak = 0;
      }
      emitGame(io, roomId);
      ack?.({ ok: true, correct: isCorrect });
    }));

    socket.on("group:game-draw", safeHandler("group:game-draw", async ({ roomId, gameId, stroke }, ack) => {
      const game = roomGames.get(roomId);
      if (!game || game.gameId !== gameId || game.type !== "draw" || game.status !== "drawing" || socket.id !== game.drawerId || !stroke || !Array.isArray(stroke.points) || stroke.points.length > 80) { ack?.({ ok: false }); return; }
      const safeStroke = { color: String(stroke.color || "#ffffff").slice(0, 20), size: Math.min(Math.max(Number(stroke.size) || 4, 1), 24), erase: Boolean(stroke.erase), points: stroke.points.slice(0, 80).map((point) => ({ x: Math.min(Math.max(Number(point.x) || 0, 0), 1), y: Math.min(Math.max(Number(point.y) || 0, 0), 1) })) };
      game.drawStrokes.push(safeStroke);
      if (game.drawStrokes.length > 500) game.drawStrokes.shift();
      socket.to(roomId).emit("group:game-draw", { gameId, stroke: safeStroke });
      ack?.({ ok: true });
    }));

    socket.on("group:game-stop", safeHandler("group:game-stop", async (_payload, ack) => {
      ack?.({ ok: false, error: "Games finish automatically after the final round." });
    }));

    socket.on("group:music-pause", safeHandler("group:music-pause", async ({ roomId }, ack) => {
      if (!(await canControlMusic(socket, roomId))) {
        if (typeof ack === "function") ack({ ok: false, error: "Only a host or music moderator can control room music." });
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
        if (typeof ack === "function") ack({ ok: false, error: "Only a host or music moderator can control room music." });
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
        socket.emit("group:music-error", { message: "Only a host or music moderator can control room music." });
        if (typeof ack === "function") ack({ ok: false, error: "Only a host or music moderator can control room music." });
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
            socket.emit("group:music-error", { message: "Only a host or music moderator can control room music." });
            if (typeof ack === "function") ack({ ok: false, error: "Only a host or music moderator can control room music." });
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
      "group:report-user",
      safeHandler("group:report-user", async ({ roomId, targetId, reason, details } = {}, ack) => {
        const target = io.sockets.sockets.get(targetId);
        if (!target || !socket.data.groupRooms?.has(roomId) || !target.data.groupRooms?.has(roomId)) {
          ack?.({ ok: false, error: "That participant is no longer in this room." });
          return;
        }
        if (["admin", "developer"].includes(target.data.role || "user")) {
          ack?.({ ok: false, error: "Administrators and developers cannot be reported." });
          return;
        }
        if (!allowAction(`group-report:${socket.data.ipHash}:${roomId}`, { limit: 1, windowMs: 24 * 60 * 60 * 1000 })) {
          ack?.({ ok: false, error: "Only one report per network is allowed for this room." });
          return;
        }
        const room = await Room.findById(roomId).select("name").lean();
        await fileReport({
          reporterFingerprint: socket.data.fingerprint,
          reporterIpHash: socket.data.ipHash,
          reporterDisplayName: socket.data.displayName,
          reporterLocation: socket.data.locationLabel,
          reportedFingerprint: target.data.fingerprint,
          reportedDisplayName: target.data.displayName,
          reportedIpHash: target.data.ipHash,
          reportedLocation: target.data.locationLabel,
          reportedRoomName: room?.name,
          roomId,
          reason: typeof reason === "string" ? reason.slice(0, 80) : "other",
          details: typeof details === "string" ? details.slice(0, 1000) : "",
        });
        ack?.({ ok: true });
      })
    );

    socket.on(
      "group:mod-promote",
      safeHandler("group:mod-promote", async ({ roomId, targetId }) => {
        if (roleOf(socket) === "premium") return;
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
        target.emit("group:demoted", { message: "Your host role was removed." });
        io.to(roomId).emit("group:peer-demoted", {
          socketId: targetId,
          displayName: target.data.groupMeta.displayName || "A participant",
        });
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
        removeGamePlayer(io, roomId, targetId);
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
        removeGamePlayer(io, roomId, targetId);
        target.leave(roomId);
        target.emit("group:removed", { reason: "You were removed from this room by a moderator." });
        socket.to(roomId).emit("group:peer-left", { socketId: targetId });
        io.to(roomId).emit("group:waiting-list", { waiting: roomState.waitingList(roomId) });
      })
    );

    socket.on("disconnect", () => {
      const affectedRooms = roomState.leaveAll(socket.id);
      affectedRooms.forEach((roomId) => {
        removeGamePlayer(io, roomId, socket.id);
        socket.to(roomId).emit("group:peer-left", { socketId: socket.id });
      });
    });
  });
}

function leaveGroupRoom(io, socket, roomId) {
  removeGamePlayer(io, roomId, socket.id);
  roomState.leave(roomId, socket.id);
  socket.leave(roomId);
  socket.data.groupRooms?.delete(roomId);
  socket.to(roomId).emit("group:peer-left", { socketId: socket.id });
}
