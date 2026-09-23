import type { ClearType } from "@jirikihyou/shared";
import { maxExScore } from "@jirikihyou/shared";
import { PSM } from "tesseract.js";
import { recognizePage, type OcrLine, type OcrWord } from "./tesseract";

export interface ReadIidxResult {
  clearType: ClearType | null;
  exScore: number | null;
  missCount: number | null;
  rawText: string;
}

/** 画像に対する正規化枠 (0〜1)。指定時はこの範囲だけを読む */
export interface CropNorm {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const MAX_EDGE = 1600;
const MAX_FILE_BYTES = 15 * 1024 * 1024;

/** OCR が CLEAR を CREAR と読むことがある */
const fixTypos = (s: string) => s.replace(/CREAR/gi, "CLEAR");

const compact = (s: string) => fixTypos(s).toUpperCase().replace(/[^A-Z0-9+\-]/g, "");

/**
 * 筐体は EXH-CLEAR / H-CLEAR など略称。
 * 具体的な表記を先に取り、裸の CLEAR は最後。
 */
const LAMP_RULES: { type: ClearType; re: RegExp }[] = [
  { type: "FC", re: /F-?COMBO|FULL-?COMBO|(?<![A-Z])FC(?![A-Z])/ },
  { type: "EX_HARD", re: /EXH-?CLEAR|EX-?HARD|EXHARD/ },
  { type: "HARD", re: /(?<!EX)H-?CLEAR|(?<!EX)HARD-?CLEAR|(?<![A-Z])HARD(?![A-Z])|(?<![A-Z])H-(?![A-Z0-9])/ },
  { type: "EASY", re: /(?<![A-Z])E-?CLEAR|(?<![A-Z])EASY(?![A-Z])/ },
  { type: "ASSIST", re: /(?<![A-Z])A-?CLEAR|ASSIST/ },
  { type: "FAILED", re: /FAILED|(?<![A-Z])FAIL(?![A-Z])/ },
  { type: "CLEAR", re: /N-?CLEAR|(?<![A-Z])CLEAR(?![A-Z])/ },
];

export function findClearTypes(text: string): ClearType[] {
  const src = compact(text);
  const found: ClearType[] = [];
  for (const { type, re } of LAMP_RULES) {
    if (re.test(src)) found.push(type);
  }
  return found;
}

/** 1 種類だけならそれを返す。EXH-CLEAR と H-CLEAR が両方ある行は判定不能 */
export function parseClearTypeFromText(text: string): ClearType | null {
  const found = findClearTypes(text);
  const unique = [...new Set(found)];
  if (unique.length === 1) return unique[0] ?? null;
  const strong = unique.filter((t) => t !== "CLEAR");
  if (strong.length === 1) return strong[0] ?? null;
  return null;
}

interface LampHit {
  type: ClearType;
  bbox: OcrWord["bbox"];
  raw: string;
}

/** 単語・隣接単語からランプ表記を拾う (H CLEAR / EXH-CLEAR など) */
export function findLampHits(words: OcrWord[]): LampHit[] {
  const hits: LampHit[] = [];
  const texts = words.map((w) => compact(w.text));
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (!w) continue;
    const one = texts[i] ?? "";
    const two = `${one}${texts[i + 1] ?? ""}`;
    const three = `${two}${texts[i + 2] ?? ""}`;
    const candidates = [one, two, three];
    let matched: ClearType | null = null;
    for (const c of candidates) {
      const t = parseClearTypeFromText(c);
      if (t && t !== "CLEAR") {
        matched = t;
        break;
      }
    }
    if (!matched && parseClearTypeFromText(one) === "CLEAR") matched = "CLEAR";
    if (matched) hits.push({ type: matched, bbox: w.bbox, raw: one || two });
  }
  return hits;
}

function meanLuma(ctx: CanvasRenderingContext2D, bbox: OcrWord["bbox"]): number {
  const x0 = Math.max(0, Math.floor(bbox.x0));
  const y0 = Math.max(0, Math.floor(bbox.y0));
  const x1 = Math.max(x0 + 1, Math.ceil(bbox.x1));
  const y1 = Math.max(y0 + 1, Math.ceil(bbox.y1));
  const w = x1 - x0;
  const h = y1 - y0;
  const img = ctx.getImageData(x0, y0, w, h);
  let sum = 0;
  let n = 0;
  for (let i = 0; i < img.data.length; i += 4) {
    const r = img.data[i] ?? 0;
    const g = img.data[i + 1] ?? 0;
    const b = img.data[i + 2] ?? 0;
    const a = img.data[i + 3] ?? 0;
    if (a < 128) continue;
    sum += 0.299 * r + 0.587 * g + 0.114 * b;
    n += 1;
  }
  return n === 0 ? 0 : sum / n;
}

