import type {
  ChartRecordDto,
  ChartRecordInput,
  ChartRecordsResponse,
  HealthResponse,
  SheetDetailDto,
  SheetSummaryDto,
} from "@jirikihyou/shared";

/**
 * 本番ビルドでは `VITE_API_BASE`（例: `https://xxx.onrender.com`）を付ける。
 * 未設定のときは `/api` のままで、開発時は Vite が api コンテナへプロキシする。
 */
const apiBase = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");

/**
 * `/api` への fetch ラッパ。
 * 失敗時は `{ error }` があればその文言、無ければ HTTP ステータスを Error にする。
 *
 * @typeParam T - 成功時の JSON 型。204 は `undefined`
 * @param path - `/api/...` で始まるパス
 * @param init - 任意の RequestInit
 * @returns パース済み JSON
 * @throws Error 非 2xx のとき
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBase}${path}`, init);
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

/**
 * JSON body 付きの fetch オプション。
 *
 * @param method - PUT / DELETE など
 * @param body - 省略時は Content-Type も付けない
 */
const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: body === undefined ? undefined : { "Content-Type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

/** フロントから使う API クライアント。認証ヘッダは未使用 (サーバが userId=1 固定) */
export const api = {
  /** GET /api/health */
  health: () => request<HealthResponse>("/api/health"),
  /** GET /api/sheets */
  sheets: () => request<SheetSummaryDto[]>("/api/sheets"),
  /**
   * GET /api/sheets/:idOrSlug
   * @param idOrSlug - 数値 id または slug
   */
  sheet: (idOrSlug: number | string) => request<SheetDetailDto>(`/api/sheets/${idOrSlug}`),
  /** GET /api/records */
  records: () => request<ChartRecordsResponse>("/api/records"),
  /**
   * PUT /api/records/:chartId
   * @param chartId - 譜面 id
   * @param input - クリアタイプと任意のスコア
   */
  saveRecord: (chartId: number, input: ChartRecordInput) =>
    request<ChartRecordDto>(`/api/records/${chartId}`, json("PUT", input)),
  /**
   * DELETE /api/records/:chartId
   * @param chartId - 消す譜面 id
   */
  deleteRecord: (chartId: number) => request<void>(`/api/records/${chartId}`, json("DELETE")),
};
