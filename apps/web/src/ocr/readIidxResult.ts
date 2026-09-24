import type { ClearType } from "@jirikihyou/shared";
import { maxExScore } from "@jirikihyou/shared";
import { PSM } from "tesseract.js";
import { recognizePage, type OcrLine, type OcrWord } from "./tesseract";

/** {@link readIidxResult} の戻り値。読めなかった項目は null */
export interface ReadIidxResult {
  clearType: ClearType | null;
  exScore: number | null;
  missCount: number | null;
  /** デバッグ用。生 OCR + refine で足したテキスト */
  rawText: string;
}

/** 画像に対する正規化枠 (0〜1)。指定時はこの範囲だけを読む */
export interface CropNorm {
  /** 左端 (0 = 画像左) */
  x0: number;
  /** 上端 */
  y0: number;
  /** 右端 (1 = 画像右) */
  x1: number;
  /** 下端 */
  y1: number;
}

/** 長辺の上限 (px)。これ以上は縮小してから OCR する */
const MAX_EDGE = 1600;
/** 受け付ける画像サイズ上限 */
const MAX_FILE_BYTES = 15 * 1024 * 1024;

/** OCR が CLEAR を CREAR と読むことがある */
/**
 * 筐体フォントで CLEAR が CREAR になりやすいので先に直す。
 *
 * @param s - 生テキスト
 */
const fixTypos = (s: string) => s.replace(/CREAR/gi, "CLEAR");

/**
 * ランプ照合用に英数字と +/- だけ残す。空白や記号のゆらぎを潰す。
 *
 * @param s - 生テキスト
 */
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

/**
 * テキストに含まれるクリアランプを列挙する。順序は {@link LAMP_RULES} と同じ。
 *
 * @param text - OCR 生テキスト
 * @returns マッチした ClearType。重複あり得る
 */
export function findClearTypes(text: string): ClearType[] {
  const src = compact(text);
  const found: ClearType[] = [];
  for (const { type, re } of LAMP_RULES) {
    if (re.test(src)) found.push(type);
  }
  return found;
}

/**
 * テキストからランプを 1 つに絞る。
 * 裸の CLEAR は他ランプと共存しがちなので、それ以外が 1 つならそちらを優先する。
 *
 * @param text - OCR 生テキスト
 * @returns 一意に決まったランプ。EXH と H が両方あるなど曖昧なら null
 */
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

/**
 * 単語とその右隣 1〜2 語を連結してランプを拾う。
 * 「H」と「CLEAR」が別単語になるケース向け。裸の CLEAR は他が無いときだけ採用。
 *
 * @param words - ページ上の単語 (bbox 付き)
 * @returns ヒット位置。同じランプが複数回出ることがある
 */
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

/**
 * bbox 内ピクセルの平均輝度 (ITU-R BT.601)。透明画素は無視する。
 *
 * @param ctx - 元画像の 2D コンテキスト
 * @param bbox - 画像座標 (px)
 * @returns 0〜255。画素が無ければ 0
 */
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

/**
 * 複数ランプが写っているときは、より明るい (筐体で選択中) 方を採用する。
 * ctx が無いときはテキスト規則だけにフォールバックする。
 *
 * @param hits - {@link findLampHits} の結果
 * @param ctx - 輝度比較用。null なら明るさを見ない
 * @returns 選択中とみなしたランプ。ヒット無しなら null
 */
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

/**
 * 正規表現の第 1 キャプチャを整数として取る。
 *
 * @param text - 対象文字列
 * @param re - キャプチャ付きの正規表現
 * @returns パースできた整数。失敗時は null
 */
