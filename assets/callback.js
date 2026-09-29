/*
 * The redirect URI, /auth/callback/.
 *
 * Finishes the authorization code flow: checks state and the response `iss`,
 * exchanges the code with the PKCE verifier, verifies the ID token, and stores
 * the verified session. Then it leaves — to the page sign-in started from on
 * success, or to the login page with `?error=...` on failure. The login page
 * shows that error and deliberately does not start SSO again.
 */
(function () {
  "use strict";

  var shell = window.AppShell;

  function toLogin(error, description) {
    var url = new URL(shell.routes.login);
    url.searchParams.set("error", error);
    if (description) url.searchParams.set("error_description", description);
    // Only error fields are carried over — never `iss`, which would look like a
    // fresh CIAM launch and start SSO all over again.
    window.location.replace(url.toString());
  }

  async function finish() {
    var query = new URLSearchParams(window.location.search);
    if (!query.get("code") && !query.get("error")) {
      window.location.replace(shell.routes.login);
      return;
    }
    try {
      var result = await window.CiamOidc.completeLogin({ cleanUrl: false });
      shell.saveSession(result);
      shell.clearAutoStarted();
      window.location.replace(shell.safeReturnTo(result.returnTo));
    } catch (error) {
      // A failed sign-in must not leave an earlier user's session behind.
      shell.clearSession();
      toLogin(query.get("error") || "sso_failed", error.message);
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    shell.renderBrand();
    finish();
  });
})();
