import { useEffect, useMemo, useState } from "react";
import type { HealthResponse, SheetDetailDto } from "@jirikihyou/shared";
import { DIFFICULTY_SHORT, VERSIONS, versionName } from "@jirikihyou/shared";
import { api } from "./api";

// 新しいバージョンを先頭に表示 (参考サイトと同じ並び)
const VERSIONS_DESC = [...VERSIONS].reverse();

export function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [sheet, setSheet] = useState<SheetDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedVersions, setSelectedVersions] = useState<ReadonlySet<number>>(new Set());

  useEffect(() => {
    api.health().then(setHealth).catch((e) => setError(String(e)));
    api
      .sheets()
      .then((list) => (list[0] ? api.sheet(list[0].id) : null))
      .then(setSheet)
      .catch((e) => setError(String(e)));
  }, []);

  // バージョンごとの譜面数 (ボタンに表示、0 件は無効化)
  const countByVersion = useMemo(() => {
    const m = new Map<number, number>();
    for (const t of sheet?.tiers ?? []) {
      for (const e of t.entries) {
        const v = e.chart.song.version;
        if (v != null) m.set(v, (m.get(v) ?? 0) + 1);
      }
    }
    return m;
  }, [sheet]);

  const normalizedQuery = query.trim().toLowerCase();
  const isFiltering = normalizedQuery.length > 0 || selectedVersions.size > 0;

  const filteredTiers = useMemo(() => {
    if (!sheet) return [];
    if (!isFiltering) return sheet.tiers;
    return sheet.tiers.map((tier) => ({
      ...tier,
      entries: tier.entries.filter((e) => {
        const { title, version } = e.chart.song;
        if (selectedVersions.size > 0 && (version == null || !selectedVersions.has(version))) return false;
        if (normalizedQuery && !title.toLowerCase().includes(normalizedQuery)) return false;
        return true;
      }),
    }));
  }, [sheet, isFiltering, normalizedQuery, selectedVersions]);

  const totalEntries = sheet?.tiers.reduce((sum, t) => sum + t.entries.length, 0) ?? 0;
  const shownEntries = filteredTiers.reduce((sum, t) => sum + t.entries.length, 0);

  const toggleVersion = (n: number) =>
    setSelectedVersions((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });

  return (
    <main className="container">
      <header className="header">
        <h1>jirikihyou</h1>
        <span className={`badge ${health?.db === "ok" ? "ok" : "ng"}`}>
          API: {health ? `${health.status} / db ${health.db}` : "..."}
        </span>
      </header>

      {error && <p className="error">{error}</p>}

      {sheet ? (
        <section>
          <h2>{sheet.name}</h2>
          {sheet.description && <p className="muted">{sheet.description}</p>}
          <p className="muted small">
            {sheet.playStyle}☆{sheet.level} / {totalEntries} 譜面 / 更新:{" "}
            {new Date(sheet.updatedAt).toLocaleString("ja-JP")}
          </p>

          <div className="version-filter" role="group" aria-label="バージョンで絞り込み">
            {VERSIONS_DESC.map((v) => {
              const count = countByVersion.get(v.number) ?? 0;
              const active = selectedVersions.has(v.number);
              return (
                <button
                  key={v.number}
                  type="button"
                  className={`chip ${active ? "active" : ""}`}
                  aria-pressed={active}
                  disabled={count === 0}
                  title={`${v.name} (${count} 譜面)`}
                  onClick={() => toggleVersion(v.number)}
                >
                  {v.name}
                </button>
              );
            })}
            {selectedVersions.size > 0 && (
              <button type="button" className="chip clear" onClick={() => setSelectedVersions(new Set())}>
                選択解除 ({selectedVersions.size})
              </button>
            )}
          </div>

          <div className="toolbar">
            <input
              type="search"
              className="search"
              placeholder="楽曲名で検索..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {isFiltering && (
              <span className="muted small">
                {shownEntries} / {totalEntries} 件
              </span>
            )}
          </div>

          {filteredTiers.map((tier) => {
            if (isFiltering && tier.entries.length === 0) return null;
            return (
              <div key={tier.id} className="tier">
                <h3 className={`tier-name ${tier.kind.toLowerCase()}`}>
                  {tier.name}
                  <span className="count">{tier.entries.length}</span>
                </h3>
                {tier.entries.length === 0 ? (
                  <p className="muted small">（なし）</p>
                ) : (
                  <ul className="grid">
                    {tier.entries.map((e) => (
                      <li
                        key={e.id}
                        className={`card diff-${e.chart.difficulty.toLowerCase()}`}
                        title={[
                          e.chart.song.title,
                          e.chart.song.artist,
                          e.chart.song.genre,
                          versionName(e.chart.song.version),
                          e.chart.song.bpm && `BPM ${e.chart.song.bpm}`,
                          e.chart.notes != null && `${e.chart.notes} notes`,
                        ]
                          .filter(Boolean)
                          .join(" / ")}
                      >
                        <span className="level">
                          {e.chart.level}
                          <small>{DIFFICULTY_SHORT[e.chart.difficulty]}</small>
                        </span>
                        <span className="title">{e.chart.song.title}</span>
                        <span className="version">{versionName(e.chart.song.version)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}

          {isFiltering && shownEntries === 0 && <p className="muted">該当する譜面がありません。</p>}
        </section>
      ) : (
        !error && <p className="muted">読み込み中...</p>
      )}
    </main>
  );
}
