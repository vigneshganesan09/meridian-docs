/* The settings page: the URIs to register, and a check that the issuer answers. */
(function () {
  "use strict";

  var shell = window.AppShell;
  var el = shell.el;

  document.addEventListener("DOMContentLoaded", function () {
    shell.renderBrand();
    document.title = "Connection settings — " + (shell.app.name || "Demo application");

    el("uri-callback").textContent = shell.routes.callback;
    el("uri-logout").textContent = shell.routes.login;
    var launch = new URL(shell.routes.login);
    if (shell.tokenIssuer()) launch.searchParams.set("iss", shell.tokenIssuer());
    el("uri-launch").textContent = launch.toString();

    el("test-issuer").addEventListener("click", function () {
      var status = el("issuer-status");
      status.className = "verify";
      status.textContent = "Checking " + shell.config.issuer + "…";
      window.CiamOidc.discover(shell.config.issuer)
        .then(function (doc) {
          var ok = doc.issuer === shell.tokenIssuer();
          status.className = ok ? "verify ok" : "verify err";
          status.textContent = ok
            ? "✓ Discovery answered and its issuer matches the configuration."
            : "Discovery answered, but it names its issuer as " +
              doc.issuer +
              ". Fix the server's issuer setting, or enter that value as Token issuer (iss) above.";
        })
        .catch(function (error) {
          status.className = "verify err";
          status.textContent = error.message;
        });
    });
  });
})();
