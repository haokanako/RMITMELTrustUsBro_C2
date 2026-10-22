import { createHash } from "node:crypto";

export function anonymousId(sub, restaurantId) {
  const hex = createHash("sha256").update(`${sub}|${restaurantId}`, "utf8").digest("hex");
  return `anon_${hex.slice(0, 10)}`;
}
