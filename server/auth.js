import { createRemoteJWKSet, errors, jwtVerify } from "jose";

const ISSUER = "http://localhost:8080/realms/cloakdine";
const JWKS = createRemoteJWKSet(new URL(`${ISSUER}/protocol/openid-connect/certs`), {
  cooldownDuration: 0,
  timeoutDuration: 5000,
});
const CLIENT = "cloakdine";
const CLOCK_SKEW_SECONDS = 60;
// The restaurant is allowed to learn `sub` and nothing else.
// If a phone or name shows up here, the TideCloak client was given too much scope.
const LEAKED = [
  "name", "given_name", "family_name", "preferred_username",
  "email", "phone_number", "phone", "phone_number_verified",
];

export async function verifyAccessToken(authorization, jwks = JWKS) {
  if (!authorization || !authorization.startsWith("Bearer ")) {
    return { status: 401, error: "Sign in with TideCloak." };
  }
  const token = authorization.slice("Bearer ".length).trim();
  if (token.split(".").length !== 3) {
    return { status: 401, error: "Sign in with TideCloak." };
  }
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: ISSUER,
      algorithms: ["RS256"],
      clockTolerance: CLOCK_SKEW_SECONDS,
    });
    // Real diner tokens say aud=account. azp is the client check. typ=Bearer keeps the ID token out.
    if (payload.azp !== CLIENT || payload.typ !== "Bearer" || typeof payload.sub !== "string" || payload.sub === "") {
      return { status: 401, error: "TideCloak token was rejected." };
    }
    const scope = typeof payload.scope === "string" ? payload.scope.split(/\s+/).filter(Boolean) : [];
    const leaked = [
      ...LEAKED.filter((key) => payload[key] !== undefined),
      ...["phone", "profile", "email"].filter((name) => scope.includes(name)),
    ];
    if (leaked.length > 0) {
      return { status: 403, error: `Token carries identity claims (${leaked.join(", ")}). Scopes are misconfigured.` };
    }
    return { sub: payload.sub }; // caller stores a member number, not this token
  } catch (error) {
    if (keySetUnavailable(error)) {
      return { status: 503, error: "TideCloak key set is unavailable." };
    }
    if (error instanceof TypeError) {
      return { status: 500, error: "Order service failed." };
    }
    return { status: 401, error: "TideCloak token was rejected." };
  }
}

// TideCloak didn't answer. That's not the same as a bad login.
function keySetUnavailable(error) {
  if (error instanceof errors.JWKSTimeout) return true;
  if (error instanceof TypeError && error.message === "fetch failed") return true;
  return error instanceof errors.JOSEError && error.code === "ERR_JOSE_GENERIC";
}
