import { createWorker, PSM, type Worker } from "tesseract.js";

/**
 * Tesseract worker は初回だけ作る (学習データ ~数MB を CDN から取得)。
 * ブラウザから直接取得するので API キーは不要。
 */
let workerPromise: Promise<Worker> | null = null;

export interface OcrWord {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

export interface OcrLine {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  words: OcrWord[];
}

export interface OcrPage {
  text: string;
  lines: OcrLine[];
  words: OcrWord[];
}

async function createOcrWorker(): Promise<Worker> {
  return createWorker("eng", 1, {
    workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js",
    corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.0/tesseract-core-simd.wasm.js",
    langPath: "https://tessdata.projectnaptha.com/4.0.0",
  });
}

export async function getOcrWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createOcrWorker().catch((err) => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

const toWord = (w: { text: string; confidence: number; bbox: OcrWord["bbox"] }): OcrWord => ({
  text: w.text,
  confidence: w.confidence,
  bbox: { x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 },
});

export async function recognizePage(
  image: HTMLCanvasElement,
  opts: { digitsOnly?: boolean; psm?: PSM } = {},
): Promise<OcrPage> {
  const worker = await getOcrWorker();
  await worker.setParameters({
    tessedit_char_whitelist: opts.digitsOnly
      ? "0123456789"
      : "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz:+-.% ",
    tessedit_pageseg_mode: opts.psm ?? (opts.digitsOnly ? PSM.SINGLE_BLOCK : PSM.SINGLE_COLUMN),
    user_defined_dpi: "300",
  });
  const { data } = await worker.recognize(image);
  const words = (data.words ?? []).map(toWord);
  const lines = (data.lines ?? []).map((line) => ({
    text: line.text,
    bbox: { x0: line.bbox.x0, y0: line.bbox.y0, x1: line.bbox.x1, y1: line.bbox.y1 },
    words: (line.words ?? []).map(toWord),
  }));
  return { text: data.text ?? "", lines, words };
}

export async function recognizeText(
  image: HTMLCanvasElement,
  opts: { digitsOnly?: boolean } = {},
): Promise<string> {
  const page = await recognizePage(image, opts);
  return page.text;
}
