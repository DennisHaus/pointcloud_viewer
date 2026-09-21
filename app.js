"use strict";

const CONFIG = {
  catalogUrl:
    "https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPOSITORY/main/catalog.json",

  repositoryUrl:
    "https://github.com/YOUR_USERNAME/YOUR_REPOSITORY",

  maxUploadBytes: 95 * 1024 * 1024,
  defaultPointBudget: 3000000
};

const state = {
  catalog: [],
  loadedClouds: new Map(),
  activeScan: null,
  activeCloud: null,
  activeBounds: null,
  admin: null,
  github: null,
  sectionVolume: null
};

let viewer = null;

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", initialize);

async function initialize() {
  initializeViewer();
  bindEvents();

  await loadCatalog();

  renderLibrary();

  if (state.catalog.length > 0) {
    await loadScan(state.catalog[0]);
  } else {
    setViewerStatus("No scans available", "idle");
  }
}

/* -------------------------------------------------------------------------- */
/* VIEWER                                                                     */
/* -------------------------------------------------------------------------- */

function initializeViewer() {
  if (typeof Potree === "undefined") {
    setStatus("Potree failed to load.", "error");
    return;
  }

  viewer = new Potree.Viewer($("potree_render_area"));

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
/* AUTHENTICATION                                                             */
/* -------------------------------------------------------------------------- */

async function loadSession() {
  try {
    const response = await fetch("/api/admin/session", {
      cache: "no-store"
    });

    const data = await response.json();

    state.admin = data.authenticated
      ? {
          login: data.login
        }
      : null;

    renderAuthentication();
  } catch (error) {
    state.admin = null;
    renderAuthentication();
  }
}

function renderAuthentication() {
  const authenticated = Boolean(state.admin);

  $("loginLink").classList.toggle("hidden", authenticated);
  $("logoutButton").classList.toggle("hidden", !authenticated);
  $("uploadButton").classList.toggle("hidden", !authenticated);
  $("adminSection").classList.toggle("hidden", !authenticated);

  if (authenticated) {
    $("adminBadge").textContent = `Admin: ${state.admin.login}`;
    $("adminBadge").classList.remove("hidden");
  } else {
    $("adminBadge").classList.add("hidden");
  }
}

async function logout() {
  await fetch("/api/auth/logout", {
    method: "POST"
  });

  state.admin = null;
  state.github = null;

  renderAuthentication();
  setStatus("Logged out", "success");
}

/* -------------------------------------------------------------------------- */
/* CATALOG                                                                    */
/* -------------------------------------------------------------------------- */

async function loadCatalog() {
  try {
    const response = await fetch(
      `${CONFIG.catalogUrl}?t=${Date.now()}`,
      {
        cache: "no-store"
      }
    );

    if (!response.ok) {
      throw new Error(
        `Catalog request failed with HTTP ${response.status}.`
      );
    }

    const data = await response.json();

    const scans = Array.isArray(data)
      ? data
      : Array.isArray(data.scans)
        ? data.scans
        : [];

    state.catalog = scans.map(normalizeScan);
  } catch (error) {
    state.catalog = [];
    setStatus(error.message, "error");
  }
}

    if (!response.ok) {
      throw new Error("Could not load scan catalog.");
    }

    const data = await response.json();

    const scans = Array.isArray(data)
      ? data
      : Array.isArray(data.scans)
        ? data.scans
        : [];

    state.catalog = scans.map(normalizeScan);
  } catch (error) {
    state.catalog = [];
    setStatus(error.message, "error");
  }
}

