"use strict";

const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();

const ROOT_DIR = __dirname;
const SCANS_DIR = path.join(ROOT_DIR, "scans");
const CATALOG_FILE = path.join(ROOT_DIR, "catalog.json");

const PORT = process.env.PORT || 3000;
const MAX_FILE_SIZE = 95 * 1024 * 1024;

fs.mkdirSync(SCANS_DIR, {
  recursive: true
});

if (!fs.existsSync(CATALOG_FILE)) {
  fs.writeFileSync(
    CATALOG_FILE,
    JSON.stringify({ scans: [] }, null, 2),
    "utf8"
  );
}

function readCatalog() {
  try {
    const contents = fs.readFileSync(
      CATALOG_FILE,
      "utf8"
    );

    const parsed = JSON.parse(contents);

    if (Array.isArray(parsed)) {
      return {
        scans: parsed
      };
    }

    if (!Array.isArray(parsed.scans)) {
      parsed.scans = [];
    }

    return parsed;
  } catch (error) {
    console.error("Could not read catalog.json:", error);

    return {
      scans: []
    };
  }
}

function writeCatalog(catalog) {
  fs.writeFileSync(
    CATALOG_FILE,
    JSON.stringify(catalog, null, 2),
    "utf8"
  );
}

function cleanFilename(filename) {
  const base = path.basename(filename);

  return base
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_");
}

function getUniqueFilename(filename) {
  const cleaned = cleanFilename(filename);

  const extension = ".copc.laz";
  const withoutExtension = cleaned.replace(
    /\.copc\.laz$/i,
    ""
  );

  let candidate = `${withoutExtension}${extension}`;
  let counter = 1;

  while (
    fs.existsSync(
      path.join(SCANS_DIR, candidate)
    )
  ) {
    candidate =
      `${withoutExtension}-${counter}${extension}`;

    counter += 1;
  }

  return candidate;
}

const storage = multer.diskStorage({
  destination: (request, file, callback) => {
    callback(null, SCANS_DIR);
  },

  filename: (request, file, callback) => {
    callback(
      null,
      getUniqueFilename(file.originalname)
    );
  }
});

const upload = multer({
  storage,

  limits: {
    fileSize: MAX_FILE_SIZE
  },

  fileFilter: (request, file, callback) => {
    const filename =
      file.originalname.toLowerCase();

    if (!filename.endsWith(".copc.laz")) {
      callback(
        new Error(
          "Only .copc.laz files are accepted"
        )
      );

      return;
    }

    callback(null, true);
  }
});

/* Return the current catalog */
app.get("/api/scans", (request, response) => {
  response.json(readCatalog());
});

/* Upload one COPC file */
app.post(
  "/api/scans",
  upload.single("file"),
  (request, response) => {
    if (!request.file) {
      response.status(400).json({
        error: "No file was uploaded"
      });

      return;
    }

    const originalName = path.basename(
      request.file.originalname
    );

    const scanName = originalName.replace(
      /\.copc\.laz$/i,
      ""
    );

    const scan = {
      id: crypto.randomUUID(),
      name: scanName,
      filename: request.file.filename,
      url:
        `/scans/${encodeURIComponent(
          request.file.filename
        )}`,
      size: request.file.size,
      uploadedAt: new Date().toISOString(),
      crs: null,
      points: null
    };

    const catalog = readCatalog();

    catalog.scans.unshift(scan);

    writeCatalog(catalog);

    response.status(201).json(scan);
  }
);

/* Serve uploaded scans */
app.use(
  "/scans",
  express.static(SCANS_DIR)
);

/* Serve index.html, app.js, style.css, Potree, and libraries */
app.use(
  express.static(ROOT_DIR)
);

/* Upload and request error handler */
app.use((error, request, response, next) => {
  console.error(error);

  if (
    error instanceof multer.MulterError &&
    error.code === "LIMIT_FILE_SIZE"
  ) {
    response.status(413).json({
      error: "File is larger than 95 MiB"
    });

    return;
  }

  response.status(400).json({
    error: error.message || "Request failed"
  });
});

app.listen(PORT, () => {
  console.log(
    `Pointcloud viewer running at http://localhost:${PORT}`
  );
});
