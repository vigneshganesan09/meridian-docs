/*
 * Point this application at an Anugal deployment.
 *
 * Plain globals on purpose: no build step, no bundler. Edit this one file and
 * the page follows — so this folder can be copied to another environment and
 * re-pointed without touching anything else.
 */
window.CIAM_CONFIG = {
  /*
   * Base URL of the Anugal core API, INCLUDING its route prefix.
   *
   * The prefix is the single most common thing to get wrong. It is embedded as
   * the `iss` claim and is the base every endpoint hangs off, so a bare origin
   * makes {issuer}/oauth/token a 404. Check it before anything else:
   *
   *   curl -X POST https://<host>/oauth/token                  -> 404 (wrong)
   *   curl -X POST https://<host>/anugal-core/api/oauth/token  -> 400 (right)
   *
   * A 400 means the route is alive and merely rejecting an empty body.
   */
  issuer: "http://localhost:4000/anugal-core/api",

  /*
   * The OAuth client id this application authenticates as.
   *
   * Register it in Anugal under the customer that will use it, as a PUBLIC
   * client (no secret, PKCE required), and register its redirect URI exactly
   * as the page computes it: origin + path, no query, no fragment.
   *
   *   https://apps.example.com/meridian-docs/
   *   https://apps.example.com/meridian-docs/index.html
   *
   * Redirect URIs are matched literally — a trailing slash, an added
   * index.html, or http vs https is a mismatch and fails before sign-in.
   *
   * Left empty on purpose. An id that merely LOOKS plausible fails at the
   * authorization endpoint with "Unknown or disabled client_id", which reads
   * like a server fault; empty fails here instead, naming this file.
   */
  clientId: "",

  /** Where "Return to sign-in" sends someone whose session has ended. */
  portalUrl: "http://localhost:5173/ciam-login",

  /** Scopes to request. The server intersects this with what the client is allowed. */
  scope: "openid profile email",
};
