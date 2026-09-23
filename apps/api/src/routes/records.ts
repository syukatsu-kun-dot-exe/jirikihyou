import { Hono } from "hono";
import type { ChartRecordDto, ChartRecordInput, ChartRecordsResponse } from "@jirikihyou/shared";
import { isClearType, maxExScore } from "@jirikihyou/shared";
import { prisma } from "../db.js";
import { currentUser, type CurrentUserEnv } from "../currentUser.js";

export const records = new Hono<CurrentUserEnv>();
records.use("*", currentUser);

type Row = { chartId: number; clearType: ChartRecordDto["clearType"]; exScore: number | null; missCount: number | null; updatedAt: Date };

const toDto = (r: Row): ChartRecordDto => ({
  chartId: r.chartId,
  clearType: r.clearType,
  exScore: r.exScore,
  missCount: r.missCount,
  updatedAt: r.updatedAt.toISOString(),
});

/** 現在ユーザーの全記録 */
records.get("/", async (c) => {
  const rows = await prisma.chartRecord.findMany({
    where: { userId: c.get("userId") },
    orderBy: { chartId: "asc" },
  });
  const body: ChartRecordsResponse = { records: rows.map(toDto) };
  return c.json(body);
});

/** null / 0 以上の整数 のみ許可 */
const parseNonNegativeInt = (v: unknown, name: string): { ok: true; value: number | null } | { ok: false; error: string } => {
  if (v == null || v === "") return { ok: true, value: null };
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0) {
    return { ok: false, error: `${name} は 0 以上の整数か null にしてください` };
  }
  return { ok: true, value: v };
};

/** 記録を作成 / 更新 (upsert) */
records.put("/:chartId", async (c) => {
  const chartId = Number(c.req.param("chartId"));
  if (!Number.isInteger(chartId)) return c.json({ error: "chartId が不正です" }, 400);

  let body: Partial<ChartRecordInput>;
  try {
    body = (await c.req.json()) as Partial<ChartRecordInput>;
  } catch {
    return c.json({ error: "JSON body が必要です" }, 400);
  }

  if (!isClearType(body.clearType)) return c.json({ error: "clearType が不正です" }, 400);
  const ex = parseNonNegativeInt(body.exScore, "exScore");
  if (!ex.ok) return c.json({ error: ex.error }, 400);
  const miss = parseNonNegativeInt(body.missCount, "missCount");
  if (!miss.ok) return c.json({ error: miss.error }, 400);

  const chart = await prisma.chart.findUnique({ where: { id: chartId }, select: { id: true, notes: true } });
  if (!chart) return c.json({ error: "Chart not found" }, 404);
  if (ex.value != null && chart.notes != null && ex.value > maxExScore(chart.notes)) {
    return c.json({ error: `exScore は最大 ${maxExScore(chart.notes)} です` }, 400);
  }

  const data = { clearType: body.clearType, exScore: ex.value, missCount: miss.value };
  const row = await prisma.chartRecord.upsert({
    where: { userId_chartId: { userId: c.get("userId"), chartId } },
    update: data,
    create: { userId: c.get("userId"), chartId, ...data },
  });
  return c.json(toDto(row));
});

/** 記録を削除 */
records.delete("/:chartId", async (c) => {
  const chartId = Number(c.req.param("chartId"));
  if (!Number.isInteger(chartId)) return c.json({ error: "chartId が不正です" }, 400);

  await prisma.chartRecord.deleteMany({ where: { userId: c.get("userId"), chartId } });
  return c.body(null, 204);
});
