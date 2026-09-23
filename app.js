"use strict";

/*
  Local Potree COPC viewer.

  Required script order in index.html:

  1. Potree dependencies
  2. libs/copc/index.js
  3. build/potree/potree.js
  4. libs/plasio/js/laslaz.js
  5. app.js
*/


/* -------------------------------------------------------------------------- */
/* CONFIGURATION                                                              */
/* -------------------------------------------------------------------------- */

var CONFIG = {
  catalogUrl: "./catalog.json",

  defaultPointBudget: 3000000,

  navigationSpeed: 0.35,

  /*
    The screenshot uses the current renderer size.

    Example:
      current renderer: 3374 x 1400
      screenshotScale: 2
      exported PNG:    6748 x 2800
  */
  screenshotScale: 2,
  screenshotWarmupMs: 600,

  useRawBaseForPaths: false,

  rawBaseUrl:
    "https://raw.githubusercontent.com/DennisHaus/pointcloud_viewer/main"
};


/* -------------------------------------------------------------------------- */
/* APPLICATION STATE                                                          */
/* -------------------------------------------------------------------------- */

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

  bindNavigationKeyboard();

  loadCatalog()
    .then(
      function () {
        renderLibrary();

        if (
          state.catalog.length >
          0
        ) {
          return loadScan(
            state.catalog[0]
          );
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
      }
    )
    .catch(
      function (error) {
        console.error(
          "Application startup failed:",
          error
        );

        setStatus(
          "Application startup failed.",
          "error"
        );
      }
    );
}


/* -------------------------------------------------------------------------- */
/* DOM HELPERS                                                                */
/* -------------------------------------------------------------------------- */

function getElement(
  id
) {
  return document.getElementById(
    id
  );
}

function setText(
  id,
  value
) {
  var element =
    getElement(
      id
    );

  if (
    element
  ) {
    element.textContent =
      String(
        value
      );
  }
}

