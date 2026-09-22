(function () {
  "use strict";

  var MAX_FILE_SIZE = 95 * 1024 * 1024;

  var state = {
    viewer: null,
    scans: [],
    activeScan: null,
    pointcloud: null,
    loadToken: 0
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function on(id, eventName, handler) {
    var element = byId(id);

    if (element) {
      element.addEventListener(
        eventName,
        handler
      );
    }
  }

  /* ------------------------------------------------------------------------ */
  /* INITIALIZATION                                                           */
  /* ------------------------------------------------------------------------ */

  function initialize() {
    setupPanelDropdowns();
    setupUpload();
    setupSearch();
    setupViewerControls();
    setupInspectorControls();
    setupViewer();

    on(
      "refreshLibrary",
      "click",
      function () {
        loadCatalog();
      }
    );

    window.addEventListener(
      "resize",
      function () {
        if (
          state.viewer &&
          typeof state.viewer.onWindowResize ===
            "function"
        ) {
          state.viewer.onWindowResize();
        }
      }
    );

    loadCatalog();
  }

  /* ------------------------------------------------------------------------ */
  /* STATUS                                                                   */
  /* ------------------------------------------------------------------------ */

  function setStatus(message, type) {
    var statusMessage = byId("statusMessage");
    var viewerStatus = byId("viewerStatus");
    var viewerStatusDot = byId(
      "viewerStatusDot"
    );

    type = type || "idle";

    if (statusMessage) {
      statusMessage.textContent = message;
    }

    if (viewerStatus) {
      viewerStatus.textContent = message;
    }

    if (viewerStatusDot) {
      viewerStatusDot.className =
        "status-dot status-" + type;
    }
  }

  function setLoading(visible, message) {
    var overlay = byId("loadingOverlay");
    var loadingMessage = byId(
      "loadingMessage"
    );

    if (loadingMessage && message) {
      loadingMessage.textContent = message;
    }

    if (overlay) {
      overlay.hidden = !visible;
    }
  }

  function setUploadMessage(message) {
    var uploadMessage = byId(
      "uploadMessage"
    );

    if (uploadMessage) {
      uploadMessage.textContent = message;
    }
  }

  /* ------------------------------------------------------------------------ */
  /* PANEL DROPDOWNS                                                          */
  /* ------------------------------------------------------------------------ */

  function createPanelBody(panel, bodyId) {
    var existingBody = byId(bodyId);

    if (existingBody) {
      return existingBody;
    }

    var header = panel.querySelector(
      ".panel-header"
    );

    var body = document.createElement("div");

    body.id = bodyId;
    body.className = "panel-body";

    var children = [];

    for (var i = 0; i < panel.children.length; i += 1) {
      children.push(panel.children[i]);
    }

    for (var j = 0; j < children.length; j += 1) {
      if (children[j] !== header) {
        body.appendChild(children[j]);
      }
    }

    panel.appendChild(body);

    return body;
  }

  function createPanelToggle(
    panel,
    name,
    bodyId
  ) {
    var header = panel.querySelector(
      ".panel-header"
    );

    if (!header) {
      return null;
    }

    var selector =
      '[data-panel-toggle="' +
      name +
      '"]';

    var existingButton =
      header.querySelector(selector);

    if (existingButton) {
      return existingButton;
    }

    var actions = header.querySelector(
      ".panel-actions"
    );

    if (!actions) {
      actions = document.createElement("div");
      actions.className = "panel-actions";

      var buttonsToMove = [];

      for (var i = 0; i < header.children.length; i += 1) {
        var child = header.children[i];

        if (
          child.tagName &&
          child.tagName.toLowerCase() ===
            "button"
        ) {
          buttonsToMove.push(child);
        }
      }

      header.appendChild(actions);

      for (
        var j = 0;
        j < buttonsToMove.length;
        j += 1
      ) {
        actions.appendChild(
          buttonsToMove[j]
        );
      }
    }

    var button = document.createElement(
      "button"
    );

    button.type = "button";
    button.className = "panel-toggle";
    button.textContent = "▴";
    button.title = "Collapse " + name;
    button.setAttribute(
      "aria-expanded",
      "true"
    );
    button.setAttribute(
      "aria-controls",
      bodyId
    );
    button.setAttribute(
      "data-panel-toggle",
      name
    );

    actions.appendChild(button);

    return button;
  }

  function setupPanelDropdowns() {
    var workspace = document.querySelector(
      ".workspace"
    );

    var configurations = [
      {
        name: "library",
        panelId: "libraryPanel",
        bodyId: "libraryPanelBody",
        storageKey: "libraryCollapsed"
      },
      {
        name: "inspector",
        panelId: "inspectorPanel",
        bodyId: "inspectorPanelBody",
        storageKey: "inspectorCollapsed"
      }
    ];

    for (
      var i = 0;
      i < configurations.length;
      i += 1
    ) {
      setupOnePanel(
        configurations[i],
        workspace
      );
    }
  }

  function setupOnePanel(
    configuration,
    workspace
  ) {
    var panel = byId(
      configuration.panelId
    );

    if (!panel) {
      return;
    }

    var body = createPanelBody(
      panel,
      configuration.bodyId
    );

    var toggle = createPanelToggle(
      panel,
      configuration.name,
      configuration.bodyId
    );

    if (!toggle) {
      return;
    }

    function setPanelState(
      collapsed,
      saveState
    ) {
      panel.classList.toggle(
        "is-collapsed",
        collapsed
      );

      body.hidden = collapsed;

      toggle.textContent = collapsed
        ? "▾"
        : "▴";

      toggle.title = collapsed
        ? "Expand " + configuration.name
        : "Collapse " + configuration.name;

      toggle.setAttribute(
        "aria-expanded",
        String(!collapsed)
      );

      if (
        configuration.name === "library" &&
        workspace
      ) {
        workspace.classList.toggle(
          "library-collapsed",
          collapsed
        );
      }

      if (saveState) {
        try {
          localStorage.setItem(
            configuration.storageKey,
            String(collapsed)
          );
        } catch (error) {
          console.log(
            "Could not save panel state."
          );
        }
      }
    }

    toggle.addEventListener(
      "click",
      function (event) {
        event.stopPropagation();

        var collapsed =
          !panel.classList.contains(
            "is-collapsed"
          );

        setPanelState(
          collapsed,
          true
        );
      }
    );

    var header = panel.querySelector(
      ".panel-header"
    );

    if (header) {
      header.addEventListener(
        "click",
        function (event) {
          var element = event.target;

          while (
            element &&
            element !== header
          ) {
            if (
              element.tagName &&
              element.tagName.toLowerCase() ===
                "button"
            ) {
              return;
            }

            element = element.parentNode;
          }

          var collapsed =
            !panel.classList.contains(
              "is-collapsed"
            );

          setPanelState(
            collapsed,
            true
          );
        }
      );
    }

    var savedState = null;

    try {
      savedState = localStorage.getItem(
        configuration.storageKey
      );
    } catch (error) {
      savedState = null;
    }

    setPanelState(
      savedState === "true",
      false
    );
  }

  /* ------------------------------------------------------------------------ */
  /* UPLOAD                                                                   */
  /* ------------------------------------------------------------------------ */

  function setupUpload() {
    var dropzone = byId(
      "uploadDropzone"
    );

    var uploadButton = byId(
      "uploadButton"
    );

    var fileInput = byId(
      "fileInput"
    );

    var trigger = dropzone || uploadButton;

    if (!trigger || !fileInput) {
      return;
    }

    trigger.addEventListener(
      "click",
      function () {
        fileInput.click();
      }
    );

    trigger.addEventListener(
      "keydown",
      function (event) {
        if (
          event.key === "Enter" ||
          event.key === " "
        ) {
          event.preventDefault();
          fileInput.click();
        }
      }
    );

    fileInput.addEventListener(
      "change",
      function () {
        uploadFiles(fileInput.files);
        fileInput.value = "";
      }
    );

    if (!dropzone) {
      return;
    }

    dropzone.addEventListener(
      "dragenter",
      handleDragEnter
    );

    dropzone.addEventListener(
      "dragover",
      handleDragEnter
    );

    dropzone.addEventListener(
      "dragleave",
      handleDragLeave
    );

    dropzone.addEventListener(
      "drop",
      function (event) {
        event.preventDefault();
        event.stopPropagation();

        dropzone.classList.remove(
          "is-dragging"
        );

        if (
          event.dataTransfer &&
          event.dataTransfer.files
        ) {
          uploadFiles(
            event.dataTransfer.files
          );
        }
      }
    );

    function handleDragEnter(event) {
      event.preventDefault();
      event.stopPropagation();

      dropzone.classList.add(
        "is-dragging"
      );
    }

    function handleDragLeave(event) {
      event.preventDefault();
      event.stopPropagation();

      dropzone.classList.remove(
        "is-dragging"
      );
    }
  }

  function uploadFiles(fileList) {
    var files = [];

    if (!fileList) {
      return;
    }

    for (var i = 0; i < fileList.length; i += 1) {
      files.push(fileList[i]);
    }

    if (files.length === 0) {
      return;
    }

    uploadFileAtIndex(files, 0);
  }

  function uploadFileAtIndex(files, index) {
    if (index >= files.length) {
      loadCatalog();
      return;
    }

    uploadFile(
      files[index],
      function () {
        uploadFileAtIndex(
          files,
          index + 1
        );
      }
    );
  }

  function uploadFile(file, finished) {
    var filename = String(
      file.name || ""
    );

    if (!/\.copc\.laz$/i.test(filename)) {
      setUploadMessage(
        filename +
          ": only .copc.laz files are accepted."
      );

      setStatus(
        "Invalid file type.",
        "error"
      );

      finished();
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setUploadMessage(
        filename +
          ": file is larger than 95 MiB."
      );

      setStatus(
        "File is too large.",
        "error"
      );

      finished();
      return;
    }

    var formData = new FormData();

    formData.append(
      "file",
      file,
      filename
    );

    setUploadMessage(
      "Uploading " + filename + "..."
    );

    setStatus(
      "Uploading " + filename + "...",
      "loading"
    );

    if (typeof window.fetch !== "function") {
      setStatus(
        "This browser does not support uploads.",
        "error"
      );

      finished();
      return;
    }

    fetch("/api/scans", {
      method: "POST",
      body: formData
    })
      .then(function (response) {
        return response.json().then(
          function (data) {
            if (!response.ok) {
              throw new Error(
                data.error ||
                  "Upload failed."
              );
            }

            return data;
          }
        );
      })
      .then(function (scan) {
        setUploadMessage(
          filename +
            " uploaded successfully."
        );

        setStatus(
          filename +
            " saved in /scans.",
          "idle"
        );

        if (scan) {
          state.activeScan =
            normalizeScan(scan);
        }

        finished();
      })
      .catch(function (error) {
        console.error(error);

        setUploadMessage(
          "Upload failed: " +
            error.message
        );

        setStatus(
          "Upload failed.",
          "error"
        );

        finished();
      });
  }

  /* ------------------------------------------------------------------------ */
  /* CATALOG                                                                  */
  /* ------------------------------------------------------------------------ */

  function loadCatalog() {
    setStatus(
      "Loading scan catalog...",
      "loading"
    );

    getJson(
      "/api/scans?_=" + Date.now()
    )
      .catch(function () {
        return getJson(
          "/catalog.json?_=" + Date.now()
        );
      })
      .then(function (data) {
        var rawScans = [];

        if (Array.isArray(data)) {
          rawScans = data;
        } else if (
          data &&
          Array.isArray(data.scans)
        ) {
          rawScans = data.scans;
        }

        state.scans = rawScans.map(
          normalizeScan
        );

        renderLibrary();

        if (state.scans.length === 0) {
          setStatus(
            "No scans found.",
            "idle"
          );
        } else {
          setStatus(
            state.scans.length +
              " scan" +
              (
                state.scans.length === 1
                  ? ""
                  : "s"
              ) +
              " available.",
            "idle"
          );
        }
      })
      .catch(function (error) {
        console.error(error);

        state.scans = [];
        renderLibrary();

        setStatus(
          "Could not load catalog.json.",
          "error"
        );
      });
  }

  function getJson(url) {
    return fetch(url, {
      cache: "no-store"
    }).then(function (response) {
      if (!response.ok) {
        throw new Error(
          "Request failed: " +
            response.status
        );
      }

      return response.json();
    });
  }

  function normalizeScan(scan) {
    var raw = scan || {};

    var filename =
      raw.filename ||
      raw.fileName ||
      raw.file ||
      "";

    if (!filename && raw.url) {
      filename = String(raw.url)
        .split("/")
        .pop();

      try {
        filename = decodeURIComponent(
          filename
        );
      } catch (error) {
        // Keep the original filename.
      }
    }

    var name =
      raw.name ||
      filename ||
      "Unnamed scan";

    name = String(name).replace(
      /\.copc\.laz$/i,
      ""
    );

    var url =
      raw.url ||
      raw.path ||
      "";

    if (!url && filename) {
      url =
        "/scans/" +
        encodeURIComponent(filename);
    }

    return {
      id: String(
        raw.id ||
          filename ||
          name
      ),

      name: name,

      filename: String(filename),

      url: url,

      size: raw.size || null,

      uploadedAt:
        raw.uploadedAt ||
        raw.createdAt ||
        null,

      points:
        raw.points !== undefined
          ? raw.points
          : raw.pointCount,

      crs:
        raw.crs ||
        raw.projection ||
        null,

      bounds:
        raw.bounds ||
        raw.boundingBox ||
        null
    };
  }

  /* ------------------------------------------------------------------------ */
  /* LIBRARY                                                                  */
  /* ------------------------------------------------------------------------ */

  function setupSearch() {
    on(
      "scanSearch",
      "input",
      function () {
        renderLibrary();
      }
    );
  }

  function renderLibrary() {
    var list = byId("libraryList");
    var empty = byId("libraryEmpty");
    var count = byId("scanCount");
    var search = byId("scanSearch");

    if (!list) {
      return;
    }

    var query = "";

    if (search) {
      query = String(
        search.value || ""
      )
        .trim()
        .toLowerCase();
    }

    var visibleScans =
      state.scans.filter(function (scan) {
        return (
          scan.name
            .toLowerCase()
            .indexOf(query) !== -1 ||
          scan.filename
            .toLowerCase()
            .indexOf(query) !== -1
        );
      });

    if (count) {
      count.textContent =
        state.scans.length +
        " scan" +
        (
          state.scans.length === 1
            ? ""
            : "s"
        );
    }

    while (list.firstChild) {
      list.removeChild(list.firstChild);
    }

    if (visibleScans.length === 0) {
      if (empty) {
        empty.hidden = false;
        empty.classList.remove(
          "hidden"
        );

        var title =
          empty.querySelector("strong");

        var description =
          empty.querySelector("span");

        if (state.scans.length === 0) {
          if (title) {
            title.textContent =
              "No scans found";
          }

          if (description) {
            description.textContent =
              "Administrator uploads will appear here permanently.";
          }
        } else {
          if (title) {
            title.textContent =
              "No matching scans";
          }

          if (description) {
            description.textContent =
              "Try another search term.";
          }
        }
      }

      return;
    }

    if (empty) {
      empty.hidden = true;
      empty.classList.add("hidden");
    }

    visibleScans.forEach(function (scan) {
      var card = document.createElement(
        "button"
      );

      card.type = "button";
      card.className = "scan-card";

      if (
        state.activeScan &&
        state.activeScan.id === scan.id
      ) {
        card.classList.add("active");
      }

      var header = document.createElement(
        "span"
      );

      header.className =
        "scan-card-header";

      var icon = document.createElement(
        "span"
      );

      icon.className = "scan-icon";
      icon.textContent = "◇";

      var name = document.createElement(
        "span"
      );

      name.className = "scan-name";
      name.textContent = scan.name;

      var stateDot = document.createElement(
        "span"
      );

      stateDot.className = "scan-state";

      if (
        state.activeScan &&
        state.activeScan.id === scan.id
      ) {
        stateDot.classList.add(
          "loaded"
        );
      }

      header.appendChild(icon);
      header.appendChild(name);
      header.appendChild(stateDot);

      var meta = document.createElement(
        "span"
      );

      meta.className = "scan-meta";

      var size = document.createElement(
        "span"
      );

      size.textContent = formatBytes(
        scan.size
      );

      var date = document.createElement(
        "span"
      );

      date.textContent = formatDate(
        scan.uploadedAt
      );

      meta.appendChild(size);
      meta.appendChild(date);

      card.appendChild(header);
      card.appendChild(meta);

      card.addEventListener(
        "click",
        function () {
          loadScan(scan);
        }
      );

      list.appendChild(card);
    });
  }

  /* ------------------------------------------------------------------------ */
  /* POTREE VIEWER                                                            */
  /* ------------------------------------------------------------------------ */

  function setupViewer() {
    var renderArea = byId(
      "potree_render_area"
    );

    if (!renderArea) {
      return;
    }

    if (
      typeof window.Potree ===
        "undefined" ||
      typeof window.Potree.Viewer !==
        "function"
    ) {
      setStatus(
        "Potree could not be initialized.",
        "error"
      );

      return;
    }

    try {
      state.viewer =
        new window.Potree.Viewer(
          renderArea
        );

      if (
        typeof state.viewer.setEDLEnabled ===
        "function"
      ) {
        state.viewer.setEDLEnabled(true);
      }

      if (
        typeof state.viewer.setFOV ===
        "function"
      ) {
        state.viewer.setFOV(60);
      }

      if (
        typeof state.viewer.setPointBudget ===
        "function"
      ) {
        state.viewer.setPointBudget(
          3000000
        );
      }

      if (
        typeof state.viewer.setBackground ===
        "function"
      ) {
        state.viewer.setBackground(
          "black"
        );
      }

      setStatus(
        "Viewer ready.",
        "idle"
      );
    } catch (error) {
      console.error(error);

      setStatus(
        "Could not initialize Potree.",
        "error"
      );
    }
  }

  function loadScan(scan) {
    if (!scan) {
      return;
    }

    state.activeScan = scan;

    renderLibrary();
    updateInspector(scan);

    if (!state.viewer) {
      setStatus(
        "Scan selected. Viewer unavailable.",
        "error"
      );

      return;
    }

    if (!scan.url) {
      setStatus(
        "The selected scan has no file URL.",
        "error"
      );

      return;
    }

    state.loadToken += 1;

    var currentToken = state.loadToken;

    removeCurrentPointcloud();

    setLoading(
      true,
      "Loading " + scan.name + "..."
    );

    setStatus(
      "Loading " + scan.name + "...",
      "loading"
    );

    loadPointcloud(
      scan,
      function (error, pointcloud) {
        if (
          currentToken !== state.loadToken
        ) {
          return;
        }

        if (error) {
          console.error(error);

          setLoading(false);

          setStatus(
            "Could not load " +
              scan.name +
              ".",
            "error"
          );

          return;
        }

        state.pointcloud = pointcloud;

        state.viewer.scene.addPointCloud(
          pointcloud
        );

        applyAppearance();
        updateInspector(
          scan,
          pointcloud
        );

        setLoading(false);

        setStatus(
          scan.name + " loaded.",
          "idle"
        );

        window.setTimeout(
          function () {
            fitView();
          },
          100
        );

        renderLibrary();
      }
    );
  }

  function loadPointcloud(scan, callback) {
    if (
      typeof window.Potree ===
        "undefined" ||
      typeof window.Potree.loadPointCloud !==
        "function"
    ) {
      callback(
        new Error(
          "Potree.loadPointCloud is unavailable."
        ),
        null
      );

      return;
    }

    var finished = false;

    function finish(error, pointcloud) {
      if (finished) {
        return;
      }

      finished = true;
      callback(error, pointcloud);
    }

    try {
      window.Potree.loadPointCloud(
        scan.url,
        scan.name,
        function (event) {
          if (
            event &&
            event.pointcloud
          ) {
            finish(
              null,
              event.pointcloud
            );

            return;
          }

          if (
            event &&
            (
              event.type ===
                "loading_failed" ||
              event.type === "error"
            )
          ) {
            finish(
              new Error(
                event.message ||
                  "Point cloud loading failed."
              ),
              null
            );
          }
        }
      );
    } catch (error) {
      finish(error, null);
    }
  }

  function removeCurrentPointcloud() {
    if (
      state.pointcloud &&
      state.viewer &&
      state.viewer.scene &&
      typeof state.viewer.scene
        .removePointCloud === "function"
    ) {
      state.viewer.scene.removePointCloud(
        state.pointcloud
      );
    }

    state.pointcloud = null;
  }

  function fitView() {
    if (
      !state.viewer ||
      !state.pointcloud
    ) {
      return;
    }

    if (
      typeof state.viewer.fitToScreen ===
      "function"
    ) {
      state.viewer.fitToScreen();
      return;
    }

    if (
      state.viewer.scene &&
      state.viewer.scene.view &&
      typeof state.viewer.scene.view
        .fitToScreen === "function"
    ) {
      state.viewer.scene.view.fitToScreen();
    }
  }

  /* ------------------------------------------------------------------------ */
  /* VIEWER CONTROLS                                                          */
  /* ------------------------------------------------------------------------ */

  function setupViewerControls() {
    on(
      "fitView",
      "click",
      function () {
        fitView();
      }
    );

    on(
      "resetView",
      "click",
      function () {
        fitView();
      }
    );

    on(
      "orbitMode",
      "click",
      function () {
        if (
          !state.viewer ||
          !window.Potree
        ) {
          return;
        }

        if (
          typeof state.viewer
            .setNavigationMode ===
            "function" &&
          window.Potree.NavigationMode &&
          window.Potree.NavigationMode.ORBIT
        ) {
          state.viewer.setNavigationMode(
            window.Potree.NavigationMode.ORBIT
          );
        }

        var orbitButton = byId(
          "orbitMode"
        );

        if (orbitButton) {
          orbitButton.classList.add(
            "active"
          );
        }

        setStatus(
          "Orbit navigation enabled.",
          "idle"
        );
      }
    );

    on(
      "downloadScan",
      "click",
      function () {
        if (
          !state.activeScan ||
          !state.activeScan.url
        ) {
          return;
        }

        var link = document.createElement(
          "a"
        );

        link.href =
          state.activeScan.url;

        link.download =
          state.activeScan.filename ||
          state.activeScan.name +
            ".copc.laz";

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    );
  }

  /* ------------------------------------------------------------------------ */
  /* INSPECTOR CONTROLS                                                       */
  /* ------------------------------------------------------------------------ */

  function setupInspectorControls() {
    on(
      "pointSize",
      "input",
      function () {
        var input = byId("pointSize");
        var output = byId(
          "pointSizeValue"
        );

        if (output) {
          output.textContent =
            Number(input.value).toFixed(1);
        }

        applyAppearance();
      }
    );

    on(
      "pointOpacity",
      "input",
      function () {
        var input = byId(
          "pointOpacity"
        );

        var output = byId(
          "pointOpacityValue"
        );

        if (output) {
          output.textContent =
            Math.round(
              Number(input.value) * 100
            ) + "%";
        }

        applyAppearance();
      }
    );

    on(
      "pointBudget",
      "input",
      function () {
        var input = byId(
          "pointBudget"
        );

        var output = byId(
          "pointBudgetValue"
        );

        if (output) {
          output.textContent =
            formatPointBudget(
              Number(input.value)
            );
        }

        applyAppearance();
      }
    );

    on(
      "colorMode",
      "change",
      function () {
        applyAppearance();
      }
    );

    on(
      "sectionMode",
      "change",
      function () {
        updateSectionControls();
      }
    );

    on(
      "sectionPosition",
      "input",
      function () {
        var input = byId(
          "sectionPosition"
        );

        var output = byId(
          "sectionPositionValue"
        );

        if (output) {
          output.textContent =
            Number(input.value).toFixed(2);
        }
      }
    );

    on(
      "sectionThickness",
      "input",
      function () {
        var input = byId(
          "sectionThickness"
        );

        var output = byId(
          "sectionThicknessValue"
        );

        if (output) {
          output.textContent =
            Number(input.value).toFixed(3);
        }
      }
    );

    on(
      "applySection",
      "click",
      function () {
        setStatus(
          "Section settings updated.",
          "idle"
        );
      }
    );

    on(
      "clearSection",
      "click",
      function () {
        var mode = byId(
          "sectionMode"
        );

        if (mode) {
          mode.value = "none";
        }

        updateSectionControls();

        setStatus(
          "Section cleared.",
          "idle"
        );
      }
    );

    updateSectionControls();
  }

  function updateSectionControls() {
    var mode = byId("sectionMode");

    if (!mode) {
      return;
    }

    var selectedMode = mode.value;
    var hasSection =
      selectedMode !== "none";

    var axisWrapper = byId(
      "sectionAxisWrapper"
    );

    var position = byId(
      "sectionPosition"
    );

    var thickness = byId(
      "sectionThickness"
    );

    if (axisWrapper) {
      axisWrapper.classList.toggle(
        "hidden",
        selectedMode !== "vertical"
      );
    }

    if (position) {
      position.disabled = !hasSection;
    }

    if (thickness) {
      thickness.disabled = !hasSection;
    }

    var positionOutput = byId(
      "sectionPositionValue"
    );

    var thicknessOutput = byId(
      "sectionThicknessValue"
    );

    if (positionOutput) {
      positionOutput.textContent =
        hasSection && position
          ? Number(position.value).toFixed(2)
          : "—";
    }

    if (thicknessOutput) {
      thicknessOutput.textContent =
        hasSection && thickness
          ? Number(thickness.value).toFixed(3)
          : "—";
    }
  }

  function applyAppearance() {
    if (
      !state.viewer ||
      !state.pointcloud
    ) {
      return;
    }

    var material =
      state.pointcloud.material;

    if (!material) {
      return;
    }

    var colorMode = byId(
      "colorMode"
    );

    var pointSize = byId(
      "pointSize"
    );

    var pointOpacity = byId(
      "pointOpacity"
    );

    var pointBudget = byId(
      "pointBudget"
    );

    if (
      colorMode &&
      window.Potree &&
      window.Potree.PointColorType &&
      window.Potree.PointColorType[
        colorMode.value
      ] !== undefined
    ) {
      material.pointColorType =
        window.Potree.PointColorType[
          colorMode.value
        ];
    }

    if (pointSize) {
      material.size = Number(
        pointSize.value
      );
    }

    if (pointOpacity) {
      material.opacity = Number(
        pointOpacity.value
      );
    }

    material.needsUpdate = true;

    if (
      pointBudget &&
      typeof state.viewer
        .setPointBudget === "function"
    ) {
      state.viewer.setPointBudget(
        Number(pointBudget.value)
      );
    }
  }

  function updateInspector(
    scan,
    pointcloud
  ) {
    var empty = byId(
      "inspectorEmpty"
    );

    var content = byId(
      "inspectorContent"
    );

    var download = byId(
      "downloadScan"
    );

    if (empty) {
      empty.hidden = true;
      empty.classList.add("hidden");
    }

    if (content) {
      content.hidden = false;
      content.classList.remove(
        "hidden"
      );
    }

    if (download) {
      download.disabled = !(
        scan && scan.url
      );
    }

    var name = byId(
      "activeScanName"
    );

    if (name) {
      name.textContent =
        scan && scan.name
          ? scan.name
          : "Scan";
    }

    var points = byId(
      "activePointCount"
    );

    if (points) {
      if (
        scan &&
        scan.points !== null &&
        scan.points !== undefined
      ) {
        points.textContent =
          formatNumber(scan.points);
      } else {
        points.textContent = "—";
      }
    }

    var fileSize = byId(
      "activeFileSize"
    );

    if (fileSize) {
      fileSize.textContent =
        formatBytes(
          scan && scan.size
        );
    }

    var crs = byId(
      "activeCrs"
    );

    if (crs) {
      crs.textContent =
        scan && scan.crs
          ? scan.crs
          : "—";
    }

    updateBounds(
      scan,
      pointcloud
    );
  }

  function updateBounds(
    scan,
    pointcloud
  ) {
    var bounds = null;

    if (scan && scan.bounds) {
      bounds = scan.bounds;
    } else if (
      pointcloud &&
      pointcloud.boundingBox
    ) {
      bounds = pointcloud.boundingBox;
    } else if (
      pointcloud &&
      pointcloud.pcoGeometry &&
      pointcloud.pcoGeometry
        .tightBoundingBox
    ) {
      bounds =
        pointcloud.pcoGeometry
          .tightBoundingBox;
    }

    var boundsX = byId("boundsX");
    var boundsY = byId("boundsY");
    var boundsZ = byId("boundsZ");

    if (
      !bounds ||
      !bounds.min ||
      !bounds.max
    ) {
      if (boundsX) {
        boundsX.textContent = "—";
      }

      if (boundsY) {
        boundsY.textContent = "—";
      }

      if (boundsZ) {
        boundsZ.textContent = "—";
      }

      return;
    }

    if (boundsX) {
      boundsX.textContent =
        formatNumber(bounds.min.x) +
        " – " +
        formatNumber(bounds.max.x);
    }

    if (boundsY) {
      boundsY.textContent =
        formatNumber(bounds.min.y) +
        " – " +
        formatNumber(bounds.max.y);
    }

    if (boundsZ) {
      boundsZ.textContent =
        formatNumber(bounds.min.z) +
        " – " +
        formatNumber(bounds.max.z);
    }
  }

  /* ------------------------------------------------------------------------ */
  /* FORMATTING                                                               */
  /* ------------------------------------------------------------------------ */

  function formatBytes(value) {
    var bytes = Number(value);

    if (
      !isFinite(bytes) ||
      bytes <= 0
    ) {
      return "—";
    }

    var units = [
      "B",
      "KiB",
      "MiB",
      "GiB"
    ];

    var size = bytes;
    var unitIndex = 0;

    while (
      size >= 1024 &&
      unitIndex < units.length - 1
    ) {
      size = size / 1024;
      unitIndex += 1;
    }

    return (
      size.toFixed(
        unitIndex === 0 ? 0 : 1
      ) +
      " " +
      units[unitIndex]
    );
  }

  function formatNumber(value) {
    var number = Number(value);

    if (!isFinite(number)) {
      return "—";
    }

    if (
      window.Intl &&
      window.Intl.NumberFormat
    ) {
      return new Intl.NumberFormat(
        "en-US",
        {
          maximumFractionDigits: 2
        }
      ).format(number);
    }

    return String(number);
  }

  function formatPointBudget(value) {
    if (!isFinite(value)) {
      return "—";
    }

    if (value >= 1000000) {
      return (
        (value / 1000000).toFixed(1) +
        "M"
      );
    }

    return (
      Math.round(value / 1000) +
      "K"
    );
  }

  function formatDate(value) {
    if (!value) {
      return "";
    }

    var date = new Date(value);

    if (isNaN(date.getTime())) {
      return "";
    }

    return date.toLocaleDateString();
  }

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      initialize
    );
  } else {
    initialize();
  }
})();
