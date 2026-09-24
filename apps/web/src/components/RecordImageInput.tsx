import { useEffect, useRef, useState } from "react";
import { CLEAR_TYPE_LABEL, type ClearType } from "@jirikihyou/shared";
import { readIidxResult, type CropNorm, type ReadIidxResult } from "../ocr/readIidxResult";
import { DEFAULT_HUD_CROP, ImageCropper } from "./ImageCropper";

export interface OcrFill {
  clearType?: ClearType;
  exScore?: number;
  missCount?: number;
}

interface Props {
  notes: number | null;
  disabled?: boolean;
  onApplied: (fill: OcrFill) => void;
}

/** 枠を離してからプレビュー OCR を始めるまでの待ち (ms) */
const PREVIEW_DEBOUNCE_MS = 500;

/**
 * OCR 結果をフォームへ流し込む形にする。
 *
 * @param result - {@link readIidxResult} の戻り値
 */
function toFill(result: ReadIidxResult): OcrFill {
  const fill: OcrFill = {};
  if (result.clearType) fill.clearType = result.clearType;
  if (result.exScore != null) fill.exScore = result.exScore;
  if (result.missCount != null) fill.missCount = result.missCount;
  return fill;
}

/**
 * 1 項目でも読めていれば true。
 *
 * @param fill - プレビューまたは適用対象
 */
function hasFill(fill: OcrFill | null): fill is OcrFill {
  return fill != null && (fill.clearType != null || fill.exScore != null || fill.missCount != null);
}

/**
 * 適用後の確認メッセージ用。読めた項目だけ並べる。
 *
 * @param fill - フォームへ流し込む値
 * @returns 例: `HARD / EX 3894 / BP 1`
 */
function summarize(fill: OcrFill): string {
  const parts: string[] = [];
  if (fill.clearType) parts.push(CLEAR_TYPE_LABEL[fill.clearType]);
  if (fill.exScore != null) parts.push(`EX ${fill.exScore}`);
  if (fill.missCount != null) parts.push(`BP ${fill.missCount}`);
  return parts.join(" / ");
}

/**
 * プレビュー行。未読は「—」。
 *
 * @param fill - 最新のプレビュー。未実行なら null
 */
function previewLine(fill: OcrFill | null): string {
  return [
    fill?.clearType ? CLEAR_TYPE_LABEL[fill.clearType] : "—",
    fill?.exScore != null ? `EX ${fill.exScore}` : "EX —",
    fill?.missCount != null ? `BP ${fill.missCount}` : "BP —",
  ].join(" / ");
}

/**
 * 記録タブの画像入力。ファイル選択または Ctrl+V → 枠を合わせると自動でプレビュー OCR。
 * 「この結果を入力」でフォームへ流す。PUT はしない (確認してから保存)。
 *
 * @param props.notes - 譜面ノーツ数。EX 上限の手がかり
 * @param props.disabled - 保存中など
 * @param props.onApplied - OCR で埋めるフィールド
 */
