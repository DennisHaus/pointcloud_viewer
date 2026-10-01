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

var LOCATION_CONFIG =
  window.LOCATION_CONFIG || {};

var CONFIG = {
  catalogUrl:
    LOCATION_CONFIG.catalogUrl ||
    "./catalog.json",

  defaultPointBudget:
    30000000,

  navigationSpeed:
    0.35,

  screenshotScale:
    5,

  screenshotWarmupMs:
    600,

  useRawBaseForPaths:
    LOCATION_CONFIG.useRawBaseForPaths === true,

  fitFactor:
    0.95,

  fitDistanceMultiplier:
    0.8,

  fitVerticalOffset:
    -0.4,

  rawBaseUrl:
    LOCATION_CONFIG.rawBaseUrl ||
    "",

  scanPathPrefix:
    LOCATION_CONFIG.scanPathPrefix ||
    "scans/",

  downloadPassword:
    LOCATION_CONFIG.downloadPassword ||
    ""
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
  sectionVolume: null,
  navigationSpeed:
    Number(
      CONFIG.navigationSpeed
    ) ||
    0.35
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
  applyPointDisplayMode();
  updateSectionControls();
}

function setDropdownState(
  button,
  content,
  expanded
) {
  if (
    !button ||
    !content
  ) {
    return;
  }

  content.classList.toggle(
    "hidden",
    !expanded
  );

  button.setAttribute(
    "aria-expanded",
    String(
      expanded
    )
  );

  var panel =
    button.closest(
      ".library-panel, .inspector-panel"
    );

  if (
    panel
  ) {
    panel.classList.toggle(
      "is-expanded",
      expanded
    );

    panel.classList.toggle(
      "is-collapsed",
      !expanded
    );
  }

  var arrow =
    button.querySelector(
      ".dropdown-arrow"
    );

  if (
    arrow
  ) {
    arrow.textContent =
      expanded
        ? "⌄"
        : "⌃";
  }

  updatePanelLayout();
}


function bindDropdown(
  buttonId,
  contentId
) {
  var button =
    getElement(
      buttonId
    );

  var content =
    getElement(
      contentId
    );

  if (
    !button ||
    !content
  ) {
    console.warn(
      "Dropdown elements not found:",
      buttonId,
      contentId
    );

    return;
  }

  var expanded =
    button.getAttribute(
      "aria-expanded"
    ) ===
    "true";

  setDropdownState(
    button,
    content,
    expanded
  );

  button.addEventListener(
    "click",
    function (event) {
      event.preventDefault();
      event.stopPropagation();

      var currentlyExpanded =
        button.getAttribute(
          "aria-expanded"
        ) ===
        "true";

      setDropdownState(
        button,
        content,
        !currentlyExpanded
      );
    }
  );
}

