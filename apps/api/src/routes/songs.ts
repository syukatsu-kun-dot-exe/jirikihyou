import { Hono } from "hono";
import type { SongDto } from "@jirikihyou/shared";
import { prisma } from "../db.js";

export const songs = new Hono();

songs.get("/", async (c) => {
  const rows = await prisma.song.findMany({
    include: { charts: true },
    orderBy: { title: "asc" },
  });
  const body: SongDto[] = rows.map((s) => ({
    id: s.id,
    title: s.title,
    artist: s.artist,
    genre: s.genre,
    version: s.version,
    bpm: s.bpm,
    charts: s.charts.map((ch) => ({
      id: ch.id,
      songId: ch.songId,
      playStyle: ch.playStyle,
      difficulty: ch.difficulty,
      level: ch.level,
      notes: ch.notes,
    })),
  }));
  return c.json(body);
});
