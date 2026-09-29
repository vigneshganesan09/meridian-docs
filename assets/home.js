/*
 * The dashboard shell, shared by both demo apps: guard the page, show who is
 * signed in (from the verified ID token), wire sign-out and the date range, and
 * hand the rest to this app's own window.Dashboard.
 */
(function () {
  "use strict";

  var shell = window.AppShell;
  var el = shell.el;

  function initials(text) {
    var parts = String(text || "?").replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
    return ((parts[0] || "?")[0] + (parts[1] ? parts[1][0] : "")).toUpperCase();
  }

  function greeting() {
    var h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  }

  function renderUser(claims) {
    var name = claims.name || claims.given_name || claims.email || "there";
    var first = claims.given_name || String(name).split(" ")[0];
    el("user-initials").textContent = initials(claims.name || claims.email);
    el("user-name").textContent = claims.name || claims.email || "Signed in";
    el("user-email").textContent = claims.email || claims.sub || "";
    el("greeting").textContent = greeting() + ", " + first;
    if (claims.customerName) el("org-name").textContent = claims.customerName;
  }

  function renderClaims(session) {
    var tbody = el("claims");
    tbody.textContent = "";
    ["name", "email", "customerName", "customerId", "domain", "roles", "sub", "aud", "iss"].forEach(
      function (key) {
        var value = session.claims[key];
        if (value === undefined) return;
        shell.addRow(tbody, key, Array.isArray(value) ? value.join(", ") : String(value));
      },
    );

    var exp = session.claims.exp;
    var node = el("token-expiry");
    function tick() {
      if (typeof exp !== "number") {
        node.textContent = "No expiry on the token.";
        return;
      }
      var s = Math.max(0, Math.round(exp - Date.now() / 1000));
      node.textContent =
        "Token expires in " + Math.floor(s / 60) + "m " + String(s % 60).padStart(2, "0") + "s";
    }
    tick();
    setInterval(tick, 1000);
  }

  function renderSibling() {
    var url = shell.config.siblingUrl;
    var link = el("sibling-link");
    if (!url || !link) return;
    link.href = url;
    link.textContent = "Open " + (shell.app.sibling || "sibling app") + " ↗";
    link.hidden = false;
  }

  function wireRange() {
    var buttons = document.querySelectorAll("[data-range]");
    buttons.forEach(function (button) {
      button.addEventListener("click", function () {
        buttons.forEach(function (b) {
          b.setAttribute("aria-pressed", String(b === button));
        });
        window.Dashboard.render(Number(button.getAttribute("data-range")));
      });
    });
  }

  function start() {
    shell.renderBrand();
    var query = new URLSearchParams(window.location.search);

    // An authorization response that landed on the root (an older redirect URI
    // registration) is finished by the callback page.
    if (query.get("code") || query.get("error")) {
      window.location.replace(shell.routes.callback + window.location.search);
      return;
    }

    // A CIAM launch at the app root: hand it, parameters and all, to the login
    // page, which decides whether to auto-start SSO.
    if (query.get("iss")) {
      window.location.replace(shell.routes.login + window.location.search);
      return;
    }

    var session = shell.getSession();
    if (!session) {
      window.location.replace(shell.routes.login);
      return;
    }

    document.body.removeAttribute("data-loading");
    renderUser(session.claims);
    renderClaims(session);
    renderSibling();
    wireRange();
    window.Dashboard.render(30);

    var resizeTimer;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        window.Dashboard.render(window.Dashboard.range || 30);
      }, 150);
    });

    document.querySelectorAll("[data-sign-out]").forEach(function (button) {
      button.addEventListener("click", function () {
        button.disabled = true;
        button.textContent = "Signing out…";
        shell.signOut();
      });
    });

    shell.watchSession(session.claims);
  }

  document.addEventListener("DOMContentLoaded", start);
})();