function updatePanelLayout() {
  var workspace =
    document.querySelector(
      ".workspace"
    );

  var topbar =
    document.querySelector(
      ".topbar"
    );

  var statusbar =
    document.querySelector(
      ".statusbar"
    );

  var library =
    getElement(
      "libraryDropdownContent"
    );

  var libraryPanel =
    document.querySelector(
      ".library-panel"
    );

  var inspectorPanel =
    document.querySelector(
      ".inspector-panel"
    );

  var inspectorButton =
    getElement(
      "toggleInspector"
    );

  if (
    !workspace ||
    !topbar ||
    !statusbar ||
    !libraryPanel ||
    !inspectorPanel ||
    !inspectorButton
  ) {
    return;
  }

  /*
    Keep the existing mobile layout.
  */
  if (
    window.innerWidth <=
    850
  ) {
    libraryPanel.style.removeProperty(
      "top"
    );

    libraryPanel.style.removeProperty(
      "height"
    );

    libraryPanel.style.removeProperty(
      "bottom"
    );

    inspectorPanel.style.removeProperty(
      "top"
    );

    inspectorPanel.style.removeProperty(
      "height"
    );

    inspectorPanel.style.removeProperty(
      "bottom"
    );

    return;
  }

  var workspaceHeight =
    workspace.clientHeight ||
    window.innerHeight;

  var headerHeight =
    topbar.offsetHeight;

  var statusHeight =
    statusbar.offsetHeight;

  var panelAreaTop =
    headerHeight;

  var panelAreaBottom =
    workspaceHeight -
    statusHeight;

  var panelAreaHeight =
    Math.max(
      panelAreaBottom -
      panelAreaTop,
      0
    );

  var libraryHeader =
    libraryPanel.querySelector(
      ".panel-header"
    );

  var libraryHeaderHeight =
    libraryHeader
      ? libraryHeader.offsetHeight
      : 48;

  var inspectorToggleHeight =
    inspectorButton.offsetHeight ||
    48;

  var libraryButton =
    getElement(
      "toggleLibrary"
    );

  var libraryExpanded =
    libraryButton &&
    libraryButton.getAttribute(
      "aria-expanded"
    ) ===
    "true";

  var inspectorExpanded =
    inspectorButton.getAttribute(
      "aria-expanded"
    ) ===
    "true";

  var libraryHeight;
  var inspectorHeight;

  if (
    libraryExpanded &&
    inspectorExpanded
  ) {
    libraryHeight =
      Math.floor(
        panelAreaHeight /
        2
      );

    inspectorHeight =
      panelAreaHeight -
      libraryHeight;
  } else if (
    libraryExpanded
  ) {
    libraryHeight =
      Math.max(
        panelAreaHeight -
        inspectorToggleHeight,
        libraryHeaderHeight
      );

    inspectorHeight =
      panelAreaHeight -
      libraryHeight;
  } else if (
    inspectorExpanded
  ) {
    libraryHeight =
      libraryHeaderHeight;

    inspectorHeight =
      panelAreaHeight -
      libraryHeight;
  } else {
    libraryHeight =
      libraryHeaderHeight;

    inspectorHeight =
      inspectorToggleHeight;
  }

  libraryHeight =
    Math.max(
      libraryHeight,
      libraryHeaderHeight
    );

  inspectorHeight =
    Math.max(
      inspectorHeight,
      inspectorToggleHeight
    );

  /*
    Position the library.
  */
  libraryPanel.style.setProperty(
    "top",
    panelAreaTop +
    "px",
    "important"
  );

  libraryPanel.style.setProperty(
    "bottom",
    "auto",
    "important"
  );

  libraryPanel.style.setProperty(
    "height",
    libraryHeight +
    "px",
    "important"
  );

  /*
    Position the inspector directly below
    the library.
  */
  inspectorPanel.style.setProperty(
    "top",
    panelAreaTop +
    libraryHeight +
    "px",
    "important"
  );

  inspectorPanel.style.setProperty(
    "bottom",
    statusHeight +
    "px",
    "important"
  );

  inspectorPanel.style.setProperty(
    "height",
    inspectorHeight +
    "px",
    "important"
  );
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
        var entries =
  [];

if (
  Array.isArray(
    data
  )
) {
  entries =
    data;
} else if (
  data &&
  Array.isArray(
    data.scans
  )
) {
  entries =
    data.scans;
} else if (
  data &&
  Array.isArray(
    data.folders
  )
) {
  entries =
    data.folders;
}

var scans =
  flattenCatalogEntries(
    entries,
    ""
  );

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

function normalizeFolderPath(
  value
) {
  var path =
    String(
      value ||
      ""
    )
      .replace(
        /\\/g,
        "/"
      )
      .replace(
        /^\.\/+/,
        ""
      )
      .replace(
        /^\/+/,
        ""
      )
      .replace(
        /\/+$/,
        ""
      );

  var parts =
    path
      .split("/")
      .filter(
        function (part) {
          return Boolean(
            part
          );
        }
      );

  if (
    parts.length &&
    parts[0].toLowerCase() ===
    "scans"
  ) {
    parts.shift();
  }

  return parts.join("/");
}

function joinFolderPath(
  parent,
  child
) {
  var combined =
    [
      parent,
      child
    ]
      .filter(
        function (value) {
          return String(
            value ||
            ""
          ).trim();
        }
      )
      .join("/");

  return normalizeFolderPath(
    combined
  );
}

function flattenCatalogEntries(
  entries,
  parentFolder
) {
  var result =
    [];

  if (
    !Array.isArray(
      entries
    )
  ) {
    return result;
  }

  entries.forEach(
    function (entry) {
      if (
        !entry ||
        typeof entry !==
        "object"
      ) {
        return;
      }

      var children =
        Array.isArray(
          entry.children
        )
          ? entry.children
          : Array.isArray(
              entry.scans
            )
            ? entry.scans
            : null;

      if (
        children
      ) {
        var folderName =
          entry.folderName ||
          entry.folder ||
          entry.directory ||
          entry.name ||
          entry.title ||
          "";

        var folderPath =
          joinFolderPath(
            parentFolder,
            folderName
          );

        result =
          result.concat(
            flattenCatalogEntries(
              children,
              folderPath
            )
          );

        return;
      }

      var scan =
        Object.assign(
          {},
          entry
        );

      var ownFolder =
        scan.folderPath ||
        scan.folder ||
        scan.directory ||
        scan.category ||
        "";

      scan.folderPath =
        joinFolderPath(
          parentFolder,
          ownFolder
        );

      result.push(
        scan
      );
    }
  );

  return result;
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

    var scanPathPrefix =
    String(
      CONFIG.scanPathPrefix ||
      "scans/"
    ).replace(
      /\/+$/,
      ""
    ) + "/";

  var path =
    String(
      scan.path ||
      (
        filename
          ? scanPathPrefix +
            filename
          : ""
      )
    );

  /*
    Folder can be supplied explicitly in the catalog.
    Supported properties:
      folderPath
      folder
      directory
      category
  */
  var folderPath =
    String(
      scan.folderPath ||
      scan.folder ||
      scan.directory ||
      scan.category ||
      ""
    ).trim();

  /*
    If no folder was explicitly supplied, derive it
    from the scan path.

    Example:
      scans/2026/day-01/scan.copc.laz
      becomes:
      2026/day-01
  */
  if (
    !folderPath &&
    path &&
    !/^https?:\/\//i.test(
      path
    )
  ) {
    var pathWithoutQuery =
      path.split(
        "?"
      )[0];

    var lastSlash =
      pathWithoutQuery.lastIndexOf(
        "/"
      );

    if (
      lastSlash >
      -1
    ) {
      folderPath =
        pathWithoutQuery.substring(
          0,
          lastSlash
        );
    }
  }

  folderPath =
    normalizeFolderPath(
      folderPath
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

    folderPath: folderPath,

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

if (
  !state.activeBounds &&
  typeof window.getPointCloudWorldBounds ===
  "function"
) {
  state.activeBounds =
    window.getPointCloudWorldBounds(
      state.activeCloud
    );
}

  if (
    !state.activeBounds &&
    typeof getPointCloudWorldBounds ===
    "function"
  ) {
    state.activeBounds =
      getPointCloudWorldBounds(
        state.activeCloud
      );
  }
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

function buildLibraryTree(
  scans
) {
  var root = {
    folders: new Map(),
    scans: []
  };

  scans.forEach(
    function (scan) {
      var folderPath =
        normalizeFolderPath(
          scan.folderPath
        );

      if (
        !folderPath
      ) {
        root.scans.push(
          scan
        );

        return;
      }

      var parts =
        folderPath
          .split("/")
          .filter(
            function (part) {
              return Boolean(
                part
              );
            }
          );

      var node =
        root;

      parts.forEach(
        function (part) {
          if (
            !node.folders.has(
              part
            )
          ) {
            node.folders.set(
              part,
              {
                folders: new Map(),
                scans: []
              }
            );
          }

          node =
            node.folders.get(
              part
            );
        }
      );

      node.scans.push(
        scan
      );
    }
  );

  return root;
}

function scanMatchesQuery(
  scan,
  query
) {
  if (
    !query
  ) {
    return true;
  }

  var searchable =
    (
      scan.name +
      " " +
      scan.filename +
      " " +
      scan.path
    ).toLowerCase();

  return (
    searchable.indexOf(
      query
    ) !==
    -1
  );
}

function treeContainsQuery(
  node,
  query
) {
  if (
    !query
  ) {
    return true;
  }

  if (
    node.scans.some(
      function (scan) {
        return scanMatchesQuery(
          scan,
          query
        );
      }
    )
  ) {
    return true;
  }

  var found =
    false;

  node.folders.forEach(
    function (child) {
      if (
        treeContainsQuery(
          child,
          query
        )
      ) {
        found =
          true;
      }
    }
  );

  return found;
}

function countTreeScans(
  node
) {
  var count =
    node.scans.length;

  node.folders.forEach(
    function (child) {
      count +=
        countTreeScans(
          child
        );
    }
  );

  return count;
}

function createScanCard(
  scan
) {
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
      selectScan(
        scan
      );
    }
  );

  return card;
}

