"use strict";

/*
  Public COPC point-cloud viewer.

  This version:
  - Loads a public catalog.json
  - Loads public .copc.laz files
  - Does not use login
  - Does not upload files from the browser
  - Does not use GitHub private keys
  - Includes orbit, pan, zoom, appearance controls,
    and horizontal/vertical clipping sections
*/

const CONFIG = {
  /*
    If catalog.json is in the same repository as this application:
  */
  catalogUrl: "./catalog.json",

  /*
    Used only when catalog entries contain "path" instead of "url".

    Replace these values with your actual public repository.

    Example:
    https://raw.githubusercontent.com/johnsmith/my-pointclouds/main
  */
  rawBaseUrl:
    "https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPOSITORY/main",

  defaultPointBudget: 3000000
};

const state = {
  catalog: [],
  loadedClouds: new Map(),
  activeScan: null,
  activeCloud: null,
  activeBounds: null,
  sectionVolume: null
};

let viewer = null;

/* -------------------------------------------------------------------------- */
/* BASIC HELPERS                                                              */
/* -------------------------------------------------------------------------- */

function getElement(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const element = getElement(id);

  if (element) {
    element.textContent = value;
  }
}

function on(id, eventName, handler) {
  const element = getElement(id);

  if (element) {
    element.addEventListener(eventName, handler);
  }
}

function hideElement(id) {
  const element = getElement(id);

  if (element) {
    element.classList.add("hidden");
  }
}

/* -------------------------------------------------------------------------- */
/* STARTUP                                                                    */
/* -------------------------------------------------------------------------- */

document.addEventListener("DOMContentLoaded", initialize);

async function initialize() {
  hidePubliclyUnavailableControls();

  bindEvents();

  const viewerReady = initializeViewer();

  if (!viewerReady) {
    return;
  }

  await loadCatalog();

  renderLibrary();

  if (state.catalog.length > 0) {
    await loadScan(state.catalog[0]);
  } else {
    setViewerStatus("No scans available", "idle");
    setStatus("No scans found in catalog.json", "idle");
  }
}

/*
  Since this is a public viewer, uploads and deletes are performed
  manually through the GitHub repository.
*/
function hidePubliclyUnavailableControls() {
  hideElement("loginLink");
  hideElement("logoutButton");
  hideElement("adminBadge");
  hideElement("uploadButton");
  hideElement("adminSection");
  hideElement("deleteScan");
}

/* -------------------------------------------------------------------------- */
/* POTREE VIEWER                                                              */
/* -------------------------------------------------------------------------- */

