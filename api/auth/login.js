"use strict";

const crypto = require("crypto");

const {
  getConfig
} = require("../_lib/config");

const {
  serializeCookie,
  isSecureRequest
} = require("../_lib/auth");

const {
  redirect
} = require("../_lib/http");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.end("Method not allowed");
    return;
  }

  const config = getConfig();

  const state = crypto
    .randomBytes(32)
    .toString("hex");

  const callbackUrl =
    `${config.appUrl}/api/auth/callback`;

  const authorizeUrl = new URL(
    "https://github.com/login/oauth/authorize"
  );

  authorizeUrl.searchParams.set(
    "client_id",
    config.oauthClientId
  );

  authorizeUrl.searchParams.set(
    "redirect_uri",
    callbackUrl
  );

  authorizeUrl.searchParams.set(
    "scope",
    "read:user"
  );

  authorizeUrl.searchParams.set(
    "state",
    state
  );

  res.setHeader(
    "Set-Cookie",
    serializeCookie(
      "oauth_state",
      state,
      {
        maxAge: 600,
        secure: isSecureRequest(req),
        httpOnly: true,
        sameSite: "Lax"
      }
    )
  );

  redirect(res, authorizeUrl.toString());
};
