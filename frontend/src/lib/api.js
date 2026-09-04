import { SERVER_URL } from "./socket.js";

async function request(path, options = {}) {
  const res = await fetch(`${SERVER_URL}/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  listRooms: () => request("/rooms"),
  listMyRooms: (fingerprint) => request(`/rooms/mine?fingerprint=${encodeURIComponent(fingerprint)}`),
  getRoom: (id) => request(`/rooms/${id}`),
  createRoom: (payload) => request("/rooms", { method: "POST", body: JSON.stringify(payload) }),
  updateRoom: (id, payload) => request(`/rooms/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteRoom: (id, fingerprint) =>
    request(`/rooms/${id}?fingerprint=${encodeURIComponent(fingerprint)}`, { method: "DELETE" }),
};
