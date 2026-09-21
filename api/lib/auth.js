"use strict";

const crypto = require("crypto");
const { json } = require("./http");

const SESSION_MAX_AGE =
  60 * 60 * 24 * 7;

function base64url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function sign(value) {
  return base64url(
    crypto
      .createHmac(
        "sha256",
        process.env.SESSION_SECRET
      )
      .update(value)
      .digest()
  );
}

function createSession(login) {
  const payload = base64url(
    JSON.stringify({
      login,
      exp:
        Date.now() +
        SESSION_MAX_AGE * 1000
    })
  );

  return `${payload}.${sign(payload)}`;
}

function getCookie(req, name) {
  const header = req.headers.cookie || "";

  const cookies = header
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);

  for (const cookie of cookies) {
    const separator = cookie.indexOf("=");

    if (separator === -1) continue;

    const key = cookie.slice(0, separator);
    const value = cookie.slice(separator + 1);

    if (key === name) {
      return decodeURIComponent(value);
    }
  }

  return null;
}

function parseSession(req) {
  try {
    const value = getCookie(req, "admin_session");

    if (!value) return null;

    const parts = value.split(".");

    if (parts.length !== 2) return null;

    const payload = parts[0];
    const providedSignature = parts[1];
    const expectedSignature = sign(payload);

    const provided = Buffer.from(
      providedSignature
    );

    const expected = Buffer.from(
      expectedSignature
    );

    if (
      provided.length !== expected.length ||
      !crypto.timingSafeEqual(provided, expected)
    ) {
      return null;
    }

    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString()
    );

    if (!decoded.exp || decoded.exp < Date.now()) {
      return null;
    }

    return decoded;
  } catch (error) {
    return null;
  }
}

function serializeCookie(
  name,
  value,
  options = {}
) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${options.path || "/"}`,
    `SameSite=${options.sameSite || "Lax"}`
  ];

  if (options.httpOnly !== false) {
    parts.push("HttpOnly");
  }

  if (options.secure) {
    parts.push("Secure");
  }

  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${options.maxAge}`);
  }

  return parts.join("; ");
}

function isSecureRequest(req) {
  return (
    req.headers["x-forwarded-proto"] === "https" ||
    process.env.APP_URL?.startsWith("https://")
  );
}

function requireAdmin(req, res) {
  const session = parseSession(req);

  if (!session) {
    json(res, 401, {
      error: "Administrator authentication required."
    });

    return null;
  }

  return session;
}

module.exports = {
  createSession,
  getCookie,
  parseSession,
  serializeCookie,
  isSecureRequest,
  requireAdmin,
  SESSION_MAX_AGE
};
