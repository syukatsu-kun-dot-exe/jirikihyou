import type {
  ChartRecordDto,
  ChartRecordInput,
  ChartRecordsResponse,
  HealthResponse,
  SheetDetailDto,
  SheetSummaryDto,
} from "@jirikihyou/shared";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // body が JSON でなければステータスのみ
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: body === undefined ? undefined : { "Content-Type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const api = {
  health: () => request<HealthResponse>("/api/health"),
  sheets: () => request<SheetSummaryDto[]>("/api/sheets"),
  sheet: (idOrSlug: number | string) => request<SheetDetailDto>(`/api/sheets/${idOrSlug}`),
  records: () => request<ChartRecordsResponse>("/api/records"),
  saveRecord: (chartId: number, input: ChartRecordInput) =>
    request<ChartRecordDto>(`/api/records/${chartId}`, json("PUT", input)),
  deleteRecord: (chartId: number) => request<void>(`/api/records/${chartId}`, json("DELETE")),
};
