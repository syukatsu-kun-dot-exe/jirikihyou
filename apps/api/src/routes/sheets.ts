import { Hono } from "hono";
import type { SheetDetailDto, SheetSummaryDto } from "@jirikihyou/shared";
import { prisma } from "../db.js";

export const sheets = new Hono();

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

sheets.get("/:idOrSlug", async (c) => {
  const idOrSlug = c.req.param("idOrSlug");
  const id = Number(idOrSlug);
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
