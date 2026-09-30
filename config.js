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
   *
   * It is also what a CIAM launch is matched against: /auth/login/?iss=<value>
   * starts SSO automatically only when <value> equals this (a trailing slash
   * is ignored).
   */
  issuer: "https://dev.anugalid.com:4000/anugal-core/api",

  /*
   * Optional. The `iss` value the server writes into its ID tokens and CIAM
   * launch links, when that differs from `issuer` above. Leave empty normally.
   *
   * Only for a server whose own issuer setting has not been updated — e.g. it
   * is reached at https://dev.example.com:4000/anugal-core/api but still names
   * itself http://localhost:4000/anugal-core/api. Requests still go to
   * `issuer`; tokens must carry exactly this value or they are rejected.
   * The real fix is the server's issuer setting — clear this once it is done.
   */
  tokenIssuer: "",

  /*
   * The OAuth client id this application authenticates as.
   *
   * Register it in Anugal under the customer that will use it, as a PUBLIC
   * client (no secret, PKCE required), with these URIs (the settings page
   * prints the exact values for wherever the app is deployed):
   *
   *   redirect URI              https://apps.example.com/meridian-docs/auth/callback/
   *   post-logout redirect URI  https://apps.example.com/meridian-docs/auth/login/
   *   launch URL                https://apps.example.com/meridian-docs/auth/login/
   *
   * Redirect URIs are matched literally — a missing trailing slash, an added
   * index.html, or http vs https is a mismatch and fails before sign-in.
   *
   * Left empty on purpose. An id that merely LOOKS plausible fails at the
   * authorization endpoint with "Unknown or disabled client_id", which reads
   * like a server fault; empty fails here instead, naming this file.
   */
  clientId: "local-meridian-docs",

  /*
   * The CIAM sign-out (end-session) URL. "Sign out" sends the browser here
   * with id_token_hint, client_id and post_logout_redirect_uri, ending the
   * Anugal session for every application signed in through it.
   *
   * Leave empty to use the issuer's advertised end_session_endpoint, falling
   * back to {issuer}/oauth/logout.
   */
  endSessionUrl: "https://vigneshganesan09.github.io/meridian-docs/auth/login/",

  /** Where "Return to sign-in" sends someone whose session has ended. */
  portalUrl: "https://vigneshganesan09.github.io/meridian-docs/auth/callback/",

  /** Scopes to request. The server intersects this with what the client is allowed. */
  scope: "openid profile email",

  /**
   * Optional. Where the sibling demo application is deployed, shown as a link
   * on the dashboard so single sign-on can be tried in one click.
   */
  siblingUrl: "",
};
