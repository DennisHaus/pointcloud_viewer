"use strict";

var express = require("express");
var multer = require("multer");
var fs = require("fs");
var path = require("path");

var app = express();

var PORT = process.env.PORT || 3000;
var ROOT_DIR = __dirname;
var SCANS_DIR = path.join(ROOT_DIR, "scans");
var CATALOG_FILE = path.join(ROOT_DIR, "catalog.json");
var MAX_FILE_SIZE = 95 * 1024 * 1024;

/* -------------------------------------------------------------------------- */
/* DIRECTORIES AND CATALOG                                                    */
/* -------------------------------------------------------------------------- */

fs.mkdirSync(SCANS_DIR, {
  recursive: true
});

if (!fs.existsSync(CATALOG_FILE)) {
  fs.writeFileSync(
    CATALOG_FILE,
    JSON.stringify(
      {
        scans: []
      },
      null,
      2
    ),
    "utf8"
  );
}

function readCatalog() {
  try {
    var content = fs.readFileSync(
      CATALOG_FILE,
      "utf8"
    );

    var catalog = JSON.parse(content);

    if (Array.isArray(catalog)) {
      return {
        scans: catalog
      };
    }

    if (!catalog || typeof catalog !== "object") {
      return {
        scans: []
      };
    }

    if (!Array.isArray(catalog.scans)) {
      catalog.scans = [];
    }

    return catalog;
  } catch (error) {
    console.error(
      "Could not read catalog.json:",
      error
    );

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

/* -------------------------------------------------------------------------- */
/* FILENAMES                                                                  */
/* -------------------------------------------------------------------------- */

function sanitizeFilename(filename) {
  return path
    .basename(String(filename || ""))
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_");
}

function createUniqueFilename(originalFilename) {
  var cleaned = sanitizeFilename(
    originalFilename
  );

  var baseName = cleaned.replace(
    /\.copc\.laz$/i,
    ""
  );

  if (!baseName) {
    baseName = "scan";
  }

  var filename = baseName + ".copc.laz";
  var counter = 1;

  while (
    fs.existsSync(
      path.join(SCANS_DIR, filename)
    )
  ) {
    filename =
      baseName +
      "-" +
      counter +
      ".copc.laz";

    counter += 1;
  }

  return filename;
}

/* -------------------------------------------------------------------------- */
/* FILE UPLOAD                                                                */
/* -------------------------------------------------------------------------- */

var storage = multer.diskStorage({
  destination: function (request, file, callback) {
    callback(null, SCANS_DIR);
  },

  filename: function (request, file, callback) {
    callback(
      null,
      createUniqueFilename(file.originalname)
    );
  }
});

var upload = multer({
  storage: storage,

  limits: {
    fileSize: MAX_FILE_SIZE
  },

  fileFilter: function (request, file, callback) {
    var filename = String(
      file.originalname || ""
    ).toLowerCase();

    if (!/\.copc\.laz$/i.test(filename)) {
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

/* -------------------------------------------------------------------------- */
/* API                                                                        */
/* -------------------------------------------------------------------------- */

app.get("/api/scans", function (request, response) {
  response.json(readCatalog());
});

app.post(
  "/api/scans",
  upload.single("file"),
  function (request, response) {
    if (!request.file) {
      response.status(400).json({
        error: "No file was uploaded."
      });

      return;
    }

    var filename = request.file.filename;

    var scanName = filename.replace(
      /\.copc\.laz$/i,
      ""
    );

    var scan = {
      id:
        String(Date.now()) +
        "-" +
        filename,

      name: scanName,

      filename: filename,

      url:
        "/scans/" +
        encodeURIComponent(filename),

      size: request.file.size,

      uploadedAt: new Date().toISOString(),

      points: null,

      crs: null
    };

    var catalog = readCatalog();

    catalog.scans.unshift(scan);

    try {
      writeCatalog(catalog);
    } catch (error) {
      console.error(
        "Could not update catalog.json:",
        error
      );

      try {
        fs.unlinkSync(
          path.join(SCANS_DIR, filename)
        );
      } catch (unlinkError) {
        console.error(unlinkError);
      }

      response.status(500).json({
        error: "The file was uploaded but catalog.json could not be updated."
      });

      return;
    }

    response.status(201).json(scan);
  }
);

/* -------------------------------------------------------------------------- */
/* STATIC FILES                                                               */
/* -------------------------------------------------------------------------- */

app.use(
  "/scans",
  express.static(SCANS_DIR)
);

app.use(
  express.static(ROOT_DIR)
);

/* -------------------------------------------------------------------------- */
/* ERROR HANDLING                                                             */
/* -------------------------------------------------------------------------- */

app.use(function (
  error,
  request,
  response,
  next
) {
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
    error:
      error.message ||
      "The request failed."
  });
});

/* -------------------------------------------------------------------------- */
/* START SERVER                                                               */
/* -------------------------------------------------------------------------- */

app.listen(PORT, function () {
  console.log(
    "Pointcloud viewer running at http://localhost:" +
      PORT
  );
});
