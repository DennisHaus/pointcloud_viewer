"use strict";

const {
  getConfig,
  rawFileUrl
} = require("./_lib/config");

const {
  json
} = require("./_lib/http");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.end("Method not allowed");
    return;
  }

  try {
    const config = getConfig();

    const catalogUrl =
      `${rawFileUrl(config, config.catalogPath)}?t=${Date.now()}`;

    const response = await fetch(catalogUrl, {
      cache: "no-store"
    });

    if (response.status === 404) {
      json(res, 200, {
        version: 1,
        scans: []
      });

      return;
    }

    if (!response.ok) {
      throw new Error(
        `Catalog request failed with HTTP ${response.status}.`
      );
    }

    const catalog = await response.json();

    const scans = Array.isArray(catalog)
      ? catalog
      : Array.isArray(catalog.scans)
        ? catalog.scans
        : [];

    const normalized = scans.map((scan) => {
      const result = {
        ...scan
      };

      if (
        !result.url &&
        result.path
      ) {
        result.url = rawFileUrl(
          config,
          result.path
        );
      }

      return result;
    });

    json(res, 200, {
      version: catalog.version || 1,
      scans: normalized
    });
  } catch (error) {
    json(res, 500, {
      error: error.message
    });
  }
};