/** 複数ランプが写っているときは、より明るい (選択中) 方を採用 */
export function pickSelectedLamp(hits: LampHit[], ctx: CanvasRenderingContext2D | null): ClearType | null {
  if (hits.length === 0) return null;
  const unique = [...new Set(hits.map((h) => h.type))];
  if (unique.length === 1) return unique[0] ?? null;
  if (!ctx) return parseClearTypeFromText(hits.map((h) => h.type).join(" "));
  let best: LampHit | null = null;
  let bestLuma = -1;
  for (const hit of hits) {
    const luma = meanLuma(ctx, hit.bbox);
    if (luma > bestLuma) {
      best = hit;
      bestLuma = luma;
    }
  }
  return best?.type ?? null;
}

function matchInt(text: string, re: RegExp): number | null {
  const m = fixTypos(text).match(re);
  const raw = m?.[1];
  if (raw == null) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

function extractInts(text: string): number[] {
  const cleaned = fixTypos(text)
    .replace(/(?<=\d)O|O(?=\d)/g, "0")
    .replace(/\d+[.,]?\d*\s*%/g, " ");
  return [...cleaned.matchAll(/\d+/g)].map((m) => Number.parseInt(m[0], 10)).filter((n) => Number.isFinite(n));
}

const isScoreLabelLine = (t: string) => {
  const u = fixTypos(t).toUpperCase();
  if (/PACE\s*MAKER|PACEMAKER/.test(u)) return false;
  if (/BEST/.test(u) && !/SCORE/.test(u)) return false;
  return /EX\s*SCORE|EXスコア|(?<![A-Z])S[CO0]{2}RE/.test(u);
};

const isMissLine = (t: string) => /MISS|ミス/.test(fixTypos(t).toUpperCase());
const isMaxMinusLine = (t: string) => /MAX\s*-|MAX-/.test(fixTypos(t).toUpperCase());

export function parseScoresFromLines(
  lines: { text: string }[],
  notes: number | null,
): { exScore: number | null; missCount: number | null } {
  const max = notes != null ? maxExScore(notes) : null;
  let ex: number | null = null;
  let miss: number | null = null;
  let maxMinus: number | null = null;
  const allNums: number[] = [];

  for (const line of lines) {
    if (/PACE\s*MAKER|PACEMAKER/.test(fixTypos(line.text).toUpperCase())) continue;
    const nums = extractInts(line.text);
    allNums.push(...nums);

    if (isMissLine(line.text) && miss == null) {
      const small = nums.filter((n) => n <= 200);
      miss = small.at(-1) ?? nums.filter((n) => n <= 999).at(-1) ?? null;
    }
    if (isScoreLabelLine(line.text) && ex == null) {
      const candidates = nums.filter((n) => (max != null ? n >= 50 && n <= max : n >= 200 && n <= 9999));
      if (candidates.length > 0) ex = Math.max(...candidates);
    }
    if (isMaxMinusLine(line.text) && maxMinus == null) {
      const mm = nums.find((n) => n > 0 && n <= 2000);
      if (mm != null) maxMinus = mm;
    }
  }

  if (ex != null && max != null && ex > max) ex = null;

  if (ex == null && max != null) {
    const found = allNums.find((a) => a >= Math.floor(max * 0.2) && a <= max && allNums.includes(max - a));
    if (found != null) ex = found;
  }
  if (ex == null && maxMinus != null && max != null) {
    const guess = max - maxMinus;
    if (guess >= Math.floor(max * 0.2)) ex = guess;
  }
  if (ex == null) {
    const lo = max != null ? Math.floor(max * 0.25) : 200;
    const hi = max ?? 9999;
    const candidates = allNums.filter((n) => n >= lo && n <= hi);
    if (candidates.length > 0) ex = Math.max(...candidates);
  }

  // 筐体では MISS の 1 桁が EXH-CLEAR / H-CLEAR 行に混ざることがある
  if (miss == null) {
    for (const line of lines) {
      if (!/EXH-?CLEAR|(?<!EX)H-?CLEAR/.test(compact(line.text))) continue;
      const glued = extractInts(line.text).filter((n) => n <= 20);
      if (glued.length === 1) {
        miss = glued[0] ?? null;
        break;
      }
    }
  }

  return { exScore: ex, missCount: miss };
}

/** テスト / フォールバック用。行情報がないときは全文を 1 行として扱う */
export function parseScoresFromText(
  text: string,
  notes: number | null,
): { exScore: number | null; missCount: number | null } {
  return parseScoresFromLines(
    text.split(/\r?\n/).map((row) => ({ text: row })),
    notes,
  );
}

function loadToCanvas(file: Blob): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        reject(new Error("canvas を初期化できませんでした"));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("画像を読み込めませんでした"));
    };
    img.src = url;
  });
}

