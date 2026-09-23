"use strict";

/*
  Local Potree COPC viewer.

  Required script order in index.html:

  1. Potree dependencies
  2. libs/copc/index.js
  3. build/potree/potree.js
  4. libs/plasio/js/laslaz.js
  5. app.js

  XR/VR is intentionally not used by this file.
*/

var CONFIG = {
  /*
    This file must exist beside index.html.

    Expected structure:

    {
      "scans": [
        {
          "id": "scan-01",
          "name": "Scan 01",
          "filename": "scan-01.copc.laz",
          "path": "scans/scan-01.copc.laz"
        }
      ]
    }
  */
  catalogUrl: "./catalog.json",

  defaultPointBudget: 3000000,

  /*
    If true, entries with "path" are loaded from GitHub raw content.
    Leave false when the COPC files are hosted locally.
  */
  useRawBaseForPaths: false,

  rawBaseUrl:
    "https://raw.githubusercontent.com/DennisHaus/pointcloud_viewer/main"
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
  initializeControls();

  if (!initializeViewer()) {
    return;
  }

  loadCatalog()
    .then(function () {
      renderLibrary();

      if (state.catalog.length > 0) {
        return loadScan(state.catalog[0]);
      }

      setViewerStatus(
        "No scans available",
        "idle"
      );

      setStatus(
        "No scans found in catalog.json",
        "idle"
      );

      return null;
    })
    .catch(function (error) {
      console.error(error);

      setStatus(
        "Application startup failed.",
        "error"
      );
    });
}

/* -------------------------------------------------------------------------- */
/* DOM HELPERS                                                                */
/* -------------------------------------------------------------------------- */

function getElement(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  var element = getElement(id);

  if (element) {
    element.textContent = String(value);
  }
}

function addEvent(id, eventName, handler) {
  var element = getElement(id);

  if (element) {
    element.addEventListener(
      eventName,
      handler
    );
  }
}

function initializeControls() {
  applyPointSize();
  applyOpacity();
  applyPointBudget();
  updateSectionControls();
}

/* -------------------------------------------------------------------------- */
/* POTREE INITIALIZATION                                                      */
/* -------------------------------------------------------------------------- */

function initializeViewer() {
  var potree = window.Potree;

  if (!potree) {
    setStatus(
      "Potree is not loaded.",
      "error"
    );

    console.error(
      "window.Potree is undefined. Check build/potree/potree.js."
    );

    return false;
  }

  if (
    typeof potree.Viewer !==
    "function"
  ) {
    setStatus(
      "Potree Viewer is unavailable.",
      "error"
    );

    console.error(
      "Potree.Viewer is not available."
    );

    return false;
  }

  var renderArea =
    getElement("potree_render_area");

  if (!renderArea) {
    setStatus(
      "The Potree render area is missing.",
      "error"
    );

    return false;
  }

  try {
    /*
      This constructor requires the local potree.js bundle to have
      its internal VRControls construction disabled.

      See the patch instructions below the code.
    */
    viewer = new potree.Viewer(
      renderArea
    );

    disableXROnViewer();

    if (
      typeof viewer.setEDLEnabled ===
      "function"
    ) {
      viewer.setEDLEnabled(false);
    }

    if (
      typeof viewer.setFOV ===
      "function"
    ) {
      viewer.setFOV(60);
    }

    if (
      typeof viewer.setPointBudget ===
      "function"
    ) {
      viewer.setPointBudget(
        CONFIG.defaultPointBudget
      );
    }

    if (
      typeof viewer.setBackground ===
      "function"
    ) {
      viewer.setBackground(
        "gradient"
      );
    }

    /*
      Explicitly use orbit controls.
      No VR, XR, controller, or device-orientation
      controls are selected.
    */
    if (
      viewer.orbitControls &&
      typeof viewer.setControls ===
      "function"
    ) {
      viewer.setControls(
        viewer.orbitControls
      );
    }

    window.addEventListener(
      "resize",
      function () {
        if (
          viewer &&
          typeof viewer.onWindowResize ===
          "function"
        ) {
          viewer.onWindowResize();
        }
      }
    );

    setViewerStatus(
      "Ready",
      "idle"
    );

    setStatus(
      "Ready",
      "idle"
    );

    return true;
  } catch (error) {
    console.error(
      "Potree initialization failed:",
      error
    );

    setViewerStatus(
      "Potree initialization failed",
      "error"
    );

    setStatus(
      "Could not initialize Potree.",
      "error"
    );

    return false;
  }
}

