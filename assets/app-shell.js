/*
 * Everything the pages of this application share: where each page lives, the
 * signed-in session, starting SSO, signing out, and the session-ended overlay.
 *
 * Pages live at fixed paths under the application root:
 *
 *   ./                  dashboard (requires a session)
 *   ./auth/login/       sign-in; auto-starts SSO when launched by CIAM
 *   ./auth/callback/    redirect URI — finishes the OIDC handshake
 *   ./settings/         configuration and the URIs to register
 *
 * The root is derived from this script's own URL, so the app works unchanged at
 * a domain root or under a GitHub Pages project path.
 */
(function () {
  "use strict";

  var app = window.DEMO_APP || {};
  var config = window.CIAM_CONFIG || {};
  var clientId = config.clientId || "";

  // document.currentScript is only set while this file is first executing.
  var BASE = new URL("../", document.currentScript.src).href;

  var routes = {
    home: BASE,
    login: BASE + "auth/login/",
    callback: BASE + "auth/callback/",
    settings: BASE + "settings/",
  };

  function slug(text) {
    return (
      String(text || "app")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") || "app"
    );
  }

  var APP_KEY = slug(app.name);
  var SESSION_KEY = "ciam-demo-session:" + APP_KEY;
  var AUTOSTART_KEY = "ciam-demo-autostart:" + APP_KEY;
  var SIGNED_OUT_KEY = "ciam-demo-signed-out:" + APP_KEY;

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

  function storageGet(store, key) {
    try {
      return store.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function storageSet(store, key, value) {
    try {
      store.setItem(key, value);
    } catch (e) {
      /* Storage disabled — the app degrades to signing in on every page. */
    }
  }

  function storageRemove(store, key) {
    try {
      store.removeItem(key);
    } catch (e) {
      /* ignore */
    }
  }

  /* ---- configuration ------------------------------------------------------ */

  function misconfigured() {
    if (!config.issuer) return "No issuer is configured.";
    if (!clientId) return "No client ID is configured.";
    return "";
  }

  function normaliseIssuer(value) {
    return String(value || "").trim().replace(/\/+$/, "");
  }

  /** The `iss` value tokens and launches carry: `tokenIssuer` if set, else `issuer`. */
  function tokenIssuer() {
    return config.tokenIssuer || config.issuer || "";
  }

  /** True when a launch's `iss` names the CIAM issuer this app is configured for. */
  function issuerMatches(iss) {
    return !!iss && !!tokenIssuer() && normaliseIssuer(iss) === normaliseIssuer(tokenIssuer());
  }

  /* ---- session ------------------------------------------------------------ */

  /*
   * The verified sign-in, kept in sessionStorage so it survives the hop from
   * the callback page to the dashboard. Only ever written after the ID token's
   * signature and iss / aud / exp / nonce have been checked, and scoped to this
   * tab: a new tab signs in again through the Anugal session, silently.
   */
  function getSession() {
    var raw = storageGet(sessionStorage, SESSION_KEY);
    if (!raw) return null;
    try {
      var session = JSON.parse(raw);
      var exp = session && session.claims && session.claims.exp;
      if (typeof exp === "number" && exp * 1000 <= Date.now()) {
        clearSession();
        return null;
      }
      return session;
    } catch (e) {
      clearSession();
      return null;
    }
  }

  function saveSession(result) {
    storageSet(
      sessionStorage,
      SESSION_KEY,
      JSON.stringify({
        claims: result.claims,
        idToken: result.idToken,
        signedInAt: Date.now(),
      }),
    );
  }

  function clearSession() {
    storageRemove(sessionStorage, SESSION_KEY);
  }

  /** Same-origin URL inside this app, or the dashboard. Never an open redirect. */
  function safeReturnTo(url) {
    try {
      var target = new URL(url, BASE);
      if (target.href.indexOf(BASE) === 0 && target.href.indexOf(routes.login) !== 0 &&
          target.href.indexOf(routes.callback) !== 0) {
        return target.href;
      }
    } catch (e) {
      /* fall through */
    }
    return routes.home;
  }

  /* ---- sign-in / sign-out ------------------------------------------------- */

  /**
   * Start SSO and return the authorization URL (the equivalent of a server's
   * `/api/auth/sso/start`). The caller redirects.
   */
  function startSso(options) {
    options = options || {};
    return window.CiamOidc.startSso({
      issuer: config.issuer,
      tokenIssuer: config.tokenIssuer,
      clientId: clientId,
      scope: config.scope,
      redirectUri: routes.callback,
      returnTo: safeReturnTo(options.returnTo || routes.home),
      loginHint: options.loginHint || "",
    }).then(function (started) {
      return started.authorizationUrl;
    });
  }

  /*
   * Where sign-out sends the browser: `endSessionUrl` from the configuration
   * when set, otherwise the issuer's advertised end_session_endpoint, otherwise
   * {issuer}/oauth/logout.
   */
  function discoverEndSession() {
    if (config.endSessionUrl) return Promise.resolve(config.endSessionUrl);

    // Prefer what the issuer advertises; give up quickly and fall back to the
    // Anugal default so a slow discovery call never strands someone signing out.
    var timeout = new Promise(function (resolve) {
      setTimeout(resolve, 2500, "");
    });
    var lookup = window.CiamOidc.discover(config.issuer)
      .then(function (doc) {
        var endpoint = (doc && doc.end_session_endpoint) || "";
        // Only follow an endpoint on the configured issuer's own host. A server
        // whose issuer is misconfigured (e.g. still "localhost") advertises
        // URLs the browser cannot reach; the default path is safer then.
        try {
          if (new URL(endpoint).origin === new URL(config.issuer).origin) return endpoint;
        } catch (e) {
          /* missing or malformed — fall back */
        }
        return "";
      })
      .catch(function () {
        return "";
      });
    return Promise.race([lookup, timeout]);
  }

  /**
   * Sign out through CIAM: drop the local session, then send the browser to the
   * CIAM end-session endpoint with id_token_hint, so the Anugal session — and
   * with it every other application signed in through it — ends too.
   */
  function signOut() {
    var session = getSession();
    var idToken = session ? session.idToken : "";
    clearSession();
    storageRemove(sessionStorage, AUTOSTART_KEY);
    storageSet(sessionStorage, SIGNED_OUT_KEY, String(Date.now()));

    if (misconfigured()) {
      window.location.assign(routes.login);
      return Promise.resolve();
    }
    return discoverEndSession().then(function (endpoint) {
      window.CiamOidc.logout({
        issuer: config.issuer,
        clientId: clientId,
        idToken: idToken,
        endSessionEndpoint: endpoint,
        postLogoutRedirectUri: routes.login,
      });
    });
  }

  /* ---- auto-start loop guard ---------------------------------------------- */

  var AUTOSTART_WINDOW_MS = 60 * 1000;

  /*
   * Records that this tab just auto-started SSO. If the launch lands back on the
   * login page within the window without having completed, something is
   * bouncing, and the page stops and shows the form instead of looping.
   */
  function recentlyAutoStarted() {
    var at = Number(storageGet(sessionStorage, AUTOSTART_KEY));
    return !!at && Date.now() - at < AUTOSTART_WINDOW_MS;
  }

  function markAutoStarted() {
    storageSet(sessionStorage, AUTOSTART_KEY, String(Date.now()));
  }

  function clearAutoStarted() {
    storageRemove(sessionStorage, AUTOSTART_KEY);
  }

  function takeSignedOut() {
    var at = storageGet(sessionStorage, SIGNED_OUT_KEY);
    storageRemove(sessionStorage, SIGNED_OUT_KEY);
    return !!at;
  }

  /* ---- branding ----------------------------------------------------------- */

  function renderBrand() {
    var root = document.documentElement.style;
    root.setProperty("--accent", app.accent || "#6d5efc");
    root.setProperty("--accent-2", app.accent2 || app.accent || "#9b8bff");
    document.querySelectorAll("[data-app-name]").forEach(function (node) {
      node.textContent = app.name || "Demo application";
    });
    document.querySelectorAll("[data-app-initials]").forEach(function (node) {
      node.textContent = app.initials || "??";
    });
    document.querySelectorAll("[data-app-tagline]").forEach(function (node) {
      node.textContent = app.tagline || "";
    });
    document.querySelectorAll("[data-href]").forEach(function (node) {
      var route = routes[node.getAttribute("data-href")];
      if (route) node.href = route;
    });
    var portalLink = el("portal-link");
    if (portalLink && config.portalUrl) portalLink.href = config.portalUrl;
  }

  /* ---- session end -------------------------------------------------------- */

  var sessionEnded = false;

  function endSession(reason) {
    if (sessionEnded) return;
    sessionEnded = true;
    clearSession();
    var overlay = el("session-ended");
    if (!overlay) return;
    var node = el("session-ended-reason");
    if (node) node.textContent = reason;
    overlay.setAttribute("data-open", "true");
  }

  /*
   * Expire the page when the Anugal-issued token does. setTimeout takes a
   * signed 32-bit delay, so the timer is armed only for an in-range duration.
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
   * Cross-tab sign-out — works ONLY when served from the same origin as the
   * Anugal portal. A convenience, never the security boundary.
   */
  var LAUNCHED_AT = Date.now();

  function isFreshLogout(at) {
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

  function watchSession(claims) {
    armExpiry(claims);
    listenForPortalLogout();
  }

  window.AppShell = {
    app: app,
    config: config,
    clientId: clientId,
    routes: routes,
    el: el,
    addRow: addRow,
    misconfigured: misconfigured,
    tokenIssuer: tokenIssuer,
    issuerMatches: issuerMatches,
    getSession: getSession,
    saveSession: saveSession,
    clearSession: clearSession,
    safeReturnTo: safeReturnTo,
    startSso: startSso,
    signOut: signOut,
    recentlyAutoStarted: recentlyAutoStarted,
    markAutoStarted: markAutoStarted,
    clearAutoStarted: clearAutoStarted,
    takeSignedOut: takeSignedOut,
    renderBrand: renderBrand,
    watchSession: watchSession,
  };
})();
