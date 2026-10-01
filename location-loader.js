document.addEventListener("DOMContentLoaded", () => {
  const config = window.LOCATION_CONFIG;

  if (!config) {
    console.error("LOCATION_CONFIG was not found.");
    return;
  }

  document.title =
    config.pageTitle || document.title;

  const metaDescription =
    document.querySelector(
      'meta[name="description"]'
    );

  if (metaDescription) {
    metaDescription.setAttribute(
      "content",
      config.metaDescription || ""
    );
  }

  const brandEyebrow =
    document.getElementById("brandEyebrow");

  if (brandEyebrow) {
    brandEyebrow.textContent =
      config.brandEyebrow || "";
  }

  const brandTitle =
    document.getElementById("brandTitle");

  if (brandTitle) {
    brandTitle.innerHTML =
      config.brandTitle || "";
  }

  const brandSubtitle =
    document.getElementById("brandSubtitle");

  if (brandSubtitle) {
    brandSubtitle.innerHTML =
      config.brandSubtitle || "";
  }

  const addModel =
    document.getElementById("addModel");

  if (addModel && config.uploadUrl) {
    addModel.href =
      config.uploadUrl;
  }

  const descriptionTitle =
    document.getElementById(
      "descriptionTitle"
    );

  if (descriptionTitle) {
    descriptionTitle.textContent =
      config.readmeTitle || "";
  }

  const descriptionContent =
    document.getElementById(
      "descriptionContent"
    );

  if (descriptionContent) {
    descriptionContent.innerHTML =
      config.readmeHtml || "";
  }
});
