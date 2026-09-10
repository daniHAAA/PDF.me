"use client";

import { getPdfjs } from "./pdfjs";
import { asset } from "./basePath";
import { classifyFamily, type ExtractedItem, type ExtractedPage } from "@/lib/convert/types";

/**
 * Textextraktion im Browser — das Gegenstück zu lib/convert/extract.ts.
 *
 * Gleiche Ausgabe, andere Art pdf.js zu laden. Dadurch funktionieren
 * PDF → Word und die Prüfung nach dem Entfernen von Text auch dann, wenn gar
 * kein Server vorhanden ist (statischer Betrieb).
 */
export async function extractPagesInBrowser(bytes: Uint8Array): Promise<ExtractedPage[]> {
  const pdfjs = await getPdfjs();

  // Kopie: pdf.js übernimmt den Puffer und lässt das Original leer zurück.
  const task = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    cMapUrl: asset("/pdfjs/cmaps/"),
    cMapPacked: true,
    standardFontDataUrl: asset("/pdfjs/standard_fonts/"),
  });
  const pdf = await task.promise;

  try {
    const pages: ExtractedPage[] = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items: ExtractedItem[] = [];

      for (const raw of content.items) {
        if (!("str" in raw) || !raw.str) continue;
        const [scaleX, , , scaleY, x, y] = raw.transform as number[];

        let realName = "";
        try {
          const font = page.commonObjs.get(raw.fontName) as { name?: string } | undefined;
          realName = font?.name ?? "";
        } catch {
          realName = "";
        }
        const styleFamily = content.styles?.[raw.fontName]?.fontFamily ?? "";

        items.push({
          text: raw.str,
          x,
          y,
          width: raw.width ?? 0,
          fontSize: Math.abs(scaleY) || Math.abs(scaleX) || 11,
          bold: /bold|black|heavy|semibold/i.test(realName),
          italic: /italic|oblique/i.test(realName),
          fontFamily: classifyFamily(realName || styleFamily),
        });
      }

      pages.push({ width: viewport.width, height: viewport.height, items });
      page.cleanup();
    }

    return pages;
  } finally {
    await task.destroy();
  }
}
