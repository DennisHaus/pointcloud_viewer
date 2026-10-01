window.LOCATION_CONFIG = {
  pageTitle: "Spatial Library Brinzauls",

  metaDescription:
    "Cloud optimized point cloud viewer for Brienz/Brinzauls scans.",

  brandEyebrow:
    "© ETH ZURICH",

  brandTitle: `
    SPATIAL<br>
    LIBRARY<br>
    BRINZAULS-qq
  `,

  brandSubtitle: `
    copc viewer & point cloud model interface | for collecting, storing and
    visualizing spatial recordings and spatial visions of Brienz/Brinzauls
    during the Seminarweek 2026 |
    beta version
    <br><br>
    developed at Professur Voser, Institute for Landscape and Urban Studies,
    ETH Zürich | assisted by AI gpt 5.6
    <a
      class="subtitle-link"
      href="https://kyotodesignlab.github.io/campus-garden"
      target="_blank"
      rel="noopener"
    >
      inspired by Campus Garden XR, Kyoto Design Lab
    </a>
  `,

  uploadUrl:
    "https://github.com/DennisHaus/pointcloud_viewer/upload/main/scans",

  readmeTitle: "Spatial Library - Read Me",

  catalogUrl: "./catalog.json",

  scanPathPrefix: "scans/",

  /*
    Keep this false when catalog.json contains relative paths,
    for example: scans/scan-01.copc.laz
  */
  useRawBaseForPaths: false,

  rawBaseUrl:
    "https://raw.githubusercontent.com/DennisHaus/pointcloud_viewer/main",

  downloadPassword: "Voser",

  readmeHtml: `
    <section>
      <h3>Overview</h3>

      <p>
        Spatial Library Brienzauls is a point-cloud viewer for loading,
        visualizing, inspecting and comparing COPC LAZ scans.
      </p>

      <p>
        Select a scan from the model library to load it into the viewer.
        Several scans can be loaded and displayed at the same time.
        Registered users can upload and download models.
        Sections can be visualized and images exported.
      </p>
    </section>

    <section>
      <h3>Navigation</h3>

      <ul>
        <li>
          <strong>Left mouse button + drag:</strong>
          Orbit around the point cloud.
        </li>

        <li>
          <strong>Right mouse button + drag:</strong>
          Pan the view.
        </li>

        <li>
          <strong>Mouse wheel:</strong>
          Zoom in and out.
        </li>

        <li>
          <strong>W or Arrow Up:</strong>
          Move forward.
        </li>

        <li>
          <strong>S or Arrow Down:</strong>
          Move backward.
        </li>

        <li>
          <strong>A or Arrow Left:</strong>
          Move left.
        </li>

        <li>
          <strong>D or Arrow Right:</strong>
          Move right.
        </li>
      </ul>
    </section>

    <section>
      <h3>Model library</h3>

      <ul>
        <li>Click a scan name to select it.</li>
        <li>Click the visibility symbol to show or hide a scan.</li>
        <li>Use the refresh button to reload the scan catalog.</li>
      </ul>
    </section>

    <section>
      <h3>Impressum</h3>

      <p>
        © ETH Zürich, developed at Professur Voser, Institute for Landscape
        and Urban Studies, ETH Zürich.
      </p>

      <p>
        Contract information:<br>
        <strong>Professur Voser</strong><br>
        c/o Dennis Häusler<br>
        Institute for Landscape and Urban Studies<br>
        ETH Zürich, Switzerland<br>
        haeusler@arch.ethz.ch
      </p>
    </section>


  `
};
