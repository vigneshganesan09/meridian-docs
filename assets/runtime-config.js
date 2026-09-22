/*
 * Lets the configuration in config.js be overridden from inside the browser,
 * so pointing this app at a different Anugal deployment doesn't require
 * editing a file and redeploying.
 *
 * config.js still sets the bundled defaults. This file loads any saved
 * overrides from localStorage and layers them on top, in place, before
 * oidc-client.js or demo-app.js read window.CIAM_CONFIG — so nothing else on
 * the page needs to know overrides exist. It also wires up the on-page
 * "Configuration" form, when one is present, to edit and persist them.
 *
 * Overrides live only in this browser (localStorage). They are never written
 * back to config.js and never leave the machine.
 */
(function () {
  "use strict";

  var FIELDS = ["issuer", "clientId", "portalUrl", "scope"];

  function slug(text) {
    return (
      String(text || "app")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") || "app"
    );
  }

  // Scoped per application name, not just per origin: GitHub Pages project
  // sites for two sibling apps can end up on the same domain under different
  // paths, and localStorage is shared across the whole origin.
  var STORAGE_KEY = "ciam-demo-config:" + slug((window.DEMO_APP || {}).name);

  var defaults = Object.assign({}, window.CIAM_CONFIG || {});

  function loadOverrides() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveOverrides(overrides) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
      return true;
    } catch (e) {
      return false;
    }
  }

  function clearOverrides() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      /* ignore */
    }
  }

  // Effective configuration = bundled defaults + saved overrides. Every
  // later script sees this object, so this has to run before them, and does:
  // config.js, then this file, then oidc-client.js, then demo-app.js.
  var savedOverrides = loadOverrides();
  window.CIAM_CONFIG = Object.assign({}, defaults, savedOverrides);

  function el(id) {
    return document.getElementById(id);
  }

  function wireForm() {
    var inputs = {
      issuer: el("cfg-issuer"),
      clientId: el("cfg-client-id"),
      portalUrl: el("cfg-portal-url"),
      scope: el("cfg-scope"),
    };
    var saveBtn = el("cfg-save");
    var resetBtn = el("cfg-reset");
    var status = el("cfg-status");
    if (!saveBtn || !inputs.issuer) return; // page has no configuration card

    var overriddenKeys = Object.keys(savedOverrides);
    if (overriddenKeys.length) {
      status.className = "verify ok";
      status.textContent =
        "Using saved overrides for: " + overriddenKeys.join(", ") + ".";
    } else {
      status.className = "verify";
      status.textContent = "Using the defaults bundled in config.js.";
    }

    FIELDS.forEach(function (key) {
      if (!inputs[key]) return;
      inputs[key].value = window.CIAM_CONFIG[key] || "";
      inputs[key].placeholder = defaults[key] || "";
    });

    saveBtn.addEventListener("click", function () {
      var next = {};
      FIELDS.forEach(function (key) {
        var raw = (inputs[key].value || "").trim();
        // Blank means "fall back to config.js" — only store a field once it
        // actually diverges from the bundled default.
        if (raw && raw !== defaults[key]) next[key] = raw;
      });
      if (saveOverrides(next)) {
        status.className = "verify ok";
        status.textContent = "Saved. Reloading…";
        setTimeout(function () {
          window.location.reload();
        }, 300);
      } else {
        status.className = "verify err";
        status.textContent =
          "Could not save — this browser has localStorage disabled or full.";
      }
    });

    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        clearOverrides();
        window.location.reload();
      });
    }
  }

  document.addEventListener("DOMContentLoaded", wireForm);
})();
