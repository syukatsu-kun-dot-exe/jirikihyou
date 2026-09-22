import type { HealthResponse, SheetDetailDto, SheetSummaryDto } from "@jirikihyou/shared";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${path}`);
  return (await res.json()) as T;
}

export const api = {
  health: () => get<HealthResponse>("/api/health"),
  sheets: () => get<SheetSummaryDto[]>("/api/sheets"),
  sheet: (idOrSlug: number | string) => get<SheetDetailDto>(`/api/sheets/${idOrSlug}`),
};
