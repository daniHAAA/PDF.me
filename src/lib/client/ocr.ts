"use client";

import type { PageViewport } from "./pdfjs";
import { asset } from "./basePath";
import type { EditableItem } from "./textLayer";

/**
 * Texterkennung für eingescannte Seiten.
 *
 * Läuft bewusst im Browser: die Seite liegt dort bereits als Canvas vor, ein
 * Upload entfällt, und gescannte Dokumente verlassen den Rechner nie.
 *
 * Beim ersten Lauf lädt tesseract.js die Sprachdaten (~15 MB je Sprache) nach
 * und legt sie im IndexedDB des Browsers ab. Jeder weitere Lauf ist offline.
 */

type TesseractWorker = Awaited<ReturnType<typeof import("tesseract.js").createWorker>>;

let workerPromise: Promise<TesseractWorker> | null = null;
let workerLanguage = "";
let langPathCache: string | undefined | null = null;

/**
 * Wo die Sprachdaten herkommen.
 *
 * Liegen sie lokal unter public/tessdata (via `npm run ocr:offline`), werden
 * sie von dort geladen und die App braucht überhaupt kein Internet. Sonst
 * bleibt es beim Standardweg von tesseract.js über ein CDN — beim ersten Lauf
 * einmalig rund 15 MB, danach im Browser zwischengespeichert.
 */
async function resolveLangPath(language: string): Promise<string | undefined> {
  if (langPathCache !== null) return langPathCache;
  try {
    const response = await fetch(asset(`/tessdata/${language}.traineddata.gz`), { method: "HEAD" });
    langPathCache = response.ok ? asset("/tessdata") : undefined;
  } catch {
    langPathCache = undefined;
  }
  return langPathCache;
}

async function getWorker(
  language: string,
  onProgress?: (status: string, progress: number) => void,
): Promise<TesseractWorker> {
  // Sprachwechsel bedeutet neuen Worker — die Sprachdaten hängen am Worker.
  if (workerPromise && workerLanguage !== language) {
    const old = await workerPromise;
    await old.terminate();
    workerPromise = null;
  }

  if (!workerPromise) {
    workerLanguage = language;
    const { createWorker } = await import("tesseract.js");
    const langPath = await resolveLangPath(language);

    workerPromise = createWorker(language, undefined, {
      /*
       * Worker und WebAssembly kommen aus public/ statt vom CDN. tesseract.js
       * würde sie sonst von jsdelivr holen — eine Anwendung, die lokal auf dem
       * eigenen Rechner läuft, wäre damit ohne Internet funktionsunfähig.
       * scripts/copy-assets.mjs legt die Dateien bei der Installation ab.
       */
      workerPath: asset("/tesseract/worker.min.js"),
      corePath: asset("/tesseract/core"),
      ...(langPath ? { langPath } : {}),
      logger: (message: { status: string; progress: number }) => {
        onProgress?.(message.status, message.progress);
      },
    });
  }
  return workerPromise;
}

export interface OcrOptions {
  language?: string;
  onProgress?: (status: string, progress: number) => void;
}

/**
 * Erkennt Text auf einem gerenderten Canvas und liefert dieselben Boxen, die
 * auch der PDF-Textlayer liefern würde — dadurch funktioniert die Bearbeitung
 * für Scans und normale PDFs über exakt denselben Weg.
 */
export async function recognizePage(
  canvas: HTMLCanvasElement,
  viewport: PageViewport,
  pageNumber: number,
  { language = "deu", onProgress }: OcrOptions = {},
): Promise<EditableItem[]> {
  const worker = await getWorker(language, onProgress);
  const result = await worker.recognize(canvas, {}, { blocks: true });

  const items: EditableItem[] = [];
  let counter = 0;

  for (const block of result.data.blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        // Tesseract liefert die Basislinie pro Zeile — deutlich genauer als
        // eine Schätzung aus der Wort-Bounding-Box, weil Unterlängen sonst
        // die Grundlinie nach unten ziehen.
        const rowHeight = line.rowAttributes?.rowHeight || line.bbox.y1 - line.bbox.y0;
        const ascenders = line.rowAttributes?.ascenders || rowHeight * 0.75;
        const descenders = Math.abs(line.rowAttributes?.descenders || rowHeight * 0.25);

        for (const word of line.words ?? []) {
          if (!word.text.trim()) continue;
          // Sehr unsichere Treffer wären beim Bearbeiten mehr Last als Hilfe.
          if (word.confidence < 40) continue;

          const baselineImageY = line.bbox.y1 - descenders;

          // Bildpixel → PDF-Punkte. convertToPdfPoint berücksichtigt Zoomstufe
          // und Seitendrehung, deshalb wird hier nicht selbst gerechnet.
          const [pdfLeft, pdfBaselineY] = viewport.convertToPdfPoint(
            word.bbox.x0,
            baselineImageY,
          );
          const [pdfRight, pdfTopY] = viewport.convertToPdfPoint(word.bbox.x1, line.bbox.y0);
          const [, pdfBottomY] = viewport.convertToPdfPoint(word.bbox.x0, line.bbox.y1);

          const boxWidth = Math.abs(pdfRight - pdfLeft);
          const boxHeight = Math.abs(pdfTopY - pdfBottomY);
          const fontSize = (Math.abs(ascenders) + descenders) / viewport.scale;

          items.push({
            id: `ocr-${pageNumber}-${counter++}`,
            original: word.text,
            source: "ocr",
            screen: {
              left: word.bbox.x0,
              top: line.bbox.y0,
              width: word.bbox.x1 - word.bbox.x0,
              height: line.bbox.y1 - line.bbox.y0,
              fontSize: (Math.abs(ascenders) + descenders) * 0.92,
              angleDeg: 0,
            },
            pdf: {
              baselineX: pdfLeft,
              baselineY: pdfBaselineY,
              boxX: pdfLeft,
              boxY: Math.min(pdfBottomY, pdfTopY),
              boxWidth,
              boxHeight,
              fontSize: fontSize > 1 ? fontSize : boxHeight * 0.75,
              rotationDeg: 0,
            },
            fontFamily: "sans",
            bold: false,
            italic: false,
          });
        }
      }
    }
  }

  return items;
}

/** Gibt den Worker frei — beim Verlassen der Bearbeitung aufrufen. */
export async function releaseOcrWorker(): Promise<void> {
  if (!workerPromise) return;
  const worker = await workerPromise;
  workerPromise = null;
  workerLanguage = "";
  await worker.terminate();
}