export function RecordImageInput({ notes, disabled, onApplied }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef(notes);
  const onAppliedRef = useRef(onApplied);
  notesRef.current = notes;
  onAppliedRef.current = onApplied;

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [crop, setCrop] = useState<CropNorm>(DEFAULT_HUD_CROP);
  const [reading, setReading] = useState(false);
  const [stale, setStale] = useState(false);
  const [previewFill, setPreviewFill] = useState<OcrFill | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileRef = useRef<File | null>(null);
  fileRef.current = file;
  const genRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  /**
   * 進行中・予約中の OCR を無効化する。新しい枠操作や画像差し替えのとき。
   */
  const invalidate = () => {
    genRef.current += 1;
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  /**
   * 指定枠で OCR し、結果はプレビューだけに載せる (フォームへは入れない)。
   *
   * @param rect - 正規化枠
   * @param currentFile - 対象画像
   */
  const runPreview = async (rect: CropNorm, currentFile: File) => {
    const gen = genRef.current;
    setReading(true);
    setStale(false);
    setError(null);
    try {
      const result = await readIidxResult(currentFile, notesRef.current, rect);
      if (gen !== genRef.current) return;
      const fill = toFill(result);
      setPreviewFill(fill);
      if (!hasFill(fill)) {
        setMessage(null);
        setError("読み取れませんでした。枠を調整するか、手入力してください。");
        return;
      }
      setError(null);
      setMessage(null);
    } catch (e) {
      if (gen !== genRef.current) return;
      setPreviewFill(null);
      setMessage(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (gen === genRef.current) setReading(false);
    }
  };

  /**
   * 枠確定後、debounce してから {@link runPreview} する。
   *
   * @param rect - 確定した枠
   */
  const schedulePreview = (rect: CropNorm) => {
    const currentFile = fileRef.current;
    if (!currentFile || disabled) return;
    invalidate();
    setStale(true);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void runPreview(rect, currentFile);
    }, PREVIEW_DEBOUNCE_MS);
  };

  /**
   * 新しい画像を受け取り、プレビュー URL を差し替える。枠は初期値に戻し、直後に OCR を予約する。
   *
   * @param next - 選択またはペーストされた画像
   */
  const acceptFile = (next: File) => {
    if (disabled) return;
    invalidate();
    setReading(false);
    setPreviewFill(null);
    setError(null);
    setMessage("CLEAR TYPE 〜 MISS COUNT が入るように枠を合わせてください。");
    setFile(next);
    fileRef.current = next;
    setCrop(DEFAULT_HUD_CROP);
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(next);
    });
    schedulePreview(DEFAULT_HUD_CROP);
  };

  /**
   * ドラッグ開始。古い OCR を捨て、プレビューを古い結果として扱う。
   */
  const onInteractStart = () => {
    if (disabled) return;
    invalidate();
    setReading(false);
    setStale(true);
    setError(null);
    setMessage(null);
  };

  /**
   * プレビューをフォームへ流す。保存はしない。
   */
  const applyPreview = () => {
    if (disabled || reading || stale || !hasFill(previewFill)) return;
    onAppliedRef.current(previewFill);
    setMessage(`${summarize(previewFill)} を入力しました。内容を確認して保存してください。`);
  };

  /**
   * 画像と予約 OCR を捨てて初期状態に戻す。
   */
  const clearImage = () => {
    invalidate();
    setReading(false);
    setFile(null);
    fileRef.current = null;
    setPreviewFill(null);
    setStale(false);
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setMessage(null);
    setError(null);
  };

  const acceptRef = useRef(acceptFile);
  acceptRef.current = acceptFile;
  const disabledRef = useRef(!!disabled);
  disabledRef.current = !!disabled;

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (disabledRef.current) return;
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith("image/"));
      if (!item) return;
      const f = item.getAsFile();
      if (!f) return;
      e.preventDefault();
      acceptRef.current(f);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  useEffect(() => {
    return () => {
      genRef.current += 1;
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const canApply = !disabled && !reading && !stale && hasFill(previewFill);

  return (
    <div className="ocr-box">
      <div className="ocr-row">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const next = e.target.files?.[0];
            e.target.value = "";
            if (next) acceptFile(next);
          }}
        />
        <button type="button" className="btn ghost" disabled={disabled} onClick={() => inputRef.current?.click()}>
          {preview ? "画像を変更" : "画像から入力"}
        </button>
      </div>

      {preview && (
        <>
          <ImageCropper
            src={preview}
            value={crop}
            onChange={setCrop}
            onInteractStart={onInteractStart}
            onCommit={schedulePreview}
            disabled={disabled}
          />
          <p className={`ocr-preview ${reading || stale ? "pending" : ""}`} aria-live="polite">
            {previewLine(previewFill)}
            {reading && <span className="ocr-preview-status">読み取り中...（初回は数十秒かかることがあります）</span>}
          </p>
          <div className="ocr-row">
            <button type="button" className="btn primary" disabled={!canApply} onClick={applyPreview}>
              この結果を入力
            </button>
            <button type="button" className="btn ghost" disabled={disabled} onClick={clearImage}>
              取消
            </button>
          </div>
        </>
      )}

      <p className="muted small ocr-hint">
        画像を選ぶか Ctrl+V で貼り付け、CLEAR TYPE・SCORE・MISS COUNT が見えるように枠を合わせると自動で読み取ります。内容を確認してから入力してください。
      </p>
      {message && <p className="muted small">{message}</p>}
      {error && (
        <p className="error small" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
