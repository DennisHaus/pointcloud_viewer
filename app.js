"use strict";

/*
  COPC Point Cloud Viewer

  Important:
  - This frontend stores and loads optimized .copc.laz files only.
  - Permanent GitHub storage requires a backend or GitHub App endpoint.
  - Set CONFIG.uploadEndpoint when that endpoint exists.
*/

const CONFIG = {
  // Optional catalog file. The application continues if it does not exist.
  catalogUrl: "./catalog.json",

  // Leave empty during frontend-only testing.
  // Example later:
  // uploadEndpoint: "https://your-api.example.com/upload"
  uploadEndpoint: "",

  // 95 MiB gives a small safety margin below GitHub's 100 MB file limit.
  maxUploadBytes: 95 * 1024 * 1024,

  defaultPointBudget: 3000000
};

/*
  Default demo catalog.

  Replace this with your own catalog entries or create catalog.json.

  Each scan should point to one optimized COPC file:
  {
    id: "scan-001",
    name: "Warehouse Scan",
    url: "./data/warehouse.copc.laz",
    sizeBytes: 73400320,
    pointCount: 12800000,
    crs: "EPSG:26910"
  }
*/
const DEFAULT_CATALOG = [
  {
    id: "demo-lion",
    name: "Lion Takanawa COPC Demo",
    url: "https://raw.githubusercontent.com/potree/potree/develop/pointclouds/lion_takanawa.copc.laz",
    sizeBytes: 0,
    pointCount: 0,
    crs: "Unknown"
  }
];

const state = {
  catalog: [],
  loadedClouds: new Map(),
  activeScan: null,
  activeCloud: null,
  activeBounds: null,
  sectionVolume: null,
  sectionCreated: false
};

let viewer = null;

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", initialize);

async function initialize() {
  if (typeof Potree === "undefined") {
    setStatus("Potree failed to load.", "error");
    return;
  }

  initializeViewer();
  bindInterfaceEvents();

  await loadCatalog();

  renderLibrary();

  if (state.catalog.length > 0) {
    await loadScan(state.catalog[0]);
  } else {
    setViewerStatus("No scans available", "idle");
  }
}

/* -------------------------------------------------------------------------- */
/* VIEWER INITIALIZATION                                                      */
/* -------------------------------------------------------------------------- */

function initializeViewer() {
  viewer = new Potree.Viewer($("viewer"));

  window.viewer = viewer;

  viewer.setEDLEnabled(true);
  viewer.setFOV(60);
  viewer.setPointBudget(CONFIG.defaultPointBudget);
  viewer.setBackground("gradient");

  window.addEventListener("resize", () => {
    if (viewer && typeof viewer.onWindowResize === "function") {
      viewer.onWindowResize();
    }
  });
}

/* -------------------------------------------------------------------------- */
/* CATALOG                                                                    */
/* -------------------------------------------------------------------------- */

async function loadCatalog() {
  const catalogEntries = [];

  try {
    const response = await fetch(CONFIG.catalogUrl, {
      cache: "no-store"
    });

    if (response.ok) {
      const json = await response.json();
      const entries = Array.isArray(json) ? json : json.scans;

      if (Array.isArray(entries)) {
        catalogEntries.push(...entries);
      }
    }
  } catch (error) {
    /*
      catalog.json is optional during this first stage.
      The default demo catalog will be used if it does not exist.
    */
  }

  const byId = new Map();

  DEFAULT_CATALOG.forEach((scan) => {
    byId.set(scan.id, normalizeScan(scan));
  });

  catalogEntries.forEach((scan) => {
    if (scan && scan.id) {
      byId.set(scan.id, normalizeScan(scan));
    }
  });

  state.catalog = Array.from(byId.values());
}

function normalizeScan(scan) {
  return {
    id: String(scan.id || createId()),
    name: String(scan.name || scan.filename || "Unnamed COPC scan"),
    url: scan.url || scan.copcUrl || "",
    filename: scan.filename || "",
    sizeBytes: Number(scan.sizeBytes || scan.size || 0),
    pointCount: Number(scan.pointCount || scan.points || 0),
    crs: scan.crs || scan.coordinateSystem || "Unknown",
    localFile: scan.localFile || null,
    localOnly: Boolean(scan.localOnly)
  };
}

