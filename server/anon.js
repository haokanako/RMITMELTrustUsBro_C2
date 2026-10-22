import { createHash } from "node:crypto";

// Hash stays on the server. The page used to do this itself, which meant anyone could claim a member number.
export function anonymousId(sub, restaurantId) {
  const hex = createHash("sha256").update(`${sub}|${restaurantId}`, "utf8").digest("hex");
  return `anon_${hex.slice(0, 10)}`;
}
