"use client";

import JSZip from "jszip";
import { buildDocxFromPages, FALLBACK_WARNING } from "@/lib/convert/docxBuilder";
import { extractPagesInBrowser } from "./extractText";
import {
  applyTextEdits,
  mergePdfs,
  organizePages,
  splitIntoSinglePages,
  splitPdf,
  type PageSpec,
  type SplitRange,
} from "@/lib/pdf/operations";
import type { TextEdit } from "@/lib/pdf/types";

/**
 * Alle PDF-Vorgänge, ausgeführt im Browser.
 *
 * WARUM IM BROWSER
 * pdf-lib und pdf.js laufen in Node und im Browser gleichermassen. Es gibt
 * also keinen technischen Grund, eine Datei erst hochzuladen, sie dort zu
 * verändern und wieder herunterzuladen. Direkt im Browser zu rechnen hat drei
 * Vorteile:
 *
 *  1. Die Datei verlässt den Rechner überhaupt nicht — kein Upload, keine
 *     Zwischenkopie, nichts, was auf einem Server landen könnte.
 *  2. Es ist schneller, weil die Übertragung in beide Richtungen entfällt.
 *  3. Die App läuft dadurch auch ganz ohne Server, etwa als statische Seite
 *     auf GitHub Pages. Damit ist sie von jedem Gerät erreichbar, auch von
 *     einem, auf dem sich nichts installieren lässt.
 *
 * Einzige Ausnahme bleibt Word → PDF: das braucht LibreOffice, ein
 * ausgewachsenes Programm, das es im Browser nicht gibt.
 */

async function toBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

function pdfBlob(bytes: Uint8Array): Blob {
  // Kopie in einen eigenen Puffer: Blob soll nicht auf Speicher zeigen, den
  // pdf.js später übernehmen könnte.
  return new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
}

export interface EngineResult {
  blob: Blob;
  filename: string;
  /** Hinweis für den Nutzer, etwa zu Qualitätsgrenzen. */
  warning?: string;
}

export async function mergeFiles(files: File[]): Promise<EngineResult> {
  const sources = await Promise.all(files.map(toBytes));
  return { blob: pdfBlob(await mergePdfs(sources)), filename: "zusammengefuehrt.pdf" };
}

export async function splitFile(
  file: File,
  mode: "ranges" | "single",
  ranges: SplitRange[],
): Promise<EngineResult> {
  const bytes = await toBytes(file);
  const parts = mode === "single" ? await splitIntoSinglePages(bytes) : await splitPdf(bytes, ranges);

  // Ein Teil → direkt als PDF. Mehrere → als ZIP, damit der Browser nicht
  // mehrere Downloads gleichzeitig auslösen muss.
  if (parts.length === 1) {
    return { blob: pdfBlob(parts[0].bytes), filename: `${parts[0].label}.pdf` };
  }

  const zip = new JSZip();
  parts.forEach((part, index) => {
    // Index voranstellen, damit die Reihenfolge im Dateimanager stimmt.
    const prefix = String(index + 1).padStart(String(parts.length).length, "0");
    zip.file(`${prefix}_${part.label}.pdf`, part.bytes);
  });

  return {
    blob: await zip.generateAsync({ type: "blob", compression: "DEFLATE" }),
    filename: "geteilt.zip",
  };
}

export async function organizeFiles(files: File[], pages: PageSpec[]): Promise<EngineResult> {
  const sources = await Promise.all(files.map(toBytes));
  return {
    blob: pdfBlob(await organizePages(sources, pages)),
    filename: "seiten-neu-geordnet.pdf",
  };
}

export interface EditResultInfo extends EngineResult {
  removedOriginals: number;
  coveredOnly: number;
}

export async function applyEdits(file: File, edits: TextEdit[]): Promise<EditResultInfo> {
  const bytes = await toBytes(file);
  // Der Extraktor wird hereingereicht: damit kann die Anwendung nach dem
  // Entfernen prüfen, ob der Originaltext wirklich verschwunden ist.
  const result = await applyTextEdits(bytes, edits, extractPagesInBrowser);

  return {
    blob: pdfBlob(result.bytes),
    filename: "bearbeitet.pdf",
    removedOriginals: result.removedOriginals,
    coveredOnly: result.coveredOnly,
  };
}

export async function pdfToDocxInBrowser(file: File): Promise<EngineResult> {
  const pages = await extractPagesInBrowser(await toBytes(file));
  const docx = await buildDocxFromPages(pages);

  return {
    blob: new Blob([new Uint8Array(docx)], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
    filename: file.name.replace(/\.pdf$/i, "") + ".docx",
    warning: FALLBACK_WARNING,
  };
}
