"use client";

import type { PDFDocumentProxy } from "./pdfjs";

/** Eine im Browser geöffnete Datei. bytes bleibt erhalten, um sie hochzuladen. */
export interface LoadedDoc {
  id: string;
  name: string;
  bytes: ArrayBuffer;
  pdf: PDFDocumentProxy;
  pageCount: number;
  /** Gibt den pdf.js-Worker dieses Dokuments frei. */
  destroy: () => Promise<void>;
}

export function toFile(doc: LoadedDoc): File {
  return new File([doc.bytes], doc.name, { type: "application/pdf" });
}
