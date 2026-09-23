import { useEffect, useRef, useState } from "react";
import { CLEAR_TYPE_LABEL, type ClearType } from "@jirikihyou/shared";
import { readIidxResult, type CropNorm } from "../ocr/readIidxResult";
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

function summarize(fill: OcrFill): string {
  const parts: string[] = [];
  if (fill.clearType) parts.push(CLEAR_TYPE_LABEL[fill.clearType]);
  if (fill.exScore != null) parts.push(`EX ${fill.exScore}`);
  if (fill.missCount != null) parts.push(`BP ${fill.missCount}`);
  return parts.join(" / ");
}

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
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const acceptFile = (next: File) => {
    if (disabled || reading) return;
    setFile(next);
    setCrop(DEFAULT_HUD_CROP);
    setError(null);
    setMessage("CLEAR TYPE 〜 MISS COUNT が入るように枠を合わせてください。");
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(next);
    });
  };

  const readCrop = async () => {
    if (!file || disabled || reading) return;
    setReading(true);
    setError(null);
    setMessage("読み取り中...（初回は学習データの取得で数十秒かかることがあります）");
    try {
      const result = await readIidxResult(file, notesRef.current, crop);
      const fill: OcrFill = {};
      if (result.clearType) fill.clearType = result.clearType;
      if (result.exScore != null) fill.exScore = result.exScore;
      if (result.missCount != null) fill.missCount = result.missCount;
      if (!fill.clearType && fill.exScore == null && fill.missCount == null) {
        setMessage(null);
        setError("読み取れませんでした。枠を調整するか、手入力してください。");
        return;
      }
      onAppliedRef.current(fill);
      setMessage(`${summarize(fill)} を入力しました。内容を確認して保存してください。`);
    } catch (e) {
      setMessage(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setReading(false);
    }
  };

  const acceptRef = useRef(acceptFile);
  acceptRef.current = acceptFile;
  const blockRef = useRef({ disabled: false, reading: false });
  blockRef.current = { disabled: !!disabled, reading };

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (blockRef.current.disabled || blockRef.current.reading) return;
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
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

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
        <button type="button" className="btn ghost" disabled={disabled || reading} onClick={() => inputRef.current?.click()}>
          {preview ? "画像を変更" : "画像から入力"}
        </button>
      </div>

      {preview && (
        <>
          <ImageCropper src={preview} value={crop} onChange={setCrop} disabled={reading} />
          <div className="ocr-row">
            <button type="button" className="btn primary" disabled={disabled || reading} onClick={() => void readCrop()}>
              {reading ? "読み取り中..." : "この枠で読み取る"}
            </button>
            <button
              type="button"
              className="btn ghost"
              disabled={reading}
              onClick={() => {
                setFile(null);
                setPreview((prev) => {
                  if (prev) URL.revokeObjectURL(prev);
                  return null;
                });
                setMessage(null);
                setError(null);
              }}
            >
              取消
            </button>
          </div>
        </>
      )}

      <p className="muted small ocr-hint">
        画像を選ぶか Ctrl+V で貼り付け、CLEAR TYPE・SCORE・MISS COUNT が見えるように枠を指定してから読み取ります。
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
