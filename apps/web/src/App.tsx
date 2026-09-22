import { useEffect, useMemo, useState } from "react";
import type { HealthResponse, SheetDetailDto } from "@jirikihyou/shared";
import { DIFFICULTY_SHORT } from "@jirikihyou/shared";
import { api } from "./api";

export function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [sheet, setSheet] = useState<SheetDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    api.health().then(setHealth).catch((e) => setError(String(e)));
    api
      .sheets()
      .then((list) => (list[0] ? api.sheet(list[0].id) : null))
      .then(setSheet)
      .catch((e) => setError(String(e)));
  }, []);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredTiers = useMemo(() => {
    if (!sheet) return [];
    if (!normalizedQuery) return sheet.tiers;
    return sheet.tiers.map((tier) => ({
      ...tier,
      entries: tier.entries.filter((e) => e.chart.song.title.toLowerCase().includes(normalizedQuery)),
    }));
  }, [sheet, normalizedQuery]);

  const totalEntries = sheet?.tiers.reduce((sum, t) => sum + t.entries.length, 0) ?? 0;
  const shownEntries = filteredTiers.reduce((sum, t) => sum + t.entries.length, 0);

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

          <div className="toolbar">
            <input
              type="search"
              className="search"
              placeholder="楽曲名で検索..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {normalizedQuery && (
              <span className="muted small">
                {shownEntries} / {totalEntries} 件
              </span>
            )}
          </div>

          {filteredTiers.map((tier) => {
            if (normalizedQuery && tier.entries.length === 0) return null;
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
                      <li key={e.id} className={`card diff-${e.chart.difficulty.toLowerCase()}`}>
                        <span className="level">
                          {e.chart.level}
                          <small>{DIFFICULTY_SHORT[e.chart.difficulty]}</small>
                        </span>
                        <span className="title" title={e.chart.song.title}>
                          {e.chart.song.title}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </section>
      ) : (
        !error && <p className="muted">読み込み中...</p>
      )}
    </main>
  );
}
