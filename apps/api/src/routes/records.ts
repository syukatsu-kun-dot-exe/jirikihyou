import { Hono } from "hono";
import type { ChartRecordDto, ChartRecordInput, ChartRecordsResponse } from "@jirikihyou/shared";
import { isClearType, maxExScore } from "@jirikihyou/shared";
import { prisma } from "../db.js";
import { currentUser, type CurrentUserEnv } from "../currentUser.js";

/** 個人記録 API。全ルートで {@link currentUser} を通し userId をセットする */
export const records = new Hono<CurrentUserEnv>();
records.use("*", currentUser);

/** Prisma の ChartRecord 行のうち DTO に必要な列 */
type Row = { chartId: number; clearType: ChartRecordDto["clearType"]; exScore: number | null; missCount: number | null; updatedAt: Date };

/**
 * DB 行を API レスポンス形にする。`updatedAt` は ISO 8601 文字列。
 *
 * @param r - 記録行
 * @returns フロントが使う ChartRecordDto
 */
const toDto = (r: Row): ChartRecordDto => ({
  chartId: r.chartId,
  clearType: r.clearType,
  exScore: r.exScore,
  missCount: r.missCount,
  updatedAt: r.updatedAt.toISOString(),
});

/**
 * GET /api/records
 * 現在ユーザー (現状 id=1) の最新記録一覧。
 *
 * @returns `{ records: ChartRecordDto[] }`
 */
records.get("/", async (c) => {
  const rows = await prisma.chartRecord.findMany({
    where: { userId: c.get("userId") },
    orderBy: { chartId: "asc" },
  });
  const body: ChartRecordsResponse = { records: rows.map(toDto) };
  return c.json(body);
});

/**
 * JSON の数値フィールドを検証する。空 / null は「未入力」。
 *
 * @param v - body の値
 * @param name - エラーメッセージに出す項目名
 * @returns 成功時は整数または null、失敗時は日本語エラー
 */
const parseNonNegativeInt = (v: unknown, name: string): { ok: true; value: number | null } | { ok: false; error: string } => {
  if (v == null || v === "") return { ok: true, value: null };
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0) {
    return { ok: false, error: `${name} は 0 以上の整数か null にしてください` };
  }
  return { ok: true, value: v };
};

/**
 * PUT /api/records/:chartId
 * 1 譜面の記録を upsert。`@@unique([userId, chartId])`。
 *
 * @param chartId - パス。整数であること
 * @body clearType / exScore / missCount
 * @returns 保存後の ChartRecordDto
 * @throws 400 不正な body、404 譜面なし。exScore が notes*2 超も 400
 */
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

/**
 * DELETE /api/records/:chartId
 * 該当ユーザーのその譜面の記録を消す。無くても 204。
 *
 * @param chartId - パス
 * @returns 空 body、HTTP 204
 */
records.delete("/:chartId", async (c) => {
  const chartId = Number(c.req.param("chartId"));
  if (!Number.isInteger(chartId)) return c.json({ error: "chartId が不正です" }, 400);

  await prisma.chartRecord.deleteMany({ where: { userId: c.get("userId"), chartId } });
  return c.body(null, 204);
});
