"use strict";

const {
  parseSession
} = require("../_lib/auth");

const {
  json
} = require("../_lib/http");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.end("Method not allowed");
    return;
  }

  const session = parseSession(req);

  if (!session) {
    json(res, 200, {
      authenticated: false
    });

    return;
  }

  json(res, 200, {
    authenticated: true,
    login: session.login
  });
};
