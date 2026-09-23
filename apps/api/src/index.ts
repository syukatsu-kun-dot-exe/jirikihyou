import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import type { HealthResponse } from "@jirikihyou/shared";
import { ensureLocalUser } from "./currentUser.js";
import { prisma } from "./db.js";
import { records } from "./routes/records.js";
import { sheets } from "./routes/sheets.js";
import { songs } from "./routes/songs.js";

const app = new Hono();

app.use(logger());
app.use(
  "/api/*",
  cors({
    origin: (origin) => origin ?? "*",
  }),
);

const health = async (): Promise<HealthResponse> => {
  let db: HealthResponse["db"] = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    db = "error";
  }
  return {
    status: db === "ok" ? "ok" : "degraded",
    db,
    timestamp: new Date().toISOString(),
  };
};

app.get("/health", async (c) => c.json(await health()));
app.get("/api/health", async (c) => c.json(await health()));

app.route("/api/songs", songs);
app.route("/api/sheets", sheets);
app.route("/api/records", records);

app.notFound((c) => c.json({ error: "Not Found" }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Internal Server Error" }, 500);
});

const port = Number(process.env.PORT ?? 3000);
await ensureLocalUser();
serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => {
  console.log(`[api] listening on http://localhost:${info.port}`);
});