function disableXROnViewer() {
  if (!viewer) {
    return;
  }

  /*
    This is only a secondary safeguard.
    The main XR fix must be made inside potree.js before
    the Viewer constructor creates VRControls.
  */

  if (
    viewer.vrControls
  ) {
    viewer.vrControls = null;
  }

  if (
    viewer.deviceOrientationControls
  ) {
    viewer.deviceOrientationControls =
      null;
  }

  var renderer =
    viewer.renderer ||
    viewer.pRenderer ||
    null;

  if (
    renderer &&
    renderer.xr
  ) {
    renderer.xr.enabled = false;
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
      var scans = [];

      if (Array.isArray(data)) {
        scans = data;
      } else if (
        data &&
        Array.isArray(data.scans)
      ) {
        scans = data.scans;
      }

      state.catalog = scans.map(
        function (scan, index) {
          return normalizeScan(
            scan,
            index
          );
        }
      );

      console.log(
        "Catalog scans:",
        state.catalog.map(function (scan) {
          return scan.id;
        })
      );

      // Remove loaded clouds that no longer exist
      // in the updated catalog.
      reconcileLoadedClouds();

      updateScanCount();

      return state.catalog;

    })
    .catch(function (error) {
      state.catalog = [];

      console.error(
        "Could not load catalog.json:",
        error
      );

      setStatus(
        "Could not load catalog.json.",
        "error"
      );

      updateScanCount();

      return [];
    });
}

function reconcileLoadedClouds() {
  var catalogIds = new Set(
    state.catalog.map(function (scan) {
      return scan.id;
    })
  );

  var removedActiveCloud = false;

  state.loadedClouds.forEach(
    function (pointcloud, scanId) {
      if (catalogIds.has(scanId)) {
        return;
      }

      /*
        Remove the deleted scan from the Potree scene.
      */
      if (
        viewer &&
        viewer.scene &&
        typeof viewer.scene.removePointCloud ===
        "function"
      ) {
        viewer.scene.removePointCloud(
          pointcloud
        );
      }

      state.loadedClouds.delete(
        scanId
      );

      if (
        state.activeScan &&
        state.activeScan.id === scanId
      ) {
        removedActiveCloud = true;
      }
    }
  );

  /*
    Clear the inspector if the active scan
    was deleted from the catalog.
  */
  if (removedActiveCloud) {
    removeSectionVolume();

    state.activeScan = null;
    state.activeCloud = null;
    state.activeBounds = null;

    setViewerStatus(
      "No scan selected",
      "idle"
    );
  }

  /*
    Refresh the active scan metadata if it still exists.
  */
  if (state.activeScan) {
    var refreshedScan =
      state.catalog.find(
        function (scan) {
          return scan.id ===
            state.activeScan.id;
        }
      );

    if (refreshedScan) {
      state.activeScan =
        refreshedScan;
    }
  }

  updateInspector();
  updateSectionControls();
}

function normalizeScan(scan, index) {
  scan = scan || {};

  var fallbackId =
    "scan-" +
    (index + 1);

  var id = String(
    scan.id ||
    scan.filename ||
    fallbackId
  );

  var filename = String(
    scan.filename ||
    ""
  );

  var name = String(
    scan.name ||
    filename ||
    id
  );

  var path = String(
    scan.path ||
    (
      filename
        ? "scans/" + filename
        : ""
    )
  );

  var suppliedUrl = String(
    scan.url ||
    ""
  ).trim();

  var url = "";

  if (suppliedUrl) {
    url = resolveUrl(
      suppliedUrl
    );
  } else if (
    path &&
    CONFIG.useRawBaseForPaths
  ) {
    url = buildRawUrl(path);
  } else if (path) {
    url = resolveUrl(path);
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
    uploadedAt:
      scan.uploadedAt || "",
    loading: false
  };
}

function resolveUrl(value) {
  try {
    return new URL(
      value,
      document.baseURI
    ).href;
  } catch (error) {
    console.error(
      "Invalid scan URL:",
      value,
      error
    );

    return "";
  }
}

