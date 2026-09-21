"use strict";

function required(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

function getConfig() {
  return {
    appUrl: required("APP_URL").replace(/\/$/, ""),

    oauthClientId: required(
      "GITHUB_OAUTH_CLIENT_ID"
    ),

    oauthClientSecret: required(
      "GITHUB_OAUTH_CLIENT_SECRET"
    ),

    adminLogins: required(
      "ADMIN_GITHUB_LOGINS"
    )
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),

    appId: required("GITHUB_APP_ID"),

    appPrivateKey: required(
      "GITHUB_APP_PRIVATE_KEY"
    ).replace(/\\n/g, "\n"),

    installationId: required(
      "GITHUB_APP_INSTALLATION_ID"
    ),

    dataOwner: required(
      "GITHUB_DATA_OWNER"
    ),

    dataRepo: required(
      "GITHUB_DATA_REPO"
    ),

    dataBranch:
      process.env.GITHUB_DATA_BRANCH || "main",

    catalogPath:
      process.env.GITHUB_CATALOG_PATH ||
      "catalog.json"
  };
}

function encodePath(path) {
  return path
    .split("/")
    .map(encodeURIComponent)
    .join("/");
}

function rawBaseUrl(config) {
  return [
    "https://raw.githubusercontent.com",
    encodeURIComponent(config.dataOwner),
    encodeURIComponent(config.dataRepo),
    encodeURIComponent(config.dataBranch)
  ].join("/");
}

function rawFileUrl(config, path) {
  return `${rawBaseUrl(config)}/${encodePath(path)}`;
}

module.exports = {
  getConfig,
  encodePath,
  rawBaseUrl,
  rawFileUrl
};
