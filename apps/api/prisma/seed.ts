/**
 * 開発用の最小シード。
 * 楽曲マスタの本格的な投入方法は別途決める。ここでは DB 接続と表の表示確認ができる程度のデータのみ。
 * すでに楽曲が存在する場合は何もしない (docker compose 起動毎に実行されるため)。
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const sampleSongs = [
  { title: "卑弥呼", artist: "朱雀 VS 玄武", version: 16, bpm: "180", level: 12, tier: "地力S+" },
  { title: "GuNGNiR", artist: "P*Light", version: 33, bpm: "190", level: 12, tier: "地力S+" },
  { title: "冥", artist: "Amuro vs Killer", version: 12, bpm: "66-200", level: 12, tier: "地力A" },
  { title: "AA", artist: "D.J.Amuro", version: 9, bpm: "154", level: 12, tier: "地力D" },
] as const;

const tiers = [
  { name: "地力S+", order: 10, kind: "JIRIKI" },
  { name: "個人差S+", order: 11, kind: "KOJINSA" },
  { name: "地力A", order: 40, kind: "JIRIKI" },
  { name: "地力D", order: 100, kind: "JIRIKI" },
  { name: "難易度未定", order: 999, kind: "UNRATED" },
] as const;

async function main() {
  const songCount = await prisma.song.count();
  if (songCount > 0) {
    console.log(`[seed] songs already exist (${songCount}), skip.`);
    return;
  }

  const sheet = await prisma.sheet.upsert({
    where: { slug: "sp12-normal" },
    update: {},
    create: {
      slug: "sp12-normal",
      name: "SP☆12 ノマゲ参考表",
      description: "SP☆12 のノーマルゲージクリア難易度を地力ランクで分類した参考表 (サンプル)",
      playStyle: "SP",
      level: 12,
      tiers: { create: tiers.map((t) => ({ ...t })) },
    },
    include: { tiers: true },
  });

  for (const s of sampleSongs) {
    const song = await prisma.song.create({
      data: {
        title: s.title,
        artist: s.artist,
        version: s.version,
        bpm: s.bpm,
        charts: {
          create: { playStyle: "SP", difficulty: "ANOTHER", level: s.level },
        },
      },
      include: { charts: true },
    });

    const tier = sheet.tiers.find((t) => t.name === s.tier);
    const chart = song.charts[0];
    if (!tier || !chart) continue;

    await prisma.sheetEntry.create({
      data: { sheetId: sheet.id, tierId: tier.id, chartId: chart.id },
    });
  }

  console.log(`[seed] inserted ${sampleSongs.length} songs into sheet "${sheet.name}".`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
