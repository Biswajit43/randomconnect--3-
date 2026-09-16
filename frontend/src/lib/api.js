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
  adminLogoutOnExit: () => {
    const body = new Blob(["{}"], { type: "application/json" });
    navigator.sendBeacon(`${SERVER_URL}/api/admin/logout`, body);
  },
  adminSession: () => request("/admin/session"),
  adminReports: (status = "pending") => request(`/admin/reports?status=${encodeURIComponent(status)}`),
  updateAdminReport: (id, status) => request(`/admin/reports/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  approveAdminReportBan: (id, duration) => request(`/admin/reports/${id}/approve-ban`, { method: "POST", body: JSON.stringify({ duration }) }),
  adminRooms: () => request("/admin/rooms"),
  adminUsage: () => request("/admin/usage"),
  deleteAdminRoom: (id) => request(`/admin/rooms/${id}`, { method: "DELETE" }),
  updateAdminRoom: (id, payload) => request(`/admin/rooms/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  removeAllAdminMembers: (id) => request(`/admin/rooms/${id}/remove-all`, { method: "POST", body: JSON.stringify({ confirm: true }) }),
  adminBans: () => request("/admin/bans"),
  createAdminBan: (payload) => request("/admin/bans", { method: "POST", body: JSON.stringify(payload) }),
  removeAdminBan: (id) => request(`/admin/bans/${id}`, { method: "DELETE" }),
  adminAudit: () => request("/admin/audit"),
};
