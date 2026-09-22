import { useEffect, useState } from "react";
import type { HealthResponse, SheetDetailDto } from "@jirikihyou/shared";
import { DIFFICULTY_SHORT } from "@jirikihyou/shared";
import { api } from "./api";

export function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [sheet, setSheet] = useState<SheetDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.health().then(setHealth).catch((e) => setError(String(e)));
    api
      .sheets()
      .then((list) => (list[0] ? api.sheet(list[0].id) : null))
      .then(setSheet)
      .catch((e) => setError(String(e)));
  }, []);

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
          {sheet.tiers.map((tier) => (
            <div key={tier.id} className="tier">
              <h3 className={`tier-name ${tier.kind.toLowerCase()}`}>{tier.name}</h3>
              {tier.entries.length === 0 ? (
                <p className="muted small">（なし）</p>
              ) : (
                <ul className="grid">
                  {tier.entries.map((e) => (
                    <li key={e.id} className="card">
                      <span className="level">
                        {e.chart.level}
                        <small>{DIFFICULTY_SHORT[e.chart.difficulty]}</small>
                      </span>
                      <span className="title">{e.chart.song.title}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </section>
      ) : (
        !error && <p className="muted">読み込み中...</p>
      )}
    </main>
  );
}
