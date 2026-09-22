"use strict";

/*
  Public COPC point-cloud viewer.

  The HTML file must load Potree before this file:

  <script src="./build/potree/potree.js"></script>
  <script src="./app.js"></script>
*/

var CONFIG = {
  catalogUrl: "./catalog.json",

  /*
    Used when a catalog entry has "path" instead of "url".

    Your repository:
    https://github.com/dennishaus/pointcloud_viewer

    Change "main" if your GitHub branch has another name.
  */
  rawBaseUrl:
    "https://raw.githubusercontent.com/dennishaus/pointcloud_viewer/main",

  defaultPointBudget: 3000000
};

var state = {
  catalog: [],
  loadedClouds: new Map(),
  activeScan: null,
  activeCloud: null,
  activeBounds: null,
  sectionVolume: null
};

var viewer = null;

/* -------------------------------------------------------------------------- */
/* STARTUP                                                                    */
/* -------------------------------------------------------------------------- */

document.addEventListener(
  "DOMContentLoaded",
  function () {
    initialize();
  }
);

function initialize() {
  bindEvents();

  var viewerReady = initializeViewer();

  if (!viewerReady) {
    return;
  }

  loadCatalog()
    .then(function () {
      renderLibrary();

      if (state.catalog.length > 0) {
        return loadScan(state.catalog[0]);
      }

      setViewerStatus("No scans available", "idle");
      setStatus("No scans found in catalog.json", "idle");

      return null;
    })
    .catch(function (error) {
      console.error(error);
      setStatus("Application startup failed.", "error");
    });
}

/* -------------------------------------------------------------------------- */
/* BASIC DOM HELPERS                                                          */
/* -------------------------------------------------------------------------- */

function getElement(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  var element = getElement(id);

  if (element) {
    element.textContent = value;
  }
}

function addEvent(id, eventName, handler) {
  var element = getElement(id);

  if (element) {
    element.addEventListener(eventName, handler);
  }
}

/* -------------------------------------------------------------------------- */
/* POTREE INITIALIZATION                                                      */
/* -------------------------------------------------------------------------- */

