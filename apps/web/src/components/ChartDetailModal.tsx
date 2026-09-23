import { useEffect, useRef, useState, type FormEvent } from "react";
import type {
  ChartRecordDto,
  ChartRecordInput,
  ClearType,
  SheetDetailDto,
  SheetEntryDto,
  SheetTierDto,
} from "@jirikihyou/shared";
import { CLEAR_TYPES, CLEAR_TYPE_LABEL, DIFFICULTY_SHORT, djLevel, maxExScore, versionName } from "@jirikihyou/shared";
import { RecordImageInput } from "./RecordImageInput";

const DIFFICULTY_LABEL: Record<SheetEntryDto["chart"]["difficulty"], string> = {
  BEGINNER: "BEGINNER",
  NORMAL: "NORMAL",
  HYPER: "HYPER",
  ANOTHER: "ANOTHER",
  LEGGENDARIA: "LEGGENDARIA",
};

type Tab = "record" | "detail";

interface Props {
  sheet: SheetDetailDto;
  entry: SheetEntryDto | null;
  record: ChartRecordDto | undefined;
  onSaveRecord: (chartId: number, input: ChartRecordInput) => Promise<unknown>;
  onRemoveRecord: (chartId: number) => Promise<void>;
  onClose: () => void;
  /** 同じ楽曲の別譜面へ移動 */
  onSelect: (entry: SheetEntryDto) => void;
}

export function ChartDetailModal({ sheet, entry, record, onSaveRecord, onRemoveRecord, onClose, onSelect }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<Tab>("record");

  // entry の有無で <dialog> を開閉 (showModal で Esc / フォーカストラップが効く)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (entry && !el.open) {
      setTab("record");
      el.showModal();
    }
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
            {currentTier && <span className="muted small">/ {currentTier.name}</span>}
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="閉じる">
            ×
          </button>
        </header>

        <h2 id="chart-detail-title" className="modal-title">
          {song.title}
        </h2>

        {siblings.length > 1 && (
          <ul className="siblings">
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
        )}

        <div className="tabs" role="tablist" aria-label="表示切替">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "record"}
            className={`tab ${tab === "record" ? "active" : ""}`}
            onClick={() => setTab("record")}
          >
            記録
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "detail"}
            className={`tab ${tab === "detail" ? "active" : ""}`}
            onClick={() => setTab("detail")}
          >
            楽曲詳細
          </button>
        </div>

        {tab === "record" ? (
          <RecordForm
            key={chart.id}
            chartId={chart.id}
            notes={chart.notes}
            record={record}
            onSave={onSaveRecord}
            onRemove={onRemoveRecord}
          />
        ) : (
          <DetailPanel entry={entry} />
        )}
      </div>
    </dialog>
  );
}

// ---------- 記録タブ ----------

interface RecordFormProps {
  chartId: number;
  notes: number | null;
  record: ChartRecordDto | undefined;
  onSave: (chartId: number, input: ChartRecordInput) => Promise<unknown>;
  onRemove: (chartId: number) => Promise<void>;
}

const toInt = (s: string): number | null => {
  const t = s.trim();
  if (!t) return null;
  const n = Number.parseInt(t, 10);
  return Number.isNaN(n) || n < 0 ? null : n;
};

