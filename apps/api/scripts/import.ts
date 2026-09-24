/**
 * data/ 配下の JSON を DB に取り込む (冪等)。
 *
 *   data/songs.json          楽曲 + 譜面
 *   data/sheets/*.json       地力表 (帯 → 譜面)
 *
 * 実行: pnpm --filter api db:import
 *      DATA_DIR 環境変数でディレクトリを上書き可能
 */
import fs from "node:fs";
import path from "node:path";
import { PrismaClient, type Difficulty, type PlayStyle, type Prisma, type TierKind } from "@prisma/client";
import { DIFFICULTIES, PLAY_STYLES, TIER_KINDS } from "@jirikihyou/shared";

const prisma = new PrismaClient();

/** マスタ JSON のルート。Docker では `/data` を DATA_DIR で渡す */
const DATA_DIR = process.env.DATA_DIR ?? path.resolve(import.meta.dirname, "../../../data");

// ---------- JSON の型 ----------

interface ChartJson {
  playStyle: PlayStyle;
  difficulty: Difficulty;
  level: number;
  notes?: number | null;
}

interface SongJson {
  title: string;
  artist?: string | null;
  genre?: string | null;
  version?: number | null;
  bpm?: string | null;
  charts: ChartJson[];
}

interface SheetEntryJson {
  title: string;
  difficulty: Difficulty;
  playStyle?: PlayStyle; // 省略時はシートの playStyle
  note?: string | null;
}

interface SheetTierJson {
  name: string;
  kind: TierKind;
  entries: SheetEntryJson[];
}

interface SheetJson {
  slug: string;
  name: string;
  description?: string | null;
  playStyle: PlayStyle;
  level: number;
  source?: { name: string; url: string; fetchedAt?: string };
  tiers: SheetTierJson[];
}

// ---------- 読み込み & 検証 ----------

/**
 * UTF-8 の JSON ファイルを読む。BOM 無し前提。
 *
 * @param file - 絶対パス
 * @returns パース結果。型は呼び出し側の責任
 * @throws ファイル無し / JSON 不正
 */
function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

/**
 * 条件が偽なら即失敗させる。import は途中成功を残さない方針。
 *
 * @param cond - 成立していてほしい条件
 * @param msg - 失敗時のメッセージ
 */
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

/**
 * 列挙定数に含まれる文字列か。
 *
 * @param arr - 許可リスト
 * @param v - 未検証値
 * @returns 型ガード。true なら `v` は arr の要素
 */
const isIn = <T extends readonly string[]>(arr: T, v: unknown): v is T[number] =>
  typeof v === "string" && (arr as readonly string[]).includes(v);

/**
 * songs.json の最低限の形を検証する。タイトル重複は import キーと衝突するため禁止。
 *
 * @param songs - 読み込んだ配列
 */
function validateSongs(songs: SongJson[]) {
  const seen = new Set<string>();
  for (const s of songs) {
    assert(typeof s.title === "string" && s.title.length > 0, `song without title: ${JSON.stringify(s)}`);
    assert(!seen.has(s.title), `duplicate song title: ${s.title}`);
    seen.add(s.title);
    assert(Array.isArray(s.charts) && s.charts.length > 0, `song without charts: ${s.title}`);
    for (const c of s.charts) {
      assert(isIn(PLAY_STYLES, c.playStyle), `invalid playStyle "${c.playStyle}" in ${s.title}`);
      assert(isIn(DIFFICULTIES, c.difficulty), `invalid difficulty "${c.difficulty}" in ${s.title}`);
      assert(Number.isInteger(c.level) && c.level >= 1 && c.level <= 12, `invalid level in ${s.title}`);
    }
  }
}

/**
 * 地力表 JSON の slug / 帯名重複 / 同一譜面の二重掲載を検証する。
 *
 * @param sheet - 1 ファイル分
 * @param file - エラーメッセージ用のファイル名
 */
