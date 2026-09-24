import { Hono } from "hono";
import type { SheetDetailDto, SheetSummaryDto } from "@jirikihyou/shared";
import { prisma } from "../db.js";

/** 地力表 API。`GET /api/sheets` と詳細 */
export const sheets = new Hono();

/**
 * GET /api/sheets
 * 表の一覧 (帯・譜面は含まない)。
 *
 * @returns SheetSummaryDto[]
 */
sheets.get("/", async (c) => {
  const rows = await prisma.sheet.findMany({ orderBy: { id: "asc" } });
  const body: SheetSummaryDto[] = rows.map((s) => ({
    id: s.id,
    slug: s.slug,
    name: s.name,
    description: s.description,
    playStyle: s.playStyle,
    level: s.level,
    updatedAt: s.updatedAt.toISOString(),
  }));
  return c.json(body);
});

/**
 * GET /api/sheets/:idOrSlug
 * 数値なら id、それ以外は slug で 1 表を返す。帯 → エントリ → 譜面 → 楽曲。
 *
 * @param idOrSlug - パス。例: `1` または `sp12-normal`
 * @returns SheetDetailDto。無ければ 404
 */
sheets.get("/:idOrSlug", async (c) => {
  const idOrSlug = c.req.param("idOrSlug");
  const id = Number(idOrSlug);
  // 純数なら PK、それ以外 (sp12-normal など) は slug。先頭ゼロ付きは Number で整数になる点に注意
  const where = Number.isInteger(id) ? { id } : { slug: idOrSlug };

  const sheet = await prisma.sheet.findUnique({
    where,
    include: {
      tiers: {
        orderBy: { order: "asc" },
        include: {
          entries: {
            include: { chart: { include: { song: true } } },
            orderBy: { chart: { song: { title: "asc" } } },
          },
        },
      },
    },
  });

  if (!sheet) return c.json({ error: "Sheet not found" }, 404);

  const body: SheetDetailDto = {
    id: sheet.id,
    slug: sheet.slug,
    name: sheet.name,
    description: sheet.description,
    playStyle: sheet.playStyle,
    level: sheet.level,
    updatedAt: sheet.updatedAt.toISOString(),
    tiers: sheet.tiers.map((t) => ({
      id: t.id,
      name: t.name,
      order: t.order,
      kind: t.kind,
      entries: t.entries.map((e) => ({
        id: e.id,
        note: e.note,
        chart: {
          id: e.chart.id,
          songId: e.chart.songId,
          playStyle: e.chart.playStyle,
          difficulty: e.chart.difficulty,
          level: e.chart.level,
          notes: e.chart.notes,
          song: {
            id: e.chart.song.id,
            title: e.chart.song.title,
            artist: e.chart.song.artist,
            genre: e.chart.song.genre,
            version: e.chart.song.version,
            bpm: e.chart.song.bpm,
          },
        },
      })),
    })),
  };
  return c.json(body);
});
