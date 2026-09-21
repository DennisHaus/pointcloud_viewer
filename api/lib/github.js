"use strict";

const crypto = require("crypto");

function base64url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createAppJwt(appId, privateKey) {
  const now = Math.floor(Date.now() / 1000);

  const header = base64url(
    JSON.stringify({
      alg: "RS256",
      typ: "JWT"
    })
  );

  const payload = base64url(
    JSON.stringify({
      iat: now - 60,
      exp: now + 540,
      iss: appId
    })
  );

  const unsigned = `${header}.${payload}`;

  const signer = crypto.createSign(
    "RSA-SHA256"
  );

  signer.update(unsigned);
  signer.end();

  const signature = signer.sign(privateKey);

  return `${unsigned}.${base64url(signature)}`;
}

async function createInstallationToken(config) {
  const appJwt = createAppJwt(
    config.appId,
    config.appPrivateKey
  );

  const response = await fetch(
    `https://api.github.com/app/installations/${config.installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "COPC-Viewer",
        "X-GitHub-Api-Version": "2022-11-28",
        Authorization: `Bearer ${appJwt}`
      },
      body: JSON.stringify({
        repositories: [config.dataRepo],
        permissions: {
          contents: "write"
        }
      })
    }
  );

  if (!response.ok) {
    const message = await response.text();

    throw new Error(
      `Could not create GitHub installation token: ${message}`
    );
  }

  return response.json();
}

module.exports = {
  createInstallationToken
};