function buildRawUrl(path) {
  var base =
    CONFIG.rawBaseUrl.replace(
      /\/+$/,
      ""
    );

  var encodedPath = path
    .split("/")
    .map(function (part) {
      return encodeURIComponent(
        part
      );
    })
    .join("/");

  return base + "/" + encodedPath;
}

/* -------------------------------------------------------------------------- */
/* LIBRARY                                                                    */
/* -------------------------------------------------------------------------- */

function renderLibrary() {
  var list =
    getElement("libraryList");

  var empty =
    getElement("libraryEmpty");

  var search =
    getElement("scanSearch");

  if (!list) {
    return;
  }

  var query =
    search &&
    search.value
      ? search.value
        .trim()
        .toLowerCase()
      : "";

  /*
    Clear the existing scan cards.
  */
  while (list.firstChild) {
    list.removeChild(
      list.firstChild
    );
  }

  updateScanCount();

  /*
    Filter scans according to the search field.
  */
  var visibleScans =
    state.catalog.filter(
      function (scan) {
        var searchable =
          (
            scan.name +
            " " +
            scan.filename
          ).toLowerCase();

        return searchable.indexOf(
          query
        ) !== -1;
      }
    );

  /*
    Show the empty message if no scans are available.
  */
  if (
    visibleScans.length === 0
  ) {
    if (empty) {
      empty.classList.remove(
        "hidden"
      );
    }

    return;
  }

  if (empty) {
    empty.classList.add(
      "hidden"
    );
  }

  /*
    Create one card for every scan.
  */
  visibleScans.forEach(
    function (scan) {
      var card =
        document.createElement(
          "button"
        );

      card.type =
        "button";

      card.className =
        "scan-card";

      if (
        state.activeScan &&
        state.activeScan.id === scan.id
      ) {
        card.classList.add(
          "active"
        );
      }

      var header =
        document.createElement(
          "div"
        );

      header.className =
        "scan-card-header";

      var icon =
        document.createElement(
          "div"
        );

      icon.className =
        "scan-card-icon";

      icon.textContent =
        "";

      var name =
        document.createElement(
          "div"
        );

      name.className =
        "scan-name";

      name.textContent =
        scan.name;

      name.title =
        scan.name;

      /*
        Loading/loaded status indicator.
      */
      var scanState =
        document.createElement(
          "div"
        );

      scanState.className =
        "scan-state";

      if (
        scan.loading
      ) {
        scanState.classList.add(
          "loading"
        );
      } else if (
        state.loadedClouds.has(
          scan.id
        )
      ) {
        scanState.classList.add(
          "loaded"
        );
      }

      /*
        Visibility toggle.
      */
      var pointcloud =
        state.loadedClouds.get(
          scan.id
        );

      var isLoaded =
        Boolean(
          pointcloud
        );

      var isVisible =
        isLoaded &&
        pointcloud.visible !== false;

      var visibilityToggle =
        document.createElement(
          "span"
        );

      visibilityToggle.className =
        "scan-visibility-toggle";

      visibilityToggle.textContent =
        isLoaded
          ? (
              isVisible
                ? "●"
                : "○"
            )
          : "·";

      visibilityToggle.title =
        isLoaded
          ? (
              isVisible
                ? "Hide scan"
                : "Show scan"
            )
          : "Load scan";

      visibilityToggle.setAttribute(
        "role",
        "button"
      );

      visibilityToggle.setAttribute(
        "aria-label",
        visibilityToggle.title
      );

      visibilityToggle.setAttribute(
        "aria-pressed",
        String(
          isVisible
        )
      );

      visibilityToggle.tabIndex =
        0;

      visibilityToggle.addEventListener(
        "click",
        function (event) {
          event.preventDefault();
          event.stopPropagation();

          toggleScanVisibility(
            scan
          );
        }
      );

      visibilityToggle.addEventListener(
        "keydown",
        function (event) {
          if (
            event.key === "Enter" ||
            event.key === " "
          ) {
            event.preventDefault();
            event.stopPropagation();

            toggleScanVisibility(
              scan
            );
          }
        }
      );

      header.appendChild(
        icon
      );

      header.appendChild(
        name
      );

      header.appendChild(
        scanState
      );

      header.appendChild(
        visibilityToggle
      );

      /*
        Metadata row.
      */
      var metadata =
        document.createElement(
          "div"
        );

      metadata.className =
        "scan-meta";

      var format =
        document.createElement(
          "span"
        );

      format.textContent =
        "COPC";

      var size =
        document.createElement(
          "span"
        );

      size.textContent =
        scan.sizeBytes
          ? formatBytes(
              scan.sizeBytes
            )
          : "Size unknown";

      metadata.appendChild(
        format
      );

      metadata.appendChild(
        size
      );

      /*
        Assemble the card.
      */
      card.appendChild(
        header
      );

      card.appendChild(
        metadata
      );

      /*
        Clicking the card activates/fits the scan.
        Clicking the visibility indicator is handled
        separately above.
      */
      card.addEventListener(
        "click",
        function () {
          loadScan(
            scan
          );
        }
      );

      list.appendChild(
        card
      );
    }
  );
}

