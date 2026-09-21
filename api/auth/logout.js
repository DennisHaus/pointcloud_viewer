"use strict";

const {
  serializeCookie,
  isSecureRequest
} = require("../_lib/auth");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end("Method not allowed");
    return;
  }

  res.setHeader(
    "Set-Cookie",
    serializeCookie(
      "admin_session",
      "",
      {
        maxAge: 0,
        secure: isSecureRequest(req),
        httpOnly: true,
        sameSite: "Lax"
      }
    )
  );

  res.statusCode = 204;
  res.end();
};
