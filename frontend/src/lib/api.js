import { SERVER_URL } from "./socket.js";

async function request(path, options = {}) {
  const res = await fetch(`${SERVER_URL}/api${path}`, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  stats: () => request("/stats"),
  listRooms: () => request("/rooms"),
  listMyRooms: (fingerprint) => request(`/rooms/mine?fingerprint=${encodeURIComponent(fingerprint)}`),
  getRoom: (id) => request(`/rooms/${id}`),
  createRoom: (payload) => request("/rooms", { method: "POST", body: JSON.stringify(payload) }),
  updateRoom: (id, payload) => request(`/rooms/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteRoom: (id, fingerprint) =>
    request(`/rooms/${id}?fingerprint=${encodeURIComponent(fingerprint)}`, { method: "DELETE" }),
  adminLogin: (password) => request("/admin/login", { method: "POST", body: JSON.stringify({ password }) }),
  adminLogout: () => request("/admin/logout", { method: "POST" }),
  adminSession: () => request("/admin/session"),
  adminReports: (status = "pending") => request(`/admin/reports?status=${encodeURIComponent(status)}`),
  updateAdminReport: (id, status) => request(`/admin/reports/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  adminRooms: () => request("/admin/rooms"),
  deleteAdminRoom: (id) => request(`/admin/rooms/${id}`, { method: "DELETE" }),
};