/* -------------------------------------------------------------------------- */
/* ACTIVE SCAN AND INSPECTOR                                                  */
/* -------------------------------------------------------------------------- */

function setActiveScan(scan) {
  removeSectionVolume();

  var sectionMode =
    getElement("sectionMode");

  if (sectionMode) {
    sectionMode.value = "none";
  }

  state.activeScan =
    scan;

  state.activeCloud =
    state.loadedClouds.get(
      scan.id
    );

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
      empty.classList.remove(
        "hidden"
      );
    }

    if (content) {
      content.classList.add(
        "hidden"
      );
    }

    return;
  }

  if (empty) {
    empty.classList.add(
      "hidden"
    );
  }

  if (content) {
    content.classList.remove(
      "hidden"
    );
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

function getPointCloudBounds(
  pointcloud
) {
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

  if (
    !box ||
    !box.min ||
    !box.max
  ) {
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
    typeof vector[property] ===
    "number"
  ) {
    return vector[property];
  }

  if (
    vector &&
    typeof vector[index] ===
    "number"
  ) {
    return vector[index];
  }

  return 0;
}

/* -------------------------------------------------------------------------- */
/* APPEARANCE                                                                 */
/* -------------------------------------------------------------------------- */

function applyColorMode(
  pointcloud
) {
  var cloud =
    pointcloud ||
    state.activeCloud;

  var potree =
    window.Potree;

  if (
    !cloud ||
    !cloud.material ||
    !potree ||
    !potree.PointColorType
  ) {
    return;
  }

  var select =
    getElement("colorMode");

  if (!select) {
    return;
  }

  var colorType =
    potree.PointColorType[
      select.value
    ];

  if (
    colorType !== undefined
  ) {
    cloud.material.pointColorType =
      colorType;

    cloud.material.needsUpdate =
      true;
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

function applyOpacity(
  pointcloud
) {
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

  var cloud =
    pointcloud ||
    state.activeCloud;

  if (
    cloud &&
    cloud.material
  ) {
    cloud.material.opacity =
      value;

    cloud.material.transparent =
      value < 1;

    cloud.material.needsUpdate =
      true;
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
    viewer.setPointBudget(
      value
    );
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

  var modeElement =
    getElement("sectionMode");

  var mode =
    modeElement
      ? modeElement.value
      : "none";

  if (mode === "horizontal") {
    return {
      min: state.activeBounds.min.z,
      max: state.activeBounds.max.z
    };
  }

  var axisElement =
    getElement("sectionAxis");

  var axis =
    axisElement &&
    axisElement.value
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

  var mode =
    modeElement.value;

  var active =
    mode !== "none" &&
    Boolean(
      state.activeBounds
    );

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

  positionElement.disabled =
    !active;

  thicknessElement.disabled =
    !active;

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
      0.000001
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

  var modeElement =
    getElement("sectionMode");

  var mode =
    modeElement
      ? modeElement.value
      : "none";

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
    Math.max(
      thickness,
      0.001
    );

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
      safePosition -
      thickness / 2;

    max.z =
      safePosition +
      thickness / 2;
  }

  if (mode === "vertical") {
    var axisElement =
      getElement("sectionAxis");

    var axis =
      axisElement &&
      axisElement.value
        ? axisElement.value
        : "x";

    min[axis] =
      safePosition -
      thickness / 2;

    max[axis] =
      safePosition +
      thickness / 2;
  }

  var potree =
    window.Potree;

  if (
    !potree ||
    !potree.BoxVolume ||
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
    new potree.BoxVolume();

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

  volume.clip =
    true;

  volume.visible =
    false;

  if (
    typeof viewer.scene.addVolume ===
    "function"
  ) {
    viewer.scene.addVolume(
      volume
    );
  }

  state.sectionVolume =
    volume;

  if (
    potree.ClipTask &&
    potree.ClipTask.SHOW_INSIDE !==
    undefined &&
    typeof viewer.setClipTask ===
    "function"
  ) {
    viewer.setClipTask(
      potree.ClipTask.SHOW_INSIDE
    );
  }

  if (
    potree.ClipMethod &&
    potree.ClipMethod.INSIDE_ANY !==
    undefined &&
    typeof viewer.setClipMethod ===
    "function"
  ) {
    viewer.setClipMethod(
      potree.ClipMethod.INSIDE_ANY
    );
  }

  setText(
    "sectionPositionValue",
    formatCoordinate(
      safePosition
    )
  );

  setText(
    "sectionThicknessValue",
    formatCoordinate(
      thickness
    ) +
    " units"
  );

  setStatus(
    "Section applied",
    "idle"
  );
}

function removeSectionVolume() {
  if (
    !state.sectionVolume
  ) {
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

  state.sectionVolume =
    null;

  var potree =
    window.Potree;

  if (
    viewer &&
    potree &&
    potree.ClipTask &&
    potree.ClipTask.NONE !==
    undefined &&
    typeof viewer.setClipTask ===
    "function"
  ) {
    viewer.setClipTask(
      potree.ClipTask.NONE
    );
  }
}

function clearSection() {
  removeSectionVolume();

  var modeElement =
    getElement("sectionMode");

  if (modeElement) {
    modeElement.value =
      "none";
  }

  updateSectionControls();

  setStatus(
    "Section cleared",
    "idle"
  );
}

/* -------------------------------------------------------------------------- */
/* VIEW CONTROLS                                                              */
/* -------------------------------------------------------------------------- */

function fitActiveScan() {
  if (
    !viewer ||
    !state.activeCloud
  ) {
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
    viewer.fitToScreen(
      0.5
    );
  }

  setStatus(
    "View fitted to active scan",
    "idle"
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
    button.classList.add(
      "active"
    );
  }

  setStatus(
    "Orbit navigation active",
    "idle"
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
    document.createElement(
      "a"
    );

  link.href =
    state.activeScan.url;

  link.download =
    state.activeScan.filename ||
    state.activeScan.name +
    ".copc.laz";

  link.target =
    "_blank";

  link.rel =
    "noopener";

  document.body.appendChild(
    link
  );

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
      loadCatalog().then(
        function () {
          renderLibrary();

          setStatus(
            "Library refreshed",
            "idle"
          );
        }
      );
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
        "idle"
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
    function () {
      applyOpacity();
    }
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

      if (
        state.sectionVolume
      ) {
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

      if (
        state.sectionVolume
      ) {
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

      if (
        state.sectionVolume
      ) {
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

function setStatus(
  message,
  type
) {
  setText(
    "statusMessage",
    message
  );

  setViewerStatus(
    message,
    type
  );
}

function setViewerStatus(
  message,
  type
) {
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

function showLoading(
  message
) {
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

function getNumberValue(
  id,
  fallback
) {
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

function clamp(
  value,
  min,
  max
) {
  return Math.min(
    Math.max(value, min),
    max
  );
}

function formatBytes(
  bytes
) {
  if (
    !bytes ||
    bytes <= 0
  ) {
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
    Math.pow(
      1024,
      index
    );

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

function formatNumber(
  value
) {
  return new Intl.NumberFormat()
    .format(value);
}

function formatCompactNumber(
  value
) {
  if (
    value >= 1000000
  ) {
    return (
      (value / 1000000)
        .toFixed(1) +
      "M"
    );
  }

  if (
    value >= 1000
  ) {
    return (
      Math.round(
        value / 1000
      ) +
      "K"
    );
  }

  return String(value);
}

function formatCoordinate(
  value
) {
  if (!isFinite(value)) {
    return "—";
  }

  return Number(value).toFixed(3);
}