function validateSheet(sheet: SheetJson, file: string) {
  assert(typeof sheet.slug === "string" && /^[a-z0-9-]+$/.test(sheet.slug), `${file}: invalid slug`);
  assert(isIn(PLAY_STYLES, sheet.playStyle), `${file}: invalid playStyle`);
  const tierNames = new Set<string>();
  const entryKeys = new Set<string>();
  for (const t of sheet.tiers) {
    assert(!tierNames.has(t.name), `${file}: duplicate tier ${t.name}`);
    tierNames.add(t.name);
    assert(isIn(TIER_KINDS, t.kind), `${file}: invalid tier kind "${t.kind}" in ${t.name}`);
    for (const e of t.entries) {
      assert(isIn(DIFFICULTIES, e.difficulty), `${file}: invalid difficulty for ${e.title}`);
      const key = `${e.playStyle ?? sheet.playStyle}|${e.difficulty}|${e.title}`;
      assert(!entryKeys.has(key), `${file}: chart listed twice: ${key}`);
      entryKeys.add(key);
    }
  }
}

// ---------- 取り込み ----------

/**
 * 譜面の突き合わせキー。シート JSON と songs.json の対応に使う。
 *
 * @param playStyle - SP / DP
 * @param difficulty - 譜面難易度
 * @param title - 楽曲タイトル (Song.title と一致)
 */
const chartKey = (playStyle: PlayStyle, difficulty: Difficulty, title: string) =>
  `${playStyle}|${difficulty}|${title}`;

/**
 * 大量の upsert を分割トランザクションにする。1 本にするとタイムアウトしやすい。
 *
 * @param ops - Prisma Promise の列
 * @param size - 1 トランザクションあたりの件数。デフォルト 200
 */
async function runBatched<T>(ops: Prisma.PrismaPromise<T>[], size = 200) {
  for (let i = 0; i < ops.length; i += size) {
    await prisma.$transaction(ops.slice(i, i + size));
  }
}

/**
 * 楽曲と譜面を upsert し、チャートキー → Chart.id の対応表を返す。
 * User / ChartRecord には触れない (個人記録を消さない)。
 *
 * @param songs - 検証済みの楽曲配列
 * @returns `SP|ANOTHER|タイトル` 形式のキーから chartId
 */
async function importSongs(songs: SongJson[]) {
  await runBatched(
    songs.map((s) =>
      prisma.song.upsert({
        where: { title: s.title },
        create: {
          title: s.title,
          artist: s.artist ?? null,
          genre: s.genre ?? null,
          version: s.version ?? null,
          bpm: s.bpm ?? null,
        },
        update: {
          artist: s.artist ?? null,
          genre: s.genre ?? null,
          version: s.version ?? null,
          bpm: s.bpm ?? null,
        },
      }),
    ),
  );

  const songRows = await prisma.song.findMany({ select: { id: true, title: true } });
  const songIdByTitle = new Map(songRows.map((r) => [r.title, r.id]));

  await runBatched(
    songs.flatMap((s) => {
      const songId = songIdByTitle.get(s.title)!;
      return s.charts.map((c) =>
        prisma.chart.upsert({
          where: { songId_playStyle_difficulty: { songId, playStyle: c.playStyle, difficulty: c.difficulty } },
          create: { songId, playStyle: c.playStyle, difficulty: c.difficulty, level: c.level, notes: c.notes ?? null },
          update: { level: c.level, notes: c.notes ?? null },
        }),
      );
    }),
  );

  const chartRows = await prisma.chart.findMany({
    select: { id: true, playStyle: true, difficulty: true, song: { select: { title: true } } },
  });
  return new Map(chartRows.map((r) => [chartKey(r.playStyle, r.difficulty, r.song.title), r.id]));
}

/**
 * 1 つの地力表を upsert。JSON に無い帯は削除 (エントリは cascade)。
 * JSON にあるが songs に無い譜面があれば例外。
 *
 * @param sheet - 検証済みシート
 * @param chartIdByKey - {@link importSongs} の戻り値
 * @returns 取り込んだ帯数とエントリ数
 * @throws 参照譜面が songs.json に無いとき
 */