/** 白い HUD 文字を残し、ジャケットや暗い背景を落とす */
function enhanceForOcr(src: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = src.width;
  canvas.height = src.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return src;
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] ?? 0;
    const g0 = d[i + 1] ?? 0;
    const b = d[i + 2] ?? 0;
    const g = 0.299 * r + 0.587 * g0 + 0.114 * b;
    const v = g > 155 ? 255 : g > 110 ? Math.round((g - 110) * 4) : 0;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function crop(src: HTMLCanvasElement, x0: number, y0: number, x1: number, y1: number): HTMLCanvasElement {
  return cropPx(
    src,
    src.width * x0,
    src.height * y0,
    src.width * x1,
    src.height * y1,
  );
}

function cropPx(src: HTMLCanvasElement, x0: number, y0: number, x1: number, y1: number): HTMLCanvasElement {
  const sx = Math.max(0, Math.floor(Math.min(x0, x1)));
  const sy = Math.max(0, Math.floor(Math.min(y0, y1)));
  const w = Math.max(1, Math.min(src.width - sx, Math.floor(Math.abs(x1 - x0))));
  const h = Math.max(1, Math.min(src.height - sy, Math.floor(Math.abs(y1 - y0))));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")?.drawImage(src, sx, sy, w, h, 0, 0, w, h);
  return canvas;
}

function upscale(src: HTMLCanvasElement, factor: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(src.width * factor);
  canvas.height = Math.round(src.height * factor);
  const ctx = canvas.getContext("2d");
  if (!ctx) return src;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** EXH-CLEAR と H- 断片が同時にある = 筐体で H-CLEAR も読めた */
function preferHardIfBothLamps(text: string, type: ClearType | null): ClearType | null {
  if (type !== "EX_HARD") return type;
  const stripped = text.toUpperCase().replace(/EXH[\s-]*CLEAR/g, " ");
  if (/H-/.test(stripped)) return "HARD";
  return type;
}

function mergePages(pages: { text: string; lines: OcrLine[]; words: OcrWord[] }[]) {
  return {
    text: pages.map((p) => p.text).join("\n"),
    lines: pages.flatMap((p) => p.lines),
    words: pages.flatMap((p) => p.words),
  };
}

export async function readIidxResult(file: Blob, notes: number | null, cropRect?: CropNorm | null): Promise<ReadIidxResult> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("画像が大きすぎます (15MB まで)");
  }
  if (file.type && !file.type.startsWith("image/")) {
    throw new Error("画像ファイルを指定してください");
  }

  const full = await loadToCanvas(file);
  const region = cropRect
    ? crop(full, cropRect.x0, cropRect.y0, cropRect.x1, cropRect.y1)
    : crop(full, 0.03, 0.1, 0.58, 0.64);
  const factor = Math.max(2, Math.min(3.2, 900 / Math.max(region.width, 1)));
  const left = upscale(region, factor);
  const enhanced = enhanceForOcr(left);
  const rawPage = await recognizePage(left);
  const binPage = await recognizePage(enhanced);
  const page = mergePages([rawPage, binPage]);
  const ctx = left.getContext("2d", { willReadFrequently: true });

  let clearType = pickSelectedLamp(findLampHits(page.words), ctx);
  clearType ??= parseClearTypeFromText(page.text);
  const compactAll = compact(page.text);
  if (/EX-?HARD/.test(compactAll) && !/EXH-?CLEAR/.test(compactAll)) clearType = "EX_HARD";
  let { exScore, missCount } = parseScoresFromLines(page.lines, notes);

  const refined = await refineCabinetFields(left, page.words, { clearType, exScore, missCount });
  clearType = preferHardIfBothLamps(`${page.text}\n${refined.extraText}`, refined.clearType);
  missCount = refined.missCount;
  if (missCount == null && !cropRect) {
    const lower = await recognizePage(upscale(crop(full, 0.03, 0.55, 0.58, 0.84), 2));
    missCount = parseScoresFromLines(lower.lines, notes).missCount;
  }

  if (!cropRect && (exScore == null || missCount == null || clearType == null)) {
    const mid = upscale(crop(full, 0.05, 0.24, 0.54, 0.55), 2.4);
    const extra = mergePages([await recognizePage(mid), await recognizePage(enhanceForOcr(mid))]);
    const merged = mergePages([page, extra]);
    if (clearType == null) {
      const extraCtx = mid.getContext("2d", { willReadFrequently: true });
      clearType = pickSelectedLamp(findLampHits(merged.words), extraCtx) ?? parseClearTypeFromText(merged.text);
    }
    const again = parseScoresFromLines(merged.lines, notes);
    exScore ??= again.exScore;
    missCount ??= again.missCount;
    const refined2 = await refineCabinetFields(left, merged.words, { clearType, exScore, missCount });
    const raw = `${merged.text}\n${refined.extraText}\n${refined2.extraText}`;
    return { clearType: preferHardIfBothLamps(raw, refined2.clearType), exScore, missCount: refined2.missCount, rawText: raw };
  }

  return { clearType, exScore, missCount, rawText: `${page.text}\n${refined.extraText}` };
}