function matchInt(text: string, re: RegExp): number | null {
  const m = fixTypos(text).match(re);
  const raw = m?.[1];
  if (raw == null) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * 行から整数だけ拾う。O は数字の隣にあるときだけ 0 とみなす
 * (COUNT を C0UNT に壊さないため)。パーセント値は捨てる。
 *
 * @param text - 1 行分
 * @returns 出現順の整数
 */
function extractInts(text: string): number[] {
  const cleaned = fixTypos(text)
    .replace(/(?<=\d)O|O(?=\d)/g, "0")
    .replace(/\d+[.,]?\d*\s*%/g, " ");
  return [...cleaned.matchAll(/\d+/g)].map((m) => Number.parseInt(m[0], 10)).filter((n) => Number.isFinite(n));
}

/**
 * EX SCORE 行か。PACEMAKER / BEST 単独は目標値なので除外する。
 *
 * @param t - 1 行
 */
const isScoreLabelLine = (t: string) => {
  const u = fixTypos(t).toUpperCase();
  if (/PACE\s*MAKER|PACEMAKER/.test(u)) return false;
  if (/BEST/.test(u) && !/SCORE/.test(u)) return false;
  return /EX\s*SCORE|EXスコア|(?<![A-Z])S[CO0]{2}RE/.test(u);
};

/** MISS COUNT / ミス 行か */
const isMissLine = (t: string) => /MISS|ミス/.test(fixTypos(t).toUpperCase());
/** MAX- (理論値との差) 行か。EX 復元に使う */
const isMaxMinusLine = (t: string) => /MAX\s*-|MAX-/.test(fixTypos(t).toUpperCase());

/**
 * 行単位で EX スコアとミスカウントを読む。
 * ラベル行が無いときは MAX- とのペア、なければ範囲内の最大値で推測する。
 *
 * @param lines - OCR 行。bbox は不要
 * @param notes - 譜面ノーツ数。分かれば上限 (notes*2) で EX を検証できる
 * @returns 読めなければ各フィールド null
 */
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
    // 目標スコア行。プレイ結果の EX / MISS と混同しやすいので捨てる
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

  // 同じページに EX と MAX- が両方あるときは、和が理論値になる組を優先
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

/**
 * テスト / フォールバック用。改行で行分割して {@link parseScoresFromLines} に渡す。
 * 英単語境界では切らない (MISS COUNT 1 を壊すため)。
 *
 * @param text - 全文
 * @param notes - 譜面ノーツ数。不明なら null
 */
export function parseScoresFromText(
  text: string,
  notes: number | null,
): { exScore: number | null; missCount: number | null } {
  return parseScoresFromLines(
    text.split(/\r?\n/).map((row) => ({ text: row })),
    notes,
  );
}

/**
 * 画像 Blob をキャンバスへ描く。長辺が {@link MAX_EDGE} を超えたら縮小する。
 *
 * @param file - 画像ファイル
 * @returns 描画済みキャンバス
 * @throws デコード失敗、または 2D コンテキストが取れないとき
 */
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

/**
 * 白い HUD 文字を残し、ジャケットや暗い背景を落とす 2 値化に近い強調。
 *
 * @param src - 切り出し済み画像
 * @returns 新しいキャンバス。コンテキストが取れなければ src をそのまま返す
 */
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

/**
 * 正規化座標 (0〜1) で切り出す。
 *
 * @param src - 元画像
 * @param x0 - 左 (0〜1)
 * @param y0 - 上
 * @param x1 - 右
 * @param y1 - 下
 */
function crop(src: HTMLCanvasElement, x0: number, y0: number, x1: number, y1: number): HTMLCanvasElement {
  return cropPx(
    src,
    src.width * x0,
    src.height * y0,
    src.width * x1,
    src.height * y1,
  );
}

/**
 * ピクセル座標で切り出す。範囲は画像内にクランプする。
 *
 * @param src - 元画像
 * @param x0 - 左 (px)
 * @param y0 - 上 (px)
 * @param x1 - 右 (px)
 * @param y1 - 下 (px)
 */
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

/**
 * 高品質スムージングで拡大する。小さい HUD 文字を Tesseract に渡しやすくする。
 *
 * @param src - 切り出し画像
 * @param factor - 倍率 (1 超を想定)
 * @returns 拡大キャンバス。コンテキストが取れなければ src
 */
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

/**
 * EXH-CLEAR を除いた残りに `H-` がある = 筐体で H-CLEAR も読めた、とみなして HARD にする。
 * 選択ランプが EX_HARD のときだけ適用する。
 *
 * @param text - 生テキスト (複数ページ結合可)
 * @param type - 暫定ランプ
 * @returns HARD に倒すか、そのまま
 */
function preferHardIfBothLamps(text: string, type: ClearType | null): ClearType | null {
  if (type !== "EX_HARD") return type;
  const stripped = text.toUpperCase().replace(/EXH[\s-]*CLEAR/g, " ");
  if (/H-/.test(stripped)) return "HARD";
  return type;
}

/**
 * 生画像と強調画像など、複数回の OCR 結果を連結する。
 *
 * @param pages - 結合するページ
 * @returns テキストは改行結合、lines/words は連結
 */
function mergePages(pages: { text: string; lines: OcrLine[]; words: OcrWord[] }[]) {
  return {
    text: pages.map((p) => p.text).join("\n"),
    lines: pages.flatMap((p) => p.lines),
    words: pages.flatMap((p) => p.words),
  };
}

/**
 * リザルト画像からクリアタイプ / EX スコア / ミスカウントを読む。
 * 保存はしない。呼び出し側がフォームへ流し込んで確認する想定。
 *
 * cropRect があるときはその範囲だけを読む (追加の左下・中央クロップはしない)。
 * 無いときは筐体写真向けに左 HUD を自動切り出し、足りなければ下段・中央を足す。
 *
 * @param file - 画像 Blob (15MB まで)
 * @param notes - 譜面ノーツ数。EX の上限判定に使う。不明なら null
 * @param cropRect - ユーザー指定の正規化枠。省略時は自動切り出し
 * @returns 読めた項目と結合 rawText。読めない項目は null
 * @throws ファイルサイズ / MIME 不正、画像デコード失敗
 */
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
  // EX-HARD 表記だけで EXH-CLEAR が無いときは、H-CLEAR との混同を避けるため EX_HARD で確定
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

/**
 * 筐体 HUD 向けの再認識。EXH-CLEAR ヒットの右隣を切り直して H-CLEAR か判定し、
 * ミスが未取得なら SCORE 直下 (または中央帯) を 1 行 OCR する。
 *
 * @param source - 拡大済みの対象領域
 * @param words - 既に得ている単語
 * @param current - ここまでの推定値
 * @returns 更新したランプ / ミスと、追加で読んだテキスト
 */
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
