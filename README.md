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
index.html               The application
config.js                Bundled default configuration
assets/
  app.css                Styling
  runtime-config.js       Configuration overrides, saved in the browser
  oidc-client.js          OIDC relying party: PKCE, token exchange, JWT verification
  demo-app.js             Page bootstrap
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

On top of that, the page itself has a **Configuration** card where you can
set the same four fields at runtime. Saving there writes to this browser's
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
2. Register its redirect URI **exactly** as the page reports it. The page
   prints the value under "Redirect URI to register" once loaded. It is
   matched literally: a trailing slash, an added `index.html`, or `http`
   where the registration says `https` all fail.
3. Put the resulting client id into `config.js` as `clientId`.
4. Subscribe the customer to the application and grant it to the member who
   will sign in. Subscribed but not granted shows "Request access" rather
   than a launch.

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
- **Tokens are held in memory only.** Reloading the page signs it in again
  through the Anugal session rather than restoring anything from storage,
  which is why a reload is instant while the session lives and prompts once
  it does not.

This is a demonstration application. A production relying party should
exchange the authorization code server-to-server and keep its own session in
an httpOnly, `SameSite` cookie rather than doing any of this in the browser.
