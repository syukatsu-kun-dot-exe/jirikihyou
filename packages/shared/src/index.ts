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

export const versionName = (n: number | null | undefined): string =>
  VERSIONS.find((v) => v.number === n)?.name ?? (n == null ? "不明" : `ver.${n}`);

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
