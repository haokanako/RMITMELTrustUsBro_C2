import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { verifyAccessToken } from "./server/auth.js";
import { openTideSession } from "./server/identity.js";
import { createOrder, exportCsv, listOrders, sessionFor } from "./server/orders.js";

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON."));
      }
    });
    req.on("error", reject);
  });
}

function send(res, status, body, type = "application/json") {
  res.statusCode = status;
  res.setHeader("Content-Type", type);
  res.end(type === "application/json" ? JSON.stringify(body) : body);
}

function ordersApi() {
  return {
    name: "cloakdine-orders",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || "/", "http://localhost");
        if (!url.pathname.startsWith("/api/")) return next();
        try {
          if (req.method === "GET" && url.pathname === "/api/orders") {
            const header = req.headers.authorization;
            if (!header) return send(res, 200, listOrders());
            const auth = await verifyAccessToken(header);
            if (auth.error) return send(res, auth.status, { error: auth.error });
            return send(res, 200, { ...listOrders(), session: sessionFor(auth.sub) });
          }
          if (req.method === "GET" && url.pathname === "/api/export") {
            return send(res, 200, exportCsv(), "text/csv; charset=utf-8");
          }
          if (req.method === "POST" && url.pathname === "/api/identity/session") {
            const result = await openTideSession(await readBody(req));
            if (result.error) return send(res, result.status, { error: result.error });
            return send(res, 200, {
              accessToken: result.accessToken,
              sub: result.sub,
              members: result.members,
            });
          }
          if (req.method === "POST" && url.pathname === "/api/orders") {
            // Check the token before reading the order, so a bad login can't poke at the menu rules.
            const auth = await verifyAccessToken(req.headers.authorization);
            if (auth.error) return send(res, auth.status, { error: auth.error });
            const result = createOrder(await readBody(req), auth.sub);
            if (result.error) return send(res, result.status, { error: result.error });
            return send(res, result.status, result);
          }
          return send(res, 404, { error: "Not found." });
        } catch (error) {
          return send(res, 400, { error: error instanceof Error ? error.message : "Bad request." });
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), ordersApi()],
  server: { port: 5174, strictPort: true },
});
