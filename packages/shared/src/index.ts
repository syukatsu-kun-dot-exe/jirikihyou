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
