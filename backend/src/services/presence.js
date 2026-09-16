const sockets = new Set();
const socketRefs = new Map();
const identityStats = new Map();

export function trackSocket(socket) {
  sockets.add(socket.id);
  socketRefs.set(socket.id, socket);
  socket.data.joinCount = 0;
  socket.once("disconnect", () => sockets.delete(socket.id));
  socket.once("disconnect", () => socketRefs.delete(socket.id));
}

export function connectedUsers() {
  return sockets.size;
}

export function noteIdentity(socket) {
  const key = socket.data.fingerprint || socket.id;
  const current = identityStats.get(key) || { joinCount: 0, ipMatchCount: 0, lastSeenAt: 0 };
  current.ipHash = socket.data.ipHash;
  current.lastSeenAt = Date.now();
  current.displayName = socket.data.displayName || "Guest";
  identityStats.set(key, current);
}

export function noteJoin(socket) {
  socket.data.joinCount = (socket.data.joinCount || 0) + 1;
  const current = identityStats.get(socket.data.fingerprint) || {};
  current.joinCount = (current.joinCount || 0) + 1;
  identityStats.set(socket.data.fingerprint, current);
}

export function adminPresence() {
  const membersByRoom = {};
  for (const socket of socketRefs.values()) {
    for (const roomId of socket.data.groupRooms || []) {
      membersByRoom[roomId] ||= [];
      membersByRoom[roomId].push({
        socketId: socket.id,
        name: socket.data.displayName || "Guest",
        fingerprint: socket.data.fingerprint,
        ipHash: socket.data.ipHash,
        joinCount: socket.data.joinCount || 0,
        role: socket.data.role || "user",
      });
    }
  }
  return membersByRoom;
}

export function abuseSignals(fingerprint, ipHash) {
  const matches = [...socketRefs.values()].filter((socket) => socket.data.ipHash && socket.data.ipHash === ipHash).length;
  const stat = identityStats.get(fingerprint) || {};
  return { ipMatchCount: matches, deviceSessionMatch: Boolean(fingerprint && stat.lastSeenAt), repeatedJoins: stat.joinCount || 0 };
}

export function disconnectMatching({ fingerprint, ipHash }) {
  let disconnected = 0;
  for (const socket of socketRefs.values()) {
    if ((fingerprint && socket.data.fingerprint === fingerprint) || (ipHash && socket.data.ipHash === ipHash)) {
      socket.emit("blocked", { reason: "banned" });
      socket.disconnect(true);
      disconnected += 1;
    }
  }
  return disconnected;
}
