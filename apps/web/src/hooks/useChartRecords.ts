import { useCallback, useEffect, useState } from "react";
import type { ChartRecordDto, ChartRecordInput } from "@jirikihyou/shared";
import { api } from "../api";

/**
 * 譜面ごとの記録 (クリアタイプ / EX スコア / ミスカウント)。
 * API (DB) に保存する。save / remove は楽観的更新し、失敗時は元に戻して例外を投げる。
 */
export type RecordMap = Readonly<Record<number, ChartRecordDto>>;

export function useChartRecords() {
  const [records, setRecords] = useState<RecordMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .records()
      .then((res) => {
        if (cancelled) return;
        setRecords(Object.fromEntries(res.records.map((r) => [r.chartId, r])));
      })
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback(async (chartId: number, input: ChartRecordInput): Promise<ChartRecordDto> => {
    let previous: ChartRecordDto | undefined;
    setRecords((prev) => {
      previous = prev[chartId];
      return { ...prev, [chartId]: { chartId, ...input, updatedAt: new Date().toISOString() } };
    });
    try {
      const saved = await api.saveRecord(chartId, input);
      setRecords((prev) => ({ ...prev, [chartId]: saved }));
      return saved;
    } catch (e) {
      setRecords((prev) => {
        const { [chartId]: _optimistic, ...rest } = prev;
        return previous ? { ...rest, [chartId]: previous } : rest;
      });
      throw e;
    }
  }, []);

  const remove = useCallback(async (chartId: number): Promise<void> => {
    let previous: ChartRecordDto | undefined;
    setRecords((prev) => {
      previous = prev[chartId];
      const { [chartId]: _removed, ...rest } = prev;
      return rest;
    });
    try {
      await api.deleteRecord(chartId);
    } catch (e) {
      if (previous) setRecords((prev) => ({ ...prev, [chartId]: previous! }));
      throw e;
    }
  }, []);

  return { records, loading, error, save, remove };
}
