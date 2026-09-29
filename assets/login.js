/*
 * The sign-in page, /auth/login/.
 *
 * Two ways in:
 *
 *  - Launched by CIAM with `?iss=<issuer>`. When that issuer is the one this app
 *    is configured for, SSO starts on its own: the page shows "Signing you in…"
 *    and redirects to the authorization endpoint without showing the form.
 *
 *  - Opened any other way (no `iss`, or an `iss` naming a different issuer).
 *    The normal page is shown; the email field and SSO button start the same
 *    flow on a click.
 *
 * When SSO comes back with an error, the callback page sends the browser here
 * with `?error=...`. The error is shown and SSO is NOT restarted, so a failing
 * launch cannot turn into a redirect loop.
 */
(function () {
  "use strict";

  var shell = window.AppShell;
  var el = shell.el;

  function show(state) {
    el("state-signing-in").hidden = state !== "signing-in";
    el("state-form").hidden = state !== "form";
  }

  function showError(text) {
    el("login-error-text").textContent = text;
    el("login-error").hidden = false;
  }

  function showInfo(text) {
    var node = el("login-info");
    node.textContent = text;
    node.hidden = false;
  }

  function busy(isBusy) {
    el("email-continue").disabled = isBusy;
    el("sso-button").disabled = isBusy;
  }

  function redirectToSso(loginHint) {
    busy(true);
    return shell
      .startSso({ loginHint: loginHint })
      .then(function (authorizationUrl) {
        window.location.assign(authorizationUrl);
      })
      .catch(function (error) {
        busy(false);
        show("form");
        showError(error.message);
      });
  }

  function describeError(query) {
    var code = query.get("error");
    var description = query.get("error_description");
    if (code === "access_denied" && !description) {
      return "Access was denied. Ask your administrator to grant you this application.";
    }
    return description || code;
  }

  function start() {
    shell.renderBrand();
    document.title = "Sign in — " + (shell.app.name || "Demo application");

    var query = new URLSearchParams(window.location.search);
    var iss = query.get("iss");
    var loginHint = query.get("login_hint") || "";
    var error = query.get("error");

    if (loginHint) el("email").value = loginHint;

    el("email-form").addEventListener("submit", function (event) {
      event.preventDefault();
      var input = el("email");
      var email = input.value.trim();
      if (!input.checkValidity() || !email) {
        input.focus();
        showError("Enter a valid email address.");
        return;
      }
      el("login-error").hidden = true;
      redirectToSso(email);
    });

    el("sso-button").addEventListener("click", function () {
      el("login-error").hidden = true;
      redirectToSso(el("email").value.trim());
    });

    var problem = shell.misconfigured();
    if (problem) {
      show("form");
      busy(true);
      showError(problem + " Open Connection settings to set it.");
      return;
    }

    // 1. SSO came back with an error: show it, and never restart automatically.
    if (error) {
      shell.clearAutoStarted();
      show("form");
      showError(describeError(query));
      // Drop the error from the address bar so a refresh shows a clean page
      // rather than the same failure — still without auto-starting.
      window.history.replaceState({}, "", shell.routes.login);
      return;
    }

    // 2. Launched by CIAM with our issuer: auto-start SSO.
    if (shell.issuerMatches(iss)) {
      if (shell.recentlyAutoStarted()) {
        // We were here moments ago and the sign-in never completed. Stop rather
        // than bounce between the app and CIAM.
        shell.clearAutoStarted();
        show("form");
        showInfo("Automatic sign-in did not complete. Continue below to try again.");
        return;
      }
      shell.markAutoStarted();
      show("signing-in");
      redirectToSso(loginHint);
      return;
    }

    // 3. Everything else: the normal login page.
    if (iss) {
      console.warn(
        "Ignoring launch: iss " + iss + " is not the configured issuer " + shell.config.issuer,
      );
    }
    if (shell.getSession()) {
      window.location.replace(shell.routes.home);
      return;
    }
    if (shell.takeSignedOut()) showInfo("You have been signed out.");
    show("form");
  }

  document.addEventListener("DOMContentLoaded", start);
})();
