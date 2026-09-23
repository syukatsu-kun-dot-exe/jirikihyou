import { useCallback, useSyncExternalStore } from "react";
import type { ChartRecord } from "@jirikihyou/shared";

/**
 * 譜面ごとの記録 (クリアタイプ / EX スコア / ミスカウント)。
 * ユーザー機能ができるまでの暫定として localStorage に保存する。
 * 保存先を API に差し替えるときはこのファイルだけ変えればよい。
 */
const STORAGE_KEY = "jirikihyou.records.v1";

type RecordMap = Readonly<Record<number, ChartRecord>>;

let cache: RecordMap | null = null;
const listeners = new Set<() => void>();

function load(): RecordMap {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    cache = raw ? (JSON.parse(raw) as RecordMap) : {};
  } catch {
    cache = {};
  }
  return cache;
}

function persist(next: RecordMap) {
  cache = next;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      cache = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useChartRecords() {
  const records = useSyncExternalStore(subscribe, load, () => ({}) as RecordMap);

  const save = useCallback((chartId: number, input: Omit<ChartRecord, "updatedAt">) => {
    persist({ ...load(), [chartId]: { ...input, updatedAt: new Date().toISOString() } });
  }, []);

  const remove = useCallback((chartId: number) => {
    const { [chartId]: _removed, ...rest } = load();
    persist(rest);
  }, []);

  return { records, save, remove };
}
