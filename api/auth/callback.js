"use strict";

const {
  getConfig
} = require("../_lib/config");

const {
  createSession,
  getCookie,
  serializeCookie,
  isSecureRequest
} = require("../_lib/auth");

const {
  redirect,
  json
} = require("../_lib/http");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.end("Method not allowed");
    return;
  }

  try {
    const config = getConfig();

    const query = new URL(
      req.url,
      config.appUrl
    ).searchParams;

    const code = query.get("code");
    const state = query.get("state");
    const savedState = getCookie(req, "oauth_state");

    if (
      !code ||
      !state ||
      !savedState ||
      state !== savedState
    ) {
      json(res, 400, {
        error: "Invalid OAuth state."
      });

      return;
    }

    const tokenResponse = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type":
            "application/x-www-form-urlencoded",
          "User-Agent": "COPC-Viewer"
        },
        body: new URLSearchParams({
          client_id: config.oauthClientId,
          client_secret:
            config.oauthClientSecret,
          code,
          redirect_uri:
            `${config.appUrl}/api/auth/callback`
        })
      }
    );

    const tokenData =
      await tokenResponse.json();

    if (
      !tokenResponse.ok ||
      !tokenData.access_token
    ) {
      json(res, 401, {
        error: "GitHub OAuth exchange failed."
      });

      return;
    }

    const userResponse = await fetch(
      "https://api.github.com/user",
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "COPC-Viewer",
          Authorization:
            `Bearer ${tokenData.access_token}`
        }
      }
    );

    const user = await userResponse.json();

    if (!user.login) {
      json(res, 401, {
        error: "Could not identify GitHub user."
      });

      return;
    }

    const allowed =
      config.adminLogins.includes(
        user.login.toLowerCase()
      );

    if (!allowed) {
      json(res, 403, {
        error:
          "This GitHub account is not an authorized administrator."
      });

      return;
    }

    const session = createSession(user.login);

    res.setHeader("Set-Cookie", [
      serializeCookie(
        "admin_session",
        session,
        {
          maxAge: 60 * 60 * 24 * 7,
          secure: isSecureRequest(req),
          httpOnly: true,
          sameSite: "Lax"
        }
      ),
      serializeCookie(
        "oauth_state",
        "",
        {
          maxAge: 0,
          secure: isSecureRequest(req),
          httpOnly: true,
          sameSite: "Lax"
        }
      )
    ]);

    redirect(res, "/");
  } catch (error) {
    json(res, 500, {
      error: error.message
    });
  }
};
