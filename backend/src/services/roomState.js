/**
 * Tracks who is actually in a room right now, plus live moderation state
 * (mutes, the waiting room, and per-room kicks). Room *metadata* (name,
 * topic, creator, moderator list) lives in MongoDB (Room.js) since it needs
 * to survive a server restart; this tracks fast-changing presence and
 * moderation actions that don't need that durability.
 *
 * Swap for Redis once you run more than one server process — this only
 * works on a single node.
 */
class RoomState {
  constructor() {
    this.rooms = new Map();
    // roomId -> {
    //   participants: Map<socketId, {fingerprint, displayName}>,
    //   mutedFingerprints: Set<fingerprint>,
    //   waitingRoom: Map<socketId, {fingerprint, displayName}>,
    //   kickedFingerprints: Set<fingerprint>,
    // }
  }

  ensureRoom(roomId) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, {
        participants: new Map(),
        mutedFingerprints: new Set(),
        waitingRoom: new Map(),
        kickedFingerprints: new Set(),
      });
    }
    return this.rooms.get(roomId);
  }

  join(roomId, socketId, meta) {
    const room = this.ensureRoom(roomId);
    room.participants.set(socketId, meta);
    return [...room.participants.keys()].filter((id) => id !== socketId);
  }

  leave(roomId, socketId) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.participants.delete(socketId);
    this.pruneIfEmpty(roomId);
  }

  leaveAll(socketId) {
    const affected = [];
    for (const [roomId, room] of this.rooms.entries()) {
      if (room.participants.has(socketId)) {
        room.participants.delete(socketId);
        affected.push(roomId);
        this.pruneIfEmpty(roomId);
      }
    }
    return affected;
  }

  // A room's moderation state (mutes, kicks) only makes sense while the room
  // has been continuously live. Once everyone leaves, drop it entirely so a
  // stale kick doesn't linger and lock someone out of a room days later.
  pruneIfEmpty(roomId) {
    const room = this.rooms.get(roomId);
    if (room && room.participants.size === 0 && room.waitingRoom.size === 0) {
      this.rooms.delete(roomId);
    }
  }

  participantCount(roomId) {
    return this.rooms.get(roomId)?.participants.size || 0;
  }

  participants(roomId) {
    const room = this.rooms.get(roomId);
    return room ? [...room.participants.entries()].map(([socketId, meta]) => ({ socketId, ...meta })) : [];
  }

  liveCounts() {
    const counts = {};
    for (const [roomId, room] of this.rooms.entries()) counts[roomId] = room.participants.size;
    return counts;
  }

  // --- Moderation: mute -----------------------------------------------------

  mute(roomId, fingerprint) {
    this.ensureRoom(roomId).mutedFingerprints.add(fingerprint);
  }

  unmute(roomId, fingerprint) {
    this.rooms.get(roomId)?.mutedFingerprints.delete(fingerprint);
  }

  isMuted(roomId, fingerprint) {
    return this.rooms.get(roomId)?.mutedFingerprints.has(fingerprint) || false;
  }

  // --- Moderation: waiting room ----------------------------------------------

  hold(roomId, socketId, meta) {
    const room = this.ensureRoom(roomId);
    room.participants.delete(socketId);
    room.waitingRoom.set(socketId, meta);
  }

  admit(roomId, socketId) {
    const room = this.rooms.get(roomId);
    room?.waitingRoom.delete(socketId);
    this.pruneIfEmpty(roomId);
  }

  denyFromWaitingRoom(roomId, socketId) {
    const room = this.rooms.get(roomId);
    room?.waitingRoom.delete(socketId);
    this.pruneIfEmpty(roomId);
  }

  waitingList(roomId) {
    const room = this.rooms.get(roomId);
    return room ? [...room.waitingRoom.entries()].map(([socketId, meta]) => ({ socketId, ...meta })) : [];
  }

  // --- Moderation: kick (per-room, lasts as long as the room stays live) ----

  kick(roomId, socketId, fingerprint) {
    const room = this.ensureRoom(roomId);
    room.participants.delete(socketId);
    room.waitingRoom.delete(socketId);
    room.kickedFingerprints.add(fingerprint);
  }

  isKicked(roomId, fingerprint) {
    return this.rooms.get(roomId)?.kickedFingerprints.has(fingerprint) || false;
  }
}

export const roomState = new RoomState();
