import crypto from "crypto";

export const ADMIN_COOKIE = "randomconnect_admin";
export const ADMIN_SESSION_MS = 8 * 60 * 60 * 1000;
export const ADMIN_DEVICE_COOKIE = "randomconnect_admin_device";

export function signAdminSession(issuedAt) {
  return crypto
    .createHmac("sha256", process.env.ADMIN_SESSION_SECRET || "")
    .update(String(issuedAt))
    .digest("base64url");
}

export function isValidAdminToken(token) {
  if (!token || !process.env.ADMIN_SESSION_SECRET) return false;
  const [issuedAt, signature] = token.split(".");
  const issued = Number(issuedAt);
  if (!Number.isSafeInteger(issued) || Date.now() - issued > ADMIN_SESSION_MS || Date.now() < issued) return false;

  const expectedBuffer = Buffer.from(signAdminSession(issuedAt));
  const actualBuffer = Buffer.from(signature || "");
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
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

export function hashDeviceToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

export function deviceTokenFromCookieHeader(cookieHeader = "") {
  const cookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ADMIN_DEVICE_COOKIE}=`));
  if (!cookie) return null;
  try {
    return decodeURIComponent(cookie.slice(ADMIN_DEVICE_COOKIE.length + 1));
  } catch {
    return null;
  }
}