async function refineCabinetFields(
  source: HTMLCanvasElement,
  words: OcrWord[],
  current: { clearType: ClearType | null; exScore: number | null; missCount: number | null },
): Promise<{ clearType: ClearType | null; missCount: number | null; extraText: string }> {
  let extraText = "";
  let { clearType, missCount } = current;
  const hits = findLampHits(words);
  const exh = hits.find((h) => h.type === "EX_HARD" && /EXH/.test(h.raw));

  // 筐体略称 EXH-CLEAR のときだけ、右隣の H-CLEAR と明るさを比べる
  if (exh && clearType !== "FC") {
    const boxW = Math.max(8, exh.bbox.x1 - exh.bbox.x0);
    const wide = boxW > source.width * 0.35;
    const ctx2 = source.getContext("2d", { willReadFrequently: true });
    if (ctx2) {
      const midX = (exh.bbox.x0 + exh.bbox.x1) / 2;
      const leftBox = wide ? { ...exh.bbox, x1: midX } : exh.bbox;
      const rightBox = wide
        ? { ...exh.bbox, x0: midX }
        : { ...exh.bbox, x0: exh.bbox.x1, x1: Math.min(source.width, exh.bbox.x1 + boxW * 1.25) };
      const leftL = meanLuma(ctx2, leftBox);
      const rightL = meanLuma(ctx2, rightBox);
      if (rightL > leftL + 6) clearType = "HARD";
      else if (leftL > rightL + 6) clearType = "EX_HARD";
    }
    const pad = 14;
    const stripX0 = wide ? (exh.bbox.x0 + exh.bbox.x1) / 2 : exh.bbox.x1;
    const strip = upscale(cropPx(source, stripX0, exh.bbox.y0 - pad, source.width * 0.98, exh.bbox.y1 + pad), 2.2);
    const p = await recognizePage(strip, { psm: PSM.SINGLE_LINE });
    extraText += `\n${p.text}`;
    if (parseClearTypeFromText(p.text) === "HARD" || /(?<![A-Z])H-/.test(compact(p.text))) clearType = "HARD";
  }

  if (missCount == null) {
    const scoreWord =
      current.exScore != null ? words.find((w) => extractInts(w.text).includes(current.exScore ?? -1)) : undefined;
    const bands = scoreWord
      ? [
          cropPx(source, scoreWord.bbox.x0 - 80, scoreWord.bbox.y1, scoreWord.bbox.x1 + 120, scoreWord.bbox.y1 + Math.max(28, (scoreWord.bbox.y1 - scoreWord.bbox.y0) * 2.4)),
        ]
      : [crop(source, 0.05, 0.42, 0.95, 0.62)];
    for (const band of bands) {
      const p = await recognizePage(upscale(band, 2.2), { psm: PSM.SINGLE_LINE });
      extraText += `\n${p.text}`;
      const parsed = parseScoresFromLines([{ text: `MISS ${p.text}` }], null);
      if (parsed.missCount != null) {
        missCount = parsed.missCount;
        break;
      }
    }
  }

  return { clearType, missCount, extraText };
}
