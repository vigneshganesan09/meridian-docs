/*
 * Minimal OpenID Connect relying party for Anugal CIAM.
 *
 * Authorization Code flow with PKCE (S256) and NO client secret. That is not a
 * simplification: Anugal registers a browser application as a PUBLIC client
 * (tokenEndpointAuthMethod 'none'), and its token endpoint refuses a public
 * client that presents no code_challenge. A secret shipped in a static asset is
 * readable by anyone who opens devtools, so there is nothing it could protect.
 *
 * No dependencies — fetch + SubtleCrypto only, so this file can be dropped into
 * any static host with no build step.
 */
(function (global) {
  "use strict";

  /* ---- base64url / bytes ------------------------------------------------- */

  function bytesToB64url(bytes) {
    var bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function b64urlToStr(s) {
    s = s.replace(/-/g, "+").replace(/_/g, "/");
    var pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
    return atob(s + pad);
  }

  function b64urlToBytes(s) {
    var bin = b64urlToStr(s);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function randomUrlSafe(byteLength) {
    var bytes = new Uint8Array(byteLength);
    crypto.getRandomValues(bytes);
    return bytesToB64url(bytes);
  }

  async function sha256B64url(text) {
    var digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(text),
    );
    return bytesToB64url(new Uint8Array(digest));
  }

  /* ---- JWT --------------------------------------------------------------- */

  function decodeJwt(token) {
    var parts = String(token).split(".");
    if (parts.length !== 3) throw new Error("Malformed JWT.");
    return {
      header: JSON.parse(b64urlToStr(parts[0])),
      claims: JSON.parse(b64urlToStr(parts[1])),
      signingInput: parts[0] + "." + parts[1],
      signature: parts[2],
    };
  }

  /*
   * Verify the RS256 signature against the issuer's published JWKS.
   *
   * Selection is by `kid` with NO fallback to "the first key". A fallback looks
   * harmless while there is one key and silently accepts a token signed by the
   * wrong one the day a second appears — which is exactly when key rotation is
   * in flight and a verification bug is hardest to spot.
   */
  async function verifySignature(jwt, issuer) {
    var res = await fetch(issuer + "/oauth/jwks");
    if (!res.ok) throw new Error("Could not fetch JWKS (HTTP " + res.status + ").");
    var jwks = await res.json();
    var keys = (jwks && jwks.keys) || [];
    var jwk = keys.filter(function (k) {
      return k.kid === jwt.header.kid;
    })[0];
    if (!jwk) throw new Error('No JWKS key matches the token kid "' + jwt.header.kid + '".');

    var key = await crypto.subtle.importKey(
      "jwk",
      { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    var ok = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      b64urlToBytes(jwt.signature),
      new TextEncoder().encode(jwt.signingInput),
    );
    if (!ok) throw new Error("ID token signature is not valid.");
  }

  /*
   * The claim checks that make a verified signature mean something. A correctly
   * signed token issued for a DIFFERENT application is still a valid signature —
   * `aud` is what stops it being accepted here.
   */
  function verifyClaims(claims, expected) {
    var now = Math.floor(Date.now() / 1000);
    var skew = 60;

    if (claims.iss !== expected.issuer) {
      throw new Error("Unexpected token issuer: " + claims.iss);
    }
    var aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (aud.indexOf(expected.clientId) === -1) {
      throw new Error("ID token was not issued for this application.");
    }
    if (typeof claims.exp === "number" && claims.exp + skew < now) {
      throw new Error("ID token has expired.");
    }
    if (typeof claims.nbf === "number" && claims.nbf - skew > now) {
      throw new Error("ID token is not valid yet.");
    }
    // A missing nonce is a failure, not a pass: replaying an old token is exactly
    // what it defends against, and an absent claim is the easiest thing to forge.
    if (expected.nonce && claims.nonce !== expected.nonce) {
      throw new Error("ID token nonce does not match this sign-in attempt.");
    }
  }

  /* ---- transaction state -------------------------------------------------- */

  /*
   * sessionStorage, not localStorage: the verifier and nonce belong to ONE
   * sign-in in ONE tab. localStorage would share them across every tab on the
   * origin, so two concurrent sign-ins would overwrite each other's verifier and
   * the second exchange would fail with a PKCE error that looks like a server bug.
   */
  var TX_KEY = "ciam-demo:auth-tx";

  function saveTx(tx) {
    try {
      sessionStorage.setItem(TX_KEY, JSON.stringify(tx));
    } catch (e) {
      throw new Error("Session storage is unavailable, so sign-in cannot continue.");
    }
  }

  function takeTx() {
    try {
      var raw = sessionStorage.getItem(TX_KEY);
      sessionStorage.removeItem(TX_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  /* ---- public API --------------------------------------------------------- */

  function redirectUriFor() {
    // Origin + path, with no query or fragment. This must match a registered
    // redirect URI EXACTLY — Anugal does not normalise them, so a trailing slash
    // or an index.html that is present here and absent there is a hard failure.
    return global.location.origin + global.location.pathname;
  }

  /** Send the browser to the authorization endpoint. Does not return. */
  async function beginLogin(options) {
    var verifier = randomUrlSafe(32);
    var tx = {
      state: randomUrlSafe(16),
      nonce: randomUrlSafe(16),
      verifier: verifier,
      issuer: options.issuer,
      clientId: options.clientId,
      redirectUri: redirectUriFor(),
      returnTo: global.location.href,
    };
    saveTx(tx);

    var url = new URL(options.issuer + "/oauth/authorize");
    url.searchParams.set("client_id", tx.clientId);
    url.searchParams.set("redirect_uri", tx.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", options.scope || "openid profile email");
    url.searchParams.set("state", tx.state);
    url.searchParams.set("nonce", tx.nonce);
    url.searchParams.set("code_challenge", await sha256B64url(verifier));
    url.searchParams.set("code_challenge_method", "S256");

    global.location.assign(url.toString());
  }

  /**
   * Finish a redirect back from the authorization endpoint.
   *
   * Returns null when this is not a callback, so a page can call it on every load
   * and only act when there is something to finish.
   */
  async function completeLogin(options) {
    var query = new URLSearchParams(global.location.search);
    var error = query.get("error");
    var code = query.get("code");
    if (!error && !code) return null;

    var tx = takeTx();

    if (error) {
      throw new Error(query.get("error_description") || error);
    }
    if (!tx) {
      throw new Error(
        "No sign-in is in progress in this tab. Start again from the application.",
      );
    }
    // Reject before the code is spent: a state mismatch means this callback does
    // not belong to the request this tab made.
    if (query.get("state") !== tx.state) {
      throw new Error("state does not match — the sign-in was not started here.");
    }

    /*
     * RFC 9207: the authorization server names itself in the response. Honour it
     * ONLY when it equals the issuer we sent the request to — taking it at face
     * value would let a rogue redirect nominate its own issuer and JWKS, and the
     * signature would then verify against the attacker's key.
     */
    var responseIss = query.get("iss");
    if (responseIss && responseIss !== tx.issuer) {
      throw new Error("Response came from an unexpected issuer: " + responseIss);
    }

    var body = new URLSearchParams();
    body.set("grant_type", "authorization_code");
    body.set("code", code);
    body.set("redirect_uri", tx.redirectUri);
    body.set("client_id", tx.clientId);
    body.set("code_verifier", tx.verifier);

    var res = await fetch(tx.issuer + "/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    var payload = await res.json().catch(function () {
      return {};
    });
    if (!res.ok) {
      throw new Error(
        payload.error_description || payload.error || "HTTP " + res.status,
      );
    }
    if (!payload.id_token) {
      throw new Error("The token response carried no id_token.");
    }

    var jwt = decodeJwt(payload.id_token);
    await verifySignature(jwt, tx.issuer);
    verifyClaims(jwt.claims, {
      issuer: tx.issuer,
      clientId: tx.clientId,
      nonce: tx.nonce,
    });

    // Drop code and state from the address bar so a refresh does not replay a
    // spent code and report a confusing invalid_grant.
    if (options && options.cleanUrl !== false) {
      global.history.replaceState({}, "", tx.redirectUri);
    }

    return {
      claims: jwt.claims,
      idToken: payload.id_token,
      accessToken: payload.access_token || "",
      expiresIn: payload.expires_in || 0,
      tokenType: payload.token_type || "Bearer",
      scope: payload.scope || "",
    };
  }

  /** Current user from the authorization server, using the access token. */
  async function fetchUserInfo(issuer, accessToken) {
    var res = await fetch(issuer + "/oauth/userinfo", {
      headers: { Authorization: "Bearer " + accessToken },
    });
    if (!res.ok) throw new Error("userinfo failed (HTTP " + res.status + ").");
    return res.json();
  }

  /** RP-initiated logout. Ends the CIAM session, not just this page. */
  function logout(options) {
    var url = new URL(options.issuer + "/oauth/logout");
    url.searchParams.set("client_id", options.clientId);
    if (options.postLogoutRedirectUri) {
      // Honoured only when it exactly matches a registered post-logout URI;
      // anything else is ignored by the server rather than followed.
      url.searchParams.set("post_logout_redirect_uri", options.postLogoutRedirectUri);
    }
    if (options.idToken) url.searchParams.set("id_token_hint", options.idToken);
    global.location.assign(url.toString());
  }

  /** The server's own description of itself — useful for checking configuration. */
  async function discover(issuer) {
    var res = await fetch(issuer + "/.well-known/openid-configuration");
    if (!res.ok) {
      throw new Error(
        "Discovery failed (HTTP " +
          res.status +
          "). A 404 usually means the issuer is missing its /anugal-core/api prefix.",
      );
    }
    return res.json();
  }

  global.CiamOidc = {
    beginLogin: beginLogin,
    completeLogin: completeLogin,
    fetchUserInfo: fetchUserInfo,
    logout: logout,
    discover: discover,
    decodeJwt: decodeJwt,
    redirectUriFor: redirectUriFor,
  };
})(window);
