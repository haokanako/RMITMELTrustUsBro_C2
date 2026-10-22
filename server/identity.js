import { randomBytes } from "node:crypto";
import { anonymousId } from "./anon.js";

const BASE = "http://localhost:8080";
const REALM = "cloakdine";
const CLIENT = "cloakdine";
// Demo only. A real shop would let TideCloak send the SMS, not hard-code 1234.
const DEMO_CODE = "1234";

function normalizePhone(value) {
  const phone = String(value || "").trim().replace(/[\s-]/g, "");
  return /^\+[1-9][0-9]{7,14}$/.test(phone) ? phone : "";
}

async function keepOnlyPhoneRequired(admin) {
  const current = await tide(`/admin/realms/${REALM}/users/profile`, admin);
  if (!current.ok) return;
  for (const attribute of current.body?.attributes || []) {
    if (attribute.name === "phoneNumber") continue;
    delete attribute.required;
  }
  await tide(`/admin/realms/${REALM}/users/profile`, admin, {
    method: "PUT",
    body: JSON.stringify(current.body),
  });
}

async function adminToken() {
  const body = new URLSearchParams({
    grant_type: "password",
    client_id: "admin-cli",
    username: "admin",
    password: "password",
  });
  const response = await fetch(`${BASE}/realms/master/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error("TideCloak admin login failed.");
  return (await response.json()).access_token;
}

async function tide(path, token, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const text = await response.text();
  return { ok: response.ok, status: response.status, body: text ? JSON.parse(text) : null };
}

// Phone is written onto the TideCloak user, then dropped. Callers get a login token with no phone claim.
export async function openTideSession(input) {
  const phone = normalizePhone(input?.phone);
  if (!phone) return { status: 400, error: "Enter a phone number like +60123456789." };
  if (String(input?.otp || "") !== DEMO_CODE) return { status: 401, error: "That code was not accepted." };

  // Same digits, same TideCloak user, so the member number stays put next visit.
  const username = `diner${phone.slice(1)}`;
  const admin = await adminToken();
  await keepOnlyPhoneRequired(admin);
  const found = await tide(`/admin/realms/${REALM}/users?username=${encodeURIComponent(username)}&exact=true`, admin);
  if (!found.ok) return { status: 503, error: "TideCloak could not store the number." };

  const profile = {
    username,
    enabled: true,
    attributes: { phoneNumber: [phone] },
  };
  let userId = found.body?.[0]?.id;
  if (!userId) {
    const created = await tide(`/admin/realms/${REALM}/users`, admin, { method: "POST", body: JSON.stringify(profile) });
    if (!created.ok && created.status !== 409) return { status: 503, error: "TideCloak could not store the number." };
    const again = await tide(`/admin/realms/${REALM}/users?username=${encodeURIComponent(username)}&exact=true`, admin);
    userId = again.body?.[0]?.id;
  } else {
    await tide(`/admin/realms/${REALM}/users/${userId}`, admin, { method: "PUT", body: JSON.stringify({ ...profile, id: userId }) });
  }
  if (!userId) return { status: 503, error: "TideCloak could not store the number." };

  const password = randomBytes(18).toString("hex");
  const secret = await tide(`/admin/realms/${REALM}/users/${userId}/reset-password`, admin, {
    method: "PUT",
    body: JSON.stringify({ type: "password", value: password, temporary: false }),
  });
  if (!secret.ok) return { status: 503, error: "TideCloak could not open a session." };

  const issued = await fetch(`${BASE}/realms/${REALM}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "password",
      client_id: CLIENT,
      username,
      password,
      scope: "openid",
    }),
  });
  if (!issued.ok) return { status: 503, error: "TideCloak could not open a session." };
  const accessToken = (await issued.json()).access_token;
  const payload = JSON.parse(Buffer.from(accessToken.split(".")[1], "base64url").toString());
  if (payload.phone_number || payload.phone || payload.email || payload.name) {
    return { status: 403, error: "TideCloak returned identity claims. Scopes are misconfigured." };
  }

  const restaurants = ["nasi-lane", "teh-house"];
  return {
    status: 200,
    accessToken,
    sub: payload.sub,
    checked: { phone, otp: String(input.otp), match: true },
    members: restaurants.map((restaurantId) => ({
      restaurantId,
      anonId: anonymousId(payload.sub, restaurantId),
    })),
  };
}
