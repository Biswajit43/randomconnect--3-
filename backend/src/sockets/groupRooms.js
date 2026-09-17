import { roomState } from "../services/roomState.js";
import Room from "../models/Room.js";
import { searchTrack, parseYouTubeId, getYouTubeMetadata } from "../services/musicService.js";
import { musicProvider } from "../services/musicProvider.js";
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
  const targetIsRoomModerator = Boolean(target.data.isModeratorByRoom?.[roomId]);
  if (targetRole === "developer") return false;
  if (actorRole === "admin") return ["user", "premium"].includes(targetRole);
  if (actorRole === "developer") return true;
  if (actorRole === "premium") return targetRole === "user" && !targetIsRoomModerator;
  return targetRole === "user" && !targetIsRoomModerator && isModeratorOfRoom(roomId, socket.data.fingerprint);
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
const songGames = new Map();
const GAME_ROUNDS = 5;
const BOMB_TURN_MS = 12000;
const BOMB_GRACE_MS = 1800;
const DRAW_WORDS = [
  "cat", "dog", "sun", "moon", "tree", "house", "car", "ball", "apple", "fish", "book", "phone", "star", "flower", "pizza", "rocket", "rainbow", "snowman",
  "bird", "boat", "cake", "cloud", "cow", "crown", "cup", "door", "duck", "ear", "egg", "eye", "fire", "flag", "frog", "ghost", "glasses", "guitar", "heart", "horse", "ice cream", "island", "jacket", "key", "kite", "lamp", "leaf", "lion", "lock", "map", "milk", "monkey", "mountain", "mouse", "orange", "pencil", "piano", "pig", "rain", "ring", "robot", "sandwich", "scarf", "shoe", "skateboard", "snake", "sock", "spoon", "table", "taco", "tiger", "train", "umbrella", "watch", "watermelon", "wheel", "window", "wolf", "zebra", "birthday", "campfire", "castle", "cookie", "football", "laptop", "mermaid", "parrot", "penguin", "pirate", "princess", "spaceship", "superhero", "toothbrush", "treasure", "volcano", "wizard", "ambulance", "backpack", "barcode", "bubble", "camera", "candle", "cactus", "chocolate", "donut", "elevator", "fan", "fountain", "garden", "hamburger", "helmet", "jellyfish", "ladder", "microphone", "octopus", "pancake", "popcorn", "roller skate", "sunglasses", "trophy", "yoyo"
];
const BOMB_PARTY_SYLLABLES = ["cat", "at", "an", "ar", "oo", "ee", "st", "ch", "in", "on", "ra", "sun"];

const SONG_DEFAULTS = {
  rounds: 5,
  timeLimit: 15,
  difficulty: "normal",
  category: "trending",
  genre: "",
  decade: "any",
};