function normalizeScan(scan) {
  return {
    id: String(scan.id || ""),
    name: String(
      scan.name ||
      scan.filename ||
      scan.id ||
      "Unnamed COPC scan"
    ),
    filename: scan.filename || "",
    path: scan.path || "",
    url: scan.url || "",
    sizeBytes: Number(scan.sizeBytes || 0),
    pointCount: Number(scan.pointCount || 0),
    crs: scan.crs || "Unknown",
    uploadedAt: scan.uploadedAt || ""
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

  $("scanCount").textContent =
    `${state.catalog.length} ${
      state.catalog.length === 1 ? "scan" : "scans"
    }`;

  const visibleScans = state.catalog.filter((scan) =>
    scan.name.toLowerCase().includes(query)
  );

  if (visibleScans.length === 0) {
    empty.classList.remove("hidden");
    return;
  }

  empty.classList.add("hidden");

  visibleScans.forEach((scan) => {
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

    const scanState = document.createElement("div");
    scanState.className = "scan-state";

    if (state.loadedClouds.has(scan.id)) {
      scanState.classList.add("loaded");
    }

    header.append(icon, name, scanState);

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
  if (!scan || !scan.url) {
    setStatus("This scan has no valid COPC URL.", "error");
    return;
  }

  if (state.loadedClouds.has(scan.id)) {
    setActiveScan(scan);
    fitActiveScan();
    return;
  }

  showLoading(`Loading ${scan.name}...`);
  setViewerStatus("Loading point cloud", "loading");
  setStatus(`Loading ${scan.name}...`, "loading");

  try {
    const event = await loadRemoteCopc(
      scan.url,
      scan.name
    );

    const cloud = event.pointcloud || event;

    if (!cloud) {
      throw new Error("Potree returned no point cloud.");
    }

    cloud.name = scan.name;

    viewer.scene.addPointCloud(cloud);
    configurePointCloud(cloud);

    state.loadedClouds.set(scan.id, cloud);

    setActiveScan(scan);
    renderLibrary();

    hideLoading();
    setViewerStatus("Point cloud loaded", "success");
    setStatus(`${scan.name} loaded`, "success");

    setTimeout(fitActiveScan, 250);
  } catch (error) {
    hideLoading();
    setViewerStatus("Loading failed", "error");
    setStatus(error.message, "error");
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
              "Potree could not load this COPC file."
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

  cloud.material.size = Number($("pointSize").value);

  if (
    Potree.PointSizeType &&
    Potree.PointSizeType.ADAPTIVE !== undefined
  ) {
    cloud.material.pointSizeType =
      Potree.PointSizeType.ADAPTIVE;
  }

  if (
    Potree.PointShape &&
    Potree.PointShape.SQUARE !== undefined
  ) {
    cloud.material.shape = Potree.PointShape.SQUARE;
  }

  applyColorMode(cloud);
  applyOpacity(cloud);
}

/* -------------------------------------------------------------------------- */
/* ACTIVE SCAN                                                                */
/* -------------------------------------------------------------------------- */

function setActiveScan(scan) {
  const cloud = state.loadedClouds.get(scan.id);

  if (!cloud) return;

  clearSection(false);

  state.activeScan = scan;
  state.activeCloud = cloud;
  state.activeBounds = getPointCloudBounds(cloud);

  updateInspector();
  updateSectionControls();
  renderLibrary();
}

function updateInspector() {
  const scan = state.activeScan;

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

  if (!state.activeBounds) {
    $("boundsX").textContent = "Unavailable";
    $("boundsY").textContent = "Unavailable";
    $("boundsZ").textContent = "Unavailable";
    return;
  }

  const bounds = state.activeBounds;

  $("boundsX").textContent =
    `${formatCoordinate(bounds.min.x)} → ${
      formatCoordinate(bounds.max.x)
    }`;

  $("boundsY").textContent =
    `${formatCoordinate(bounds.min.y)} → ${
      formatCoordinate(bounds.max.y)
    }`;

  $("boundsZ").textContent =
    `${formatCoordinate(bounds.min.z)} → ${
      formatCoordinate(bounds.max.z)
    }`;
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
      x: Number(box.min.x),
      y: Number(box.min.y),
      z: Number(box.min.z)
    },
    max: {
      x: Number(box.max.x),
      y: Number(box.max.y),
      z: Number(box.max.z)
    }
  };
}

/* -------------------------------------------------------------------------- */
/* APPEARANCE                                                                 */
/* -------------------------------------------------------------------------- */

function applyColorMode(cloud = state.activeCloud) {
  if (
    !cloud ||
    !cloud.material ||
    !Potree.PointColorType
  ) {
    return;
  }

  const mode = $("colorMode").value;
  const colorType = Potree.PointColorType[mode];

  if (colorType !== undefined) {
    cloud.material.pointColorType = colorType;
  }
}

function applyPointSize() {
  const value = Number($("pointSize").value);

  $("pointSizeValue").textContent = value.toFixed(1);

  if (
    state.activeCloud &&
    state.activeCloud.material
  ) {
    state.activeCloud.material.size = value;
  }
}

function applyOpacity() {
  const value = Number($("pointOpacity").value);

  $("pointOpacityValue").textContent =
    `${Math.round(value * 100)}%`;

  if (
    state.activeCloud &&
    state.activeCloud.material
  ) {
    state.activeCloud.material.opacity = value;
    state.activeCloud.material.transparent = value < 1;
  }
}

function applyPointBudget() {
  const value = Number($("pointBudget").value);

  viewer.setPointBudget(value);
  $("pointBudgetValue").textContent =
    formatCompactNumber(value);
}

/* -------------------------------------------------------------------------- */
/* SECTION TOOLS                                                              */
/* -------------------------------------------------------------------------- */

function getSectionRange() {
  if (!state.activeBounds) return null;

  const mode = $("sectionMode").value;
  const bounds = state.activeBounds;

  if (mode === "horizontal") {
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

function updateSectionControls() {
  const mode = $("sectionMode").value;
  const isActive =
    mode !== "none" &&
    Boolean(state.activeBounds);

  $("sectionAxisWrapper").classList.toggle(
    "hidden",
    mode !== "vertical"
  );

  $("sectionPosition").disabled = !isActive;
  $("sectionThickness").disabled = !isActive;

  if (!isActive) {
    $("sectionPositionValue").textContent = "—";
    $("sectionThicknessValue").textContent = "—";
    return;
  }

  const range = getSectionRange();
  const distance = Math.max(range.max - range.min, 0.001);

  $("sectionPosition").min = range.min;
  $("sectionPosition").max = range.max;
  $("sectionPosition").step = distance / 1000;

  const position =
    (Number(range.min) + Number(range.max)) / 2;

  $("sectionPosition").value = position;

  const thickness = Math.max(distance * 0.08, 0.01);

  $("sectionThickness").max = distance;
  $("sectionThickness").value = thickness.toFixed(3);

  $("sectionPositionValue").textContent =
    formatCoordinate(position);

  $("sectionThicknessValue").textContent =
    `${formatCoordinate(thickness)} units`;
}

function applySection() {
  if (!state.activeBounds || !state.activeCloud) {
    setStatus("Load a scan first.", "warning");
    return;
  }

  const mode = $("sectionMode").value;

  if (mode === "none") {
    clearSection();
    return;
  }

  clearSection(false);

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

  const safePosition = clamp(
    position,
    range.min,
    range.max
  );

  if (mode === "horizontal") {
    min.z = safePosition - thickness / 2;
    max.z = safePosition + thickness / 2;
  }

  if (mode === "vertical") {
    const axis = $("sectionAxis").value;

    min[axis] = safePosition - thickness / 2;
    max[axis] = safePosition + thickness / 2;
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

  viewer.scene.addVolume(volume);

  state.sectionVolume = volume;

  if (
    Potree.ClipTask &&
    Potree.ClipTask.SHOW_INSIDE !== undefined &&
    typeof viewer.setClipTask === "function"
  ) {
    viewer.setClipTask(Potree.ClipTask.SHOW_INSIDE);
  }

  if (
    Potree.ClipMethod &&
    Potree.ClipMethod.INSIDE_ANY !== undefined &&
    typeof viewer.setClipMethod === "function"
  ) {
    viewer.setClipMethod(Potree.ClipMethod.INSIDE_ANY);
  }

  $("sectionPositionValue").textContent =
    formatCoordinate(safePosition);

  $("sectionThicknessValue").textContent =
    `${formatCoordinate(thickness)} units`;

  setStatus("Section applied", "success");
}

function clearSection(showMessage = true) {
  if (state.sectionVolume) {
    if (
      viewer.scene &&
      typeof viewer.scene.removeVolume === "function"
    ) {
      viewer.scene.removeVolume(state.sectionVolume);
    }

    state.sectionVolume = null;
  }

  if (
    viewer &&
    Potree.ClipTask &&
    Potree.ClipTask.NONE !== undefined &&
    typeof viewer.setClipTask === "function"
  ) {
    viewer.setClipTask(Potree.ClipTask.NONE);
  }

  if (showMessage) {
    $("sectionMode").value = "none";
    updateSectionControls();
    setStatus("Section cleared", "success");
  }
}

/* -------------------------------------------------------------------------- */
/* VIEW CONTROLS                                                              */
/* -------------------------------------------------------------------------- */

function fitActiveScan() {
  if (!state.activeCloud) {
    setStatus("Select a scan first.", "warning");
    return;
  }

  viewer.fitToScreen(0.5);
  setStatus("View fitted to active scan", "success");
}

function resetView() {
  fitActiveScan();
}

function activateOrbitMode() {
  if (
    viewer.orbitControls &&
    typeof viewer.setControls === "function"
  ) {
    viewer.setControls(viewer.orbitControls);
  }

  $("orbitMode").classList.add("active");
  setStatus("Orbit navigation active", "success");
}

function downloadActiveScan() {
  if (!state.activeScan || !state.activeScan.url) {
    setStatus("Select a scan first.", "warning");
    return;
  }

  const anchor = document.createElement("a");

  anchor.href = state.activeScan.url;
  anchor.download =
    state.activeScan.filename ||
    `${state.activeScan.name}.copc.laz`;
  anchor.target = "_blank";
  anchor.rel = "noopener";

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

/* -------------------------------------------------------------------------- */
/* ADMIN UPLOAD                                                               */
/* -------------------------------------------------------------------------- */

async function handleFileSelected(file) {
  if (!state.admin) {
    setStatus("Administrator login required.", "error");
    return;
  }

  if (!file) return;

  if (!/\.copc\.laz$/i.test(file.name)) {
    setStatus(
      "Only .copc.laz files are accepted.",
      "error"
    );
    return;
  }

  if (file.size > CONFIG.maxUploadBytes) {
    setStatus(
      `The file exceeds ${formatBytes(
        CONFIG.maxUploadBytes
      )}.`,
      "error"
    );
    return;
  }

  try {
    await validateCopcFile(file);

    showLoading("Encoding COPC file for GitHub...");
    setStatus("Preparing upload...", "loading");

    const github = await ensureGithubToken();

    const id = createId();
    const path = `scans/${id}.copc.laz`;

    const buffer = await file.arrayBuffer();
    const contentBase64 =
      arrayBufferToBase64(buffer);

    await putRepositoryFile(
      path,
      contentBase64,
      `Add COPC scan ${id}`
    );

    const entry = {
      id,
      name: file.name.replace(/\.copc\.laz$/i, ""),
      filename: file.name,
      path,
      url: joinUrl(github.rawBaseUrl, path),
      sizeBytes: file.size,
      pointCount: 0,
      crs: "Unknown",
      uploadedAt: new Date().toISOString()
    };

    try {
      await mutateCatalog(
        (root) => {
          root.scans = root.scans.filter(
            (scan) => scan.id !== entry.id
          );

          root.scans.unshift(entry);
          return root;
        },
        `Add catalog entry ${id}`
      );
    } catch (catalogError) {
      try {
        const fileInfo = await getRepositoryFile(path);

        await deleteRepositoryFile(
          path,
          fileInfo.sha,
          `Rollback COPC upload ${id}`
        );
      } catch (rollbackError) {
        console.error("Rollback failed:", rollbackError);
      }

      throw new Error(
        `COPC was uploaded, but catalog update failed: ${
          catalogError.message
        }`
      );
    }

    hideLoading();

    await loadCatalog();
    renderLibrary();

    const createdScan = state.catalog.find(
      (scan) => scan.id === id
    );

    if (createdScan) {
      await loadScan(createdScan);
    }

    setStatus("COPC permanently saved", "success");
  } catch (error) {
    hideLoading();
    setStatus(error.message, "error");
    console.error(error);
  }
}

async function validateCopcFile(file) {
  const sampleSize = Math.min(file.size, 65536);
  const sample = new Uint8Array(
    await file.slice(0, sampleSize).arrayBuffer()
  );

  const signature = String.fromCharCode(
    sample[0],
    sample[1],
    sample[2],
    sample[3]
  );

  if (signature !== "LASF") {
    throw new Error(
      "This file does not contain a valid LAS/LAZ header."
    );
  }

  const text = new TextDecoder().decode(sample);

  if (!/copc/i.test(text)) {
    throw new Error(
      "The file does not appear to contain COPC metadata."
    );
  }
}

/* -------------------------------------------------------------------------- */
/* GITHUB REPOSITORY OPERATIONS                                               */
/* -------------------------------------------------------------------------- */

async function ensureGithubToken() {
  if (state.github && state.github.token) {
    return state.github;
  }

  const response = await fetch(CONFIG.tokenEndpoint, {
    cache: "no-store"
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error(
        "Administrator authentication has expired."
      );
    }

    throw new Error(
      "Could not obtain GitHub repository access."
    );
  }

  state.github = await response.json();
  return state.github;
}

async function githubRequest(
  endpoint,
  options = {},
  retry = true
) {
  const github = await ensureGithubToken();

  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    Authorization: `Bearer ${github.token}`,
    ...options.headers
  };

  const response = await fetch(
    `${github.apiBase}${endpoint}`,
    {
      ...options,
      headers
    }
  );

  if (response.status === 401 && retry) {
    state.github = null;
    return githubRequest(endpoint, options, false);
  }

  if (!response.ok) {
    const message = await response.text();
    const error = new Error(
      `GitHub API error ${response.status}: ${message}`
    );

    error.status = response.status;
    throw error;
  }

  return response;
}

function repositoryEndpoint(path) {
  const github = state.github;

  const encodedPath = path
    .split("/")
    .map(encodeURIComponent)
    .join("/");

  return `/repos/${github.owner}/${github.repo}/contents/${encodedPath}?ref=${encodeURIComponent(github.branch)}`;
}

async function getRepositoryFile(path) {
  const response = await githubRequest(
    repositoryEndpoint(path),
    {
      headers: {
        Accept: "application/vnd.github.object+json"
      }
    }
  );

  return response.json();
}

async function putRepositoryFile(
  path,
  base64Content,
  message,
  sha = undefined
) {
  const github = await ensureGithubToken();

  const encodedPath = path
    .split("/")
    .map(encodeURIComponent)
    .join("/");

  const body = {
    message,
    content: base64Content,
    branch: github.branch
  };

  if (sha) {
    body.sha = sha;
  }

  await githubRequest(
    `/repos/${github.owner}/${github.repo}/contents/${encodedPath}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    },
    false
  );
}

async function deleteRepositoryFile(
  path,
  sha,
  message
) {
  const github = await ensureGithubToken();

  const encodedPath = path
    .split("/")
    .map(encodeURIComponent)
    .join("/");

  await githubRequest(
    `/repos/${github.owner}/${github.repo}/contents/${encodedPath}`,
    {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message,
        sha,
        branch: github.branch
      })
    }
  );
}

async function mutateCatalog(mutator, message) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const catalogFile = await getRepositoryFile(
      state.github.catalogPath
    );

    const root = decodeCatalog(
      catalogFile.content
    );

    const nextRoot = mutator(root) || root;

    const content =
      JSON.stringify(nextRoot, null, 2) + "\n";

    try {
      await putRepositoryFile(
        state.github.catalogPath,
        utf8ToBase64(content),
        message,
        catalogFile.sha
      );

      return nextRoot;
    } catch (error) {
      if (error.status === 409 && attempt < 2) {
        continue;
      }

      throw error;
    }
  }

  throw new Error("Catalog update conflict.");
}

function decodeCatalog(content) {
  if (!content) {
    return {
      version: 1,
      scans: []
    };
  }

  const decoded = base64ToUtf8(
    content.replace(/\n/g, "")
  );

  const parsed = JSON.parse(decoded);

  if (Array.isArray(parsed)) {
    return {
      version: 1,
      scans: parsed
    };
  }

  return {
    version: parsed.version || 1,
    scans: Array.isArray(parsed.scans)
      ? parsed.scans
      : []
  };
}

/* -------------------------------------------------------------------------- */
/* ADMIN DELETE                                                               */
/* -------------------------------------------------------------------------- */

async function deleteActiveScan() {
  if (!state.admin) {
    setStatus("Administrator login required.", "error");
    return;
  }

  const scan = state.activeScan;

  if (!scan || !scan.path) {
    setStatus("Select a repository scan first.", "warning");
    return;
  }

  const confirmed = window.confirm(
    `Delete "${scan.name}" permanently from the active repository?`
  );

  if (!confirmed) return;

  try {
    showLoading("Removing scan from repository...");
    setStatus("Preparing deletion...", "loading");

    const fileInfo = await getRepositoryFile(scan.path);

    await mutateCatalog(
      (root) => {
        root.scans = root.scans.filter(
          (item) => item.id !== scan.id
        );

        return root;
      },
      `Remove catalog entry ${scan.id}`
    );

    try {
      await deleteRepositoryFile(
        scan.path,
        fileInfo.sha,
        `Delete COPC scan ${scan.id}`
      );
    } catch (deleteError) {
      // Restore catalog entry if file deletion fails.
      await mutateCatalog(
        (root) => {
          if (
            !root.scans.some(
              (item) => item.id === scan.id
            )
          ) {
            root.scans.push(scan);
          }

          return root;
        },
        `Restore catalog entry ${scan.id}`
      );

      throw deleteError;
    }

    removeLoadedCloud(scan.id);

    state.activeScan = null;
    state.activeCloud = null;
    state.activeBounds = null;

    await loadCatalog();

    renderLibrary();
    updateInspector();

    hideLoading();
    setViewerStatus("Scan deleted", "success");
    setStatus("COPC scan deleted", "success");
  } catch (error) {
    hideLoading();
    setStatus(error.message, "error");
    console.error(error);
  }
}

function removeLoadedCloud(scanId) {
  const cloud = state.loadedClouds.get(scanId);

  if (!cloud) return;

  if (
    viewer.scene &&
    typeof viewer.scene.removePointCloud === "function"
  ) {
    viewer.scene.removePointCloud(cloud);
  } else {
    cloud.visible = false;
  }

  state.loadedClouds.delete(scanId);
}

/* -------------------------------------------------------------------------- */
/* UI EVENTS                                                                  */
/* -------------------------------------------------------------------------- */

function bindEvents() {
  $("loginLink").addEventListener("click", () => {
    setStatus("Opening administrator login...", "loading");
  });

  $("logoutButton").addEventListener("click", logout);

  $("uploadButton").addEventListener("click", () => {
    $("fileInput").click();
  });

  $("fileInput").addEventListener("change", (event) => {
    const file = event.target.files[0];

    if (file) {
      handleFileSelected(file);
    }

    event.target.value = "";
  });

  $("scanSearch").addEventListener(
    "input",
    renderLibrary
  );

  $("refreshLibrary").addEventListener(
    "click",
    async () => {
      await loadCatalog();
      renderLibrary();
      setStatus("Library refreshed", "success");
    }
  );

  $("fitView").addEventListener(
    "click",
    fitActiveScan
  );

  $("resetView").addEventListener(
    "click",
    resetView
  );

  $("orbitMode").addEventListener(
    "click",
    activateOrbitMode
  );

  $("downloadScan").addEventListener(
    "click",
    downloadActiveScan
  );

  $("colorMode").addEventListener("change", () => {
    applyColorMode();
    setStatus("Color mode updated", "success");
  });

  $("pointSize").addEventListener(
    "input",
    applyPointSize
  );

  $("pointOpacity").addEventListener(
    "input",
    applyOpacity
  );

  $("pointBudget").addEventListener(
    "input",
    applyPointBudget
  );

  $("sectionMode").addEventListener(
    "change",
    () => {
      updateSectionControls();

      if ($("sectionMode").value === "none") {
        clearSection();
      }
    }
  );

  $("sectionAxis").addEventListener(
    "change",
    () => {
      updateSectionControls();
    }
  );

  $("sectionPosition").addEventListener(
    "input",
    () => {
      $("sectionPositionValue").textContent =
        formatCoordinate(
          Number($("sectionPosition").value)
        );

      if (state.sectionVolume) {
        applySection();
      }
    }
  );

  $("sectionThickness").addEventListener(
    "input",
    () => {
      $("sectionThicknessValue").textContent =
        `${formatCoordinate(
          Number($("sectionThickness").value)
        )} units`;

      if (state.sectionVolume) {
        applySection();
      }
    }
  );

  $("applySection").addEventListener(
    "click",
    applySection
  );

  $("clearSection").addEventListener(
    "click",
    clearSection
  );
}

/* -------------------------------------------------------------------------- */
/* STATUS                                                                     */
/* -------------------------------------------------------------------------- */

function setStatus(message, type = "") {
  $("statusMessage").textContent = message;
  setViewerStatus(message, type);
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
    .slice(2, 9)}`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function joinUrl(base, path) {
  return `${String(base).replace(/\/$/, "")}/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return "Unknown";

  const units = ["B", "KiB", "MiB", "GiB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );

  const value =
    bytes / Math.pow(1024, index);

  return `${value.toFixed(index === 0 ? 0 : 1)} ${
    units[index]
  }`;
}

function formatNumber(value) {
  return new Intl.NumberFormat().format(value);
}

function formatCompactNumber(value) {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }

  if (value >= 1000) {
    return `${Math.round(value / 1000)}K`;
  }

  return String(value);
}

function formatCoordinate(value) {
  if (!Number.isFinite(value)) return "—";
  return Number(value).toFixed(3);
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (
    let offset = 0;
    offset < bytes.length;
    offset += chunkSize
  ) {
    const chunk = bytes.subarray(
      offset,
      Math.min(offset + chunkSize, bytes.length)
    );

    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function utf8ToBase64(value) {
  return arrayBufferToBase64(
    new TextEncoder().encode(value).buffer
  );
}

function base64ToUtf8(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new TextDecoder().decode(bytes);
}
