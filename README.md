# Meridian Docs — Anugal CIAM demo application

A static web application that signs in through Anugal CIAM over OpenID
Connect. It exists to prove the sign-in flow end to end against a real
deployment, and to give a working reference for anyone integrating a third
application. It is one half of a pair — see [Single sign-on
testing](#single-sign-on-testing) below to test SSO against its sibling app,
[Aurora Analytics](https://github.com/) (update this link once that repo is
pushed).

There is no build step and no dependencies. Every file here is served as-is.

```
index.html               Dashboard (sample data) — requires a signed-in session
auth/login/index.html    Sign-in page; auto-starts SSO when launched by CIAM
auth/callback/index.html Redirect URI — finishes the OIDC handshake
settings/index.html      Connection settings and the URIs to register
config.js                Bundled default configuration
assets/
  app.css                Styling
  app-identity.js        This app's name, colours and sibling
  app-shell.js           Routes, session, SSO start, sign-out, session-ended overlay
  runtime-config.js      Configuration overrides, saved in the browser
  oidc-client.js         OIDC relying party: PKCE, token exchange, JWT verification
  login.js / callback.js / settings.js / home.js   Per-page scripts
  charts.js              Tiny SVG charts for the dashboard
  dashboard.js           This app's sample dashboard data
```

## Deploying

Copy this folder to any static host — nginx, S3 + CloudFront, GitHub Pages, an
existing web server's document root. It needs nothing but the ability to serve
files over HTTP. On GitHub Pages, point the site at this repo's root (or
`/docs`, if you move these files there) and it serves at
`https://<user>.github.io/<repo>/`.

Serve it over **HTTPS** anywhere other than localhost. `crypto.subtle`, which
generates the PKCE challenge and verifies the token signature, is unavailable
in a non-secure context, so the page will fail to sign in over plain HTTP.
GitHub Pages serves over HTTPS by default.

## Configuring

There are two layers. `config.js` is the bundled default, checked into the
repo — set it to whatever the application should point to when nobody has
overridden anything:

| Key | What it is |
|---|---|
| `issuer` | Base URL of the Anugal core API, **including** its `/anugal-core/api` prefix |
| `clientId` | The OAuth client id this application authenticates as |
| `portalUrl` | Where "Return to sign-in" sends an ended session |
| `scope` | Scopes requested; the server intersects this with what the client allows |
| `siblingUrl` | Optional. Where the sibling app is deployed; shown as a link on the dashboard |

On top of that, the page itself has a **Configuration** card where you can
set the same fields at runtime. Saving there writes to this browser's
`localStorage` (nothing is sent anywhere, and `config.js` on disk is never
touched) and immediately reloads the page using the new values. It's the
quick way to point a deployed copy at a different Anugal environment, or to
try several client ids, without editing a file and redeploying. Leave a
field blank to fall back to the bundled default; "Reset to defaults" clears
the saved overrides for this app in this browser.

Because overrides are per-browser, deploying a fresh copy of `config.js`
still changes what a first-time visitor sees — it's the floor everything
else sits on. The issuer prefix is the single most common misconfiguration
in either layer. Verify it before anything else:

```bash
curl -X POST https://<host>/oauth/token                  # 404 -> prefix missing
curl -X POST https://<host>/anugal-core/api/oauth/token  # 400 -> correct
```

A 400 means the route is alive and rejecting an empty body, which is what you
want.

## Registering in Anugal

1. Register this application as a **public** client — no secret, PKCE
   required.
2. Register its URIs **exactly** as the settings page (`settings/`) reports
   them. They are matched literally: a missing trailing slash, an added
   `index.html`, or `http` where the registration says `https` all fail.

   | What | Value |
   |---|---|
   | Redirect URI | `https://<host>/<path>/auth/callback/` |
   | Post-logout redirect URI | `https://<host>/<path>/auth/login/` |
   | Launch URL | `https://<host>/<path>/auth/login/` |

3. Put the resulting client id into `config.js` as `clientId`.
4. Subscribe the customer to the application and grant it to the member who
   will sign in. Subscribed but not granted shows "Request access" rather
   than a launch.

## Launching from CIAM (auto-start SSO)

When CIAM launches the application it opens `/auth/login/?iss=<issuer>`
(optionally with `login_hint`). The sign-in page then behaves as follows:

- **`iss` equals the configured `issuer`** (a trailing slash is ignored): SSO
  starts on its own. The page shows "Signing you in…" instead of the email
  form and redirects straight to the authorization endpoint. `startSso()` in
  `oidc-client.js` is the static-site equivalent of a server's
  `/api/auth/sso/start`: it records PKCE/state/nonce and returns the
  authorization URL.
- **`iss` is missing or names another issuer**: the normal sign-in page is
  shown. Continuing with an email, or "Sign in with Anugal SSO", starts the
  same flow on a click.
- **`login_hint`** pre-fills the email field and is passed through to the
  authorization request. It is only a hint — who signed in is always read
  from the verified ID token.
- **SSO returns an error** (`/auth/callback/?error=...`): the callback sends
  the browser to `/auth/login/?error=...`, which shows the error and does
  **not** restart SSO. The redirect carries only the error fields, never
  `iss`, so it cannot look like a fresh launch. As a second guard, a launch
  that lands back on the sign-in page within a minute of an automatic
  attempt that never completed shows the form instead of trying again.

A launch at the application root (`/?iss=...`) is forwarded to the sign-in
page with its parameters, so either URL works as the launch URL.

## Signing out through CIAM

"Sign out" clears this app's session and redirects the browser to the CIAM
end-session endpoint (the discovery document's `end_session_endpoint`,
falling back to `{issuer}/oauth/logout`) with `id_token_hint`, `client_id`
and `post_logout_redirect_uri` set to the sign-in page. That ends the Anugal
session, so the sibling application is signed out too.

## Single sign-on testing

This application is meant to be deployed alongside another Anugal CIAM demo
application — such as [Aurora Analytics](https://github.com/), its sibling —
registered as a separate client under the **same** Anugal customer:

1. Sign in to the sibling application first.
2. Open this one. It should complete with no second prompt — that is single
   sign-on. The session lives in Anugal, not in either page.
3. Sign out of either one. Both should be signed out.

## What this page does, and what it deliberately does not

It runs the authorization code flow with PKCE (S256) and holds **no client
secret**. Anugal registers a browser application as a public client, and its
token endpoint refuses a public client that presents no code challenge. A
secret shipped inside a static asset is readable by anyone who opens developer
tools, so there would be nothing for it to protect.

On every sign-in the client verifies the ID token's RS256 signature against
the issuer's JWKS, selecting the key by `kid` with no fallback, and then
checks `iss`, `aud`, `exp` and `nonce`. A correctly signed token issued for a
different application is still correctly signed — `aud` is what stops it
being accepted here.

Two limits worth knowing:

- **Cross-tab sign-out only works same-origin.** `BroadcastChannel` and
  storage events are scoped to an origin, so once this application and its
  sibling are on separate hosts (as they will be, deployed as separate
  repos), the portal's sign-out broadcast never reaches either one. What
  does still work is the token expiry timer and RP-initiated logout.
- **The verified session is kept in `sessionStorage`.** Sign-in now spans
  three pages (sign-in, callback, dashboard), so the verified claims and ID
  token are kept for this tab only, and dropped when the token expires or on
  sign-out. A new tab has no session and shows the sign-in page; continuing
  completes silently while the Anugal session lives.

This is a demonstration application. A production relying party should
exchange the authorization code server-to-server and keep its own session in
an httpOnly, `SameSite` cookie rather than doing any of this in the browser.
