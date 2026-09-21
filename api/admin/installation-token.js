"use strict";

const {
  getConfig,
  rawBaseUrl
} = require("../_lib/config");

const {
  requireAdmin
} = require("../_lib/auth");

const {
  createInstallationToken
} = require("../_lib/github");

const {
  json
} = require("../_lib/http");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.end("Method not allowed");
    return;
  }

  const session = requireAdmin(req, res);

  if (!session) return;

  try {
    const config = getConfig();

    const installationToken =
      await createInstallationToken(config);

    json(res, 200, {
      token: installationToken.token,
      expiresAt: installationToken.expires_at,
      apiBase: "https://api.github.com",
      owner: config.dataOwner,
      repo: config.dataRepo,
      branch: config.dataBranch,
      catalogPath: config.catalogPath,
      rawBaseUrl: rawBaseUrl(config)
    });
  } catch (error) {
    json(res, 500, {
      error: error.message
    });
  }
};