function addEvent(
  id,
  eventName,
  handler
) {
  var element =
    getElement(
      id
    );

  if (
    element
  ) {
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
  var potree =
    window.Potree;

  if (
    !potree
  ) {
    setStatus(
      "Potree is not loaded.",
      "error"
    );

    console.error(
      "window.Potree is undefined."
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
    getElement(
      "potree_render_area"
    );

  if (
    !renderArea
  ) {
    setStatus(
      "The Potree render area is missing.",
      "error"
    );

    return false;
  }

  try {
    viewer =
      new potree.Viewer(
        renderArea
      );

    disableXROnViewer();

    if (
      typeof viewer.setEDLEnabled ===
      "function"
    ) {
      viewer.setEDLEnabled(
        false
      );
    }

    if (
      typeof viewer.setFOV ===
      "function"
    ) {
      viewer.setFOV(
        60
      );
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
        "none"
      );
    }

    /*
      Start with a transparent WebGL clear color.
    */
    if (
      viewer.renderer
    ) {
      if (
        typeof viewer.renderer.setClearColor ===
        "function"
      ) {
        viewer.renderer.setClearColor(
          0x000000,
          0
        );
      }

      if (
        typeof viewer.renderer.setClearAlpha ===
        "function"
      ) {
        viewer.renderer.setClearAlpha(
          0
        );
      }
    }

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
  } catch (
    error
  ) {
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
  if (
    !viewer
  ) {
    return;
  }

  if (
    viewer.vrControls
  ) {
    viewer.vrControls =
      null;
  }

  if (
    viewer.deviceOrientationControls
  ) {
    viewer.deviceOrientationControls =
      null;
  }

  var renderer =
    viewer.renderer ||
    null;

  if (
    renderer &&
    renderer.xr
  ) {
    renderer.xr.enabled =
      false;
  }
}


/* -------------------------------------------------------------------------- */
/* CATALOG                                                                    */
/* -------------------------------------------------------------------------- */

function loadCatalog() {
  var separator =
    CONFIG.catalogUrl.indexOf(
      "?"
    ) === -1
      ? "?"
      : "&";

  var requestUrl =
    CONFIG.catalogUrl +
    separator +
    "cacheBust=" +
    Date.now();

  return fetch(
    requestUrl,
    {
      cache: "no-store"
    }
  )
    .then(
      function (response) {
        if (
          !response.ok
        ) {
          throw new Error(
            "Catalog request failed with HTTP " +
            response.status
          );
        }

        return response.json();
      }
    )
    .then(
      function (data) {
        var scans =
          [];

        if (
          Array.isArray(
            data
          )
        ) {
          scans =
            data;
        } else if (
          data &&
          Array.isArray(
            data.scans
          )
        ) {
          scans =
            data.scans;
        }

        var previousScans =
          new Map();

        state.catalog.forEach(
          function (oldScan) {
            previousScans.set(
              oldScan.id,
              oldScan
            );
          }
        );

        state.catalog =
          scans.map(
            function (
              scan,
              index
            ) {
              var normalized =
                normalizeScan(
                  scan,
                  index
                );

              var previous =
                previousScans.get(
                  normalized.id
                );

              if (
                previous &&
                previous.loading
              ) {
                normalized.loading =
                  true;
              }

              return normalized;
            }
          );

        reconcileLoadedClouds();
        updateScanCount();

        return state.catalog;
      }
    )
    .catch(
      function (error) {
        console.error(
          "Could not load catalog.json:",
          error
        );

        setStatus(
          "Could not load catalog.json.",
          "error"
        );

        updateScanCount();

        return state.catalog;
      }
    );
}

function normalizeScan(
  scan,
  index
) {
  scan =
    scan ||
    {};

  var fallbackId =
    "scan-" +
    (
      index +
      1
    );

  var id =
    String(
      scan.id ||
      scan.filename ||
      fallbackId
    );

  var filename =
    String(
      scan.filename ||
      ""
    );

  var name =
    String(
      scan.name ||
      filename ||
      id
    );

  var path =
    String(
      scan.path ||
      (
        filename
          ? "scans/" +
            filename
          : ""
      )
    );

  var suppliedUrl =
    String(
      scan.url ||
      ""
    ).trim();

  var url =
    "";

  if (
    suppliedUrl
  ) {
    url =
      resolveUrl(
        suppliedUrl
      );
  } else if (
    path &&
    CONFIG.useRawBaseForPaths
  ) {
    url =
      buildRawUrl(
        path
      );
  } else if (
    path
  ) {
    url =
      resolveUrl(
        path
      );
  }

  return {
    id: id,
    name: name,
    filename: filename,
    path: path,
    url: url,
    format:
      scan.format ||
      "copc",
    sizeBytes:
      Number(
        scan.sizeBytes ||
        0
      ),
    pointCount:
      Number(
        scan.pointCount ||
        0
      ),
    crs:
      scan.crs ||
      "Unknown",
    uploadedAt:
      scan.uploadedAt ||
      "",
    loading: false
  };
}

function resolveUrl(
  value
) {
  try {
    return new URL(
      value,
      document.baseURI
    ).href;
  } catch (
    error
  ) {
    console.error(
      "Invalid scan URL:",
      value,
      error
    );

    return "";
  }
}

function buildRawUrl(
  path
) {
  var base =
    CONFIG.rawBaseUrl.replace(
      /\/+$/,
      ""
    );

  var encodedPath =
    path
      .split(
        "/"
      )
      .map(
        function (part) {
          return encodeURIComponent(
            part
          );
        }
      )
      .join(
        "/"
      );

  return (
    base +
    "/" +
    encodedPath
  );
}

function reconcileLoadedClouds() {
  var catalogIds =
    new Set(
      state.catalog.map(
        function (scan) {
          return scan.id;
        }
      )
    );

  var removedActiveCloud =
    false;

  state.loadedClouds.forEach(
    function (
      pointcloud,
      scanId
    ) {
      if (
        catalogIds.has(
          scanId
        )
      ) {
        return;
      }

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
        state.activeScan.id ===
        scanId
      ) {
        removedActiveCloud =
          true;
      }
    }
  );

  if (
    removedActiveCloud
  ) {
    removeSectionVolume();

    state.activeScan =
      null;

    state.activeCloud =
      null;

    state.activeBounds =
      null;

    setViewerStatus(
      "No scan selected",
      "idle"
    );
  }

  if (
    state.activeScan
  ) {
    var refreshedScan =
      state.catalog.find(
        function (scan) {
          return (
            scan.id ===
            state.activeScan.id
          );
        }
      );

    if (
      refreshedScan
    ) {
      state.activeScan =
        refreshedScan;

      state.activeCloud =
        state.loadedClouds.get(
          refreshedScan.id
        );

      state.activeBounds =
        getPointCloudBounds(
          state.activeCloud
        );
    }
  }

  updateInspector();
  updateSectionControls();
}


/* -------------------------------------------------------------------------- */
/* LIBRARY                                                                    */
/* -------------------------------------------------------------------------- */

function updateScanCount() {
  var count =
    Array.isArray(
      state.catalog
    )
      ? state.catalog.length
      : 0;

  setText(
    "scanCount",
    count +
    " " +
    (
      count === 1
        ? "scan"
        : "scans"
    )
  );
}

function renderLibrary() {
  var list =
    getElement(
      "libraryList"
    );

  var empty =
    getElement(
      "libraryEmpty"
    );

  var search =
    getElement(
      "scanSearch"
    );

  if (
    !list
  ) {
    return;
  }

  var query =
    search &&
    search.value
      ? search.value
        .trim()
        .toLowerCase()
      : "";

  while (
    list.firstChild
  ) {
    list.removeChild(
      list.firstChild
    );
  }

  updateScanCount();

  var visibleScans =
    state.catalog.filter(
      function (scan) {
        var searchable =
          (
            scan.name +
            " " +
            scan.filename
          ).toLowerCase();

        return (
          searchable.indexOf(
            query
          ) !== -1
        );
      }
    );

  if (
    visibleScans.length ===
    0
  ) {
    if (
      empty
    ) {
      empty.classList.remove(
        "hidden"
      );
    }

    return;
  }

  if (
    empty
  ) {
    empty.classList.add(
      "hidden"
    );
  }

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
        state.activeScan.id ===
        scan.id
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
        pointcloud.visible !==
        false;

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
            event.key ===
              "Enter" ||
            event.key ===
            " "
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

      card.appendChild(
        header
      );

      card.appendChild(
        metadata
      );

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
/* POINT-CLOUD LOADING                                                        */
/* -------------------------------------------------------------------------- */

function loadScan(
  scan
) {
  if (
    !scan
  ) {
    return Promise.resolve(
      null
    );
  }

  if (
    !scan.url
  ) {
    setStatus(
      "This scan has no valid COPC URL.",
      "error"
    );

    return Promise.resolve(
      null
    );
  }

  if (
    state.loadedClouds.has(
      scan.id
    )
  ) {
    setActiveScan(
      scan
    );

    fitActiveScan();

    return Promise.resolve(
      state.loadedClouds.get(
        scan.id
      )
    );
  }

  if (
    scan.loading
  ) {
    return Promise.resolve(
      null
    );
  }

  scan.loading =
    true;

  renderLibrary();

  showLoading(
    "Loading " +
    scan.name +
    "..."
  );

  setViewerStatus(
    "Loading point cloud",
    "loading"
  );

  setStatus(
    "Loading " +
    scan.name +
    "...",
    "loading"
  );

  return loadCopcPointCloud(
    scan
  )
    .then(
      function (pointcloud) {
        if (
          !pointcloud
        ) {
          throw new Error(
            "Potree returned no point cloud."
          );
        }

        pointcloud.name =
          scan.name;

        pointcloud.visible =
          true;

        if (
          !viewer ||
          !viewer.scene ||
          typeof viewer.scene.addPointCloud !==
          "function"
        ) {
          throw new Error(
            "Potree scene is unavailable."
          );
        }

        viewer.scene.addPointCloud(
          pointcloud
        );

        configurePointCloud(
          pointcloud
        );

        state.loadedClouds.set(
          scan.id,
          pointcloud
        );

        scan.loading =
          false;

        setActiveScan(
          scan
        );

        renderLibrary();
        hideLoading();

        setViewerStatus(
          "Point cloud loaded",
          "idle"
        );

        setStatus(
          scan.name +
          " loaded",
          "idle"
        );

        window.setTimeout(
          function () {
            fitActiveScan();
          },
          250
        );

        return pointcloud;
      }
    )
    .catch(
      function (error) {
        scan.loading =
          false;

        hideLoading();
        renderLibrary();

        console.error(
          "Point-cloud loading failed:",
          error
        );

        setViewerStatus(
          "Point-cloud loading failed",
          "error"
        );

        setStatus(
          "Could not load " +
          scan.name,
          "error"
        );

        return null;
      }
    );
}

function loadCopcPointCloud(
  scan
) {
  return new Promise(
    function (
      resolve,
      reject
    ) {
      var potree =
        window.Potree;

      if (
        !potree ||
        typeof potree.loadPointCloud !==
        "function"
      ) {
        reject(
          new Error(
            "Potree.loadPointCloud is unavailable."
          )
        );

        return;
      }

      var finished =
        false;

      function finishWithCloud(
        cloud
      ) {
        if (
          finished ||
          !cloud
        ) {
          return;
        }

        finished =
          true;

        resolve(
          cloud
        );
      }

      function finishWithError(
        error
      ) {
        if (
          finished
        ) {
          return;
        }

        finished =
          true;

        reject(
          error instanceof Error
            ? error
            : new Error(
                String(
                  error
                )
              )
        );
      }

      try {
        var result =
          potree.loadPointCloud(
            scan.url,
            scan.name,
            function (event) {
              if (
                !event
              ) {
                return;
              }

              if (
                event.pointcloud
              ) {
                finishWithCloud(
                  event.pointcloud
                );

                return;
              }

              if (
                event.error
              ) {
                finishWithError(
                  event.error
                );

                return;
              }

              if (
                event.material ||
                event.pcoGeometry ||
                event.boundingBox
              ) {
                finishWithCloud(
                  event
                );
              }
            }
          );

        if (
          result &&
          typeof result.then ===
          "function"
        ) {
          result
            .then(
              function (value) {
                if (
                  value &&
                  value.pointcloud
                ) {
                  finishWithCloud(
                    value.pointcloud
                  );
                } else {
                  finishWithCloud(
                    value
                  );
                }
              }
            )
            .catch(
              function (error) {
                finishWithError(
                  error
                );
              }
            );
        } else if (
          result &&
          result.pointcloud
        ) {
          finishWithCloud(
            result.pointcloud
          );
        }
      } catch (
        error
      ) {
        finishWithError(
          error
        );
      }
    }
  );
}

function configurePointCloud(
  pointcloud
) {
  if (
    !pointcloud ||
    !pointcloud.material
  ) {
    return;
  }

  var material =
    pointcloud.material;

  material.size =
    getNumberValue(
      "pointSize",
      1.5
    );

  var potree =
    window.Potree;

  if (
    potree &&
    potree.PointSizeType &&
    potree.PointSizeType.ADAPTIVE !==
    undefined
  ) {
    material.pointSizeType =
      potree.PointSizeType.ADAPTIVE;
  }

  if (
    potree &&
    potree.PointShape &&
    potree.PointShape.CIRCLE !==
    undefined
  ) {
    material.shape =
      potree.PointShape.CIRCLE;
  }

  applyColorMode(
    pointcloud
  );

  applyOpacity(
    pointcloud
  );

  material.needsUpdate =
    true;
}

function toggleScanVisibility(
  scan
) {
  if (
    !scan
  ) {
    return;
  }

  var pointcloud =
    state.loadedClouds.get(
      scan.id
    );

  if (
    !pointcloud
  ) {
    loadScan(
      scan
    );

    return;
  }

  pointcloud.visible =
    pointcloud.visible ===
    false;

  renderLibrary();

  setStatus(
    scan.name +
    (
      pointcloud.visible
        ? " shown"
        : " hidden"
    ),
    "idle"
  );
}


/* -------------------------------------------------------------------------- */
/* ACTIVE SCAN AND INSPECTOR                                                  */
/* -------------------------------------------------------------------------- */

function setActiveScan(
  scan
) {
  removeSectionVolume();

  var sectionMode =
    getElement(
      "sectionMode"
    );

  if (
    sectionMode
  ) {
    sectionMode.value =
      "none";
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
    getElement(
      "inspectorEmpty"
    );

  var content =
    getElement(
      "inspectorContent"
    );

  if (
    !state.activeScan ||
    !state.activeCloud
  ) {
    if (
      empty
    ) {
      empty.classList.remove(
        "hidden"
      );
    }

    if (
      content
    ) {
      content.classList.add(
        "hidden"
      );
    }

    return;
  }

  if (
    empty
  ) {
    empty.classList.add(
      "hidden"
    );
  }

  if (
    content
  ) {
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

  if (
    !state.activeBounds
  ) {
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
    " -> " +
    formatCoordinate(
      state.activeBounds.max.x
    )
  );

  setText(
    "boundsY",
    formatCoordinate(
      state.activeBounds.min.y
    ) +
    " -> " +
    formatCoordinate(
      state.activeBounds.max.y
    )
  );

  setText(
    "boundsZ",
    formatCoordinate(
      state.activeBounds.min.z
    ) +
    " -> " +
    formatCoordinate(
      state.activeBounds.max.z
    )
  );
}

function getPointCloudBounds(
  pointcloud
) {
  if (
    !pointcloud
  ) {
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
    getElement(
      "colorMode"
    );

  if (
    !select
  ) {
    return;
  }

  var colorType =
    potree.PointColorType[
      select.value
    ];

  if (
    colorType !==
    undefined
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
    value.toFixed(
      1
    )
  );

  if (
    state.activeCloud &&
    state.activeCloud.material
  ) {
    state.activeCloud.material.size =
      value;

    state.activeCloud.material.needsUpdate =
      true;
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
    Math.round(
      value *
      100
    ) +
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
    formatCompactNumber(
      value
    )
  );
}


/* -------------------------------------------------------------------------- */
/* SECTION TOOLS                                                              */
/* -------------------------------------------------------------------------- */

function getSectionRange() {
  if (
    !state.activeBounds
  ) {
    return null;
  }

  var modeElement =
    getElement(
      "sectionMode"
    );

  var mode =
    modeElement
      ? modeElement.value
      : "none";

  if (
    mode ===
    "horizontal"
  ) {
    return {
      min:
        state.activeBounds.min.z,
      max:
        state.activeBounds.max.z
    };
  }

  var axisElement =
    getElement(
      "sectionAxis"
    );

  var axis =
    axisElement &&
    axisElement.value
      ? axisElement.value
      : "x";

  return {
    min:
      state.activeBounds.min[axis],
    max:
      state.activeBounds.max[axis]
  };
}

function updateSectionControls() {
  var modeElement =
    getElement(
      "sectionMode"
    );

  var positionElement =
    getElement(
      "sectionPosition"
    );

  var thicknessElement =
    getElement(
      "sectionThickness"
    );

  var axisWrapper =
    getElement(
      "sectionAxisWrapper"
    );

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

  if (
    axisWrapper
  ) {
    if (
      mode ===
      "vertical"
    ) {
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

  if (
    !active
  ) {
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

  if (
    !range
  ) {
    return;
  }

  var length =
    Math.max(
      range.max -
      range.min,
      0.001
    );

  var center =
    (
      range.min +
      range.max
    ) / 2;

  var thickness =
    Math.max(
      length *
      0.08,
      0.01
    );

  positionElement.min =
    range.min;

  positionElement.max =
    range.max;

  positionElement.step =
    Math.max(
      length /
      1000,
      0.000001
    );

  positionElement.value =
    center;

  thicknessElement.min =
    0.001;

  thicknessElement.max =
    length;

  thicknessElement.value =
    thickness.toFixed(
      3
    );

  setText(
    "sectionPositionValue",
    formatCoordinate(
      center
    )
  );

  setText(
    "sectionThicknessValue",
    formatCoordinate(
      thickness
    ) +
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
    getElement(
      "sectionMode"
    );

  var mode =
    modeElement
      ? modeElement.value
      : "none";

  if (
    mode ===
    "none"
  ) {
    clearSection();

    return;
  }

  var range =
    getSectionRange();

  if (
    !range
  ) {
    return;
  }

  removeSectionVolume();

  var position =
    getNumberValue(
      "sectionPosition",
      (
        range.min +
        range.max
      ) / 2
    );

  var thickness =
    getNumberValue(
      "sectionThickness",
      (
        range.max -
        range.min
      ) *
      0.08
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
    x:
      state.activeBounds.min.x,
    y:
      state.activeBounds.min.y,
    z:
      state.activeBounds.min.z
  };

  var max = {
    x:
      state.activeBounds.max.x,
    y:
      state.activeBounds.max.y,
    z:
      state.activeBounds.max.z
  };

  if (
    mode ===
    "horizontal"
  ) {
    min.z =
      safePosition -
      thickness /
      2;

    max.z =
      safePosition +
      thickness /
      2;
  }

  if (
    mode ===
    "vertical"
  ) {
    var axisElement =
      getElement(
        "sectionAxis"
      );

    var axis =
      axisElement &&
      axisElement.value
        ? axisElement.value
        : "x";

    min[axis] =
      safePosition -
      thickness /
      2;

    max[axis] =
      safePosition +
      thickness /
      2;
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
    (
      min.x +
      max.x
    ) / 2,
    (
      min.y +
      max.y
    ) / 2,
    (
      min.z +
      max.z
    ) / 2
  );

  volume.scale.set(
    Math.max(
      max.x -
      min.x,
      0.001
    ),
    Math.max(
      max.y -
      min.y,
      0.001
    ),
    Math.max(
      max.z -
      min.z,
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
    getElement(
      "sectionMode"
    );

  if (
    modeElement
  ) {
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
/* KEYBOARD NAVIGATION                                                        */
/* -------------------------------------------------------------------------- */

var navigationKeys = {
  forward: false,
  backward: false,
  left: false,
  right: false
};

var navigationKeyboardBound =
  false;

var navigationLastTime =
  0;

function isTypingInField(
  target
) {
  if (
    !target
  ) {
    return false;
  }

  var tagName =
    target.tagName
      ? target.tagName.toLowerCase()
      : "";

  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target.isContentEditable ===
      true
  );
}

function getNavigationKey(
  event
) {
  var key =
    String(
      event.key ||
      ""
    ).toLowerCase();

  if (
    key === "w" ||
    key === "a" ||
    key === "s" ||
    key === "d" ||
    key === "arrowup" ||
    key === "arrowdown" ||
    key === "arrowleft" ||
    key === "arrowright"
  ) {
    return key;
  }

  var code =
    String(
      event.code ||
      ""
    ).toLowerCase();

  if (
    code ===
    "keyw"
  ) {
    return "w";
  }

  if (
    code ===
    "keya"
  ) {
    return "a";
  }

  if (
    code ===
    "keys"
  ) {
    return "s";
  }

  if (
    code ===
    "keyd"
  ) {
    return "d";
  }

  if (
    code ===
    "arrowup"
  ) {
    return "arrowup";
  }

  if (
    code ===
    "arrowdown"
  ) {
    return "arrowdown";
  }

  if (
    code ===
    "arrowleft"
  ) {
    return "arrowleft";
  }

  if (
    code ===
    "arrowright"
  ) {
    return "arrowright";
  }

  return "";
}

function setNavigationKey(
  key,
  pressed
) {
  if (
    key === "w" ||
    key === "arrowup"
  ) {
    navigationKeys.forward =
      pressed;
  }

  if (
    key === "s" ||
    key === "arrowdown"
  ) {
    navigationKeys.backward =
      pressed;
  }

  if (
    key === "a" ||
    key === "arrowleft"
  ) {
    navigationKeys.left =
      pressed;
  }

  if (
    key === "d" ||
    key === "arrowright"
  ) {
    navigationKeys.right =
      pressed;
  }
}

function clearNavigationKeys() {
  navigationKeys.forward =
    false;

  navigationKeys.backward =
    false;

  navigationKeys.left =
    false;

  navigationKeys.right =
    false;
}

function moveViewerWithKeyboard(
  deltaSeconds
) {
  if (
    !viewer ||
    !viewer.scene ||
    !viewer.scene.view
  ) {
    return;
  }

  var view =
    viewer.scene.view;

  if (
    !view.position
  ) {
    return;
  }

  var moving =
    navigationKeys.forward ||
    navigationKeys.backward ||
    navigationKeys.left ||
    navigationKeys.right;

  if (
    !moving
  ) {
    return;
  }

  var direction =
    null;

  if (
    view.direction &&
    typeof view.direction.clone ===
    "function"
  ) {
    direction =
      view.direction.clone();
  } else if (
    typeof view.getDirection ===
    "function"
  ) {
    direction =
      view.getDirection();
  }

  if (
    !direction ||
    typeof direction.normalize !==
    "function"
  ) {
    return;
  }

  direction.normalize();

  var right =
    direction.clone();

  if (
    typeof right.cross !==
    "function"
  ) {
    return;
  }

  right.cross(
    direction.clone().set(
      0,
      0,
      1
    )
  );

  if (
    typeof right.lengthSq ===
    "function" &&
    right.lengthSq() <
    0.000001
  ) {
    right.set(
      1,
      0,
      0
    );
  } else {
    right.normalize();
  }

  var movement =
    direction.clone().set(
      0,
      0,
      0
    );

  if (
    navigationKeys.forward
  ) {
    movement.add(
      direction
    );
  }

  if (
    navigationKeys.backward
  ) {
    movement.sub(
      direction
    );
  }

  if (
    navigationKeys.left
  ) {
    movement.sub(
      right
    );
  }

  if (
    navigationKeys.right
  ) {
    movement.add(
      right
    );
  }

  if (
    typeof movement.lengthSq ===
    "function" &&
    movement.lengthSq() <
    0.000001
  ) {
    return;
  }

  movement.normalize();

  var radius =
    Number(
      view.radius
    );

  if (
    !isFinite(
      radius
    ) ||
    radius <= 0
  ) {
    radius =
      1;
  }

  var speed =
    radius *
    Number(
      CONFIG.navigationSpeed
    );

  if (
    !isFinite(
      speed
    ) ||
    speed <= 0
  ) {
    speed =
      1;
  }

  movement.multiplyScalar(
    speed *
    deltaSeconds
  );

  view.position.add(
    movement
  );
}

function navigationAnimationLoop(
  timestamp
) {
  if (
    !navigationLastTime
  ) {
    navigationLastTime =
      timestamp;
  }

  var deltaSeconds =
    (
      timestamp -
      navigationLastTime
    ) / 1000;

  navigationLastTime =
    timestamp;

  if (
    !isFinite(
      deltaSeconds
    ) ||
    deltaSeconds <= 0 ||
    deltaSeconds > 0.1
  ) {
    deltaSeconds =
      0.016;
  }

  moveViewerWithKeyboard(
    deltaSeconds
  );

  window.requestAnimationFrame(
    navigationAnimationLoop
  );
}

function bindNavigationKeyboard() {
  if (
    navigationKeyboardBound
  ) {
    return;
  }

  navigationKeyboardBound =
    true;

  document.addEventListener(
    "keydown",
    function (event) {
      if (
        isTypingInField(
          event.target
        )
      ) {
        return;
      }

      var key =
        getNavigationKey(
          event
        );

      if (
        !key
      ) {
        return;
      }

      event.preventDefault();

      setNavigationKey(
        key,
        true
      );
    },
    true
  );

  document.addEventListener(
    "keyup",
    function (event) {
      var key =
        getNavigationKey(
          event
        );

      if (
        !key
      ) {
        return;
      }

      event.preventDefault();

      setNavigationKey(
        key,
        false
      );
    },
    true
  );

  window.addEventListener(
    "blur",
    clearNavigationKeys
  );

  document.addEventListener(
    "visibilitychange",
    function () {
      if (
        document.hidden
      ) {
        clearNavigationKeys();
      }
    }
  );

  window.requestAnimationFrame(
    navigationAnimationLoop
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

  var pointclouds =
    viewer.scene &&
    viewer.scene.pointclouds;

  var previousVisibility =
    [];

  if (
    pointclouds &&
    typeof pointclouds.forEach ===
    "function"
  ) {
    pointclouds.forEach(
      function (cloud) {
        previousVisibility.push(
          {
            cloud: cloud,
            visible:
              cloud.visible !==
              false
          }
        );

        cloud.visible =
          cloud ===
          state.activeCloud;
      }
    );
  }

  try {
    if (
      typeof viewer.fitToScreen ===
      "function"
    ) {
      viewer.fitToScreen(
        0.5
      );
    }
  } finally {
    previousVisibility.forEach(
      function (item) {
        item.cloud.visible =
          item.visible;
      }
    );
  }

  setStatus(
    "Focused on active scan",
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
    getElement(
      "orbitMode"
    );

  if (
    button
  ) {
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
/* SCREENSHOT EXPORT                                                          */
/* -------------------------------------------------------------------------- */

function getActiveViewerCamera() {
  if (
    !viewer ||
    !viewer.scene
  ) {
    return null;
  }

  if (
    typeof viewer.scene.getActiveCamera ===
    "function"
  ) {
    return viewer.scene.getActiveCamera();
  }

  return (
    viewer.scene.camera ||
    viewer.scene.cameraP ||
    null
  );
}

function getScreenshotFilename(
  width,
  height
) {
  var name =
    state.activeScan &&
    state.activeScan.name
      ? state.activeScan.name
      : "potree-viewer";

  name =
    String(
      name
    )
      .replace(
        /[^\w-]+/g,
        "-"
      )
      .replace(
        /^-+|-+$/g,
        ""
      );

  if (
    !name
  ) {
    name =
      "potree-viewer";
  }

  return (
    name +
    "_" +
    width +
    "x" +
    height +
    ".png"
  );
}

function exportScreenshot() {
  if (
    !viewer ||
    !viewer.renderer ||
    !viewer.renderer.domElement
  ) {
    setStatus(
      "Potree renderer is unavailable.",
      "error"
    );

    return;
  }

  var renderer =
    viewer.renderer;

  var canvas =
    renderer.domElement;

  var renderArea =
    getElement(
      "potree_render_area"
    );

  var camera =
    getActiveViewerCamera();

  var button =
    getElement(
      "exportScreenshot"
    );

  var screenshotScale =
    Math.max(
      1,
      Number(
        CONFIG.screenshotScale
      ) ||
      1
    );

  /*
    Use the current physical drawing-buffer dimensions.

    Example:
      current viewer canvas: 3374 x 1400
      scale: 2
      export: 6748 x 2800
  */
  var baseWidth =
    Number(
      canvas.width
    );

  var baseHeight =
    Number(
      canvas.height
    );

  if (
    !isFinite(
      baseWidth
    ) ||
    baseWidth <= 0
  ) {
    var fallbackPixelRatio =
      typeof renderer.getPixelRatio ===
      "function"
        ? renderer.getPixelRatio()
        : 1;

    baseWidth =
      Math.round(
        (
          canvas.clientWidth ||
          (
            renderArea &&
            renderArea.clientWidth
          ) ||
          1
        ) *
        fallbackPixelRatio
      );
  }

  if (
    !isFinite(
      baseHeight
    ) ||
    baseHeight <= 0
  ) {
    var fallbackHeightPixelRatio =
      typeof renderer.getPixelRatio ===
      "function"
        ? renderer.getPixelRatio()
        : 1;

    baseHeight =
      Math.round(
        (
          canvas.clientHeight ||
          (
            renderArea &&
            renderArea.clientHeight
          ) ||
          1
        ) *
        fallbackHeightPixelRatio
      );
  }

  baseWidth =
    Math.max(
      1,
      Math.round(
        baseWidth
      )
    );

  baseHeight =
    Math.max(
      1,
      Math.round(
        baseHeight
      )
    );

  var targetWidth =
    Math.max(
      1,
      Math.round(
        baseWidth *
        screenshotScale
      )
    );

  var targetHeight =
    Math.max(
      1,
      Math.round(
        baseHeight *
        screenshotScale
      )
    );

  var originalPixelRatio =
    typeof renderer.getPixelRatio ===
    "function"
      ? renderer.getPixelRatio()
      : 1;

  if (
    !isFinite(
      originalPixelRatio
    ) ||
    originalPixelRatio <= 0
  ) {
    originalPixelRatio =
      1;
  }

  var originalRendererSize =
    null;

  if (
    typeof renderer.getSize ===
    "function" &&
    window.THREE &&
    window.THREE.Vector2
  ) {
    try {
      originalRendererSize =
        renderer.getSize(
          new window.THREE.Vector2()
        );
    } catch (
      error
    ) {
      originalRendererSize =
        null;
    }
  }

  var originalCanvasWidth =
    canvas.width;

  var originalCanvasHeight =
    canvas.height;

  var originalCanvasStyle =
    canvas.style.cssText;

  var originalRenderAreaStyle =
    renderArea
      ? renderArea.style.cssText
      : "";

  var originalCameraAspect =
    camera &&
    typeof camera.aspect ===
    "number"
      ? camera.aspect
      : null;

  var originalViewerBackground =
    viewer.background;

  var hasSceneBackground =
    Boolean(
      viewer.scene &&
      "background" in viewer.scene
    );

  var originalSceneBackground =
    hasSceneBackground
      ? viewer.scene.background
      : null;

  var originalClearAlpha =
    typeof renderer.getClearAlpha ===
    "function"
      ? renderer.getClearAlpha()
      : 1;

  var originalClearColor =
    null;

  if (
    typeof renderer.getClearColor ===
    "function" &&
    window.THREE &&
    window.THREE.Color
  ) {
    try {
      originalClearColor =
        renderer.getClearColor(
          new window.THREE.Color()
        ).clone();
    } catch (
      error
    ) {
      originalClearColor =
        null;
    }
  }

  var originalAutoClear =
    typeof renderer.autoClear ===
    "boolean"
      ? renderer.autoClear
      : null;

  var originalAutoClearColor =
    typeof renderer.autoClearColor ===
    "boolean"
      ? renderer.autoClearColor
      : null;

  var originalAutoClearDepth =
    typeof renderer.autoClearDepth ===
    "boolean"
      ? renderer.autoClearDepth
      : null;

  var originalAutoClearStencil =
    typeof renderer.autoClearStencil ===
    "boolean"
      ? renderer.autoClearStencil
      : null;

  var originalSetSize =
    renderer.setSize;

  var originalSetPixelRatio =
    typeof renderer.setPixelRatio ===
    "function"
      ? renderer.setPixelRatio
      : null;

  var originalSetViewport =
    typeof renderer.setViewport ===
    "function"
      ? renderer.setViewport
      : null;

  var originalSetScissor =
    typeof renderer.setScissor ===
    "function"
      ? renderer.setScissor
      : null;

  var originalSetClearColor =
    typeof renderer.setClearColor ===
    "function"
      ? renderer.setClearColor
      : null;

  var originalSetClearAlpha =
    typeof renderer.setClearAlpha ===
    "function"
      ? renderer.setClearAlpha
      : null;

  var originalOnWindowResize =
    viewer &&
    typeof viewer.onWindowResize ===
    "function"
      ? viewer.onWindowResize
      : null;

  var originalButtonText =
    button
      ? button.textContent
      : "";

  var restored =
    false;

  function forceTransparentBackground() {
    if (
      renderArea
    ) {
      renderArea.style.setProperty(
        "background",
        "transparent",
        "important"
      );

      renderArea.style.setProperty(
        "background-image",
        "none",
        "important"
      );

      renderArea.style.setProperty(
        "background-color",
        "transparent",
        "important"
      );
    }

    canvas.style.setProperty(
      "background",
      "transparent",
      "important"
    );

    canvas.style.setProperty(
      "background-image",
      "none",
      "important"
    );

    canvas.style.setProperty(
      "background-color",
      "transparent",
      "important"
    );

    if (
      viewer &&
      typeof viewer.setBackground ===
      "function"
    ) {
      try {
        viewer.setBackground(
          "none"
        );
      } catch (
        error
      ) {
        console.warn(
          "Could not set Potree background to none:",
          error
        );
      }
    }

    /*
      Potree versions differ in how they store the background.
      Set both representations.
    */
    viewer.background =
      "none";

    if (
      hasSceneBackground
    ) {
      viewer.scene.background =
        null;
    }

    if (
      originalSetClearColor
    ) {
      originalSetClearColor.call(
        renderer,
        0x000000,
        0
      );
    }

    if (
      originalSetClearAlpha
    ) {
      originalSetClearAlpha.call(
        renderer,
        0
      );
    }

    /*if (
      originalAutoClear !==
      null
    ) {
      renderer.autoClear =
        true;
    }

    if (
      originalAutoClearColor !==
      null
    ) {
      renderer.autoClearColor =
        true;
    }

    if (
      originalAutoClearDepth !==
      null
    ) {
      renderer.autoClearDepth =
        true;
    }

    if (
      originalAutoClearStencil !==
      null
    ) {
      renderer.autoClearStencil =
        true;
    }*/
  }

  function setScreenshotSize() {
    /*
      Use pixel ratio 1 because targetWidth and targetHeight
      are already physical pixel dimensions.
    */
    if (
      originalSetPixelRatio
    ) {
      originalSetPixelRatio.call(
        renderer,
        1
      );
    }

    originalSetSize.call(
      renderer,
      targetWidth,
      targetHeight,
      false
    );

    /*
      Older Three.js/Potree combinations can occasionally
      leave the canvas at its previous drawing-buffer size.
    */
    if (
      canvas.width !==
      targetWidth
    ) {
      canvas.width =
        targetWidth;
    }

    if (
      canvas.height !==
      targetHeight
    ) {
      canvas.height =
        targetHeight;
    }

    if (
      originalSetViewport
    ) {
      originalSetViewport.call(
        renderer,
        0,
        0,
        targetWidth,
        targetHeight
      );
    }

    if (
      originalSetScissor
    ) {
      originalSetScissor.call(
        renderer,
        0,
        0,
        targetWidth,
        targetHeight
      );
    }

    if (
      camera &&
      typeof camera.aspect ===
      "number"
    ) {
      camera.aspect =
        targetWidth /
        targetHeight;

      if (
        typeof camera.updateProjectionMatrix ===
        "function"
      ) {
        camera.updateProjectionMatrix();
      }
    }

    forceTransparentBackground();
  }

  function installScreenshotOverrides() {
    /*
      Potree may call renderer.setSize() internally.
      Prevent it from changing the export back to the
      normal viewer size.
    */
    renderer.setSize =
      function () {
        return originalSetSize.call(
          renderer,
          targetWidth,
          targetHeight,
          false
        );
      };

    if (
      originalSetPixelRatio
    ) {
      renderer.setPixelRatio =
        function () {
          return originalSetPixelRatio.call(
            renderer,
            1
          );
        };
    }

    if (
      originalSetViewport
    ) {
      renderer.setViewport =
        function () {
          return originalSetViewport.call(
            renderer,
            0,
            0,
            targetWidth,
            targetHeight
          );
        };
    }

    if (
      originalSetScissor
    ) {
      renderer.setScissor =
        function () {
          return originalSetScissor.call(
            renderer,
            0,
            0,
            targetWidth,
            targetHeight
          );
        };
    }

    /*
      Keep the WebGL background transparent even if Potree
      changes the clear color while rendering.
    */
    if (
      originalSetClearColor
    ) {
      renderer.setClearColor =
        function () {
          return originalSetClearColor.call(
            renderer,
            0x000000,
            0
          );
        };
    }

    if (
      originalSetClearAlpha
    ) {
      renderer.setClearAlpha =
        function () {
          return originalSetClearAlpha.call(
            renderer,
            0
          );
        };
    }

    /*
      Prevent Potree's resize handler from restoring the
      normal viewer dimensions.
    */
    if (
      originalOnWindowResize
    ) {
      viewer.onWindowResize =
        function () {
          setScreenshotSize();
        };
    }
  }

  function restoreViewer() {
    if (
      restored
    ) {
      return;
    }

    restored =
      true;

    renderer.setSize =
      originalSetSize;

    if (
      originalSetPixelRatio
    ) {
      renderer.setPixelRatio =
        originalSetPixelRatio;
    }

    if (
      originalSetViewport
    ) {
      renderer.setViewport =
        originalSetViewport;
    }

    if (
      originalSetScissor
    ) {
      renderer.setScissor =
        originalSetScissor;
    }

    if (
      originalSetClearColor
    ) {
      renderer.setClearColor =
        originalSetClearColor;
    }

    if (
      originalSetClearAlpha
    ) {
      renderer.setClearAlpha =
        originalSetClearAlpha;
    }

    if (
      originalOnWindowResize
    ) {
      viewer.onWindowResize =
        originalOnWindowResize;
    }

    if (
      renderArea
    ) {
      renderArea.style.cssText =
        originalRenderAreaStyle;
    }

    canvas.style.cssText =
      originalCanvasStyle;

    if (
      originalSetPixelRatio
    ) {
      originalSetPixelRatio.call(
        renderer,
        originalPixelRatio
      );
    }

    if (
      originalRendererSize
    ) {
      originalSetSize.call(
        renderer,
        originalRendererSize.x,
        originalRendererSize.y,
        false
      );
    } else {
      originalSetSize.call(
        renderer,
        canvas.clientWidth ||
        1,
        canvas.clientHeight ||
        1,
        false
      );
    }

    if (
      canvas.width !==
      originalCanvasWidth
    ) {
      canvas.width =
        originalCanvasWidth;
    }

    if (
      canvas.height !==
      originalCanvasHeight
    ) {
      canvas.height =
        originalCanvasHeight;
    }

    if (
      originalClearColor &&
      originalSetClearColor
    ) {
      originalSetClearColor.call(
        renderer,
        originalClearColor,
        originalClearAlpha
      );
    }

    if (
      originalSetClearAlpha
    ) {
      originalSetClearAlpha.call(
        renderer,
        originalClearAlpha
      );
    }

    if (
      originalAutoClear !==
      null
    ) {
      renderer.autoClear =
        originalAutoClear;
    }

    if (
      originalAutoClearColor !==
      null
    ) {
      renderer.autoClearColor =
        originalAutoClearColor;
    }

    if (
      originalAutoClearDepth !==
      null
    ) {
      renderer.autoClearDepth =
        originalAutoClearDepth;
    }

    if (
      originalAutoClearStencil !==
      null
    ) {
      renderer.autoClearStencil =
        originalAutoClearStencil;
    }

    if (
      viewer &&
      typeof viewer.setBackground ===
      "function" &&
      originalViewerBackground !==
      undefined
    ) {
      try {
        viewer.setBackground(
          originalViewerBackground
        );
      } catch (
        error
      ) {
        console.warn(
          "Could not restore Potree background:",
          error
        );
      }
    }

    if (
      hasSceneBackground
    ) {
      viewer.scene.background =
        originalSceneBackground;
    }

    if (
      camera &&
      originalCameraAspect !==
      null
    ) {
      camera.aspect =
        originalCameraAspect;

      if (
        typeof camera.updateProjectionMatrix ===
        "function"
      ) {
        camera.updateProjectionMatrix();
      }
    }

    if (
      originalOnWindowResize
    ) {
      try {
        originalOnWindowResize.call(
          viewer
        );
      } catch (
        error
      ) {
        console.warn(
          "Could not restore Potree window size:",
          error
        );
      }
    }

    if (
      button
    ) {
      button.disabled =
        false;

      button.textContent =
        originalButtonText;
    }
  }

  function downloadImage(
    dataUrl
  ) {
    var filename =
      getScreenshotFilename(
        targetWidth,
        targetHeight
      );

    var link =
      document.createElement(
        "a"
      );

    link.href =
      dataUrl;

    link.download =
      filename;

    document.body.appendChild(
      link
    );

    link.click();

    link.remove();

    setStatus(
      "Screenshot exported: " +
      filename,
      "idle"
    );
  }

  function renderScreenshotFrame() {
    setScreenshotSize();

    if (
      !viewer ||
      typeof viewer.render !==
      "function"
    ) {
      throw new Error(
        "viewer.render() is unavailable."
      );
    }

    viewer.render();

    /*
      If Potree changed the drawing buffer for any reason,
      restore it and render one more frame.
    */
    if (
      canvas.width !==
        targetWidth ||
      canvas.height !==
        targetHeight
    ) {
      setScreenshotSize();

      viewer.render();
    }
  }

  function captureAfterFrames(
    frame,
    startedAt
  ) {
    try {
      renderScreenshotFrame();
    } catch (
      error
    ) {
      console.error(
        "Screenshot rendering failed:",
        error
      );

      restoreViewer();

      setStatus(
        "Screenshot export failed.",
        "error"
      );

      return;
    }

    var elapsed =
      Date.now() -
      startedAt;

    var warmupMs =
      Math.max(
        0,
        Number(
          CONFIG.screenshotWarmupMs
        ) ||
        0
      );

    if (
      frame < 3 ||
      elapsed < warmupMs
    ) {
      window.requestAnimationFrame(
        function () {
          captureAfterFrames(
            frame +
            1,
            startedAt
          );
        }
      );

      return;
    }

    try {
      if (
        canvas.width !==
          targetWidth ||
        canvas.height !==
          targetHeight
      ) {
        renderScreenshotFrame();
      }

      if (
        canvas.width !==
          targetWidth ||
        canvas.height !==
          targetHeight
      ) {
        throw new Error(
          "The renderer produced " +
          canvas.width +
          " x " +
          canvas.height +
          " instead of " +
          targetWidth +
          " x " +
          targetHeight +
          "."
        );
      }

      var dataUrl =
        canvas.toDataURL(
          "image/png"
        );

      restoreViewer();

      downloadImage(
        dataUrl
      );
    } catch (
      error
    ) {
      console.error(
        "Screenshot export failed:",
        error
      );

      restoreViewer();

      setStatus(
        "Screenshot export failed.",
        "error"
      );
    }
  }

  try {
    var gl =
      typeof renderer.getContext ===
      "function"
        ? renderer.getContext()
        : null;

    if (
      gl
    ) {
      var maxRenderbufferSize =
        gl.getParameter(
          gl.MAX_RENDERBUFFER_SIZE
        );

      if (
        maxRenderbufferSize &&
        (
          targetWidth >
          maxRenderbufferSize ||
          targetHeight >
          maxRenderbufferSize
        )
      ) {
        throw new Error(
          "The GPU does not support " +
          targetWidth +
          " x " +
          targetHeight +
          ". Maximum renderbuffer size: " +
          maxRenderbufferSize
        );
      }

      var contextAttributes =
        gl.getContextAttributes &&
        gl.getContextAttributes();

      if (
        contextAttributes &&
        contextAttributes.alpha ===
        false
      ) {
        console.warn(
          "The WebGL renderer was created without alpha support. " +
          "Transparent PNG output requires an alpha-enabled WebGL context."
        );
      }
    }

    if (
      button
    ) {
      button.disabled =
        true;

      button.textContent =
        "Rendering...";
    }

    setStatus(
      "Rendering high-resolution screenshot...",
      "loading"
    );

    installScreenshotOverrides();

    setScreenshotSize();

    captureAfterFrames(
      0,
      Date.now()
    );
  } catch (
    error
  ) {
    console.error(
      "Could not prepare screenshot:",
      error
    );

    restoreViewer();

    setStatus(
      "Could not prepare screenshot.",
      "error"
    );
  }
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
      loadCatalog()
        .then(
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
    "exportScreenshot",
    "click",
    exportScreenshot
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
        getElement(
          "sectionMode"
        );

      updateSectionControls();

      if (
        mode &&
        mode.value ===
        "none"
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
        formatCoordinate(
          value
        )
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
        formatCoordinate(
          value
        ) +
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
    getElement(
      "viewerStatusDot"
    );

  if (
    !dot
  ) {
    return;
  }

  dot.className =
    "status-dot status-idle";

  if (
    type ===
    "loading"
  ) {
    dot.className =
      "status-dot status-loading";
  }

  if (
    type ===
    "error"
  ) {
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
    getElement(
      "loadingOverlay"
    );

  if (
    overlay
  ) {
    overlay.classList.remove(
      "hidden"
    );
  }
}

function hideLoading() {
  var overlay =
    getElement(
      "loadingOverlay"
    );

  if (
    overlay
  ) {
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
    getElement(
      id
    );

  if (
    !element
  ) {
    return fallback;
  }

  var value =
    Number(
      element.value
    );

  return isFinite(
    value
  )
    ? value
    : fallback;
}

function clamp(
  value,
  min,
  max
) {
  return Math.min(
    Math.max(
      value,
      min
    ),
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

  var index =
    Math.min(
      Math.floor(
        Math.log(
          bytes
        ) /
        Math.log(
          1024
        )
      ),
      units.length -
      1
    );

  var value =
    bytes /
    Math.pow(
      1024,
      index
    );

  return (
    value.toFixed(
      index ===
      0
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
    .format(
      value
    );
}

function formatCompactNumber(
  value
) {
  if (
    value >=
    1000000
  ) {
    return (
      (
        value /
        1000000
      ).toFixed(
        1
      ) +
      "M"
    );
  }

  if (
    value >=
    1000
  ) {
    return (
      Math.round(
        value /
        1000
      ) +
      "K"
    );
  }

  return String(
    value
  );
}

function formatCoordinate(
  value
) {
  if (
    !isFinite(
      value
    )
  ) {
    return "—";
  }

  return Number(
    value
  ).toFixed(
    3
  );
}
