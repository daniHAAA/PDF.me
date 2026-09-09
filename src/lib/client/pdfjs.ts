"use client";

import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist/types/src/display/api";
import type { PageViewport } from "pdfjs-dist/types/src/display/page_viewport";

/**
 * Zugriff auf pdf.js im Browser.
 *
 * pdf.js wird bewusst erst beim ersten Bedarf geladen: das Paket ist mehrere
 * hundert Kilobyte gross und wird auf der Login-Seite gar nicht gebraucht.
 */

/*
 * Bewusst der "legacy"-Build und nicht der moderne:
 * Letzterer setzt brandneue JS-APIs voraus (u.a. Map.prototype.getOrInsertComputed)
 * und stirbt in Browsern, die sie noch nicht haben, mit einem kryptischen
 * "getOrInsertComputed is not a function". Der legacy-Build bringt die nötigen
 * Polyfills mit und verhält sich sonst identisch — die paar Kilobyte mehr sind
 * es wert, wenn die App auch auf fremden Rechnern laufen soll.
 */
type PdfjsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

let modulePromise: Promise<PdfjsModule> | null = null;

export async function getPdfjs(): Promise<PdfjsModule> {
  if (!modulePromise) {
    modulePromise = import("pdfjs-dist/legacy/build/pdf.mjs").then((pdfjs) => {
      // Der Worker rendert in einem eigenen Thread — ohne ihn friert die
      // Oberfläche beim Rendern grosser Seiten ein.
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
      return pdfjs;
    });
  }
  return modulePromise;
}

export interface OpenedDocument {
  pdf: PDFDocumentProxy;
  /** Beendet den zugehörigen Worker und gibt seinen Speicher frei. */
  destroy: () => Promise<void>;
}

export async function loadDocument(data: ArrayBuffer): Promise<OpenedDocument> {
  const pdfjs = await getPdfjs();
  // Kopie übergeben: pdf.js übernimmt den Puffer (transferable) und leert ihn,
  // die Originaldatei wird aber später noch zum Hochladen gebraucht.
  const task = pdfjs.getDocument({
    data: data.slice(0),
    cMapUrl: "/pdfjs/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "/pdfjs/standard_fonts/",
  });

  // Aufgeräumt wird über den LoadingTask, nicht über das Dokument: nur er kennt
  // den Worker-Thread.
  return { pdf: await task.promise, destroy: () => task.destroy() };
}

export type { PDFDocumentProxy, PDFPageProxy, PageViewport };
