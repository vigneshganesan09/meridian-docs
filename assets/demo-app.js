/*
 * Bootstrap for this application's single page.
 *
 * The page supplies its identity (window.DEMO_APP) and this file does the
 * rest: sign in, verify, render, sign out.
 */
(function () {
  "use strict";

  var app = window.DEMO_APP || {};
  var config = window.CIAM_CONFIG || {};
  var clientId = config.clientId || "";

  /* ---- small DOM helpers -------------------------------------------------- */

  function el(id) {
    return document.getElementById(id);
  }

  function addRow(tbody, key, value) {
    var tr = document.createElement("tr");
    var k = document.createElement("td");
    k.className = "k";
    k.textContent = key;
    var v = document.createElement("td");
    v.className = "v";
    // textContent, never innerHTML: these values come from a token and a query
    // string, and one of them is attacker-influenceable on any given day.
    v.textContent = value;
    tr.appendChild(k);
    tr.appendChild(v);
    tbody.appendChild(tr);
  }

  function setStatus(kind, text) {
    var node = el("status");
    node.className = "pill " + kind;
    node.textContent = "";
    var dot = document.createElement("span");
    dot.className = "dot";
    node.appendChild(dot);
    node.appendChild(document.createTextNode(text));
  }

  /* ---- session end -------------------------------------------------------- */

  var sessionEnded = false;

  function endSession(reason) {
    if (sessionEnded) return;
    sessionEnded = true;
    var overlay = el("session-ended");
    if (!overlay) return;
    var node = el("session-ended-reason");
    if (node) node.textContent = reason;
    overlay.setAttribute("data-open", "true");
  }

  /*
   * Expire this page when the Anugal-issued token does.
   *
   * setTimeout takes a signed 32-bit delay: anything past ~24.8 days overflows
   * and fires immediately, which would blank the page the instant it loaded. So
   * the timer is armed only for a positive, in-range duration.
   */
  function armExpiry(claims) {
    if (typeof claims.exp !== "number") return;
    var msLeft = claims.exp * 1000 - Date.now();
    if (msLeft > 0 && msLeft < 2147483647) {
      setTimeout(function () {
        endSession("Your Anugal session timed out.");
      }, msLeft);
    }
  }

  /*
   * Cross-tab sign-out, which works ONLY when this app is served from the same
   * origin as the Anugal portal. BroadcastChannel and storage events are both
   * origin-scoped, so once these pages live on their own host nothing arrives
   * here and the real mechanisms are the token expiry above and RP-initiated
   * logout. Kept because it costs nothing and still helps in a same-origin
   * deployment — but it is a convenience, never the security boundary.
   */
  var LAUNCHED_AT = Date.now();

  function isFreshLogout(at) {
    // A logout recorded BEFORE this page opened is a stale replay from an
    // earlier session and must not tear down a fresh launch.
    return typeof at === "number" && at > LAUNCHED_AT;
  }

  function listenForPortalLogout() {
    try {
      var channel = new BroadcastChannel("anugal-session");
      channel.onmessage = function (event) {
        var data = event && event.data;
        if (data && data.type === "logout" && isFreshLogout(data.at)) {
          endSession("You were signed out of Anugal.");
        }
      };
    } catch (e) {
      /* Unsupported — the storage listener below is the fallback. */
    }
    window.addEventListener("storage", function (event) {
      if (
        event.key === "anugal-session-logout" &&
        event.newValue &&
        isFreshLogout(Number(event.newValue))
      ) {
        endSession("You were signed out of Anugal.");
      }
    });
  }

  /* ---- rendering ---------------------------------------------------------- */

  function renderBrand() {
    document.documentElement.style.setProperty("--accent", app.accent || "#6d5efc");
    el("logo").textContent = app.initials || "??";
    el("app-name").textContent = app.name || "Demo application";
    document.title = (app.name || "Demo application") + " — Anugal CIAM";

    // Where someone whose session has ended goes to sign in again.
    var portalLink = el("portal-link");
    if (portalLink && config.portalUrl) portalLink.href = config.portalUrl;
  }

  function renderLaunchContext() {
    var params = {};
    new URLSearchParams(window.location.search).forEach(function (v, k) {
      params[k] = v;
    });
    var hash = window.location.hash.replace(/^#/, "");
    if (hash) {
      new URLSearchParams(hash).forEach(function (v, k) {
        params[k] = v;
      });
    }

    var keys = Object.keys(params);
    var tbody = el("params");
    if (keys.length) {
      keys.forEach(function (k) {
        addRow(tbody, k, params[k]);
      });
    } else {
      el("params-empty").hidden = false;
    }

    el("href").textContent = window.location.href;
    el("ref").textContent = document.referrer || "—";
    el("ts").textContent = new Date().toLocaleString();
  }

  function renderSession(result) {
    var tbody = el("claims");
    tbody.textContent = "";
    [
      "name",
      "email",
      "customerName",
      "customerId",
      "domain",
      "roles",
      "sub",
      "aud",
      "iss",
    ].forEach(function (key) {
      var value = result.claims[key];
      if (value === undefined) return;
      addRow(tbody, key, Array.isArray(value) ? value.join(", ") : String(value));
    });

    var verify = el("verify");
    verify.className = "verify ok";
    verify.textContent =
      "✓ ID token signature verified against the Anugal JWKS, and iss / aud / exp / nonce all check out.";

    el("session-card").hidden = false;
    el("signin-actions").hidden = true;
    el("session-actions").hidden = false;

    setStatus(
      "ok",
      "Signed in via Anugal CIAM as " +
        (result.claims.email || result.claims.name || "user"),
    );
  }

  /* ---- flow --------------------------------------------------------------- */

  function misconfigured() {
    if (!config.issuer) return "config.js has no issuer set.";
    if (!clientId) {
      return "config.js has no clientId set.";
    }
    return "";
  }

  async function start() {
    renderBrand();
    renderLaunchContext();
    listenForPortalLogout();

    el("redirect-uri").textContent = window.CiamOidc.redirectUriFor();

    var problem = misconfigured();
    if (problem) {
      setStatus("err", problem);
      return;
    }

    var signIn = el("sign-in");
    signIn.addEventListener("click", function () {
      setStatus("neutral", "Redirecting to Anugal…");
      window.CiamOidc.beginLogin({
        issuer: config.issuer,
        clientId: clientId,
        scope: config.scope,
      }).catch(function (error) {
        setStatus("err", error.message);
      });
    });

    var current = null;

    el("sign-out").addEventListener("click", function () {
      window.CiamOidc.logout({
        issuer: config.issuer,
        clientId: clientId,
        idToken: current ? current.idToken : "",
        postLogoutRedirectUri: window.CiamOidc.redirectUriFor(),
      });
    });

    try {
      setStatus("neutral", "Checking for a sign-in response…");
      var result = await window.CiamOidc.completeLogin();
      if (!result) {
        setStatus("neutral", "Not signed in");
        el("signin-actions").hidden = false;
        return;
      }
      current = result;
      renderSession(result);
      armExpiry(result.claims);
    } catch (error) {
      setStatus("err", "Authentication failed: " + error.message);
      el("signin-actions").hidden = false;
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    start();
  });
})();
