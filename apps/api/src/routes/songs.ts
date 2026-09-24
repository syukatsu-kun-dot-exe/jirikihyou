import { Hono } from "hono";
import type { SongDto } from "@jirikihyou/shared";
import { prisma } from "../db.js";

/** 楽曲マスタ API。`GET /api/songs` */
export const songs = new Hono();

/**
 * GET /api/songs
 * 全楽曲と配下の譜面。タイトル昇順。
 *
 * @returns SongDto[]
 */
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
