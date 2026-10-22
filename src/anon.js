const IDENTITY_CLAIMS = [
  "sub",
  "name",
  "given_name",
  "family_name",
  "preferred_username",
  "email",
  "phone_number",
  "phone",
  "phone_number_verified",
];

export function identityClaims(token) {
  if (!token) return {};
  const part = token.split(".")[1];
  const padded = part + "=".repeat((4 - (part.length % 4)) % 4);
  const claims = JSON.parse(atob(padded.replace(/-/g, "+").replace(/_/g, "/")));
  const present = {};
  for (const key of IDENTITY_CLAIMS) {
    if (claims[key] !== undefined) present[key] = claims[key];
  }
  return present;
}
