import crypto from "crypto";

export const ADMIN_COOKIE = "randomconnect_admin";
export const ADMIN_SESSION_MS = 8 * 60 * 60 * 1000;
export const ADMIN_DEVICE_COOKIE = "randomconnect_admin_device";

export function adminDeviceCookieName(accountId) {
  return `${ADMIN_DEVICE_COOKIE}_${accountId}`;
}

export function signAdminSession(issuedAt, role = "admin", accountId = role) {
  return crypto
    .createHmac("sha256", process.env.ADMIN_SESSION_SECRET || "")
    .update(`${issuedAt}.${role}.${accountId}`)
    .digest("base64url");
}

export function adminSessionFromToken(token) {
  if (!token || !process.env.ADMIN_SESSION_SECRET) return false;
  const [issuedAt, role, accountId = role, signature] = token.split(".");
  if (!["developer", "admin"].includes(role)) return false;
  const issued = Number(issuedAt);
  if (!Number.isSafeInteger(issued) || Date.now() - issued > ADMIN_SESSION_MS || Date.now() < issued) return false;

  const expectedBuffer = Buffer.from(signAdminSession(issuedAt, role, accountId));
  const actualBuffer = Buffer.from(signature || "");
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return false;
  return { role, accountId };
}

export function isValidAdminToken(token) {
  return Boolean(adminSessionFromToken(token));
}

export function adminTokenFromCookieHeader(cookieHeader = "") {
  const cookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ADMIN_COOKIE}=`));
  if (!cookie) return null;
  try {
    return decodeURIComponent(cookie.slice(ADMIN_COOKIE.length + 1));
  } catch {
    return null;
  }
}

export function adminRoleFromCookieHeader(cookieHeader = "") {
  const token = adminTokenFromCookieHeader(cookieHeader);
  return adminSessionFromToken(token)?.role || null;
}

export function isAdminCookieHeader(cookieHeader) {
  return isValidAdminToken(adminTokenFromCookieHeader(cookieHeader));
}

export function passwordsMatch(candidate, configured) {
  const candidateBuffer = Buffer.from(String(candidate || ""));
  const configuredBuffer = Buffer.from(configured || "");
  return candidateBuffer.length === configuredBuffer.length && crypto.timingSafeEqual(candidateBuffer, configuredBuffer);
}

export function createDeviceToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function staffAccounts() {
  const accounts = [];
  if (process.env.ADMIN_PASSWORD) {
    accounts.push({
      id: "developer",
      role: "developer",
      password: process.env.ADMIN_PASSWORD,
      displayName: (process.env.ADMIN_DISPLAY_NAME || "Developer").trim().slice(0, 30),
    });
  }

  let managers = [];
  try {
    managers = process.env.ADMIN_MANAGERS ? JSON.parse(process.env.ADMIN_MANAGERS) : [];
  } catch {
    managers = [];
  }
  if (!Array.isArray(managers)) managers = [];
  if (process.env.ADMIN_MANAGER_PASSWORD) {
    managers.unshift({
      id: "manager",
      password: process.env.ADMIN_MANAGER_PASSWORD,
      displayName: process.env.ADMIN_MANAGER_DISPLAY_NAME || "Admin Manager",
    });
  }
  managers.forEach((manager, index) => {
    if (!manager?.password) return;
    accounts.push({
      id: String(manager.id || `manager-${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 40),
      role: "admin",
      password: String(manager.password),
      displayName: String(manager.displayName || manager.name || `Admin Manager ${index + 1}`).trim().slice(0, 30),
    });
  });
  return accounts;
}

export function staffAccountFromPassword(password) {
  return staffAccounts().find((account) => passwordsMatch(password, account.password)) || null;
}

export function staffAccountFromSession(session) {
  return staffAccounts().find((account) => account.id === session?.accountId && account.role === session?.role) || null;
}

export function hashDeviceToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

export function deviceTokenFromCookieHeader(cookieHeader = "", accountId = "admin") {
  const cookieName = adminDeviceCookieName(accountId);
  const cookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`));
  if (!cookie) return null;
  try {
    return decodeURIComponent(cookie.slice(cookieName.length + 1));
  } catch {
    return null;
  }
}
