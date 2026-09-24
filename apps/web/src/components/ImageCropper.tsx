import { useRef, useState, type PointerEvent } from "react";
import type { CropNorm } from "../ocr/readIidxResult";

/** 筐体写真で CLEAR TYPE〜MISS COUNT が収まりやすい初期枠 (正規化 0〜1) */
export const DEFAULT_HUD_CROP: CropNorm = { x0: 0.02, y0: 0.08, x1: 0.98, y1: 0.56 };

type Handle = "move" | "nw" | "ne" | "sw" | "se" | "draw";

/** 枠の最小幅・高さ (正規化)。これ未満だと OCR に渡す画素が足りない */
const MIN = 0.08;

/** @param n - 任意の数 @returns 0〜1 に収めた値 */
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * 枠を 0〜1 に収め、幅・高さが {@link MIN} 未満にならないようにする。
 * 対角ドラッグで x0>x1 になっても正規化する。
 *
 * @param r - ユーザー操作後の枠
 * @returns 正規化済み CropNorm
 */
export function clampCrop(r: CropNorm): CropNorm {
  let x0 = clamp01(Math.min(r.x0, r.x1));
  let x1 = clamp01(Math.max(r.x0, r.x1));
  let y0 = clamp01(Math.min(r.y0, r.y1));
  let y1 = clamp01(Math.max(r.y0, r.y1));
  if (x1 - x0 < MIN) {
    x1 = Math.min(1, x0 + MIN);
    x0 = Math.max(0, x1 - MIN);
  }
  if (y1 - y0 < MIN) {
    y1 = Math.min(1, y0 + MIN);
    y0 = Math.max(0, y1 - MIN);
  }
  return { x0, y0, x1, y1 };
}

interface Props {
  src: string;
  value: CropNorm;
  onChange: (rect: CropNorm) => void;
  disabled?: boolean;
}

/**
 * プレビュー上で読み取り枠をドラッグ / リサイズする。
 * 座標は画像表示領域に対する 0〜1 (実ピクセルではない)。
 *
 * @param props.src - object URL
 * @param props.value - 現在の枠
 * @param props.onChange - 枠が変わったとき
 * @param props.disabled - OCR 中など操作を止めるとき
 */
export function ImageCropper({ src, value, onChange, disabled }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ handle: Handle; startX: number; startY: number; origin: CropNorm } | null>(null);
  const [active, setActive] = useState(false);

  /**
   * ポインタ座標をステージ相対の 0〜1 にする。
   *
   * @param clientX - PointerEvent.clientX
   * @param clientY - PointerEvent.clientY
   */
  const toNorm = (clientX: number, clientY: number) => {
    const el = stageRef.current;
    if (!el) return { x: 0, y: 0 };
    const b = el.getBoundingClientRect();
    return {
      x: clamp01((clientX - b.left) / Math.max(1, b.width)),
      y: clamp01((clientY - b.top) / Math.max(1, b.height)),
    };
  };

  /**
   * ハンドル別の pointerdown。キャプチャして枠外でも move を受け取る。
   *
   * @param handle - move / 四隅 / 新規描画
   */
  const onDown = (handle: Handle) => (e: PointerEvent<HTMLElement>) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const p = toNorm(e.clientX, e.clientY);
    drag.current = { handle, startX: p.x, startY: p.y, origin: value };
    setActive(true);
  };

  /**
   * ドラッグ中の枠更新。draw は始点〜現在点、move はサイズ維持、四隅は辺だけ動かす。
   *
   * @param e - ステージ上の pointermove
   */
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || disabled) return;
    const p = toNorm(e.clientX, e.clientY);
    const { origin } = d;
    if (d.handle === "draw") {
      onChange(clampCrop({ x0: d.startX, y0: d.startY, x1: p.x, y1: p.y }));
      return;
    }
    const dx = p.x - d.startX;
    const dy = p.y - d.startY;
    let next = { ...origin };
    if (d.handle === "move") {
      const w = origin.x1 - origin.x0;
      const h = origin.y1 - origin.y0;
      next.x0 = clamp01(origin.x0 + dx);
      next.y0 = clamp01(origin.y0 + dy);
      next.x1 = next.x0 + w;
      next.y1 = next.y0 + h;
      if (next.x1 > 1) {
        next.x1 = 1;
        next.x0 = 1 - w;
      }
      if (next.y1 > 1) {
        next.y1 = 1;
        next.y0 = 1 - h;
      }
    } else {
      if (d.handle.includes("w")) next.x0 = origin.x0 + dx;
      if (d.handle.includes("e")) next.x1 = origin.x1 + dx;
      if (d.handle.includes("n")) next.y0 = origin.y0 + dy;
      if (d.handle.includes("s")) next.y1 = origin.y1 + dy;
    }
    onChange(clampCrop(next));
  };

  /** ドラッグ終了。pointercancel でも同じ処理 */
  const onUp = () => {
    drag.current = null;
    setActive(false);
  };

  const { x0, y0, x1, y1 } = value;
  const style = {
    left: `${x0 * 100}%`,
    top: `${y0 * 100}%`,
    width: `${(x1 - x0) * 100}%`,
    height: `${(y1 - y0) * 100}%`,
  };

  return (
    <div
      ref={stageRef}
      className={`ocr-crop ${active ? "dragging" : ""}`}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <img src={src} alt="読み取り範囲の指定" draggable={false} />
      <div className="ocr-crop-shade" onPointerDown={onDown("draw")} />
      <div className="ocr-crop-rect" style={style} onPointerDown={onDown("move")}>
        {(["nw", "ne", "sw", "se"] as const).map((h) => (
          <button
            key={h}
            type="button"
            className={`ocr-crop-handle ${h}`}
            aria-label="枠のサイズ変更"
            disabled={disabled}
            onPointerDown={onDown(h)}
          />
        ))}
      </div>
    </div>
  );
}