async function importSheet(sheet: SheetJson, chartIdByKey: Map<string, number>) {
  const row = await prisma.sheet.upsert({
    where: { slug: sheet.slug },
    create: {
      slug: sheet.slug,
      name: sheet.name,
      description: sheet.description ?? null,
      playStyle: sheet.playStyle,
      level: sheet.level,
    },
    update: { name: sheet.name, description: sheet.description ?? null, playStyle: sheet.playStyle, level: sheet.level },
  });

  // 帯: JSON に無いものは削除 (エントリは cascade)。順序は配列順。
  await prisma.tier.deleteMany({ where: { sheetId: row.id, name: { notIn: sheet.tiers.map((t) => t.name) } } });
  // order の一意制約と衝突しないよう一旦退避
  await prisma.tier.updateMany({ where: { sheetId: row.id }, data: { order: { increment: 100000 } } });
  const tierIdByName = new Map<string, number>();
  for (const [i, t] of sheet.tiers.entries()) {
    const tier = await prisma.tier.upsert({
      where: { sheetId_name: { sheetId: row.id, name: t.name } },
      create: { sheetId: row.id, name: t.name, kind: t.kind, order: (i + 1) * 10 },
      update: { kind: t.kind, order: (i + 1) * 10 },
    });
    tierIdByName.set(t.name, tier.id);
  }

  // エントリ
  const desired: { chartId: number; tierId: number; note: string | null }[] = [];
  const missing: string[] = [];
  for (const t of sheet.tiers) {
    const tierId = tierIdByName.get(t.name)!;
    for (const e of t.entries) {
      const key = chartKey(e.playStyle ?? sheet.playStyle, e.difficulty, e.title);
      const chartId = chartIdByKey.get(key);
      if (chartId === undefined) {
        missing.push(key);
        continue;
      }
      desired.push({ chartId, tierId, note: e.note ?? null });
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `${sheet.slug}: ${missing.length} chart(s) not found in songs.json:\n  ${missing.slice(0, 20).join("\n  ")}${missing.length > 20 ? "\n  ..." : ""}`,
    );
  }

  await prisma.sheetEntry.deleteMany({
    where: { sheetId: row.id, chartId: { notIn: desired.map((d) => d.chartId) } },
  });
  await runBatched(
    desired.map((d) =>
      prisma.sheetEntry.upsert({
        where: { sheetId_chartId: { sheetId: row.id, chartId: d.chartId } },
        create: { sheetId: row.id, chartId: d.chartId, tierId: d.tierId, note: d.note },
        update: { tierId: d.tierId, note: d.note },
      }),
    ),
  );
  // updatedAt を更新
  await prisma.sheet.update({ where: { id: row.id }, data: { updatedAt: new Date() } });

  return { tiers: sheet.tiers.length, entries: desired.length };
}

/**
 * CLI エントリ。`DATA_DIR` が無ければリポジトリの `data/`。
 *
 * @returns なし。失敗時は process.exit(1)
 */
async function main() {
  console.log(`[import] data dir: ${DATA_DIR}`);

  const songsFile = path.join(DATA_DIR, "songs.json");
  assert(fs.existsSync(songsFile), `not found: ${songsFile}`);
  const songs = readJson<SongJson[]>(songsFile);
  validateSongs(songs);

  const sheetsDir = path.join(DATA_DIR, "sheets");
  const sheetFiles = fs.existsSync(sheetsDir)
    ? fs.readdirSync(sheetsDir).filter((f) => f.endsWith(".json")).sort()
    : [];
  const sheets = sheetFiles.map((f) => {
    const sheet = readJson<SheetJson>(path.join(sheetsDir, f));
    validateSheet(sheet, f);
    return sheet;
  });

  const started = Date.now();
  const chartIdByKey = await importSongs(songs);
  console.log(`[import] songs: ${songs.length}, charts: ${chartIdByKey.size}`);

  for (const sheet of sheets) {
    const r = await importSheet(sheet, chartIdByKey);
    console.log(`[import] sheet "${sheet.name}" (${sheet.slug}): tiers ${r.tiers}, entries ${r.entries}`);
  }

  console.log(`[import] done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