function normalizeSongAnswer(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function songAcceptedAnswers(track) {
  const title = normalizeSongAnswer(track.title);
  const artist = normalizeSongAnswer(track.artist);
  return new Set([title, `${title} ${artist}`, `${artist} ${title}`].filter(Boolean));
}

function songPoints(game, elapsedMs) {
  const speed = Math.max(0, 1 - elapsedMs / game.timeLimitMs);
  const base = game.difficulty === "hard" ? 1200 : game.difficulty === "easy" ? 800 : 1000;
  return Math.max(100, Math.round(base * (0.35 + speed * 0.65)));
}

function songPlayers(game) {
  return Object.values(game.players)
    .sort((a, b) => b.score - a.score || b.streak - a.streak || a.displayName.localeCompare(b.displayName))
    .map((player) => ({ socketId: player.socketId || null, displayName: player.displayName, score: player.score, streak: player.streak }));
}

function publicSongGame(game, reveal = false) {
  if (!game) return null;
  const track = game.currentTrack;
  return {
    gameId: game.gameId,
    type: "song",
    title: "Song Guess",
    status: game.status,
    round: game.round,
    totalRounds: game.totalRounds,
    settings: game.settings,
    roundToken: game.roundToken || null,
    serverNow: Date.now(),
    roundStartedAt: game.roundStartedAt || null,
    roundEndsAt: game.roundEndsAt || null,
    audioUrl: track?.streamUrl || null,
    nextAudioUrl: game.nextTrack?.streamUrl || null,
    options: game.currentOptions || [],
    artworkUrl: track?.artworkUrl || null,
    genre: track?.genre || null,
    answeredCount: game.answered?.size || 0,
    players: songPlayers(game),
    answer: reveal && track ? { trackId: track.id, title: track.title, artist: track.artist, album: track.album, source: track.source, artworkUrl: track.artworkUrl } : null,
    fallbackCount: game.fallbackCount || 0,
  };
}

function emitSongScores(io, roomId, game) {
  io.to(roomId).emit("arcade:song:score", { gameId: game.gameId, players: songPlayers(game) });
}

function clearSongTimer(game) {
  if (game?.timer) clearTimeout(game.timer);
  if (game) game.timer = null;
}

function songCandidate(game) {
  const available = game.trackPool.filter((track) => !game.usedTrackIds.has(track.id));
  const track = available[0] || game.trackPool[Math.floor(Math.random() * game.trackPool.length)];
  if (track) game.usedTrackIds.add(track.id);
  return track || null;
}

function songOptions(game) {
  const distractors = game.trackPool
    .filter((track) => track.id !== game.currentTrack?.id)
    .sort(() => Math.random() - 0.5)
    .slice(0, 3)
    .map((track) => `${track.title} — ${track.artist}`);
  return [...distractors, `${game.currentTrack.title} — ${game.currentTrack.artist}`].sort(() => Math.random() - 0.5);
}

function songPublicRound(io, roomId, game) {
  io.to(roomId).emit("arcade:song:round", publicSongGame(game));
  emitSongScores(io, roomId, game);
}

function finishSongGame(io, roomId, game) {
  if (!game || songGames.get(roomId) !== game) return;
  clearSongTimer(game);
  game.status = "finished";
  io.to(roomId).emit("arcade:song:end", { ...publicSongGame(game, true), final: true });
  emitSongScores(io, roomId, game);
}

function finishSongRound(io, roomId, game) {
  if (!game || songGames.get(roomId) !== game || !["live", "paused"].includes(game.status)) return;
  clearSongTimer(game);
  game.status = "result";
  io.to(roomId).emit("arcade:song:result", publicSongGame(game, true));
  emitSongScores(io, roomId, game);
  game.timer = setTimeout(() => {
    if (songGames.get(roomId) !== game) return;
    if (game.round >= game.totalRounds) finishSongGame(io, roomId, game);
    else startSongRound(io, roomId, game);
  }, 2600);
}

function startSongRound(io, roomId, game) {
  clearSongTimer(game);
  game.round += 1;
  game.status = "live";
  game.roundToken = uuid();
  game.currentTrack = songCandidate(game);
  game.nextTrack = game.trackPool.find((track) => !game.usedTrackIds.has(track.id)) || game.currentTrack;
  game.currentOptions = songOptions(game);
  game.answered = new Set();
  game.roundStartedAt = Date.now();
  game.roundEndsAt = game.roundStartedAt + game.timeLimitMs;
  game.fallbackCount = 0;
  if (!game.currentTrack) {
    finishSongGame(io, roomId, game);
    return;
  }
  io.to(roomId).emit("arcade:song:round", publicSongGame(game));
  emitSongScores(io, roomId, game);
  game.timer = setTimeout(() => finishSongRound(io, roomId, game), game.timeLimitMs + 250);
}

async function createSongGame(io, roomId, config = {}) {
  const settings = {
    ...SONG_DEFAULTS,
    ...config,
    rounds: Math.min(Math.max(Number(config.rounds) || SONG_DEFAULTS.rounds, 3), 12),
    timeLimit: Math.min(Math.max(Number(config.timeLimit) || SONG_DEFAULTS.timeLimit, 8), 30),
    difficulty: ["easy", "normal", "hard"].includes(config.difficulty) ? config.difficulty : SONG_DEFAULTS.difficulty,
    category: ["trending", "popular", "random", "new", "search"].includes(config.category) ? config.category : SONG_DEFAULTS.category,
    genre: String(config.genre || "").slice(0, 60),
    decade: String(config.decade || "any"),
  };
  const trackPool = await musicProvider.getPlayableTracks({ ...settings, limit: 100, query: String(config.query || "").slice(0, 120) });
  if (!trackPool.length) throw new Error("Audius returned no playable tracks for these filters.");
  const participants = [...(io.sockets.adapter.rooms.get(roomId) || [])]
    .map((socketId) => io.sockets.sockets.get(socketId))
    .filter((peer) => peer?.data?.groupRooms?.has(roomId));
  const players = Object.fromEntries(participants.map((peer) => [peer.data.fingerprint, {
    fingerprint: peer.data.fingerprint,
    socketId: peer.id,
    displayName: peer.data.displayName || "Guest",
    score: 0,
    streak: 0,
  }]));
  const game = {
    gameId: uuid(), type: "song", status: "starting", settings, totalRounds: settings.rounds, round: 0,
    timeLimitMs: settings.timeLimit * 1000, difficulty: settings.difficulty, trackPool, usedTrackIds: new Set(),
    players, answered: new Set(), timer: null, currentTrack: null, nextTrack: null, fallbackCount: 0,
  };
  songGames.set(roomId, game);
  io.to(roomId).emit("arcade:song:start", { gameId: game.gameId, settings: game.settings, serverNow: Date.now() });
  startSongRound(io, roomId, game);
  return game;
}

function canControlSong(socket, roomId) {
  return Boolean(socket.data.groupRooms?.has(roomId)) && Boolean(socket.data.isModeratorByRoom?.[roomId]);
}

let arcadeIo = null;

async function submitSongGuess(io, roomId, socket, { gameId, roundToken, answer, choice }) {
  const game = songGames.get(roomId);
  const fingerprint = socket.data.fingerprint;
  const player = game?.players?.[fingerprint];
  if (!game || game.gameId !== gameId || game.status !== "live" || game.roundToken !== roundToken || !player || !socket.data.groupRooms?.has(roomId)) {
    return { ok: false, error: "That round is no longer accepting guesses." };
  }
  if (Date.now() >= game.roundEndsAt) return { ok: false, error: "Too late — the round has ended." };
  if (game.answered.has(fingerprint)) return { ok: false, error: "Only one guess per round is counted." };
  game.answered.add(fingerprint);
  const submitted = String(choice || answer || "").slice(0, 200);
  const correct = songAcceptedAnswers(game.currentTrack).has(normalizeSongAnswer(submitted));
  const elapsedMs = Math.max(0, Date.now() - game.roundStartedAt);
  const points = correct ? songPoints(game, elapsedMs) : 0;
  if (correct) { player.score += points; player.streak += 1; }
  else player.streak = 0;
  io.to(roomId).emit("arcade:song:guess", { gameId, roundToken, answeredCount: game.answered.size, playerName: player.displayName });
  emitSongScores(io, roomId, game);
  const connectedPlayers = Object.values(game.players).filter((candidate) => candidate.socketId && io.sockets.sockets.get(candidate.socketId)?.data?.groupRooms?.has(roomId));
  if (connectedPlayers.length && connectedPlayers.every((candidate) => game.answered.has(candidate.fingerprint))) finishSongRound(io, roomId, game);
  return { ok: true, correct, points, feedback: correct ? `Correct! +${points}` : "Not quite — keep listening." };
}

export async function startSongGameFromApi({ roomId, fingerprint, config = {} }) {
  const actor = arcadeIo && [...arcadeIo.sockets.sockets.values()].find((candidate) => candidate.data.fingerprint === fingerprint && candidate.data.groupRooms?.has(roomId));
  if (!actor || !canControlSong(actor, roomId)) throw new Error("Only the room host can control Song Guess.");
  const game = songGames.get(roomId);
  if (game && ["live", "paused", "result"].includes(game.status)) throw new Error("A Song Guess game is already running.");
  if (game) { clearSongTimer(game); songGames.delete(roomId); }
  return createSongGame(arcadeIo, roomId, config);
}

export async function guessSongGameFromApi({ roomId, fingerprint, gameId, roundToken, answer, choice }) {
  const actor = arcadeIo && [...arcadeIo.sockets.sockets.values()].find((candidate) => candidate.data.fingerprint === fingerprint && candidate.data.groupRooms?.has(roomId));
  if (!actor) throw new Error("You must be a member of the room to answer.");
  return submitSongGuess(arcadeIo, roomId, actor, { gameId, roundToken, answer, choice });
}

export function endSongGameFromApi({ roomId, fingerprint }) {
  const actor = arcadeIo && [...arcadeIo.sockets.sockets.values()].find((candidate) => candidate.data.fingerprint === fingerprint && candidate.data.groupRooms?.has(roomId));
  const game = songGames.get(roomId);
  if (!actor || !game || !canControlSong(actor, roomId)) throw new Error("Only the room host can end Song Guess.");
  finishSongGame(arcadeIo, roomId, game);
  return publicSongGame(game, true);
}

function publicGame(game) {
  if (!game) return null;
  const players = Object.values(game.players)
    .sort((a, b) => b.score - a.score || b.streak - a.streak || a.displayName.localeCompare(b.displayName))
    .map((player) => ({ socketId: player.socketId, displayName: player.displayName, score: player.score, streak: player.streak }));
  const winner = players.find((player) => player.socketId === game.winnerId);
  return {
    gameId: game.gameId,
    title: game.type === "bomb" ? "Bomb Party" : game.type === "draw" ? "Draw & Guess" : "Pulse Clash",
    type: game.type,
    status: game.status,
    round: game.round,
    totalRounds: game.totalRounds,
    roundToken: game.roundToken,
    countdownEndsAt: game.countdownEndsAt || null,
    liveAt: game.liveAt || null,
    roundEndsAt: game.roundEndsAt || null,
    winnerId: game.winnerId || null,
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
    bombSyllable: game.type === "bomb" ? game.bombSyllable || null : null,
    bombTurnId: game.type === "bomb" ? game.bombTurnId || null : null,
    bombTurnName: game.type === "bomb" ? game.bombTurnName || null : null,
    bombUsedCount: game.type === "bomb" ? game.bombUsed?.size || 0 : 0,
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
  game.maskedWord = game.word.replace(/[a-z]/gi, "_");
  game.drawStrokes = [];
  game.roundWinnerName = null;
  game.answered = new Set();
  game.drawCorrectCount = 0;
  game.roundEndsAt = Date.now() + 45000;
  emitGame(io, roomId);
  io.to(game.drawerId).emit("group:draw-word", { gameId: game.gameId, word: game.word });
  game.timer = setTimeout(() => finishDrawRound(io, roomId), 45000);
}

function finishBombTurn(io, roomId, winnerId = null) {
  const game = roomGames.get(roomId);
  if (!game || game.type !== "bomb" || game.status !== "bombing") return;
  clearGameTimer(game);
  game.status = "result";
  game.winnerId = winnerId;
  if (!winnerId) game.roundWinnerName = `${game.bombTurnName} ran out of time`;
  emitGame(io, roomId);
  game.timer = setTimeout(() => {
    if (roomGames.get(roomId) !== game) return;
    if (game.round >= game.totalRounds) finishGame(io, roomId);
    else startGameRound(io, roomId);
  }, 1800);
}

function startBombTurn(io, roomId) {
  const game = roomGames.get(roomId);
  if (!game) return;
  clearGameTimer(game);
  const players = Object.values(game.players);
  if (!players.length) return;
  const player = players[game.round % players.length];
  game.round += 1;
  game.status = "bombing";
  game.bombTurnId = player.socketId;
  game.bombTurnName = player.displayName;
  game.bombSyllable = BOMB_PARTY_SYLLABLES[Math.floor(Math.random() * BOMB_PARTY_SYLLABLES.length)];
  game.bombUsed = new Set();
  game.roundWinnerName = null;
  game.roundEndsAt = Date.now() + BOMB_TURN_MS;
  emitGame(io, roomId);
  game.timer = setTimeout(() => finishBombTurn(io, roomId), BOMB_TURN_MS + BOMB_GRACE_MS);
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
  if (game.type === "bomb") {
    startBombTurn(io, roomId);
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
    type: ["draw", "bomb"].includes(type) ? type : "pulse",
    status: "countdown",
    round: 0,
    totalRounds: type === "bomb" ? 8 : GAME_ROUNDS,
    players: Object.fromEntries(players.map((peer) => [peer.id, { socketId: peer.id, displayName: peer.data.displayName || "Guest", score: 0, streak: 0 }])),
    tapped: new Set(),
    drawStrokes: [],
    usedWords: new Set(),
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
  arcadeIo = io;
  io.on("connection", (socket) => {
    socket.on(
      "group:join",
      safeHandler("group:join", async ({ roomId, displayName }) => {
        if (!socket.data.fingerprint) return; // must identify() first (see signaling.js)

        // Capacity is checked without making the join handshake depend on a
        // slow database. If Mongo is temporarily unavailable, presence still
        // works; the room can never be left spinning on the join screen.
        const lookupTimeout = Symbol("room-capacity-timeout");
        try {
          const room = await Promise.race([
            Room.findById(roomId).select("maxParticipants").lean(),
            new Promise((resolve) => setTimeout(() => resolve(lookupTimeout), 1200)),
          ]);
          if (room !== lookupTimeout && !room) {
            socket.emit("group:join-rejected", { reason: "room_not_found" });
            return;
          }
          if (room !== lookupTimeout && roomState.participantCount(roomId) >= room.maxParticipants) {
            socket.emit("group:join-rejected", { reason: "room_full", maxParticipants: room.maxParticipants });
            return;
          }
        } catch (error) {
          console.error("[groupRooms] room capacity check skipped:", error.message);
        }

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
        const activeSong = songGames.get(roomId);
        if (activeSong) {
          const player = activeSong.players[socket.data.fingerprint] || {
            fingerprint: socket.data.fingerprint,
            socketId: socket.id,
            displayName: socket.data.displayName || "Guest",
            score: 0,
            streak: 0,
          };
          player.socketId = socket.id;
          player.displayName = socket.data.displayName || player.displayName;
          activeSong.players[socket.data.fingerprint] = player;
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
        if (activeSong) {
          socket.emit("arcade:song:round", publicSongGame(activeSong, activeSong.status === "result" || activeSong.status === "finished"));
          socket.emit("arcade:song:score", { gameId: activeSong.gameId, players: songPlayers(activeSong) });
        }

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
          const points = Math.max(1, 3 - game.drawCorrectCount);
          game.drawCorrectCount += 1;
          player.score += points;
          player.streak += 1;
          if (!game.roundWinnerName) game.roundWinnerName = player.displayName;
          emitGame(io, roomId);
          const waitingGuessers = Object.values(game.players).filter((candidate) => candidate.socketId !== game.drawerId && !game.answered.has(candidate.socketId));
          if (waitingGuessers.length === 0) finishDrawRound(io, roomId);
          ack?.({ ok: true, correct: true, points });
        } else {
          player.streak = 0;
          const waitingGuessers = Object.values(game.players).filter((candidate) => candidate.socketId !== game.drawerId && !game.answered.has(candidate.socketId));
          if (waitingGuessers.length === 0) finishDrawRound(io, roomId);
          ack?.({ ok: true, correct: false });
        }
        return;
      }
      if (game?.type === "bomb") {
        if (game.gameId !== gameId || game.status !== "bombing" || game.bombTurnId !== socket.id || !socket.data.groupRooms?.has(roomId) || Date.now() > game.roundEndsAt + BOMB_GRACE_MS) { ack?.({ ok: false, error: "That turn has ended. Watch for the next one." }); return; }
        const player = game.players[socket.id];
        const word = String(answer || "").trim().toLowerCase();
        const usedWords = game.usedWords || (game.usedWords = new Set());
        if (!player || word.length < 2 || !word.includes(game.bombSyllable) || usedWords.has(word)) { ack?.({ ok: false, error: usedWords.has(word) ? "That word was already used in this game." : "Use a new word containing the highlighted letters." }); return; }
        game.bombUsed.add(word);
        usedWords.add(word);
        const remainingMs = Math.max(0, game.roundEndsAt - Date.now());
        const points = remainingMs > 6000 ? 3 : remainingMs > 3000 ? 2 : 1;
        player.score += points;
        player.streak += 1;
        game.roundWinnerName = player.displayName;
        emitGame(io, roomId);
        finishBombTurn(io, roomId, socket.id);
        ack?.({ ok: true, correct: true, points });
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

    socket.on("group:game-stop", safeHandler("group:game-stop", async ({ roomId }, ack) => {
      if (!socket.data.groupRooms?.has(roomId) || !["admin", "developer", "premium"].includes(roleOf(socket))) {
        ack?.({ ok: false, error: "Only Premium users, admins, or developers can end a game." });
        return;
      }
      const game = roomGames.get(roomId);
      if (game) {
        clearGameTimer(game);
        roomGames.delete(roomId);
        io.to(roomId).emit("group:game-state", null);
      }
      ack?.({ ok: true });
    }));

    // --- Song Guess: all secret answer state stays in this process ---------
    socket.on("arcade:song:start", safeHandler("arcade:song:start", async ({ roomId, ...config }, ack) => {
      if (!canControlSong(socket, roomId)) {
        ack?.({ ok: false, error: "Only the room host can control Song Guess." });
        return;
      }
      const participants = [...(io.sockets.adapter.rooms.get(roomId) || [])]
        .filter((socketId) => io.sockets.sockets.get(socketId)?.data?.groupRooms?.has(roomId));
      if (participants.length < 4) {
        ack?.({ ok: false, error: "Song Guess supports 4–12 players. Invite at least four people first." });
        return;
      }
      const existing = songGames.get(roomId);
      if (existing && ["live", "paused", "result"].includes(existing.status)) {
        ack?.({ ok: false, error: "A Song Guess game is already running." });
        return;
      }
      if (existing) { clearSongTimer(existing); songGames.delete(roomId); }
      try {
        const game = await createSongGame(io, roomId, config);
        ack?.({ ok: true, gameId: game.gameId });
      } catch (error) {
        console.error("[groupRooms] song game start failed:", error.message);
        ack?.({ ok: false, error: "No playable songs matched those filters. Try Trending, Popular, or Random." });
      }
    }));

    socket.on("arcade:song:guess", safeHandler("arcade:song:guess", async ({ roomId, gameId, roundToken, answer, choice }, ack) => {
      const result = await submitSongGuess(io, roomId, socket, { gameId, roundToken, answer, choice });
      ack?.(result);
    }));

    socket.on("arcade:song:pause", safeHandler("arcade:song:pause", async ({ roomId, action = "pause" }, ack) => {
      const game = songGames.get(roomId);
      if (!canControlSong(socket, roomId) || !game) { ack?.({ ok: false, error: "Only the room host can pause Song Guess." }); return; }
      if (action === "pause" && game.status === "live") {
        game.pausedRemainingMs = Math.max(0, game.roundEndsAt - Date.now());
        clearSongTimer(game);
        game.status = "paused";
        io.to(roomId).emit("arcade:song:round", publicSongGame(game));
      } else if (action === "resume" && game.status === "paused") {
        game.status = "live";
        game.roundStartedAt = Date.now() - (game.timeLimitMs - game.pausedRemainingMs);
        game.roundEndsAt = Date.now() + game.pausedRemainingMs;
        io.to(roomId).emit("arcade:song:round", publicSongGame(game));
        game.timer = setTimeout(() => finishSongRound(io, roomId, game), game.pausedRemainingMs + 250);
      }
      ack?.({ ok: true });
    }));

    socket.on("arcade:song:audio-failed", safeHandler("arcade:song:audio-failed", async ({ roomId, gameId, roundToken }, ack) => {
      const game = songGames.get(roomId);
      if (!game || game.gameId !== gameId || game.roundToken !== roundToken || !game.players[socket.data.fingerprint] || game.status !== "live") { ack?.({ ok: false }); return; }
      const fallback = game.trackPool.find((track) => !game.usedTrackIds.has(track.id));
      if (!fallback) { ack?.({ ok: false, error: "No fallback track is available." }); return; }
      clearSongTimer(game);
      game.usedTrackIds.add(fallback.id);
      game.currentTrack = fallback;
      game.nextTrack = game.trackPool.find((track) => !game.usedTrackIds.has(track.id)) || fallback;
      game.currentOptions = songOptions(game);
      game.roundToken = uuid();
      game.roundStartedAt = Date.now();
      game.roundEndsAt = game.roundStartedAt + game.timeLimitMs;
      game.answered = new Set();
      game.fallbackCount += 1;
      io.to(roomId).emit("arcade:song:round", publicSongGame(game));
      game.timer = setTimeout(() => finishSongRound(io, roomId, game), game.timeLimitMs + 250);
      ack?.({ ok: true });
    }));

    socket.on("arcade:song:next", safeHandler("arcade:song:next", async ({ roomId, gameId }, ack) => {
      const game = songGames.get(roomId);
      if (!canControlSong(socket, roomId) || !game || game.gameId !== gameId || game.status !== "result") {
        ack?.({ ok: false, error: "The next round is not ready." });
        return;
      }
      clearSongTimer(game);
      if (game.round >= game.totalRounds) finishSongGame(io, roomId, game);
      else startSongRound(io, roomId, game);
      ack?.({ ok: true });
    }));

    socket.on("arcade:song:end", safeHandler("arcade:song:end", async ({ roomId }, ack) => {
      const game = songGames.get(roomId);
      if (!canControlSong(socket, roomId) || !game) { ack?.({ ok: false, error: "Only the room host can end Song Guess." }); return; }
      finishSongGame(io, roomId, game);
      ack?.({ ok: true });
    }));

    socket.on("arcade:song:rematch", safeHandler("arcade:song:rematch", async ({ roomId, config = {} }, ack) => {
      if (!canControlSong(socket, roomId)) { ack?.({ ok: false, error: "Only the room host can start a rematch." }); return; }
      const existing = songGames.get(roomId);
      if (existing) { clearSongTimer(existing); songGames.delete(roomId); }
      try {
        const game = await createSongGame(io, roomId, config);
        ack?.({ ok: true, gameId: game.gameId });
      } catch (error) {
        ack?.({ ok: false, error: "The rematch could not find playable songs." });
      }
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