/* -------------------------------------------------------------------------- */
/* LIBRARY                                                                    */
/* -------------------------------------------------------------------------- */

function renderLibrary() {
  const list = $("libraryList");
  const empty = $("libraryEmpty");
  const query = $("scanSearch").value.trim().toLowerCase();

  list.replaceChildren();

  const visibleScans = state.catalog.filter((scan) => {
    return scan.name.toLowerCase().includes(query);
  });

  $("scanCount").textContent =
    `${state.catalog.length} ${state.catalog.length === 1 ? "scan" : "scans"}`;

  if (visibleScans.length === 0) {
    empty.classList.remove("hidden");
    return;
  }

  empty.classList.add("hidden");

  visibleScans.forEach((scan) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "scan-card";

    if (state.activeScan && state.activeScan.id === scan.id) {
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

    if (state.loadedClouds.has(scan.id)) {
      stateDot.classList.add("loaded");
    }

    if (scan.loading) {
      stateDot.classList.remove("loaded");
      stateDot.classList.add("loading");
    }

    header.append(icon, name, stateDot);

    const metadata = document.createElement("div");
    metadata.className = "scan-meta";

    const format = document.createElement("span");
    format.textContent = "COPC";

    const size = document.createElement("span");
    size.textContent = scan.sizeBytes
      ? formatBytes(scan.sizeBytes)
      : "Size unknown";

    metadata.append(format, size);

    card.append(header, metadata);

    card.addEventListener("click", () => {
      loadScan(scan);
    });

    list.appendChild(card);
  });
}

/* -------------------------------------------------------------------------- */
/* POINT-CLOUD LOADING                                                        */
/* -------------------------------------------------------------------------- */

async function loadScan(scan) {
  if (!scan) return;

  if (state.loadedClouds.has(scan.id)) {
    setActiveScan(scan);
    fitActiveScan();
    return;
  }

  if (scan.loading) {
    return;
  }

  scan.loading = true;
  renderLibrary();

  showLoading(`Loading ${scan.name}...`);
  setViewerStatus("Loading point cloud", "loading");
  setStatus(`Loading ${scan.name}...`, "loading");

  try {
    let event;

    if (scan.localFile) {
      if (
        typeof Potree.loadLocalCopc !== "function"
      ) {
        throw new Error(
          "Local COPC loader is unavailable. Load the local COPC adapter script."
        );
      }

      event = await Potree.loadLocalCopc(
        scan.localFile,
        scan.localFile.name
      );
    } else {
      if (!scan.url) {
        throw new Error("This scan does not have a COPC URL.");
      }

      event = await loadRemoteCopc(scan.url, scan.name);
    }

    const cloud = event.pointcloud || event;

    if (!cloud) {
      throw new Error("No point cloud was returned by Potree.");
    }

    cloud.name = scan.name;

    viewer.scene.addPointCloud(cloud);

    configurePointCloud(cloud);

    state.loadedClouds.set(scan.id, cloud);

    scan.loading = false;
    scan.loaded = true;

    setActiveScan(scan);
    renderLibrary();

    hideLoading();
    setViewerStatus("Point cloud loaded", "success");
    setStatus(`${scan.name} loaded`, "success");

    setTimeout(() => {
      fitActiveScan();
    }, 250);
  } catch (error) {
    scan.loading = false;
    renderLibrary();

    hideLoading();
    setViewerStatus("Loading failed", "error");
    setStatus(error.message || "Unable to load COPC file.", "error");

    console.error(error);
  }
}

