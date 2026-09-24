/**
 * フロント/バック間で共有する型と定数。
 * DB の enum (Prisma) と値を揃えておく。
 */

export const PLAY_STYLES = ["SP", "DP"] as const;
export type PlayStyle = (typeof PLAY_STYLES)[number];

export const DIFFICULTIES = ["BEGINNER", "NORMAL", "HYPER", "ANOTHER", "LEGGENDARIA"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const DIFFICULTY_SHORT: Record<Difficulty, string> = {
  BEGINNER: "B",
  NORMAL: "N",
  HYPER: "H",
  ANOTHER: "A",
  LEGGENDARIA: "L",
};

export const TIER_KINDS = ["JIRIKI", "KOJINSA", "UNRATED"] as const;
export type TierKind = (typeof TIER_KINDS)[number];

/**
 * AC バージョン。`number` は Song.version と一致する (1 = 1st style)。
 * 新作が出たら末尾に追加する。
 */
export interface VersionInfo {
  number: number;
  name: string;
}

export const VERSIONS: readonly VersionInfo[] = [
  { number: 1, name: "1st style" },
  { number: 2, name: "2nd style" },
  { number: 3, name: "3rd style" },
  { number: 4, name: "4th style" },
  { number: 5, name: "5th style" },
  { number: 6, name: "6th style" },
  { number: 7, name: "7th style" },
  { number: 8, name: "8th style" },
  { number: 9, name: "9th style" },
  { number: 10, name: "10th style" },
  { number: 11, name: "IIDX RED" },
  { number: 12, name: "HAPPY SKY" },
  { number: 13, name: "DistorteD" },
  { number: 14, name: "GOLD" },
  { number: 15, name: "DJ TROOPERS" },
  { number: 16, name: "EMPRESS" },
  { number: 17, name: "SIRIUS" },
  { number: 18, name: "Resort Anthem" },
  { number: 19, name: "Lincle" },
  { number: 20, name: "tricoro" },
  { number: 21, name: "SPADA" },
  { number: 22, name: "PENDUAL" },
  { number: 23, name: "copula" },
  { number: 24, name: "SINOBUZ" },
  { number: 25, name: "CANNON BALLERS" },
  { number: 26, name: "Rootage" },
  { number: 27, name: "HEROIC VERSE" },
  { number: 28, name: "BISTROVER" },
  { number: 29, name: "CastHour" },
  { number: 30, name: "RESIDENT" },
  { number: 31, name: "EPOLIS" },
  { number: 32, name: "Pinky Crush" },
  { number: 33, name: "Sparkle Shower" },
  { number: 34, name: "ZINRAI" },
];

/**
 * `Song.version` を表示名に変換する。
 *
 * @param n - バージョン番号 (1 = 1st style)。未設定なら null/undefined
 * @returns 対応表の名称。未設定は「不明」、未知の番号は `ver.{n}`
 */
export const versionName = (n: number | null | undefined): string =>
  VERSIONS.find((v) => v.number === n)?.name ?? (n == null ? "不明" : `ver.${n}`);

/** クリアランプ。配列順 = 弱い → 強い。値は Prisma の enum ClearType と一致 */
export const CLEAR_TYPES = ["NO_PLAY", "FAILED", "ASSIST", "EASY", "CLEAR", "HARD", "EX_HARD", "FC"] as const;
export type ClearType = (typeof CLEAR_TYPES)[number];

/** 表示用ラベル */
export const CLEAR_TYPE_LABEL: Record<ClearType, string> = {
  NO_PLAY: "NO PLAY",
  FAILED: "FAILED",
  ASSIST: "ASSIST",
  EASY: "EASY",
  CLEAR: "CLEAR",
  HARD: "HARD",
  EX_HARD: "EX HARD",
  FC: "FULL COMBO",
};

/**
 * 値が {@link CLEAR_TYPES} のいずれかであるかを判定する (API 入力の検証用)。
 *
 * @param v - 未検証の値
 * @returns `v` が ClearType なら true
 */
export const isClearType = (v: unknown): v is ClearType =>
  typeof v === "string" && (CLEAR_TYPES as readonly string[]).includes(v);

/** 記録の保存リクエスト (PUT /api/records/:chartId の body) */
export interface ChartRecordInput {
  /** クリアランプ。NO_PLAY も保存可 */
  clearType: ClearType;
  /** EX スコア。未入力は null。サーバは notes*2 超を 400 */
  exScore: number | null;
  /** ミスカウント (BP)。未入力は null */
  missCount: number | null;
}

/** 1 譜面に対するプレイヤーの最新記録 */
export interface ChartRecordDto extends ChartRecordInput {
  chartId: number;
  updatedAt: string;
}

/** GET /api/records のレスポンス */
export interface ChartRecordsResponse {
  records: ChartRecordDto[];
}

/**
 * 理論上の最大 EX スコア。IIDX は 1 ノーツ = 2 点 (PGREAT)。
 *
 * @param notes - 譜面のノーツ数
 * @returns `notes * 2`
 */
export const maxExScore = (notes: number) => notes * 2;

export const DJ_LEVELS = ["F", "E", "D", "C", "B", "A", "AA", "AAA"] as const;
export type DjLevel = (typeof DJ_LEVELS)[number];

/**
 * EX スコアとノーツ数から DJ LEVEL を求める。
 * 公式と同じく理論値を 9 等分し、`floor(ex * 9 / max)` が 8 以上なら AAA、7 なら AA、…。
 *
 * @param exScore - 取得 EX スコア (0 以上)
 * @param notes - 譜面のノーツ数。0 以下なら F
 * @returns F〜AAA
 */
export function djLevel(exScore: number, notes: number): DjLevel {
  const max = maxExScore(notes);
  if (max <= 0) return "F";
  const ninths = Math.floor((exScore * 9) / max);
  if (ninths >= 8) return "AAA";
  if (ninths >= 7) return "AA";
  if (ninths >= 6) return "A";
  if (ninths >= 5) return "B";
  if (ninths >= 4) return "C";
  if (ninths >= 3) return "D";
  if (ninths >= 2) return "E";
  return "F";
}

export interface HealthResponse {
  status: "ok" | "degraded";
  db: "ok" | "error";
  timestamp: string;
}

export interface SongDto {
  id: number;
  title: string;
  artist: string | null;
  genre: string | null;
  version: number | null;
  bpm: string | null;
  charts: ChartDto[];
}

export interface ChartDto {
  id: number;
  songId: number;
  playStyle: PlayStyle;
  difficulty: Difficulty;
  level: number;
  notes: number | null;
}

export interface SheetSummaryDto {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  playStyle: PlayStyle;
  level: number;
  updatedAt: string;
}

export interface SheetEntryDto {
  id: number;
  chart: ChartDto & { song: Omit<SongDto, "charts"> };
  note: string | null;
}

export interface SheetTierDto {
  id: number;
  name: string;
  order: number;
  kind: TierKind;
  entries: SheetEntryDto[];
}

export interface SheetDetailDto extends SheetSummaryDto {
  tiers: SheetTierDto[];
}
