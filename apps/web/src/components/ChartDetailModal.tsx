import { useEffect, useRef } from "react";
import type { SheetDetailDto, SheetEntryDto, SheetTierDto } from "@jirikihyou/shared";
import { DIFFICULTY_SHORT, versionName } from "@jirikihyou/shared";

const DIFFICULTY_LABEL: Record<SheetEntryDto["chart"]["difficulty"], string> = {
  BEGINNER: "BEGINNER",
  NORMAL: "NORMAL",
  HYPER: "HYPER",
  ANOTHER: "ANOTHER",
  LEGGENDARIA: "LEGGENDARIA",
};

interface Props {
  sheet: SheetDetailDto;
  entry: SheetEntryDto | null;
  onClose: () => void;
  /** 同じ楽曲の別譜面へ移動 */
  onSelect: (entry: SheetEntryDto) => void;
}

export function ChartDetailModal({ sheet, entry, onClose, onSelect }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  // entry の有無で <dialog> を開閉 (showModal で Esc / フォーカストラップが効く)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (entry && !el.open) el.showModal();
    if (!entry && el.open) el.close();
  }, [entry]);

  if (!entry) return <dialog ref={ref} className="modal" onClose={onClose} />;

  const { chart } = entry;
  const { song } = chart;

  // この表に載っている同じ楽曲の全譜面 (帯付き)
  const siblings: { tier: SheetTierDto; entry: SheetEntryDto }[] = [];
  let currentTier: SheetTierDto | undefined;
  for (const tier of sheet.tiers) {
    for (const e of tier.entries) {
      if (e.chart.song.id === song.id) siblings.push({ tier, entry: e });
      if (e.id === entry.id) currentTier = tier;
    }
  }

  const rows: [string, string | null | undefined][] = [
    ["アーティスト", song.artist],
    ["ジャンル", song.genre],
    ["バージョン", versionName(song.version)],
    ["BPM", song.bpm],
    ["ノーツ数", chart.notes != null ? chart.notes.toLocaleString() : null],
    ["地力帯", currentTier?.name],
  ];

  return (
    <dialog
      ref={ref}
      className="modal"
      onClose={onClose}
      onClick={(e) => {
        // 背景 (dialog 自身) クリックで閉じる
        if (e.target === e.currentTarget) onClose();
      }}
      aria-labelledby="chart-detail-title"
    >
      <div className="modal-body">
        <header className="modal-header">
          <div className={`modal-chart diff-${chart.difficulty.toLowerCase()}`}>
            <span className="level">
              {chart.playStyle}
              {chart.level}
              <small>{DIFFICULTY_SHORT[chart.difficulty]}</small>
            </span>
            <span className="muted small">{DIFFICULTY_LABEL[chart.difficulty]}</span>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="閉じる">
            ×
          </button>
        </header>

        <h2 id="chart-detail-title" className="modal-title">
          {song.title}
        </h2>

        <dl className="detail">
          {rows.map(([label, value]) => (
            <div key={label} className="detail-row">
              <dt>{label}</dt>
              <dd className={value ? "" : "muted"}>{value ?? "—"}</dd>
            </div>
          ))}
        </dl>

        {siblings.length > 1 && (
          <section className="siblings">
            <h3 className="muted small">この表に載っている同じ楽曲の譜面</h3>
            <ul>
              {siblings.map(({ tier, entry: e }) => (
                <li key={e.id}>
                  <button
                    type="button"
                    className={`chip ${e.id === entry.id ? "active" : ""}`}
                    disabled={e.id === entry.id}
                    onClick={() => onSelect(e)}
                  >
                    {DIFFICULTY_LABEL[e.chart.difficulty]} ☆{e.chart.level} / {tier.name}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {entry.note && <p className="entry-note">{entry.note}</p>}
      </div>
    </dialog>
  );
}