function initializeViewer() {
  if (!window.Potree) {
    setStatus(
      "Potree is not loaded. Check your script paths.",
      "error"
    );

    console.error(
      "Potree is undefined. Make sure build/potree/potree.js loads before app.js."
    );

    return false;
  }

  if (typeof window.Potree.Viewer !== "function") {
    setStatus(
      "Potree Viewer is unavailable.",
      "error"
    );

    console.error(
      "Potree.Viewer is not available. Potree may be only partially loaded."
    );

    return false;
  }

  var renderArea = getElement("potree_render_area");

  if (!renderArea) {
    setStatus(
      "The potree_render_area element is missing.",
      "error"
    );

    return false;
  }

  try {
    viewer = new Potree.Viewer(renderArea);

    if (typeof viewer.setEDLEnabled === "function") {
      viewer.setEDLEnabled(true);
    }

    if (typeof viewer.setFOV === "function") {
      viewer.setFOV(60);
    }

    if (typeof viewer.setPointBudget === "function") {
      viewer.setPointBudget(
        CONFIG.defaultPointBudget
      );
    }

    if (typeof viewer.setBackground === "function") {
      viewer.setBackground("gradient");
    }

    if (
      viewer.orbitControls &&
      typeof viewer.setControls === "function"
    ) {
      viewer.setControls(viewer.orbitControls);
    }

    window.addEventListener(
      "resize",
      function () {
        if (
          viewer &&
          typeof viewer.onWindowResize === "function"
        ) {
          viewer.onWindowResize();
        }
      }
    );

    setViewerStatus("Ready", "idle");
    setStatus("Ready", "idle");

    return true;
  } catch (error) {
    console.error(error);

    setStatus(
      "Could not initialize Potree.",
      "error"
    );

    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* CATALOG                                                                    */
/* -------------------------------------------------------------------------- */

function loadCatalog() {
  var separator =
    CONFIG.catalogUrl.indexOf("?") === -1
      ? "?"
      : "&";

  var requestUrl =
    CONFIG.catalogUrl +
    separator +
    "cacheBust=" +
    Date.now();

  return fetch(requestUrl, {
    cache: "no-store"
  })
    .then(function (response) {
      if (!response.ok) {
        throw new Error(
          "Catalog request failed with HTTP " +
            response.status
        );
      }

      return response.json();
    })
    .then(function (data) {
      var scans;

      if (Array.isArray(data)) {
        scans = data;
      } else if (
        data &&
        Array.isArray(data.scans)
      ) {
        scans = data.scans;
      } else {
        scans = [];
      }

      state.catalog = scans.map(
        function (scan) {
          return normalizeScan(scan);
        }
      );

      setText(
        "scanCount",
        state.catalog.length +
          " " +
          (
            state.catalog.length === 1
              ? "scan"
              : "scans"
          )
      );

      return state.catalog;
    })
    .catch(function (error) {
      state.catalog = [];
      console.error(error);

      setStatus(
        "Could not load catalog.json.",
        "error"
      );

      return [];
    });
}

function normalizeScan(scan) {
  var id = String(
    scan.id ||
      scan.filename ||
      "scan-" + Date.now()
  );

  var name = String(
    scan.name ||
      scan.filename ||
      id
  );

  var filename = String(
    scan.filename || ""
  );

  var path = String(
    scan.path ||
      (
        filename
          ? "scans/" + filename
          : ""
      )
  );

  var url = String(
    scan.url || ""
  );

  if (!url && path) {
    url = buildRawUrl(path);
  }

  return {
    id: id,
    name: name,
    filename: filename,
    path: path,
    url: url,
    sizeBytes: Number(
      scan.sizeBytes || 0
    ),
    pointCount: Number(
      scan.pointCount || 0
    ),
    crs: scan.crs || "Unknown",
    uploadedAt: scan.uploadedAt || "",
    loading: false
  };
}

function buildRawUrl(path) {
  var cleanBase =
    CONFIG.rawBaseUrl.replace(
      /\/+$/,
      ""
    );

  var encodedPath = path
    .split("/")
    .map(function (part) {
      return encodeURIComponent(part);
    })
    .join("/");

  return cleanBase + "/" + encodedPath;
}

/* -------------------------------------------------------------------------- */
/* LIBRARY                                                                    */
/* -------------------------------------------------------------------------- */

function renderLibrary() {
  var list = getElement("libraryList");
  var empty = getElement("libraryEmpty");
  var search = getElement("scanSearch");

  if (!list) {
    return;
  }

  var query = search
    ? search.value.trim().toLowerCase()
    : "";

  while (list.firstChild) {
    list.removeChild(list.firstChild);
  }

  setText(
    "scanCount",
    state.catalog.length +
      " " +
      (
        state.catalog.length === 1
          ? "scan"
          : "scans"
      )
  );

  var visibleScans =
    state.catalog.filter(function (scan) {
      return scan.name
        .toLowerCase()
        .indexOf(query) !== -1;
    });

  if (visibleScans.length === 0) {
    if (empty) {
      empty.classList.remove("hidden");
    }

    return;
  }

  if (empty) {
    empty.classList.add("hidden");
  }

  visibleScans.forEach(function (scan) {
    var card =
      document.createElement("button");

    card.type = "button";
    card.className = "scan-card";

    if (
      state.activeScan &&
      state.activeScan.id === scan.id
    ) {
      card.classList.add("active");
    }

    var header =
      document.createElement("div");

    header.className =
      "scan-card-header";

    var icon =
      document.createElement("div");

    icon.className = "scan-icon";
    icon.textContent = "◈";

    var name =
      document.createElement("div");

    name.className = "scan-name";
    name.textContent = scan.name;
    name.title = scan.name;

    var stateDot =
      document.createElement("div");

    stateDot.className = "scan-state";

    if (scan.loading) {
      stateDot.classList.add("loading");
    } else if (
      state.loadedClouds.has(scan.id)
    ) {
      stateDot.classList.add("loaded");
    }

    header.appendChild(icon);
    header.appendChild(name);
    header.appendChild(stateDot);

    var metadata =
      document.createElement("div");

    metadata.className = "scan-meta";

    var format =
      document.createElement("span");

    format.textContent = "COPC";

    var size =
      document.createElement("span");

    size.textContent = scan.sizeBytes
      ? formatBytes(scan.sizeBytes)
      : "Size unknown";

    metadata.appendChild(format);
    metadata.appendChild(size);

    card.appendChild(header);
    card.appendChild(metadata);

    card.addEventListener(
      "click",
      function () {
        loadScan(scan);
      }
    );

    list.appendChild(card);
  });
}

/* -------------------------------------------------------------------------- */
/* POINT CLOUD LOADING                                                        */
/* -------------------------------------------------------------------------- */

function loadScan(scan) {
  if (!scan) {
    return Promise.resolve();
  }

  if (!scan.url) {
    setStatus(
      "This scan has no valid COPC URL.",
      "error"
    );

    return Promise.resolve();
  }

  if (state.loadedClouds.has(scan.id)) {
    setActiveScan(scan);
    fitActiveScan();

    return Promise.resolve();
  }

  scan.loading = true;
  renderLibrary();

  showLoading(
    "Loading " + scan.name + "..."
  );

  setViewerStatus(
    "Loading point cloud",
    "loading"
  );

  setStatus(
    "Loading " + scan.name + "...",
    "loading"
  );

  return loadCopcPointCloud(scan)
    .then(function (pointcloud) {
      if (!pointcloud) {
        throw new Error(
          "Potree returned no point cloud."
        );
      }

      pointcloud.name = scan.name;

      viewer.scene.addPointCloud(
        pointcloud
      );

      configurePointCloud(pointcloud);

      state.loadedClouds.set(
        scan.id,
        pointcloud
      );

      scan.loading = false;

      setActiveScan(scan);
      renderLibrary();

      hideLoading();

      setViewerStatus(
        "Point cloud loaded",
        "success"
      );

      setStatus(
        scan.name + " loaded",
        "success"
      );

      window.setTimeout(
        function () {
          fitActiveScan();
        },
        250
      );
    })
    .catch(function (error) {
      scan.loading = false;

      hideLoading();
      renderLibrary();

      console.error(error);

      setViewerStatus(
        "Point-cloud loading failed",
        "error"
      );

      setStatus(
        "Could not load " + scan.name,
        "error"
      );
    });
}

function loadCopcPointCloud(scan) {
  return new Promise(function (resolve, reject) {
    if (
      !window.Potree ||
      typeof Potree.loadPointCloud !== "function"
    ) {
      reject(
        new Error(
          "Potree.loadPointCloud is unavailable."
        )
      );

      return;
    }

    try {
      Potree.loadPointCloud(
        scan.url,
        scan.name,
        function (event) {
          if (
            event &&
            event.pointcloud
          ) {
            resolve(event.pointcloud);
          } else {
            reject(
              new Error(
                "Potree did not return a point cloud."
              )
            );
          }
        }
      );
    } catch (error) {
      reject(error);
    }
  });
}

function configurePointCloud(pointcloud) {
  if (!pointcloud.material) {
    return;
  }

  pointcloud.material.size =
    getNumberValue(
      "pointSize",
      1.5
    );

  if (
    Potree.PointSizeType &&
    Potree.PointSizeType.ADAPTIVE !== undefined
  ) {
    pointcloud.material.pointSizeType =
      Potree.PointSizeType.ADAPTIVE;
  }

  if (
    Potree.PointShape &&
    Potree.PointShape.SQUARE !== undefined
  ) {
    pointcloud.material.shape =
      Potree.PointShape.SQUARE;
  }

  applyColorMode(pointcloud);
  applyOpacity(pointcloud);
}

/* -------------------------------------------------------------------------- */
/* ACTIVE SCAN / INSPECTOR                                                    */
/* -------------------------------------------------------------------------- */

function setActiveScan(scan) {
  removeSectionVolume();

  var sectionMode =
    getElement("sectionMode");

  if (sectionMode) {
    sectionMode.value = "none";
  }

  state.activeScan = scan;
  state.activeCloud =
    state.loadedClouds.get(scan.id);

  state.activeBounds =
    getPointCloudBounds(
      state.activeCloud
    );

  updateInspector();
  updateSectionControls();
  renderLibrary();
}

function updateInspector() {
  var empty =
    getElement("inspectorEmpty");

  var content =
    getElement("inspectorContent");

  if (
    !state.activeScan ||
    !state.activeCloud
  ) {
    if (empty) {
      empty.classList.remove("hidden");
    }

    if (content) {
      content.classList.add("hidden");
    }

    return;
  }

  if (empty) {
    empty.classList.add("hidden");
  }

  if (content) {
    content.classList.remove("hidden");
  }

  setText(
    "activeScanName",
    state.activeScan.name
  );

  setText(
    "activePointCount",
    state.activeScan.pointCount
      ? formatNumber(
          state.activeScan.pointCount
        )
      : "Loaded"
  );

  setText(
    "activeFileSize",
    state.activeScan.sizeBytes
      ? formatBytes(
          state.activeScan.sizeBytes
        )
      : "Unknown"
  );

  setText(
    "activeCrs",
    state.activeScan.crs ||
      "Unknown"
  );

  if (!state.activeBounds) {
    setText(
      "boundsX",
      "Unavailable"
    );

    setText(
      "boundsY",
      "Unavailable"
    );

    setText(
      "boundsZ",
      "Unavailable"
    );

    return;
  }

  setText(
    "boundsX",
    formatCoordinate(
      state.activeBounds.min.x
    ) +
      " → " +
      formatCoordinate(
        state.activeBounds.max.x
      )
  );

  setText(
    "boundsY",
    formatCoordinate(
      state.activeBounds.min.y
    ) +
      " → " +
      formatCoordinate(
        state.activeBounds.max.y
      )
  );

  setText(
    "boundsZ",
    formatCoordinate(
      state.activeBounds.min.z
    ) +
      " → " +
      formatCoordinate(
        state.activeBounds.max.z
      )
  );
}

function getPointCloudBounds(pointcloud) {
  if (!pointcloud) {
    return null;
  }

  var box =
    pointcloud.boundingBox;

  if (
    !box &&
    pointcloud.pcoGeometry
  ) {
    box =
      pointcloud.pcoGeometry.tightBoundingBox ||
      pointcloud.pcoGeometry.boundingBox;
  }

  if (!box || !box.min || !box.max) {
    return null;
  }

  return {
    min: {
      x: getVectorValue(
        box.min,
        "x",
        0
      ),
      y: getVectorValue(
        box.min,
        "y",
        1
      ),
      z: getVectorValue(
        box.min,
        "z",
        2
      )
    },
    max: {
      x: getVectorValue(
        box.max,
        "x",
        0
      ),
      y: getVectorValue(
        box.max,
        "y",
        1
      ),
      z: getVectorValue(
        box.max,
        "z",
        2
      )
    }
  };
}

function getVectorValue(
  vector,
  property,
  index
) {
  if (
    vector &&
    typeof vector[property] === "number"
  ) {
    return vector[property];
  }

  if (
    vector &&
    typeof vector[index] === "number"
  ) {
    return vector[index];
  }

  return 0;
}

/* -------------------------------------------------------------------------- */
/* APPEARANCE                                                                 */
/* -------------------------------------------------------------------------- */

function applyColorMode(pointcloud) {
  var cloud =
    pointcloud || state.activeCloud;

  if (
    !cloud ||
    !cloud.material ||
    !Potree.PointColorType
  ) {
    return;
  }

  var select =
    getElement("colorMode");

  if (!select) {
    return;
  }

  var mode = select.value;
  var colorType =
    Potree.PointColorType[mode];

  if (colorType !== undefined) {
    cloud.material.pointColorType =
      colorType;
  }
}

function applyPointSize() {
  var value =
    getNumberValue(
      "pointSize",
      1.5
    );

  setText(
    "pointSizeValue",
    value.toFixed(1)
  );

  if (
    state.activeCloud &&
    state.activeCloud.material
  ) {
    state.activeCloud.material.size =
      value;
  }
}

function applyOpacity() {
  var value =
    getNumberValue(
      "pointOpacity",
      1
    );

  setText(
    "pointOpacityValue",
    Math.round(value * 100) +
      "%"
  );

  if (
    state.activeCloud &&
    state.activeCloud.material
  ) {
    state.activeCloud.material.opacity =
      value;

    state.activeCloud.material.transparent =
      value < 1;
  }
}

function applyPointBudget() {
  var value =
    getNumberValue(
      "pointBudget",
      CONFIG.defaultPointBudget
    );

  if (
    viewer &&
    typeof viewer.setPointBudget ===
      "function"
  ) {
    viewer.setPointBudget(value);
  }

  setText(
    "pointBudgetValue",
    formatCompactNumber(value)
  );
}

/* -------------------------------------------------------------------------- */
/* SECTION TOOLS                                                              */
/* -------------------------------------------------------------------------- */

function getSectionRange() {
  if (!state.activeBounds) {
    return null;
  }

  var mode =
    getElement("sectionMode").value;

  if (mode === "horizontal") {
    return {
      min: state.activeBounds.min.z,
      max: state.activeBounds.max.z
    };
  }

  var axisElement =
    getElement("sectionAxis");

  var axis =
    axisElement && axisElement.value
      ? axisElement.value
      : "x";

  return {
    min: state.activeBounds.min[axis],
    max: state.activeBounds.max[axis]
  };
}

function updateSectionControls() {
  var modeElement =
    getElement("sectionMode");

  var positionElement =
    getElement("sectionPosition");

  var thicknessElement =
    getElement("sectionThickness");

  var axisWrapper =
    getElement("sectionAxisWrapper");

  if (
    !modeElement ||
    !positionElement ||
    !thicknessElement
  ) {
    return;
  }

  var mode = modeElement.value;

  var active =
    mode !== "none" &&
    Boolean(state.activeBounds);

  if (axisWrapper) {
    if (mode === "vertical") {
      axisWrapper.classList.remove(
        "hidden"
      );
    } else {
      axisWrapper.classList.add(
        "hidden"
      );
    }
  }

  positionElement.disabled = !active;
  thicknessElement.disabled = !active;

  if (!active) {
    setText(
      "sectionPositionValue",
      "—"
    );

    setText(
      "sectionThicknessValue",
      "—"
    );

    return;
  }

  var range =
    getSectionRange();

  if (!range) {
    return;
  }

  var length =
    Math.max(
      range.max - range.min,
      0.001
    );

  var center =
    (range.min + range.max) / 2;

  var thickness =
    Math.max(
      length * 0.08,
      0.01
    );

  positionElement.min =
    range.min;

  positionElement.max =
    range.max;

  positionElement.step =
    Math.max(
      length / 1000,
      0.0001
    );

  positionElement.value =
    center;

  thicknessElement.min =
    0.001;

  thicknessElement.max =
    length;

  thicknessElement.value =
    thickness.toFixed(3);

  setText(
    "sectionPositionValue",
    formatCoordinate(center)
  );

  setText(
    "sectionThicknessValue",
    formatCoordinate(thickness) +
      " units"
  );
}

function applySection() {
  if (
    !state.activeCloud ||
    !state.activeBounds
  ) {
    setStatus(
      "Load a scan before creating a section.",
      "error"
    );

    return;
  }

  var mode =
    getElement("sectionMode").value;

  if (mode === "none") {
    clearSection();
    return;
  }

  var range =
    getSectionRange();

  if (!range) {
    return;
  }

  removeSectionVolume();

  var position =
    getNumberValue(
      "sectionPosition",
      (range.min + range.max) / 2
    );

  var thickness =
    getNumberValue(
      "sectionThickness",
      (range.max - range.min) * 0.08
    );

  thickness =
    Math.max(thickness, 0.001);

  var safePosition =
    clamp(
      position,
      range.min,
      range.max
    );

  var min = {
    x: state.activeBounds.min.x,
    y: state.activeBounds.min.y,
    z: state.activeBounds.min.z
  };

  var max = {
    x: state.activeBounds.max.x,
    y: state.activeBounds.max.y,
    z: state.activeBounds.max.z
  };

  if (mode === "horizontal") {
    min.z =
      safePosition - thickness / 2;

    max.z =
      safePosition + thickness / 2;
  }

  if (mode === "vertical") {
    var axisElement =
      getElement("sectionAxis");

    var axis =
      axisElement && axisElement.value
        ? axisElement.value
        : "x";

    min[axis] =
      safePosition - thickness / 2;

    max[axis] =
      safePosition + thickness / 2;
  }

  if (
    !Potree.BoxVolume ||
    !viewer ||
    !viewer.scene
  ) {
    setStatus(
      "Potree clipping volumes are unavailable.",
      "error"
    );

    return;
  }

  var volume =
    new Potree.BoxVolume();

  volume.name =
    mode === "horizontal"
      ? "Horizontal section"
      : "Vertical section";

  volume.position.set(
    (min.x + max.x) / 2,
    (min.y + max.y) / 2,
    (min.z + max.z) / 2
  );

  volume.scale.set(
    Math.max(
      max.x - min.x,
      0.001
    ),
    Math.max(
      max.y - min.y,
      0.001
    ),
    Math.max(
      max.z - min.z,
      0.001
    )
  );

  volume.clip = true;
  volume.visible = false;

  if (
    typeof viewer.scene.addVolume ===
      "function"
  ) {
    viewer.scene.addVolume(volume);
  }

  state.sectionVolume = volume;

  if (
    Potree.ClipTask &&
    Potree.ClipTask.SHOW_INSIDE !==
      undefined &&
    typeof viewer.setClipTask ===
      "function"
  ) {
    viewer.setClipTask(
      Potree.ClipTask.SHOW_INSIDE
    );
  }

  if (
    Potree.ClipMethod &&
    Potree.ClipMethod.INSIDE_ANY !==
      undefined &&
    typeof viewer.setClipMethod ===
      "function"
  ) {
    viewer.setClipMethod(
      Potree.ClipMethod.INSIDE_ANY
    );
  }

  setText(
    "sectionPositionValue",
    formatCoordinate(safePosition)
  );

  setText(
    "sectionThicknessValue",
    formatCoordinate(thickness) +
      " units"
  );

  setStatus(
    "Section applied",
    "success"
  );
}

function removeSectionVolume() {
  if (!state.sectionVolume) {
    return;
  }

  if (
    viewer &&
    viewer.scene &&
    typeof viewer.scene.removeVolume ===
      "function"
  ) {
    viewer.scene.removeVolume(
      state.sectionVolume
    );
  }

  state.sectionVolume = null;

  if (
    viewer &&
    Potree.ClipTask &&
    Potree.ClipTask.NONE !== undefined &&
    typeof viewer.setClipTask ===
      "function"
  ) {
    viewer.setClipTask(
      Potree.ClipTask.NONE
    );
  }
}

function clearSection() {
  removeSectionVolume();

  var modeElement =
    getElement("sectionMode");

  if (modeElement) {
    modeElement.value = "none";
  }

  updateSectionControls();

  setStatus(
    "Section cleared",
    "success"
  );
}

/* -------------------------------------------------------------------------- */
/* VIEW CONTROLS                                                              */
/* -------------------------------------------------------------------------- */

function fitActiveScan() {
  if (!viewer || !state.activeCloud) {
    setStatus(
      "Select a scan first.",
      "error"
    );

    return;
  }

  if (
    typeof viewer.fitToScreen ===
      "function"
  ) {
    viewer.fitToScreen(0.5);
  }

  setStatus(
    "View fitted to active scan",
    "success"
  );
}

function resetView() {
  fitActiveScan();
}

function activateOrbitMode() {
  if (
    viewer &&
    viewer.orbitControls &&
    typeof viewer.setControls ===
      "function"
  ) {
    viewer.setControls(
      viewer.orbitControls
    );
  }

  var button =
    getElement("orbitMode");

  if (button) {
    button.classList.add("active");
  }

  setStatus(
    "Orbit navigation active",
    "success"
  );
}

function downloadActiveScan() {
  if (
    !state.activeScan ||
    !state.activeScan.url
  ) {
    setStatus(
      "Select a scan first.",
      "error"
    );

    return;
  }

  var link =
    document.createElement("a");

  link.href =
    state.activeScan.url;

  link.download =
    state.activeScan.filename ||
    state.activeScan.name +
      ".copc.laz";

  link.target = "_blank";
  link.rel = "noopener";

  document.body.appendChild(link);
  link.click();
  link.remove();
}

/* -------------------------------------------------------------------------- */
/* EVENTS                                                                     */
/* -------------------------------------------------------------------------- */

function bindEvents() {
  addEvent(
    "scanSearch",
    "input",
    function () {
      renderLibrary();
    }
  );

  addEvent(
    "refreshLibrary",
    "click",
    function () {
      loadCatalog().then(function () {
        renderLibrary();

        setStatus(
          "Library refreshed",
          "success"
        );
      });
    }
  );

  addEvent(
    "fitView",
    "click",
    fitActiveScan
  );

  addEvent(
    "resetView",
    "click",
    resetView
  );

  addEvent(
    "orbitMode",
    "click",
    activateOrbitMode
  );

  addEvent(
    "downloadScan",
    "click",
    downloadActiveScan
  );

  addEvent(
    "colorMode",
    "change",
    function () {
      applyColorMode();

      setStatus(
        "Color mode updated",
        "success"
      );
    }
  );

  addEvent(
    "pointSize",
    "input",
    applyPointSize
  );

  addEvent(
    "pointOpacity",
    "input",
    applyOpacity
  );

  addEvent(
    "pointBudget",
    "input",
    applyPointBudget
  );

  addEvent(
    "sectionMode",
    "change",
    function () {
      var mode =
        getElement("sectionMode");

      updateSectionControls();

      if (
        mode &&
        mode.value === "none"
      ) {
        clearSection();
      }
    }
  );

  addEvent(
    "sectionAxis",
    "change",
    function () {
      updateSectionControls();

      if (state.sectionVolume) {
        applySection();
      }
    }
  );

  addEvent(
    "sectionPosition",
    "input",
    function () {
      var value =
        getNumberValue(
          "sectionPosition",
          0
        );

      setText(
        "sectionPositionValue",
        formatCoordinate(value)
      );

      if (state.sectionVolume) {
        applySection();
      }
    }
  );

  addEvent(
    "sectionThickness",
    "input",
    function () {
      var value =
        getNumberValue(
          "sectionThickness",
          0
        );

      setText(
        "sectionThicknessValue",
        formatCoordinate(value) +
          " units"
      );

      if (state.sectionVolume) {
        applySection();
      }
    }
  );

  addEvent(
    "applySection",
    "click",
    applySection
  );

  addEvent(
    "clearSection",
    "click",
    clearSection
  );
}

/* -------------------------------------------------------------------------- */
/* STATUS                                                                     */
/* -------------------------------------------------------------------------- */

function setStatus(message, type) {
  setText(
    "statusMessage",
    message
  );

  setViewerStatus(
    message,
    type
  );
}

function setViewerStatus(message, type) {
  setText(
    "viewerStatus",
    message
  );

  var dot =
    getElement("viewerStatusDot");

  if (!dot) {
    return;
  }

  dot.className =
    "status-dot status-idle";

  if (type === "loading") {
    dot.className =
      "status-dot status-loading";
  }

  if (type === "error") {
    dot.className =
      "status-dot status-error";
  }
}

function showLoading(message) {
  setText(
    "loadingMessage",
    message
  );

  var overlay =
    getElement("loadingOverlay");

  if (overlay) {
    overlay.classList.remove(
      "hidden"
    );
  }
}

function hideLoading() {
  var overlay =
    getElement("loadingOverlay");

  if (overlay) {
    overlay.classList.add(
      "hidden"
    );
  }
}

/* -------------------------------------------------------------------------- */
/* UTILITIES                                                                  */
/* -------------------------------------------------------------------------- */

function getNumberValue(id, fallback) {
  var element =
    getElement(id);

  if (!element) {
    return fallback;
  }

  var value =
    Number(element.value);

  return isFinite(value)
    ? value
    : fallback;
}

function clamp(value, min, max) {
  return Math.min(
    Math.max(value, min),
    max
  );
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) {
    return "Unknown";
  }

  var units = [
    "B",
    "KiB",
    "MiB",
    "GiB"
  ];

  var index = Math.min(
    Math.floor(
      Math.log(bytes) /
        Math.log(1024)
    ),
    units.length - 1
  );

  var value =
    bytes /
    Math.pow(1024, index);

  return (
    value.toFixed(
      index === 0
        ? 0
        : 1
    ) +
    " " +
    units[index]
  );
}

function formatNumber(value) {
  return new Intl.NumberFormat().format(
    value
  );
}

function formatCompactNumber(value) {
  if (value >= 1000000) {
    return (
      (value / 1000000).toFixed(1) +
      "M"
    );
  }

  if (value >= 1000) {
    return (
      Math.round(value / 1000) +
      "K"
    );
  }

  return String(value);
}

function formatCoordinate(value) {
  if (!isFinite(value)) {
    return "—";
  }

  return Number(value).toFixed(3);
}
