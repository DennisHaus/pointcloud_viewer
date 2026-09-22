"use strict";

const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const app = express();

const PORT = 3000;
const ROOT_DIR = __dirname;
const SCANS_DIR = path.join(ROOT_DIR, "scans");
const CATALOG_FILE = path.join(ROOT_DIR, "catalog.json");
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
    const content = fs.readFileSync(
      CATALOG_FILE,
      "utf8"
    );

    const catalog = JSON.parse(content);

    if (Array.isArray(catalog)) {
      return {
        scans: catalog
      };
    }

    if (!Array.isArray(catalog.scans)) {
      catalog.scans = [];
    }

    return catalog;
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

function sanitizeFilename(filename) {
  return path
    .basename(filename)
    .replace(/[^a-zA-Z0-9._-]/g, "_");
}

function createUniqueFilename(originalFilename) {
  const cleanName = sanitizeFilename(
    originalFilename
  );

  const extension = ".copc.laz";

  let baseName = cleanName.replace(
    /\.copc\.laz$/i,
    ""
  );

  if (!baseName) {
    baseName = "scan";
  }

  let filename = `${baseName}${extension}`;
  let counter = 1;

  while (
    fs.existsSync(
      path.join(SCANS_DIR, filename)
    )
  ) {
    filename =
      `${baseName}-${counter}${extension}`;

    counter += 1;
  }

  return filename;
}

const storage = multer.diskStorage({
  destination: (request, file, callback) => {
    callback(null, SCANS_DIR);
  },

  filename: (request, file, callback) => {
    const filename = createUniqueFilename(
      file.originalname
    );

    callback(null, filename);
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
          "Only .copc.laz files are accepted."
        )
      );

      return;
    }

    callback(null, true);
  }
});

/*
  Return catalog.json
*/
app.get("/api/scans", (request, response) => {
  response.json(readCatalog());
});

/*
  Upload a COPC file, save it in /scans,
  and add it to catalog.json.
*/
app.post(
  "/api/scans",
  upload.single("file"),
  (request, response) => {
    if (!request.file) {
      response.status(400).json({
        error: "No file was uploaded."
      });

      return;
    }

    const filename = request.file.filename;

    const name = filename.replace(
      /\.copc\.laz$/i,
      ""
    );

    const scan = {
      id: `${Date.now()}-${filename}`,
      name,
      filename,
      url: `/scans/${encodeURIComponent(filename)}`,
      size: request.file.size,
      uploadedAt: new Date().toISOString(),
      points: null,
      crs: null
    };

    const catalog = readCatalog();

    catalog.scans.unshift(scan);

    writeCatalog(catalog);

    response.status(201).json(scan);
  }
);

/*
  Make uploaded files available at /scans/...
*/
app.use(
  "/scans",
  express.static(SCANS_DIR)
);

/*
  Serve index.html, app.js, style.css,
  Potree, and the libraries.
*/
app.use(
  express.static(ROOT_DIR)
);

/*
  Handle upload errors.
*/
app.use((error, request, response, next) => {
  console.error(error);

  if (
    error instanceof multer.MulterError &&
    error.code === "LIMIT_FILE_SIZE"
  ) {
    response.status(413).json({
      error: "The file is larger than 95 MiB."
    });

    return;
  }

  response.status(400).json({
    error: error.message || "Upload failed."
  });
});

app.listen(PORT, () => {
  console.log(
    `Viewer running at http://localhost:${PORT}`
  );
});