function initializeViewer() {
  if (!window.Potree) {
    setStatus(
      "Potree is not loaded. Check your index.html script paths.",
      "error"
    );

    console.error(
      "Potree is undefined. Check that build/potree/potree.js exists and is loaded before app.js."
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

  const renderArea = getElement("potree_render_area");

  if (!renderArea) {
    setStatus(
      "Missing potree_render_area element.",
      "error"
    );

    console.error(
      'Add <div id="potree_render_area"></div> to index.html.'
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
      viewer.setPointBudget(CONFIG.defaultPointBudget);
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

    window.addEventListener("resize", function () {
      if (
        viewer &&
        typeof viewer.onWindowResize === "function"
      ) {
        viewer.onWindowResize();
      }
    });

    setViewerStatus("Ready", "idle");
    setStatus("Ready", "idle");

    return true;
  } catch (error) {
    console.error(error);

    setStatus(
      "Could not initialize the Potree viewer.",
      "error"
    );

    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* CATALOG                                                                    */
/* -------------------------------------------------------------------------- */

async function loadCatalog() {
  try {
    const separator =
      CONFIG.catalogUrl.indexOf("?") === -1
        ? "?"
        : "&";

    const catalogUrl =
      CONFIG.catalogUrl +
      separator +
      "cacheBust=" +
      Date.now();

    const response = await fetch(catalogUrl, {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(
        "Catalog request failed with HTTP " +
          response.status
      );
    }

    const data = await response.json();

    const scans = Array.isArray(data)
      ? data
      : Array.isArray(data.scans)
        ? data.scans
        : [];

    state.catalog = scans.map(normalizeScan);

    setText(
      "scanCount",
      state.catalog.length +
        " " +
        (state.catalog.length === 1
          ? "scan"
          : "scans")
    );
  } catch (error) {
    state.catalog = [];

    console.error(error);

    setStatus(
      "Could not load catalog.json.",
      "error"
    );
  }
}

function normalizeScan(scan) {
  const id = String(
    scan.id ||
      scan.filename ||
      "scan-" + Date.now()
  );

  const name = String(
    scan.name ||
      scan.filename ||
      id
  );

  const filename = String(
    scan.filename || ""
  );

  const path = String(
    scan.path ||
      (filename
        ? "scans/" + filename
        : "")
  );

  let url = String(
    scan.url || ""
  );

  if (!url && path && CONFIG.rawBaseUrl) {
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
  const cleanBase =
    CONFIG.rawBaseUrl.replace(/\/+$/, "");

  const encodedPath = path
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
  const list = getElement("libraryList");
  const empty = getElement("libraryEmpty");
  const search = getElement("scanSearch");

  if (!list) {
    return;
  }

  const searchTerm = search
    ? search.value.trim().toLowerCase()
    : "";

  list.replaceChildren();

  setText(
    "scanCount",
    state.catalog.length +
      " " +
      (state.catalog.length === 1
        ? "scan"
        : "scans")
  );

  const visibleScans = state.catalog.filter(
    function (scan) {
      return scan.name
        .toLowerCase()
        .includes(searchTerm);
    }
  );

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
    const card = document.createElement("button");

    card.type = "button";
    card.className = "scan-card";

    if (
      state.activeScan &&
      state.activeScan.id === scan.id
    ) {
      card.classList.add("active");
    }

    const header = document.createElement("div");
    header.className = "scan-card-header";

    const icon = document.createElement("div");
    icon.className = "scan-icon";
    icon.textContent = "◈";

    const name = document.createElement("div");
    name.className = "scan-name";
    name.textContent = scan.name;
    name.title = scan.name;

    const stateDot = document.createElement("div");
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

    const metadata = document.createElement("div");
    metadata.className = "scan-meta";

    const format = document.createElement("span");
    format.textContent = "COPC";

    const size = document.createElement("span");
    size.textContent = scan.sizeBytes
      ? formatBytes(scan.sizeBytes)
      : "Size unknown";

    metadata.appendChild(format);
    metadata.appendChild(size);

    card.appendChild(header);
    card.appendChild(metadata);

    card.addEventListener("click", function () {
      loadScan(scan);
    });

    list.appendChild(card);
  });
}

/* -------------------------------------------------------------------------- */
/* POINT-CLOUD LOADING                                                        */
/* -------------------------------------------------------------------------- */

async function loadScan(scan) {
  if (!scan) {
    return;
  }

  if (!scan.url) {
    setStatus(
      "This scan has no valid COPC URL.",
      "error"
    );

    return;
  }

  if (state.loadedClouds.has(scan.id)) {
    setActiveScan(scan);
    fitActiveScan();
    return;
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

  try {
    const pointcloud =
      await loadCopcPointCloud(scan);

    if (!pointcloud) {
      throw new Error(
        "Potree returned no point cloud."
      );
    }

    pointcloud.name = scan.name;

    viewer.scene.addPointCloud(pointcloud);

    configurePointCloud(pointcloud);

    state.loadedClouds.set(
      scan.id,
      pointcloud
    );

    scan.loading = false;

    setActiveScan(scan);

    hideLoading();

    setViewerStatus(
      "Point cloud loaded",
      "success"
    );

    setStatus(
      scan.name + " loaded",
      "success"
    );

    renderLibrary();

    window.setTimeout(function () {
      fitActiveScan();
    }, 250);
  } catch (error) {
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
  }
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
/* ACTIVE SCAN AND INSPECTOR                                                  */
/* -------------------------------------------------------------------------- */

function setActiveScan(scan) {
  const pointcloud =
    state.loadedClouds.get(scan.id);

  if (!pointcloud) {
    return;
  }

  clearSection(false);

  state.activeScan = scan;
  state.activeCloud = pointcloud;
  state.activeBounds =
    getPointCloudBounds(pointcloud);

  updateInspector();
  updateSectionControls();
  renderLibrary();
}

function updateInspector() {
  const scan = state.activeScan;

  const empty = getElement("inspectorEmpty");
  const content = getElement("inspectorContent");

  if (!scan || !state.activeCloud) {
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

  setText("activeScanName", scan.name);

  setText(
    "activePointCount",
    scan.pointCount
      ? formatNumber(scan.pointCount)
      : "Loaded"
  );

  setText(
    "activeFileSize",
    scan.sizeBytes
      ? formatBytes(scan.sizeBytes)
      : "Unknown"
  );

  setText(
    "activeCrs",
    scan.crs || "Unknown"
  );

  if (!state.activeBounds) {
    setText("boundsX", "Unavailable");
    setText("boundsY", "Unavailable");
    setText("boundsZ", "Unavailable");

    return;
  }

  const bounds = state.activeBounds;

  setText(
    "boundsX",
    formatCoordinate(bounds.min.x) +
      " → " +
      formatCoordinate(bounds.max.x)
  );

  setText(
    "boundsY",
    formatCoordinate(bounds.min.y) +
      " → " +
      formatCoordinate(bounds.max.y)
  );

  setText(
    "boundsZ",
    formatCoordinate(bounds.min.z) +
      " → " +
      formatCoordinate(bounds.max.z)
  );
}

function getPointCloudBounds(pointcloud) {
  const box =
    pointcloud.boundingBox ||
    (
      pointcloud.pcoGeometry &&
      (
        pointcloud.pcoGeometry.tightBoundingBox ||
        pointcloud.pcoGeometry.boundingBox
      )
    );

  if (!box || !box.min || !box.max) {
    return null;
  }

  return {
    min: {
      x: getVectorValue(box.min, "x", 0),
      y: getVectorValue(box.min, "y", 1),
      z: getVectorValue(box.min, "z", 2)
    },
    max: {
      x: getVectorValue(box.max, "x", 0),
      y: getVectorValue(box.max, "y", 1),
      z: getVectorValue(box.max, "z", 2)
    }
  };
}

function getVectorValue(vector, property, index) {
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
/* APPEARANCE CONTROLS                                                        */
/* -------------------------------------------------------------------------- */

function applyColorMode(pointcloud) {
  const cloud =
    pointcloud || state.activeCloud;

  if (
    !cloud ||
    !cloud.material ||
    !Potree.PointColorType
  ) {
    return;
  }

  const select = getElement("colorMode");

  if (!select) {
    return;
  }

  const mode = select.value;
  const colorType =
    Potree.PointColorType[mode];

  if (colorType !== undefined) {
    cloud.material.pointColorType =
      colorType;
  }
}

function applyPointSize() {
  const value = getNumberValue(
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
  const value = getNumberValue(
    "pointOpacity",
    1
  );

  setText(
    "pointOpacityValue",
    Math.round(value * 100) + "%"
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
  const value = getNumberValue(
    "pointBudget",
    CONFIG.defaultPointBudget
  );

  if (
    viewer &&
    typeof viewer.setPointBudget === "function"
  ) {
    viewer.setPointBudget(value);
  }

  setText(
    "pointBudgetValue",
    formatCompactNumber(value)
  );
}

/* -------------------------------------------------------------------------- */
/* SECTIONS                                                                   */
/* -------------------------------------------------------------------------- */

function updateSectionControls() {
  const modeElement =
    getElement("sectionMode");

  const positionElement =
    getElement("sectionPosition");

  const thicknessElement =
    getElement("sectionThickness");

  const axisWrapper =
    getElement("sectionAxisWrapper");

  if (
    !modeElement ||
    !positionElement ||
    !thicknessElement
  ) {
    return;
  }

  const mode = modeElement.value;
  const active =
    mode !== "none" &&
    Boolean(state.activeBounds);

  if (axisWrapper) {
    if (mode === "vertical") {
      axisWrapper.classList.remove("hidden");
    } else {
      axisWrapper.classList.add("hidden");
    }
  }

  positionElement.disabled = !active;
  thicknessElement.disabled = !active;

  if (!active) {
    setText("sectionPositionValue", "—");
    setText("sectionThicknessValue", "—");
    return;
  }

  const range = getSectionRange();

  if (!range) {
    return;
  }

  const length =
    Math.max(range.max - range.min, 0.001);

  const center =
    (range.min + range.max) / 2;

  const thickness =
    Math.max(length * 0.08, 0.01);

  positionElement.min = range.min;
  positionElement.max = range.max;
  positionElement.step =
    Math.max(length / 1000, 0.0001);
  positionElement.value = center;

  thicknessElement.min = 0.001;
  thicknessElement.max = length;
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

function getSectionRange() {
  if (!state.activeBounds) {
    return null;
  }

  const mode =
    getElement("sectionMode").value;

  if (mode === "horizontal") {
    return {
      min: state.activeBounds.min.z,
      max: state.activeBounds.max.z
    };
  }

  const axisElement =
    getElement("sectionAxis");

  const axis =
    axisElement && axisElement.value
      ? axisElement.value
      : "x";

  return {
    min: state.activeBounds.min[axis],
    max: state.activeBounds.max[axis]
  };
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

  const modeElement =
    getElement("sectionMode");

  if (!modeElement) {
    return;
  }

  const mode = modeElement.value;

  if (mode === "none") {
    clearSection();
    return;
  }

  const range = getSectionRange();

  if (!range) {
    return;
  }

  removeSectionVolume();

  const position = getNumberValue(
    "sectionPosition",
    (range.min + range.max) / 2
  );

  const thickness = Math.max(
    getNumberValue(
      "sectionThickness",
      (range.max - range.min) * 0.08
    ),
    0.001
  );

  const safePosition = clamp(
    position,
    range.min,
    range.max
  );

  const min = {
    x: state.activeBounds.min.x,
    y: state.activeBounds.min.y,
    z: state.activeBounds.min.z
  };

  const max = {
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
    const axisElement =
      getElement("sectionAxis");

    const axis =
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

  const volume = new Potree.BoxVolume();

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
    Math.max(max.x - min.x, 0.001),
    Math.max(max.y - min.y, 0.001),
    Math.max(max.z - min.z, 0.001)
  );

  volume.clip = true;
  volume.visible = false;

  if (
    typeof viewer.scene.addVolume === "function"
  ) {
    viewer.scene.addVolume(volume);
  }

  state.sectionVolume = volume;

  if (
    Potree.ClipTask &&
    Potree.ClipTask.SHOW_INSIDE !== undefined &&
    typeof viewer.setClipTask === "function"
  ) {
    viewer.setClipTask(
      Potree.ClipTask.SHOW_INSIDE
    );
  }

  if (
    Potree.ClipMethod &&
    Potree.ClipMethod.INSIDE_ANY !== undefined &&
    typeof viewer.setClipMethod === "function"
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

  setStatus("Section applied", "success");
}

function removeSectionVolume() {
  if (!state.sectionVolume) {
    return;
  }

  if (
    viewer &&
    viewer.scene &&
    typeof viewer.scene.removeVolume === "function"
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
    typeof viewer.setClipTask === "function"
  ) {
    viewer.setClipTask(
      Potree.ClipTask.NONE
    );
  }
}

function clearSection(showMessage) {
  const shouldShowMessage =
    showMessage !== false;

  removeSectionVolume();

  const modeElement =
    getElement("sectionMode");

  if (modeElement) {
    modeElement.value = "none";
  }

  updateSectionControls();

  if (shouldShowMessage) {
    setStatus("Section cleared", "success");
  }
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
    typeof viewer.fitToScreen === "function"
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
    typeof viewer.setControls === "function"
  ) {
    viewer.setControls(
      viewer.orbitControls
    );
  }

  const button = getElement("orbitMode");

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

  const link =
    document.createElement("a");

  link.href = state.activeScan.url;
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
  on(
    "scanSearch",
    "input",
    renderLibrary
  );

  on(
    "refreshLibrary",
    "click",
    async function () {
      await loadCatalog();
      renderLibrary();

      setStatus(
        "Library refreshed",
        "success"
      );
    }
  );

  on(
    "fitView",
    "click",
    fitActiveScan
  );

  on(
    "resetView",
    "click",
    resetView
  );

  on(
    "orbitMode",
    "click",
    activateOrbitMode
  );

  on(
    "downloadScan",
    "click",
    downloadActiveScan
  );

  on(
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

  on(
    "pointSize",
    "input",
    applyPointSize
  );

  on(
    "pointOpacity",
    "input",
    applyOpacity
  );

  on(
    "pointBudget",
    "input",
    applyPointBudget
  );

  on(
    "sectionMode",
    "change",
    function () {
      updateSectionControls();

      const mode =
        getElement("sectionMode");

      if (
        mode &&
        mode.value === "none"
      ) {
        clearSection();
      }
    }
  );

  on(
    "sectionAxis",
    "change",
    function () {
      updateSectionControls();

      if (state.sectionVolume) {
        applySection();
      }
    }
  );

  on(
    "sectionPosition",
    "input",
    function () {
      const value =
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

  on(
    "sectionThickness",
    "input",
    function () {
      const value =
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

  on(
    "applySection",
    "click",
    applySection
  );

  on(
    "clearSection",
    "click",
    clearSection
  );
}

/* -------------------------------------------------------------------------- */
/* STATUS                                                                     */
/* -------------------------------------------------------------------------- */

function setStatus(message, type) {
  setText("statusMessage", message);
  setViewerStatus(message, type);
}

function setViewerStatus(message, type) {
  setText("viewerStatus", message);

  const dot =
    getElement("viewerStatusDot");

  if (!dot) {
    return;
  }

  dot.className = "status-dot";

  if (type === "loading") {
    dot.classList.add("status-loading");
  }

  if (type === "error") {
    dot.classList.add("status-error");
  }

  /*
    Normal and success states keep the default green dot.
  */
}

function showLoading(message) {
  setText("loadingMessage", message);

  const overlay =
    getElement("loadingOverlay");

  if (overlay) {
    overlay.classList.remove("hidden");
  }
}

function hideLoading() {
  const overlay =
    getElement("loadingOverlay");

  if (overlay) {
    overlay.classList.add("hidden");
  }
}

/* -------------------------------------------------------------------------- */
/* UTILITIES                                                                  */
/* -------------------------------------------------------------------------- */

function getNumberValue(id, fallback) {
  const element = getElement(id);

  if (!element) {
    return fallback;
  }

  const value = Number(element.value);

  return Number.isFinite(value)
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

  const units = [
    "B",
    "KiB",
    "MiB",
    "GiB"
  ];

  const index = Math.min(
    Math.floor(
      Math.log(bytes) /
        Math.log(1024)
    ),
    units.length - 1
  );

  const value =
    bytes /
    Math.pow(1024, index);

  return (
    value.toFixed(
      index === 0 ? 0 : 1
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
  if (!Number.isFinite(value)) {
    return "—";
  }

  return Number(value).toFixed(3);
}