function renderLibraryTree(
  node,
  container,
  query
) {
  node.folders.forEach(
    function (
      child,
      folderName
    ) {
      if (
        !treeContainsQuery(
          child,
          query
        )
      ) {
        return;
      }

      var folder =
        document.createElement(
          "details"
        );

      folder.className =
        "scan-folder";

      folder.open =
        true;

      var summary =
        document.createElement(
          "summary"
        );

      summary.textContent =
        folderName;

      var count =
        document.createElement(
          "span"
        );

      count.className =
        "scan-folder-count";

      count.textContent =
        countTreeScans(
          child
        );

      summary.appendChild(
        count
      );

      var contents =
        document.createElement(
          "div"
        );

      contents.className =
        "scan-folder-contents";

      folder.appendChild(
        summary
      );

      folder.appendChild(
        contents
      );

      renderLibraryTree(
        child,
        contents,
        query
      );

      container.appendChild(
        folder
      );
    }
  );

  node.scans.forEach(
    function (scan) {
      if (
        scanMatchesQuery(
          scan,
          query
        )
      ) {
        container.appendChild(
          createScanCard(
            scan
          )
        );
      }
    }
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
        return scanMatchesQuery(
          scan,
          query
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

  var tree =
    buildLibraryTree(
      state.catalog
    );

  renderLibraryTree(
    tree,
    list,
    query
  );
}

/* -------------------------------------------------------------------------- */
/* POINT-CLOUD LOADING                                                        */
/* -------------------------------------------------------------------------- */
function selectScan(scan) {
  if (!scan) {
    return;
  }

  var pointcloud =
    state.loadedClouds.get(scan.id);

  /*
   * If the scan is not loaded yet,
   * loading it will also make it active.
   */
  if (!pointcloud) {
    loadScan(scan);
    return;
  }

  /*
   * IMPORTANT:
   * Selecting a scan changes ONLY the
   * active scan.
   *
   * It must NOT change visibility of
   * any other scan.
   */
  setActiveScan(
    scan,
    pointcloud
  );

  renderLibrary();

  setStatus(
    scan.name + " selected",
    "idle"
  );
}

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
  var existingCloud =
    state.loadedClouds.get(
      scan.id
    );

  setActiveScan(
    scan,
    existingCloud
  );

  fitActiveScan();

  return Promise.resolve(
    existingCloud
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
    if (
      state.activeCloud ===
      pointcloud
    ) {
      fitActiveScan();
    }
  },
  500
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
      1.0
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

  applyPointDisplayMode(
  pointcloud
);

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
  scan,
  pointcloud
) {
  if (
    !scan
  ) {
    return;
  }

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
    pointcloud ||
    state.loadedClouds.get(
      scan.id
    ) ||
    null;

  state.activeBounds =
    null;

  if (
    state.activeCloud &&
    typeof window.getPointCloudWorldBounds ===
    "function"
  ) {
    state.activeBounds =
      window.getPointCloudWorldBounds(
        state.activeCloud
      );
  }

  if (
    !state.activeBounds &&
    state.activeCloud &&
    typeof window.getPointCloudBounds ===
    "function"
  ) {
    state.activeBounds =
      window.getPointCloudBounds(
        state.activeCloud
      );
  }

  if (
    typeof applyPointDisplayMode ===
    "function"
  ) {
    applyPointDisplayMode(
      state.activeCloud
    );
  }

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
    state.activeScan.pointCount && state.activeScan.pointCount !== 0
      ? formatNumber(state.activeScan.pointCount)
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

window.getPointCloudBounds =
  function (
    pointcloud
  ) {
    if (
      !pointcloud
    ) {
      return null;
    }

    function readCoordinate(
      vector,
      property,
      index
    ) {
      if (
        vector &&
        typeof vector[property] ===
        "number" &&
        isFinite(
          vector[property]
        )
      ) {
        return vector[property];
      }

      if (
        vector &&
        typeof vector[index] ===
        "number" &&
        isFinite(
          vector[index]
        )
      ) {
        return vector[index];
      }

      return null;
    }

    function readBox(
      box
    ) {
      if (
        !box
      ) {
        return null;
      }

      var minX =
        null;

      var minY =
        null;

      var minZ =
        null;

      var maxX =
        null;

      var maxY =
        null;

      var maxZ =
        null;

      /*
        Standard THREE.Box3 format.
      */
      if (
        box.min &&
        box.max
      ) {
        minX =
          readCoordinate(
            box.min,
            "x",
            0
          );

        minY =
          readCoordinate(
            box.min,
            "y",
            1
          );

        minZ =
          readCoordinate(
            box.min,
            "z",
            2
          );

        maxX =
          readCoordinate(
            box.max,
            "x",
            0
          );

        maxY =
          readCoordinate(
            box.max,
            "y",
            1
          );

        maxZ =
          readCoordinate(
            box.max,
            "z",
            2
          );
      }

      /*
        Potree metadata-style format.
      */
      if (
        minX === null &&
        typeof box.lx ===
          "number" &&
        typeof box.ly ===
          "number" &&
        typeof box.lz ===
          "number" &&
        typeof box.ux ===
          "number" &&
        typeof box.uy ===
          "number" &&
        typeof box.uz ===
          "number"
      ) {
        minX =
          box.lx;

        minY =
          box.ly;

        minZ =
          box.lz;

        maxX =
          box.ux;

        maxY =
          box.uy;

        maxZ =
          box.uz;
      }

      if (
        minX === null ||
        minY === null ||
        minZ === null ||
        maxX === null ||
        maxY === null ||
        maxZ === null
      ) {
        return null;
      }

      return {
        min: {
          x:
            Math.min(
              minX,
              maxX
            ),

          y:
            Math.min(
              minY,
              maxY
            ),

          z:
            Math.min(
              minZ,
              maxZ
            )
        },

        max: {
          x:
            Math.max(
              minX,
              maxX
            ),

          y:
            Math.max(
              minY,
              maxY
            ),

          z:
            Math.max(
              minZ,
              maxZ
            )
        }
      };
    }

    var boxes =
      [];

    if (
      pointcloud.boundingBox
    ) {
      boxes.push(
        pointcloud.boundingBox
      );
    }

    if (
      pointcloud.pcoGeometry
    ) {
      if (
        pointcloud.pcoGeometry.tightBoundingBox
      ) {
        boxes.push(
          pointcloud.pcoGeometry.tightBoundingBox
        );
      }

      if (
        pointcloud.pcoGeometry.boundingBox
      ) {
        boxes.push(
          pointcloud.pcoGeometry.boundingBox
        );
      }
    }

    if (
      pointcloud.geometry &&
      pointcloud.geometry.boundingBox
    ) {
      boxes.push(
        pointcloud.geometry.boundingBox
      );
    }

    for (
      var index = 0;
      index < boxes.length;
      index += 1
    ) {
      var bounds =
        readBox(
          boxes[index]
        );

      if (
        bounds
      ) {
        return bounds;
      }
    }

    return null;
  };


/* -------------------------------------------------------------------------- */
/* APPEARANCE                                                                 */
/* -------------------------------------------------------------------------- */

function isSinglePixelMode() {
  var button =
    getElement(
      "pointDisplayMode"
    );

  return (
    button &&
    button.getAttribute(
      "aria-pressed"
    ) ===
    "true"
  );
}

function updatePointDisplayButton() {
  var button =
    getElement(
      "pointDisplayMode"
    );

  if (
    !button
  ) {
    return;
  }

  var singlePixel =
    isSinglePixelMode();

  button.textContent =
    singlePixel
      ? "Single pixels"
      : "Depth-sized";

  button.setAttribute(
    "aria-pressed",
    String(
      singlePixel
    )
  );
}

function applyPointDisplayMode(
  pointcloud
) {
  var cloud =
    pointcloud ||
    state.activeCloud;

  updatePointDisplayButton();

  if (
    !cloud ||
    !cloud.material
  ) {
    return;
  }

  var material =
    cloud.material;

  var potree =
    window.Potree;

  var pointSizeType =
    potree &&
    potree.PointSizeType
      ? potree.PointSizeType
      : null;

  if (
    isSinglePixelMode()
  ) {
    if (
      pointSizeType &&
      pointSizeType.FIXED !==
      undefined
    ) {
      material.pointSizeType =
        pointSizeType.FIXED;
    }

    material.size =
      1;
  } else {
    if (
      pointSizeType &&
      pointSizeType.ADAPTIVE !==
      undefined
    ) {
      material.pointSizeType =
        pointSizeType.ADAPTIVE;
    }

    material.size =
      getNumberValue(
        "pointSize",
        0.5
      );
  }

  material.needsUpdate =
    true;
}

function togglePointDisplayMode() {
  var button =
    getElement(
      "pointDisplayMode"
    );

  if (
    !button
  ) {
    return;
  }

  var enabled =
    button.getAttribute(
      "aria-pressed"
    ) ===
    "true";

  button.setAttribute(
    "aria-pressed",
    String(
      !enabled
    )
  );

  applyPointDisplayMode();

  setStatus(
    !enabled
      ? "Single-pixel display enabled"
      : "Depth-sized display enabled",
    "idle"
  );
}

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
      0.5
    );

  setText(
    "pointSizeValue",
    value.toFixed(
      0.5
    )
  );

  if (
    state.activeCloud &&
    state.activeCloud.material
  ) {
    state.activeCloud.material.size =
      isSinglePixelMode()
        ? 1
        : value;

    state.activeCloud.material.needsUpdate =
      true;

    applyPointDisplayMode(
      state.activeCloud
    );
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
  right: false,
  up: false,
  down: false
};

var navigationKeyboardBound =
  false;

var navigationLastTime =
  0;

  var navigationRamp =
    0;

  var navigationDirection =
    null;

  var navigationAccelerationTime =
    0.9;

  var navigationDecelerationTime =
    0.9;

  var navigationTurnTime =
    0.9;

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
    key === "," ||
    key === "."
  ) {
    return key;
  }

  if (
    key === "w" ||
    key === "a" ||
    key === "s" ||
    key === "d" ||
    key === "e" ||
    key === "c" ||
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
    code === "keyw"
  ) {
    return "w";
  }

  if (
    code === "keya"
  ) {
    return "a";
  }

  if (
    code === "keys"
  ) {
    return "s";
  }

  if (
    code === "keyd"
  ) {
    return "d";
  }

  if (
    code === "keye"
  ) {
    return "e";
  }

  if (
    code === "keyc"
  ) {
    return "c";
  }

  if (
    code === "arrowup"
  ) {
    return "arrowup";
  }

  if (
    code === "arrowdown"
  ) {
    return "arrowdown";
  }

  if (
    code === "arrowleft"
  ) {
    return "arrowleft";
  }

  if (
    code === "arrowright"
  ) {
    return "arrowright";
  }

  if (
    code === "comma"
  ) {
    return ",";
  }

  if (
    code === "period"
  ) {
    return ".";
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

  if (
  key === "e"
) {
  navigationKeys.up =
    pressed;
}

if (
  key === "c"
) {
  navigationKeys.down =
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

  navigationKeys.up =
    false;

  navigationKeys.down =
    false;
}

function adjustNavigationSpeed(
  direction
) {
  var currentSpeed =
    Number(
      state.navigationSpeed
    ) ||
    Number(
      CONFIG.navigationSpeed
    ) ||
    0.35;

  var multiplier =
    direction > 0
      ? 1.25
      : 0.8;

  state.navigationSpeed =
    clamp(
      currentSpeed *
      multiplier,
      0.02,
      8
    );

  setStatus(
    "Navigation speed: " +
    state.navigationSpeed.toFixed(
      2
    ),
    "idle"
  );
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

  /*
    Build the desired movement direction.
    This is the target direction, not the
    final movement yet.
  */
  var targetMovement =
    direction.clone().set(
      0,
      0,
      0
    );

  if (
    navigationKeys.forward
  ) {
    targetMovement.add(
      direction
    );
  }

  if (
    navigationKeys.backward
  ) {
    targetMovement.sub(
      direction
    );
  }

  if (
    navigationKeys.left
  ) {
    targetMovement.sub(
      right
    );
  }

  if (
    navigationKeys.right
  ) {
    targetMovement.add(
      right
    );
  }

  if (
    navigationKeys.up
  ) {
    targetMovement.add(
      direction.clone().set(
        0,
        0,
        1
      )
    );
  }

  if (
    navigationKeys.down
  ) {
    targetMovement.sub(
      direction.clone().set(
        0,
        0,
        1
      )
    );
  }

  var hasTargetMovement =
    typeof targetMovement.lengthSq ===
    "function" &&
    targetMovement.lengthSq() >
    0.000001;

  if (
    hasTargetMovement
  ) {
    targetMovement.normalize();

    /*
      Ramp from 0 to 1 while a direction
      is being pressed.
    */
    navigationRamp =
      Math.min(
        1,
        navigationRamp +
        deltaSeconds /
        navigationAccelerationTime
      );
  } else {
    /*
      Ramp from 1 back to 0 after release.
    */
    navigationRamp =
      Math.max(
        0,
        navigationRamp -
        deltaSeconds /
        navigationDecelerationTime
      );
  }

  /*
    Convert the linear ramp into a soft
    Catmull-Rom acceleration/deceleration.
  */
  var speedFactor =
    navigationCatmullEase(
      navigationRamp
    );

  /*
    Smooth changes between directions too.
    This prevents an abrupt snap when changing
    from forward to left, for example.
  */
  if (
    hasTargetMovement
  ) {
    if (
      !navigationDirection
    ) {
      navigationDirection =
        targetMovement.clone();
    } else {
      var turnAlpha =
        1 -
        Math.exp(
          -deltaSeconds /
          navigationTurnTime
        );

      navigationDirection.lerp(
        targetMovement,
        turnAlpha
      );

      if (
        navigationDirection.lengthSq() <
        0.000001
      ) {
        navigationDirection =
          targetMovement.clone();
      } else {
        navigationDirection.normalize();
      }
    }
  }

  /*
    Once fully stopped, discard the old
    direction so a new direction starts cleanly.
  */
  if (
    !hasTargetMovement &&
    navigationRamp ===
    0
  ) {
    navigationDirection =
      null;

    return;
  }

  if (
    !navigationDirection ||
    speedFactor <=
    0
  ) {
    return;
  }

  var radius =
    Number(
      view.radius
    );

  if (
    !isFinite(
      radius
    ) ||
    radius <=
    0
  ) {
    radius =
      1;
  }

  var navigationSpeed =
    Number(
      state.navigationSpeed
    ) ||
    Number(
      CONFIG.navigationSpeed
    ) ||
    0.35;

  var speed =
    radius *
    navigationSpeed;

  if (
    !isFinite(
      speed
    ) ||
    speed <=
    0
  ) {
    return;
  }

  var displacement =
    navigationDirection.clone();

  displacement.multiplyScalar(
    speed *
    speedFactor *
    deltaSeconds
  );

  view.position.add(
    displacement
  );
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

  navigationKeys.up =
    false;

  navigationKeys.down =
    false;

  navigationRamp =
    0;

  navigationDirection =
    null;
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

      if (
        key === "," ||
        key === "."
      ) {
        if (
          !event.repeat
        ) {
          adjustNavigationSpeed(
            key === "."
              ? 1
              : -1
          );
        }

        event.preventDefault();

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

      if (
        key === "," ||
        key === "."
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

function readBoxCoordinate(
  vector,
  property,
  index
) {
  if (
    vector &&
    typeof vector[property] ===
    "number" &&
    isFinite(
      vector[property]
    )
  ) {
    return vector[property];
  }

  if (
    vector &&
    typeof vector[index] ===
    "number" &&
    isFinite(
      vector[index]
    )
  ) {
    return vector[index];
  }

  return null;
}


function readPointCloudBox(
  box
) {
  if (
    !box
  ) {
    return null;
  }

  var minX =
    null;

  var minY =
    null;

  var minZ =
    null;

  var maxX =
    null;

  var maxY =
    null;

  var maxZ =
    null;

  if (
    box.min &&
    box.max
  ) {
    minX =
      readBoxCoordinate(
        box.min,
        "x",
        0
      );

    minY =
      readBoxCoordinate(
        box.min,
        "y",
        1
      );

    minZ =
      readBoxCoordinate(
        box.min,
        "z",
        2
      );

    maxX =
      readBoxCoordinate(
        box.max,
        "x",
        0
      );

    maxY =
      readBoxCoordinate(
        box.max,
        "y",
        1
      );

    maxZ =
      readBoxCoordinate(
        box.max,
        "z",
        2
      );
  } else if (
    typeof box.lx ===
      "number" &&
    typeof box.ly ===
      "number" &&
    typeof box.lz ===
      "number" &&
    typeof box.ux ===
      "number" &&
    typeof box.uy ===
      "number" &&
    typeof box.uz ===
      "number"
  ) {
    minX =
      box.lx;

    minY =
      box.ly;

    minZ =
      box.lz;

    maxX =
      box.ux;

    maxY =
      box.uy;

    maxZ =
      box.uz;
  }

  if (
    minX ===
      null ||
    minY ===
      null ||
    minZ ===
      null ||
    maxX ===
      null ||
    maxY ===
      null ||
    maxZ ===
      null
  ) {
    return null;
  }

  return {
    min: {
      x:
        Math.min(
          minX,
          maxX
        ),

      y:
        Math.min(
          minY,
          maxY
        ),

      z:
        Math.min(
          minZ,
          maxZ
        )
    },

    max: {
      x:
        Math.max(
          minX,
          maxX
        ),

      y:
        Math.max(
          minY,
          maxY
        ),

      z:
        Math.max(
          minZ,
          maxZ
        )
    }
  };
}

function catmullRomScalar(
  p0,
  p1,
  p2,
  p3,
  t
) {
  var t2 =
    t *
    t;

  var t3 =
    t2 *
    t;

  return 0.5 * (
    2 *
    p1 +
    (
      -p0 +
      p2
    ) *
    t +
    (
      2 *
      p0 -
      5 *
      p1 +
      4 *
      p2 -
      p3
    ) *
    t2 +
    (
      -p0 +
      3 *
      p1 -
      3 *
      p2 +
      p3
    ) *
    t3
  );
}

function navigationCatmullEase(
  t
) {
  t =
    Math.max(
      0,
      Math.min(
        1,
        t
      )
    );

  /*
    These virtual control points create
    zero-slope start and stop behavior.

    Result:
    3t² - 2t³
  */
  return catmullRomScalar(
    1,
    0,
    1,
    0,
    t
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
    pointcloud.boundingBox ||
    (
      pointcloud.pcoGeometry &&
      (
        pointcloud.pcoGeometry.tightBoundingBox ||
        pointcloud.pcoGeometry.boundingBox
      )
    ) ||
    (
      pointcloud.geometry &&
      pointcloud.geometry.boundingBox
    ) ||
    null;

  if (
    !box
  ) {
    return null;
  }

  function coordinate(
    vector,
    property,
    index
  ) {
    if (
      vector &&
      typeof vector[property] ===
      "number" &&
      isFinite(
        vector[property]
      )
    ) {
      return vector[property];
    }

    if (
      vector &&
      typeof vector[index] ===
      "number" &&
      isFinite(
        vector[index]
      )
    ) {
      return vector[index];
    }

    return null;
  }

  var minX =
    null;

  var minY =
    null;

  var minZ =
    null;

  var maxX =
    null;

  var maxY =
    null;

  var maxZ =
    null;

  if (
    box.min &&
    box.max
  ) {
    minX =
      coordinate(
        box.min,
        "x",
        0
      );

    minY =
      coordinate(
        box.min,
        "y",
        1
      );

    minZ =
      coordinate(
        box.min,
        "z",
        2
      );

    maxX =
      coordinate(
        box.max,
        "x",
        0
      );

    maxY =
      coordinate(
        box.max,
        "y",
        1
      );

    maxZ =
      coordinate(
        box.max,
        "z",
        2
      );
  } else if (
    typeof box.lx ===
      "number" &&
    typeof box.ly ===
      "number" &&
    typeof box.lz ===
      "number" &&
    typeof box.ux ===
      "number" &&
    typeof box.uy ===
      "number" &&
    typeof box.uz ===
      "number"
  ) {
    minX =
      box.lx;

    minY =
      box.ly;

    minZ =
      box.lz;

    maxX =
      box.ux;

    maxY =
      box.uy;

    maxZ =
      box.uz;
  }

  if (
    minX === null ||
    minY === null ||
    minZ === null ||
    maxX === null ||
    maxY === null ||
    maxZ === null
  ) {
    return null;
  }

  return {
    min: {
      x:
        Math.min(
          minX,
          maxX
        ),

      y:
        Math.min(
          minY,
          maxY
        ),

      z:
        Math.min(
          minZ,
          maxZ
        )
    },

    max: {
      x:
        Math.max(
          minX,
          maxX
        ),

      y:
        Math.max(
          minY,
          maxY
        ),

      z:
        Math.max(
          minZ,
          maxZ
        )
    }
  };
}

window.getPointCloudBounds =
  getPointCloudBounds;

function getPointCloudWorldBounds(
  pointcloud
) {
  if (
    !pointcloud
  ) {
    return null;
  }

  /*
    First try Potree's own world-bounds method.
  */
  if (
    typeof pointcloud.getBoundingBoxWorld ===
    "function"
  ) {
    try {
      var worldBox =
        pointcloud.getBoundingBoxWorld();

      var worldBounds =
        readPointCloudBox(
          worldBox
        );

      if (
        worldBounds
      ) {
        return worldBounds;
      }
    } catch (
      error
    ) {
      console.warn(
        "Could not read world bounds:",
        error
      );
    }
  }

  /*
    Try the point cloud's direct bounding box.
  */
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
    !box &&
    pointcloud.geometry
  ) {
    box =
      pointcloud.geometry.boundingBox;
  }

  /*
    Use the original application bounds helper
    if it is available.
  */
  if (
    !box &&
    typeof getPointCloudBounds ===
    "function"
  ) {
    var applicationBounds =
      window.getPointCloudBounds(
        pointcloud
      );

    if (
      applicationBounds
    ) {
      return applicationBounds;
    }
  }

  if (
    !box
  ) {
    return null;
  }

  /*
    Transform the bounds if Potree has a
    world transformation matrix.
  */
  if (
    typeof box.clone ===
      "function" &&
    typeof box.applyMatrix4 ===
      "function" &&
    pointcloud.matrixWorld
  ) {
    try {
      if (
        typeof pointcloud.updateMatrixWorld ===
        "function"
      ) {
        pointcloud.updateMatrixWorld(
          true
        );
      }

      var transformedBox =
        box.clone();

      transformedBox.applyMatrix4(
        pointcloud.matrixWorld
      );

      var transformedBounds =
        readPointCloudBox(
          transformedBox
        );

      if (
        transformedBounds
      ) {
        return transformedBounds;
      }
    } catch (
      error
    ) {
      console.warn(
        "Could not transform point-cloud bounds:",
        error
      );
    }
  }

  return readPointCloudBox(
    box
  );
}


function getCombinedPointCloudBounds(
  pointclouds
) {
  if (
    !Array.isArray(
      pointclouds
    ) ||
    pointclouds.length ===
    0
  ) {
    return null;
  }

  var combined =
    null;

  pointclouds.forEach(
    function (pointcloud) {
      var bounds =
        getPointCloudWorldBounds(
          pointcloud
        );

      if (
        !bounds
      ) {
        return;
      }

      if (
        !combined
      ) {
        combined = {
          min: {
            x:
              bounds.min.x,

            y:
              bounds.min.y,

            z:
              bounds.min.z
          },

          max: {
            x:
              bounds.max.x,

            y:
              bounds.max.y,

            z:
              bounds.max.z
          }
        };

        return;
      }

      combined.min.x =
        Math.min(
          combined.min.x,
          bounds.min.x
        );

      combined.min.y =
        Math.min(
          combined.min.y,
          bounds.min.y
        );

      combined.min.z =
        Math.min(
          combined.min.z,
          bounds.min.z
        );

      combined.max.x =
        Math.max(
          combined.max.x,
          bounds.max.x
        );

      combined.max.y =
        Math.max(
          combined.max.y,
          bounds.max.y
        );

      combined.max.z =
        Math.max(
          combined.max.z,
          bounds.max.z
        );
    }
  );

  return combined;
}


function setOrbitCenter(
  center
) {
  if (
    !viewer ||
    !viewer.scene ||
    !center
  ) {
    return;
  }

  var view =
    viewer.scene.view;

  var controls =
    viewer.orbitControls ||
    viewer.controls ||
    null;

  if (
    view
  ) {
    if (
      typeof view.setPivot ===
      "function"
    ) {
      view.setPivot(
        center
      );
    }

    if (
      view.pivot &&
      typeof view.pivot.copy ===
      "function"
    ) {
      view.pivot.copy(
        center
      );
    }

    if (
      view.target &&
      typeof view.target.copy ===
      "function"
    ) {
      view.target.copy(
        center
      );
    }
  }

  if (
    controls
  ) {
    if (
      typeof controls.setPivot ===
      "function"
    ) {
      controls.setPivot(
        center
      );
    }

    if (
      controls.pivot &&
      typeof controls.pivot.copy ===
      "function"
    ) {
      controls.pivot.copy(
        center
      );
    }

    if (
      controls.target &&
      typeof controls.target.copy ===
      "function"
    ) {
      controls.target.copy(
        center
      );
    }
  }
}


function getViewDirection(
  view,
  center
) {
  var direction =
    null;

  if (
    view &&
    view.direction &&
    typeof view.direction.clone ===
    "function"
  ) {
    direction =
      view.direction.clone();
  }

  if (
    !direction &&
    view &&
    typeof view.getDirection ===
    "function"
  ) {
    direction =
      view.getDirection();

    if (
      direction &&
      typeof direction.clone ===
      "function"
    ) {
      direction =
        direction.clone();
    }
  }

  if (
    !direction &&
    view &&
    view.position &&
    center &&
    typeof center.clone ===
    "function"
  ) {
    direction =
      center.clone()
        .sub(
          view.position
        );
  }

  if (
    !direction ||
    typeof direction.normalize !==
    "function" ||
    direction.lengthSq() <
    0.000001
  ) {
    if (
      view &&
      view.position &&
      typeof view.position.clone ===
      "function"
    ) {
      direction =
        view.position.clone();

      direction.set(
        0,
        -1,
        -0.5
      );
    }
  }

  if (
    direction &&
    typeof direction.normalize ===
    "function"
  ) {
    direction.normalize();
  }

  return direction;
}

function fitBounds(
  bounds,
  fitFactor,
  statusMessage
) {
  if (
    !viewer ||
    !viewer.scene ||
    !bounds ||
    !bounds.min ||
    !bounds.max
  ) {
    return false;
  }

  var view =
    viewer.scene.view;

  if (
    !view ||
    !view.position ||
    typeof view.position.clone !==
    "function"
  ) {
    return false;
  }

  /*
    Use Potree's own Vector3 class.
  */
  var min =
    view.position.clone();

  min.set(
    Number(
      bounds.min.x
    ),
    Number(
      bounds.min.y
    ),
    Number(
      bounds.min.z
    )
  );

  var max =
    view.position.clone();

  max.set(
    Number(
      bounds.max.x
    ),
    Number(
      bounds.max.y
    ),
    Number(
      bounds.max.z
    )
  );

  if (
    !isFinite(min.x) ||
    !isFinite(min.y) ||
    !isFinite(min.z) ||
    !isFinite(max.x) ||
    !isFinite(max.y) ||
    !isFinite(max.z)
  ) {
    return false;
  }

  /*
    Actual center of the scan bounds.
  */
  var center =
    min.clone()
      .add(
        max
      )
      .multiplyScalar(
        0.5
      );

  /*
    Size of the bounds.
  */
  var size =
    max.clone()
      .sub(
        min
      );

  var width =
    Math.abs(
      size.x
    );

  var height =
    Math.abs(
      size.y
    );

  var depth =
    Math.abs(
      size.z
    );

  if (
    !isFinite(width) ||
    width <= 0
  ) {
    width =
      1;
  }

  if (
    !isFinite(height) ||
    height <= 0
  ) {
    height =
      1;
  }

  if (
    !isFinite(depth) ||
    depth <= 0
  ) {
    depth =
      1;
  }

  /*
    Keep the current viewing direction.
  */
  var direction =
    null;

  if (
    view.direction &&
    typeof view.direction.clone ===
    "function"
  ) {
    direction =
      view.direction.clone();
  }

  if (
    !direction &&
    typeof view.getDirection ===
    "function"
  ) {
    direction =
      view.getDirection();

    if (
      direction &&
      typeof direction.clone ===
      "function"
    ) {
      direction =
        direction.clone();
    }
  }

  /*
    Fallback direction: from camera to scan center.
  */
  if (
    !direction &&
    typeof center.clone ===
    "function"
  ) {
    direction =
      center.clone()
        .sub(
          view.position
        );
  }

  /*
    Final fallback direction.
  */
  if (
    !direction ||
    typeof direction.normalize !==
    "function"
  ) {
    direction =
      view.position.clone();

    direction.set(
      0,
      -1,
      -0.5
    );
  }

  if (
    typeof direction.lengthSq ===
    "function" &&
    direction.lengthSq() <
    0.000001
  ) {
    direction.set(
      0,
      -1,
      -0.5
    );
  }

  direction.normalize();

  /*
    Camera field of view.
  */
  var fov =
    60;

  if (
    typeof viewer.getFOV ===
    "function"
  ) {
    fov =
      Number(
        viewer.getFOV()
      );
  }

  if (
    !isFinite(fov) ||
    fov <= 0
  ) {
    fov =
      60;
  }

  var verticalFov =
    fov *
    Math.PI /
    180;

  /*
    Renderer aspect ratio.
  */
  var aspect =
    1;

  if (
    viewer.renderer &&
    viewer.renderer.domElement
  ) {
    var canvas =
      viewer.renderer.domElement;

    var canvasWidth =
      canvas.clientWidth ||
      canvas.width ||
      1;

    var canvasHeight =
      canvas.clientHeight ||
      canvas.height ||
      1;

    aspect =
      canvasWidth /
      Math.max(
        canvasHeight,
        1
      );
  }

  if (
    !isFinite(aspect) ||
    aspect <= 0
  ) {
    aspect =
      1;
  }

  var horizontalFov =
    2 *
    Math.atan(
      Math.tan(
        verticalFov /
        2
      ) *
      aspect
    );

  var limitingFov =
    Math.min(
      verticalFov,
      horizontalFov
    );

  /*
    Bounding-sphere radius.
  */
  var radius =
    Math.sqrt(
      width *
      width +
      height *
      height +
      depth *
      depth
    ) /
    2;

  if (
    !isFinite(radius) ||
    radius <= 0
  ) {
    radius =
      1;
  }

  /*
    Fit factor.

    Larger values move the camera closer.
    Values such as 0.9, 0.97 and 0.998
    are all accepted.
  */
  var safeFitFactor =
    Number(
      fitFactor
    );

  if (
    !isFinite(safeFitFactor) ||
    safeFitFactor <= 0
  ) {
    safeFitFactor =
      0.9;
  }

  /*
    Base camera distance.
  */
  var baseDistance =
    radius /
    Math.sin(
      limitingFov /
      2
    );

  if (
    !isFinite(baseDistance) ||
    baseDistance <= 0
  ) {
    baseDistance =
      1;
  }

  /*
    Additional distance multiplier.

    1.00 = normal
    0.85 = closer
    0.70 = much closer
    1.20 = farther away
  */
  var distanceMultiplier =
    Number(
      CONFIG.fitDistanceMultiplier
    );

  if (
    !isFinite(distanceMultiplier) ||
    distanceMultiplier <= 0
  ) {
    distanceMultiplier =
      1;
  }

  var distance =
    baseDistance /
    safeFitFactor;

  distance *=
    distanceMultiplier;

  /*
    Prevent an invalid or extremely small distance.
  */
  var largestSize =
    Math.max(
      width,
      height,
      depth
    );

  var minimumDistance =
    Math.max(
      largestSize *
      0.001,
      0.001
    );

  distance =
    Math.max(
      distance,
      minimumDistance
    );

  /*
    Target center used for looking at the model.

    Z is treated as the vertical axis.
    Negative values move the target slightly
    downward, which makes the model appear
    higher in the viewport.
  */
  var targetCenter =
    center.clone();

  var verticalOffset =
    Number(
      CONFIG.fitVerticalOffset
    );

  if (
    !isFinite(verticalOffset)
  ) {
    verticalOffset =
      0;
  }

  targetCenter.z +=
    depth *
    verticalOffset;

  /*
    Position the camera.
  */
  var cameraPosition =
    targetCenter.clone()
      .sub(
        direction.clone()
          .multiplyScalar(
            distance
          )
      );

  view.position.copy(
    cameraPosition
  );

  /*
    Look at the adjusted target center.
  */
  if (
    typeof view.lookAt ===
    "function"
  ) {
    view.lookAt(
      targetCenter
    );
  }

  view.radius =
    distance;

  /*
    Keep the actual scan center as
    the orbit rotation center.
  */
  if (
    typeof setOrbitCenter ===
    "function"
  ) {
    setOrbitCenter(
      center
    );
  }

  if (
    viewer.scene &&
    typeof viewer.scene.getActiveCamera ===
    "function"
  ) {
    var camera =
      viewer.scene.getActiveCamera();

    if (
      camera &&
      typeof camera.updateProjectionMatrix ===
      "function"
    ) {
      camera.updateProjectionMatrix();
    }
  }

  if (
    statusMessage
  ) {
    setStatus(
      statusMessage,
      "idle"
    );
  }

  return true;
}

function fitUsingPotree(
  cloudsToFit,
  centerBounds,
  statusMessage
) {
  if (
    !viewer ||
    !viewer.scene ||
    typeof viewer.fitToScreen !==
    "function"
  ) {
    return false;
  }

  var allClouds =
    viewer.scene.pointclouds ||
    [];

  var previousVisibility =
    [];

  allClouds.forEach(
    function (cloud) {
      previousVisibility.push({
        cloud:
          cloud,

        visible:
          cloud.visible !==
          false
      });

      cloud.visible =
        cloudsToFit.indexOf(
          cloud
        ) !==
        -1;
    }
  );

  try {
    viewer.fitToScreen(
      0.9
    );
  } finally {
    previousVisibility.forEach(
      function (item) {
        item.cloud.visible =
          item.visible;
      }
    );
  }

  if (
    centerBounds &&
    viewer.scene.view &&
    viewer.scene.view.position
  ) {
    var center =
      viewer.scene.view.position.clone();

    center.set(
      (
        centerBounds.min.x +
        centerBounds.max.x
      ) /
      2,

      (
        centerBounds.min.y +
        centerBounds.max.y
      ) /
      2,

      (
        centerBounds.min.z +
        centerBounds.max.z
      ) /
      2
    );

    setOrbitCenter(
      center
    );
  }

  if (
    statusMessage
  ) {
    setStatus(
      statusMessage,
      "idle"
    );
  }

  return true;
}


function fitActiveScan() {
  if (
    !viewer ||
    !viewer.scene ||
    !state.activeCloud
  ) {
    setStatus(
      "Select a scan first.",
      "error"
    );

    return;
  }

  /*
    Fit the active scan even if it is hidden.
  */
  var bounds =
    getPointCloudWorldBounds(
      state.activeCloud
    ) ||
    state.activeBounds;

  if (
    bounds &&
    fitBounds(
      bounds,
      CONFIG.fitFactor,
      "Focused on " +
      (
        state.activeScan
          ? state.activeScan.name
          : "active scan"
      )
    )
  ) {
    return;
  }

  /*
    Fallback for Potree versions where the
    bounds are not exposed directly.
  */
  fitUsingPotree(
    [
      state.activeCloud
    ],
    bounds,
    "Focused on " +
    (
      state.activeScan
        ? state.activeScan.name
        : "active scan"
    )
  );
}


function fitAllScans() {
  if (
    !viewer ||
    !viewer.scene
  ) {
    setStatus(
      "Potree scene is unavailable.",
      "error"
    );

    return;
  }

  var pointclouds =
    viewer.scene.pointclouds ||
    [];

  var visibleClouds =
    pointclouds.filter(
      function (cloud) {
        return (
          cloud &&
          cloud.visible !==
          false
        );
      }
    );

  if (
    visibleClouds.length ===
    0
  ) {
    setStatus(
      "No visible scans.",
      "error"
    );

    return;
  }

  var bounds =
    getCombinedPointCloudBounds(
      visibleClouds
    );

  var allBoundsAvailable =
    visibleClouds.every(
      function (cloud) {
        return Boolean(
          getPointCloudWorldBounds(
            cloud
          )
        );
      }
    );

  if (
    allBoundsAvailable &&
    bounds &&
    fitBounds(
      bounds,
      CONFIG.fitFactor,
      "Focused on all visible scans."
    )
  ) {
    return;
  }

  fitUsingPotree(
    visibleClouds,
    bounds,
    "Focused on all visible scans."
  );
}


function resetView() {
  fitAllScans();
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

  // 1. Passwort-Abfrage über ein Browser-Popup
  var password = prompt("ENTER PASSWORD");

  // 2. Überprüfung: Wenn abgebrochen wurde oder das Passwort falsch ist
  if (password === null) {
    return; // Nutzer hat auf "Abbrechen" geklickt
  }

  var configuredPassword =
    String(
      CONFIG.downloadPassword ||
      ""
    );

  if (
    !configuredPassword ||
    password !== configuredPassword
  ) {
    setStatus(
      "Falsches Passwort!",
      "error"
    );
    return; // Funktion abbrechen
  }

  // 3. Download-Logik (wird nur ausgeführt, wenn das Passwort erfüllt ist)
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
  height,
  scale
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

  var safeScale =
    Number(
      scale
    );

  if (
    !isFinite(
      safeScale
    ) ||
    safeScale <= 0
  ) {
    safeScale =
      1;
  }

  return (
    name +
    "_" +
    safeScale +
    "x_" +
    width +
    "x" +
    height +
    ".png"
  );
}

function getScreenshotScale() {
  var select =
    getElement(
      "screenshotScale"
    );

  var value =
    select
      ? Number(
          select.value
        )
      : Number(
          CONFIG.screenshotScale
        );

  if (
    value !== 1 &&
    value !== 2 &&
    value !== 3 &&
    value !== 4 &&
    value !== 5
  ) {
    value =
      Number(
        CONFIG.screenshotScale
      );

    if (
      value !== 1 &&
      value !== 2 &&
      value !== 3 &&
      value !== 4 &&
      value !== 5
    ) {
      value =
        3;
    }
  }

  return value;
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
    getScreenshotScale();

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
    targetHeight,
    screenshotScale
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
/* DESCRIPTION DIALOG                                                         */
/* -------------------------------------------------------------------------- */

function openDescriptionDialog() {
  var dialog =
    getElement("descriptionDialog");

  if (!dialog) {
    return;
  }

  if (typeof dialog.showModal === "function") {
    if (!dialog.open) {
      dialog.showModal();
    }

    return;
  }

  /*
    Fallback for browsers without dialog.showModal().
  */
  dialog.setAttribute("open", "");
}

function closeDescriptionDialog() {
  var dialog =
    getElement("descriptionDialog");

  if (!dialog) {
    return;
  }

  if (
    typeof dialog.close === "function" &&
    dialog.open
  ) {
    dialog.close();
    return;
  }

  dialog.removeAttribute("open");
}

function bindDescriptionDialog() {
  var dialog =
    getElement("descriptionDialog");

  var openButton =
    getElement("OpenDescription");

  var closeButton =
    getElement("closeDescription");

  if (!dialog) {
    console.warn("descriptionDialog was not found.");
    return;
  }

  if (openButton) {
    openButton.addEventListener(
      "click",
      function () {
        openDescriptionDialog();
      }
    );
  } else {
    console.warn("OpenDescription button was not found.");
  }

  if (closeButton) {
    closeButton.addEventListener(
      "click",
      function () {
        closeDescriptionDialog();
      }
    );
  }

  /*
    Close when clicking the dialog backdrop.
  */
  dialog.addEventListener(
    "click",
    function (event) {
      if (event.target === dialog) {
        closeDescriptionDialog();
      }
    }
  );

  /*
    Allow closing with the Escape key.
  */
  dialog.addEventListener(
    "cancel",
    function () {
      closeDescriptionDialog();
    }
  );
}

/* -------------------------------------------------------------------------- */
/* EVENTS                                                                     */
/* -------------------------------------------------------------------------- */


function bindEvents() {
  bindDropdown(
  "toggleLibrary",
  "libraryDropdownContent"
);

bindDropdown(
  "toggleInspector",
  "inspectorDropdownContent"
);

window.addEventListener(
  "resize",
  updatePanelLayout
);

window.setTimeout(
  updatePanelLayout,
  0
);

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
  "pointDisplayMode",
  "click",
  togglePointDisplayMode
);

  addEvent(
    "resetView",
    "click",
    fitAllScans
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


bindDescriptionDialog();