function RecordForm({ chartId, notes, record, onSave, onRemove }: RecordFormProps) {
  const [clearType, setClearType] = useState<ClearType>(record?.clearType ?? "NO_PLAY");
  const [exScore, setExScore] = useState(record?.exScore?.toString() ?? "");
  const [missCount, setMissCount] = useState(record?.missCount?.toString() ?? "");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    clearType !== (record?.clearType ?? "NO_PLAY") ||
    exScore !== (record?.exScore?.toString() ?? "") ||
    missCount !== (record?.missCount?.toString() ?? "");

  const ex = toInt(exScore);
  const max = notes != null ? maxExScore(notes) : null;
  const exTooLarge = ex != null && max != null && ex > max;
  const rate = ex != null && max ? (ex / max) * 100 : null;

  const run = async (action: () => Promise<unknown>, onDone: () => void) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (exTooLarge || busy) return;
    void run(
      () => onSave(chartId, { clearType, exScore: ex, missCount: toInt(missCount) }),
      () => setSavedAt(new Date().toLocaleTimeString("ja-JP")),
    );
  };

  const removeRecord = () =>
    void run(
      () => onRemove(chartId),
      () => {
        setClearType("NO_PLAY");
        setExScore("");
        setMissCount("");
        setSavedAt(null);
      },
    );

  return (
    <form className="record-form" onSubmit={submit}>
      <RecordImageInput
        notes={notes}
        disabled={busy}
        onApplied={(fill) => {
          if (fill.clearType) setClearType(fill.clearType);
          if (fill.exScore != null) setExScore(String(fill.exScore));
          if (fill.missCount != null) setMissCount(String(fill.missCount));
          setSavedAt(null);
          setError(null);
        }}
      />

      <label className="field">
        <span className="field-label">クリアタイプ</span>
        <select
          className={`input lamp-text-${clearType.replace(/_/g, "-").toLowerCase()}`}
          value={clearType}
          onChange={(e) => setClearType(e.target.value as ClearType)}
        >
          {CLEAR_TYPES.map((t) => (
            <option key={t} value={t}>
              {CLEAR_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span className="field-label">EXスコア</span>
        <input
          className="input"
          type="number"
          inputMode="numeric"
          min={0}
          max={max ?? undefined}
          placeholder={max != null ? `0 〜 ${max}` : "EXスコア"}
          value={exScore}
          onChange={(e) => setExScore(e.target.value)}
          aria-invalid={exTooLarge}
        />
        <span className={`field-hint ${exTooLarge ? "error" : "muted"}`}>
          {exTooLarge
            ? `最大 ${max} を超えています`
            : ex != null && notes != null
              ? `${rate!.toFixed(2)}% / DJ LEVEL ${djLevel(ex, notes)} / MAX-${max! - ex}`
              : notes != null
                ? `MAX ${max}`
                : "ノーツ数が未登録のため DJ LEVEL は計算できません"}
        </span>
      </label>

      <label className="field">
        <span className="field-label">ミスカウント</span>
        <input
          className="input"
          type="number"
          inputMode="numeric"
          min={0}
          placeholder="BP"
          value={missCount}
          onChange={(e) => setMissCount(e.target.value)}
        />
      </label>

      <div className="record-actions">
        <span className={`small ${error ? "error" : "muted"}`} role={error ? "alert" : undefined}>
          {error
            ? `保存に失敗しました: ${error}`
            : busy
              ? "保存中..."
              : savedAt
                ? `保存しました (${savedAt})`
                : record
                  ? `最終更新: ${new Date(record.updatedAt).toLocaleString("ja-JP")}`
                  : "未登録"}
        </span>
        <div className="record-buttons">
          {record && (
            <button type="button" className="btn ghost" disabled={busy} onClick={removeRecord}>
              削除
            </button>
          )}
          <button type="submit" className="btn primary" disabled={!dirty || exTooLarge || busy}>
            保存
          </button>
        </div>
      </div>
    </form>
  );
}

// ---------- 楽曲詳細タブ ----------

function DetailPanel({ entry }: { entry: SheetEntryDto }) {
  const { chart } = entry;
  const { song } = chart;
  const rows: [string, string | null | undefined][] = [
    ["アーティスト", song.artist],
    ["ジャンル", song.genre],
    ["バージョン", versionName(song.version)],
    ["BPM", song.bpm],
    ["ノーツ数", chart.notes != null ? chart.notes.toLocaleString() : null],
    ["MAX EXスコア", chart.notes != null ? maxExScore(chart.notes).toLocaleString() : null],
  ];
  return (
    <>
      <dl className="detail">
        {rows.map(([label, value]) => (
          <div key={label} className="detail-row">
            <dt>{label}</dt>
            <dd className={value ? "" : "muted"}>{value ?? "—"}</dd>
          </div>
        ))}
      </dl>
      {entry.note && <p className="entry-note">{entry.note}</p>}
    </>
  );
}
