const sockets = new Set();

export function trackSocket(socket) {
  sockets.add(socket.id);
  socket.once("disconnect", () => sockets.delete(socket.id));
}

export function connectedUsers() {
  return sockets.size;
}