function loadRemoteCopc(url, name) {
  return new Promise((resolve, reject) => {
    try {
      Potree.loadPointCloud(url, name, (event) => {
        if (event && event.pointcloud) {
          resolve(event);
        } else {
          reject(
            new Error(
              "Potree could not create a point cloud from this COPC file."
            )
          );
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

function configurePointCloud(cloud) {
  if (!cloud.material) return;

  const material = cloud.material;

  material.size = Number($("pointSize").value);

  if (Potree.PointSizeType && Potree.PointSizeType.ADAPTIVE) {
    material.pointSizeType = Potree.PointSizeType.ADAPTIVE;
  }

  if (Potree.PointShape && Potree.PointShape.SQUARE) {
    material.shape = Potree.PointShape.SQUARE;
  }

  applyColorMode(cloud);
  applyOpacity(cloud);
}

/* -------------------------------------------------------------------------- */
/* ACTIVE SCAN AND INSPECTOR                                                  */
/* -------------------------------------------------------------------------- */

function setActiveScan(scan) {
  const cloud = state.loadedClouds.get(scan.id);

  if (!cloud) return;

  state.activeScan = scan;
  state.activeCloud = cloud;
  state.activeBounds = getPointCloudBounds(cloud);

  updateInspector();
  updateSectionControls();
  renderLibrary();
}

function updateInspector() {
  const scan = state.activeScan;
  const bounds = state.activeBounds;

  if (!scan || !state.activeCloud) {
    $("inspectorEmpty").classList.remove("hidden");
    $("inspectorContent").classList.add("hidden");
    return;
  }

  $("inspectorEmpty").classList.add("hidden");
  $("inspectorContent").classList.remove("hidden");

  $("activeScanName").textContent = scan.name;

  $("activePointCount").textContent = scan.pointCount
    ? formatNumber(scan.pointCount)
    : "Loaded";

  $("activeFileSize").textContent = scan.sizeBytes
    ? formatBytes(scan.sizeBytes)
    : "Unknown";

  $("activeCrs").textContent = scan.crs || "Unknown";

  if (bounds) {
    $("boundsX").textContent =
      `${formatCoordinate(bounds.min.x)} → ${formatCoordinate(bounds.max.x)}`;

    $("boundsY").textContent =
      `${formatCoordinate(bounds.min.y)} → ${formatCoordinate(bounds.max.y)}`;

    $("boundsZ").textContent =
      `${formatCoordinate(bounds.min.z)} → ${formatCoordinate(bounds.max.z)}`;
  } else {
    $("boundsX").textContent = "Unavailable";
    $("boundsY").textContent = "Unavailable";
    $("boundsZ").textContent = "Unavailable";
  }
}

function getPointCloudBounds(cloud) {
  const box =
    cloud.boundingBox ||
    cloud.pcoGeometry?.tightBoundingBox ||
    cloud.pcoGeometry?.boundingBox;

  if (!box || !box.min || !box.max) {
    return null;
  }

  return {
    min: {
      x: getVectorComponent(box.min, "x", 0),
      y: getVectorComponent(box.min, "y", 1),
      z: getVectorComponent(box.min, "z", 2)
    },
    max: {
      x: getVectorComponent(box.max, "x", 0),
      y: getVectorComponent(box.max, "y", 1),
      z: getVectorComponent(box.max, "z", 2)
    }
  };
}

function getVectorComponent(vector, property, index) {
  if (typeof vector[property] === "number") {
    return vector[property];
  }

  if (typeof vector[index] === "number") {
    return vector[index];
  }

  return 0;
}

/* -------------------------------------------------------------------------- */
/* APPEARANCE CONTROLS                                                        */
/* -------------------------------------------------------------------------- */

function applyColorMode(cloud = state.activeCloud) {
  if (!cloud || !cloud.material || !Potree.PointColorType) {
    return;
  }

  const selectedMode = $("colorMode").value;
  const colorType = Potree.PointColorType[selectedMode];

  if (colorType !== undefined) {
    cloud.material.pointColorType = colorType;
  }
}

function applyPointSize() {
  if (!state.activeCloud || !state.activeCloud.material) {
    return;
  }

  const value = Number($("pointSize").value);

  state.activeCloud.material.size = value;
  $("pointSizeValue").value = value.toFixed(1);
  $("pointSizeValue").textContent = value.toFixed(1);
}

function applyOpacity() {
  if (!state.activeCloud || !state.activeCloud.material) {
    return;
  }

  const value = Number($("pointOpacity").value);

  state.activeCloud.material.opacity = value;
  state.activeCloud.material.transparent = value < 1;

  $("pointOpacityValue").value = `${Math.round(value * 100)}%`;
  $("pointOpacityValue").textContent = `${Math.round(value * 100)}%`;
}

function applyPointBudget() {
  if (!viewer) return;

  const value = Number($("pointBudget").value);

  viewer.setPointBudget(value);

  $("pointBudgetValue").value = formatCompactNumber(value);
  $("pointBudgetValue").textContent = formatCompactNumber(value);
}

/* -------------------------------------------------------------------------- */
/* SECTION TOOLS                                                              */
/* -------------------------------------------------------------------------- */

function updateSectionControls() {
  const mode = $("sectionMode").value;
  const hasBounds = Boolean(state.activeBounds);

  const isActive = hasBounds && mode !== "none";
  const isVertical = mode === "vertical";

  $("sectionAxisWrapper").classList.toggle(
    "hidden",
    !isVertical
  );

  $("sectionPosition").disabled = !isActive;
  $("sectionThickness").disabled = !isActive;

  if (!hasBounds) {
    $("sectionPositionValue").textContent = "—";
    $("sectionThicknessValue").textContent = "—";
    return;
  }

  const range = getSectionRange();

  const currentPosition = Number($("sectionPosition").value);

  const position =
    Number.isFinite(currentPosition) &&
    currentPosition >= range.min &&
    currentPosition <= range.max
      ? currentPosition
      : (range.min + range.max) / 2;

  $("sectionPosition").min = range.min;
  $("sectionPosition").max = range.max;
  $("sectionPosition").step = Math.max(
    (range.max - range.min) / 1000,
    0.001
  );
  $("sectionPosition").value = position;

  const rangeLength = Math.max(range.max - range.min, 0.001);
  const defaultThickness = Math.max(rangeLength * 0.08, 0.01);

  const currentThickness = Number($("sectionThickness").value);

  if (
    !Number.isFinite(currentThickness) ||
    currentThickness <= 0
  ) {
    $("sectionThickness").value = defaultThickness.toFixed(3);
  }

  $("sectionThickness").max = rangeLength;
  $("sectionPositionValue").textContent = formatCoordinate(position);
  $("sectionThicknessValue").textContent =
    `${formatCoordinate(Number($("sectionThickness").value))} units`;
}

function getSectionRange() {
  const bounds = state.activeBounds;

  if ($("sectionMode").value === "horizontal") {
    return {
      min: bounds.min.z,
      max: bounds.max.z
    };
  }

  const axis = $("sectionAxis").value;

  return {
    min: bounds.min[axis],
    max: bounds.max[axis]
  };
}

function applySection() {
  if (!state.activeBounds || !state.activeCloud) {
    return;
  }

  const mode = $("sectionMode").value;

  if (mode === "none") {
    clearSection();
    return;
  }

  const bounds = state.activeBounds;
  const range = getSectionRange();

  const position = Number($("sectionPosition").value);
  const thickness = Math.max(
    Number($("sectionThickness").value),
    0.001
  );

  const min = {
    x: bounds.min.x,
    y: bounds.min.y,
    z: bounds.min.z
  };

  const max = {
    x: bounds.max.x,
    y: bounds.max.y,
    z: bounds.max.z
  };

  const clampedPosition = clamp(
    position,
    range.min,
    range.max
  );

  if (mode === "horizontal") {
    min.z = clampedPosition - thickness / 2;
    max.z = clampedPosition + thickness / 2;
  }

  if (mode === "vertical") {
    const axis = $("sectionAxis").value;

    min[axis] = clampedPosition - thickness / 2;
    max[axis] = clampedPosition + thickness / 2;
  }

  if (state.sectionVolume) {
    removeSectionVolume();
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

  /*
    Potree uses clipping volumes for sectioning.
    The volume itself stays invisible while clipping remains active.
  */
  volume.clip = true;
  volume.visible = false;

  viewer.scene.addVolume(volume);

  state.sectionVolume = volume;
  state.sectionCreated = true;

  if (
    Potree.ClipTask &&
    Potree.ClipTask.SHOW_INSIDE &&
    typeof viewer.setClipTask === "function"
  ) {
    viewer.setClipTask(Potree.ClipTask.SHOW_INSIDE);
  }

  $("sectionPositionValue").textContent =
    formatCoordinate(clampedPosition);

  $("sectionThicknessValue").textContent =
    `${formatCoordinate(thickness)} units`;

  setStatus("Section applied", "success");
}

function removeSectionVolume() {
  if (!state.sectionVolume) {
    return;
  }

  if (
    viewer.scene &&
    typeof viewer.scene.removeVolume === "function"
  ) {
    viewer.scene.removeVolume(state.sectionVolume);
  }

  state.sectionVolume = null;
  state.sectionCreated = false;
}

function clearSection() {
  removeSectionVolume();

  if (
    Potree.ClipTask &&
    Potree.ClipTask.NONE &&
    typeof viewer.setClipTask === "function"
  ) {
    viewer.setClipTask(Potree.ClipTask.NONE);
  }

  $("sectionMode").value = "none";
  updateSectionControls();

  setStatus("Section cleared", "success");
}

/* -------------------------------------------------------------------------- */
/* NAVIGATION AND VIEW                                                        */
/* -------------------------------------------------------------------------- */

function fitActiveScan() {
  if (!viewer || !state.activeCloud) {
    setStatus("Load a scan first.", "warning");
    return;
  }

  if (typeof viewer.fitToScreen === "function") {
    viewer.fitToScreen(0.5);
  }

  setStatus("View fitted to active scan", "success");
}

function resetView() {
  fitActiveScan();
}

function selectOrbitMode() {
  /*
    Potree's default navigation supports:
    - Left mouse: orbit
    - Right mouse: pan
    - Mouse wheel: zoom
  */

  if (
    viewer &&
    viewer.orbitControls &&
    typeof viewer.setControls === "function"
  ) {
    viewer.setControls(viewer.orbitControls);
  }

  $("orbitMode").classList.add("active");
  setStatus("Orbit navigation active", "success");
}

function downloadActiveScan() {
  const scan = state.activeScan;

  if (!scan) {
    setStatus("Select a scan first.", "warning");
    return;
  }

  let downloadUrl = scan.url;
  let temporaryUrl = false;

  if (!downloadUrl && scan.localFile) {
    downloadUrl = URL.createObjectURL(scan.localFile);
    temporaryUrl = true;
  }

  if (!downloadUrl) {
    setStatus("No downloadable COPC source is available.", "warning");
    return;
  }

  const anchor = document.createElement("a");
  anchor.href = downloadUrl;
  anchor.download = scan.filename || `${scan.name}.copc.laz`;
  anchor.target = "_blank";
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  if (temporaryUrl) {
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 2000);
  }
}

/* -------------------------------------------------------------------------- */
/* LOCAL UPLOAD / OPTIONAL API UPLOAD                                         */
/* -------------------------------------------------------------------------- */

async function handleSelectedFiles(fileList) {
  const file = fileList && fileList[0];

  if (!file) {
    return;
  }

  if (!/\.copc\.laz$/i.test(file.name)) {
    setStatus(
      "Only optimized .copc.laz files are accepted.",
      "error"
    );
    return;
  }

  if (file.size > CONFIG.maxUploadBytes) {
    setStatus(
      `File exceeds the ${formatBytes(CONFIG.maxUploadBytes)} limit.`,
      "error"
    );
    return;
  }

  const localScan = normalizeScan({
    id: `local-${Date.now()}`,
    name: file.name.replace(/\.copc\.laz$/i, ""),
    filename: file.name,
    sizeBytes: file.size,
    localFile: file,
    localOnly: true,
    crs: "Read from COPC metadata"
  });

  /*
    If an upload endpoint is configured, send the optimized COPC file
    to that endpoint. The backend should permanently store only the
    .copc.laz file and return a catalog record containing its URL.
  */
  if (CONFIG.uploadEndpoint) {
    try {
      setStatus("Uploading optimized COPC file...", "loading");
      showLoading("Saving COPC file...");

      const storedScan = await uploadCopc(file);

      Object.assign(localScan, normalizeScan(storedScan));

      /*
        The remote URL becomes the permanent source.
        The browser File object is no longer needed.
      */
      localScan.localFile = null;
      localScan.localOnly = false;
    } catch (error) {
      hideLoading();
      setStatus(
        error.message || "COPC upload failed.",
        "error"
      );
      return;
    }
  }

  state.catalog.unshift(localScan);
  renderLibrary();

  await loadScan(localScan);
}

async function uploadCopc(file) {
  const formData = new FormData();

  formData.append("file", file, file.name);
  formData.append("filename", file.name);
  formData.append("format", "copc.laz");

  const response = await fetch(CONFIG.uploadEndpoint, {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    throw new Error(
      `Upload failed with HTTP ${response.status}.`
    );
  }

  const result = await response.json();

  if (!result.url && !result.copcUrl) {
    throw new Error(
      "Upload endpoint did not return a COPC URL."
    );
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/* UI EVENTS                                                                  */
/* -------------------------------------------------------------------------- */

function bindInterfaceEvents() {
  $("uploadButton").addEventListener("click", () => {
    $("fileInput").click();
  });

  $("fileInput").addEventListener("change", (event) => {
    handleSelectedFiles(event.target.files);
    event.target.value = "";
  });

  $("scanSearch").addEventListener("input", renderLibrary);

  $("refreshLibrary").addEventListener("click", async () => {
    await loadCatalog();
    renderLibrary();
    setStatus("Library refreshed", "success");
  });

  $("fitView").addEventListener("click", fitActiveScan);
  $("resetView").addEventListener("click", resetView);
  $("orbitMode").addEventListener("click", selectOrbitMode);
  $("downloadScan").addEventListener("click", downloadActiveScan);

  $("colorMode").addEventListener("change", () => {
    applyColorMode();
    setStatus("Color mode updated", "success");
  });

  $("pointSize").addEventListener("input", applyPointSize);
  $("pointOpacity").addEventListener("input", applyOpacity);
  $("pointBudget").addEventListener("input", applyPointBudget);

  $("sectionMode").addEventListener("change", () => {
    updateSectionControls();

    if ($("sectionMode").value === "none") {
      clearSection();
    }
  });

  $("sectionAxis").addEventListener("change", () => {
    updateSectionControls();

    if (state.sectionCreated) {
      applySection();
    }
  });

  $("sectionPosition").addEventListener("input", () => {
    const value = Number($("sectionPosition").value);

    $("sectionPositionValue").textContent =
      formatCoordinate(value);

    if (state.sectionCreated) {
      applySection();
    }
  });

  $("sectionThickness").addEventListener("input", () => {
    const value = Number($("sectionThickness").value);

    $("sectionThicknessValue").textContent =
      `${formatCoordinate(value)} units`;

    if (state.sectionCreated) {
      applySection();
    }
  });

  $("applySection").addEventListener("click", applySection);
  $("clearSection").addEventListener("click", clearSection);

  const viewerElement = $("viewer");

  viewerElement.addEventListener("dragover", (event) => {
    event.preventDefault();
    viewerElement.classList.add("drop-target");
  });

  viewerElement.addEventListener("dragleave", () => {
    viewerElement.classList.remove("drop-target");
  });

  viewerElement.addEventListener("drop", (event) => {
    event.preventDefault();
    viewerElement.classList.remove("drop-target");

    handleSelectedFiles(event.dataTransfer.files);
  });
}

/* -------------------------------------------------------------------------- */
/* STATUS AND LOADING                                                         */
/* -------------------------------------------------------------------------- */

function setStatus(message, type = "") {
  $("statusMessage").textContent = message;

  const dot = $("viewerStatusDot");

  dot.classList.remove(
    "status-idle",
    "status-loading",
    "status-error"
  );

  if (type === "loading") {
    dot.classList.add("status-loading");
  } else if (type === "error") {
    dot.classList.add("status-error");
  } else if (type === "success") {
    dot.classList.add("status-dot");
  } else {
    dot.classList.add("status-idle");
  }
}

function setViewerStatus(message, type = "idle") {
  $("viewerStatus").textContent = message;

  const dot = $("viewerStatusDot");

  dot.classList.remove(
    "status-idle",
    "status-loading",
    "status-error"
  );

  if (type === "loading") {
    dot.classList.add("status-loading");
  } else if (type === "error") {
    dot.classList.add("status-error");
  } else if (type === "success") {
    dot.classList.add("status-dot");
  } else {
    dot.classList.add("status-idle");
  }
}

function showLoading(message) {
  $("loadingMessage").textContent = message;
  $("loadingOverlay").classList.remove("hidden");
}

function hideLoading() {
  $("loadingOverlay").classList.add("hidden");
}

/* -------------------------------------------------------------------------- */
/* UTILITIES                                                                  */
/* -------------------------------------------------------------------------- */

function createId() {
  return `scan-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) {
    return "Unknown";
  }

  const units = ["B", "KiB", "MiB", "GiB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );

  const value = bytes / Math.pow(1024, index);

  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatNumber(value) {
  if (!value || value <= 0) {
    return "Unknown";
  }

  return new Intl.NumberFormat().format(value);
}

function formatCompactNumber(value) {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(0)}K`;
  }

  return String(value);
}

function formatCoordinate(value) {
  if (!Number.isFinite(value)) {
    return "—";
  }

  return Number(value).toFixed(3);
}
