"use client";

import type { PDFPageProxy, PageViewport } from "./pdfjs";
import { getPdfjs } from "./pdfjs";
import { guessBold, guessFamily, guessItalic } from "@/lib/pdf/fonts";
import type { FontFamily } from "@/lib/pdf/types";

/**
 * Übersetzt den Textlayer von pdf.js in bearbeitbare Boxen.
 *
 * Zwei Koordinatensysteme sind im Spiel:
 *  - Bildschirm: Pixel im Canvas, Ursprung oben links, y wächst nach unten.
 *  - PDF:        Punkt, Ursprung unten links, y wächst nach oben.
 *
 * Die Anzeige braucht das erste, der Server das zweite. Beides wird hier
 * einmal berechnet, damit später nichts mehr umgerechnet werden muss.
 */

export interface EditableItem {
  id: string;
  original: string;
  /** Woher die Stelle stammt — entscheidet, ob Originaltext entfernt werden kann. */
  source: "text" | "ocr";
  /** Position im Canvas, für die Overlay-Box. */
  screen: {
    left: number;
    top: number;
    width: number;
    height: number;
    fontSize: number;
    /** Drehung in Grad im Uhrzeigersinn (CSS-Konvention). */
    angleDeg: number;
  };
  /** Position im PDF, für pdf-lib. */
  pdf: {
    baselineX: number;
    baselineY: number;
    boxX: number;
    boxY: number;
    boxWidth: number;
    boxHeight: number;
    fontSize: number;
    /** Drehung in Grad gegen den Uhrzeigersinn (PDF-Konvention). */
    rotationDeg: number;
  };
  fontFamily: FontFamily;
  bold: boolean;
  italic: boolean;
}

/** Typische Metriken, wenn pdf.js keine liefert. */
const DEFAULT_ASCENT = 0.76;
const DEFAULT_DESCENT = 0.22;

export async function buildEditableItems(
  page: PDFPageProxy,
  viewport: PageViewport,
): Promise<EditableItem[]> {
  const pdfjs = await getPdfjs();
  const content = await page.getTextContent();
  const items: EditableItem[] = [];

  content.items.forEach((raw, index) => {
    if (!("str" in raw) || !raw.str || !raw.str.trim()) return;

    const matrix = raw.transform as number[];
    const style = content.styles?.[raw.fontName];
    const ascent = typeof style?.ascent === "number" && style.ascent > 0 ? style.ascent : DEFAULT_ASCENT;
    const descent =
      typeof style?.descent === "number" ? Math.abs(style.descent) : DEFAULT_DESCENT;

    /* --- PDF-Seite --- */
    // Die Textmatrix steht bereits in PDF-Koordinaten. Ihre vertikale Skalierung
    // ist die effektive Schriftgrösse, ihr Winkel die Leserichtung.
    const pdfFontSize = Math.hypot(matrix[2], matrix[3]) || Math.hypot(matrix[0], matrix[1]) || 10;
    const angleRad = Math.atan2(matrix[1], matrix[0]);
    const baselineX = matrix[4];
    const baselineY = matrix[5];

    // Die Abdeckbox beginnt unterhalb der Basislinie (Unterlängen) und reicht
    // bis über die Oberlängen — verschoben entlang der Normalen zur Leserichtung.
    const acrossX = -Math.sin(angleRad);
    const acrossY = Math.cos(angleRad);
    const boxHeight = pdfFontSize * (ascent + descent);

    /* --- Bildschirmseite --- */
    const screenMatrix = pdfjs.Util.transform(viewport.transform, matrix);
    const screenFontSize = Math.hypot(screenMatrix[2], screenMatrix[3]);
    const screenAngleRad = Math.atan2(screenMatrix[1], screenMatrix[0]);
    const screenWidth = (raw.width ?? 0) * viewport.scale;

    /*
     * styles[].fontFamily liefert nur die grobe Gattung ("sans-serif") und
     * verrät nichts über Fett oder Kursiv. Der echte Fontname steckt im
     * Font-Objekt (z.B. "Helvetica-Bold") — daraus lässt sich beides ablesen.
     * commonObjs kann für eine Schrift noch nicht bereitstehen; dann bleibt
     * die Gattung als Rückfallebene.
     */
    let realName = "";
    try {
      const font = page.commonObjs.get(raw.fontName) as { name?: string } | undefined;
      realName = font?.name ?? "";
    } catch {
      realName = "";
    }
    const fontName = realName || style?.fontFamily || raw.fontName || "";

    items.push({
      id: `${page.pageNumber}-${index}`,
      original: raw.str,
      source: "text",
      screen: {
        left: screenMatrix[4],
        // screenMatrix[5] ist die Basislinie; die Box beginnt eine Oberlänge höher.
        top: screenMatrix[5] - screenFontSize * ascent,
        width: screenWidth,
        height: screenFontSize * (ascent + descent),
        fontSize: screenFontSize,
        angleDeg: (screenAngleRad * 180) / Math.PI,
      },
      pdf: {
        baselineX,
        baselineY,
        boxX: baselineX - acrossX * pdfFontSize * descent,
        boxY: baselineY - acrossY * pdfFontSize * descent,
        boxWidth: raw.width ?? 0,
        boxHeight,
        fontSize: pdfFontSize,
        rotationDeg: (angleRad * 180) / Math.PI,
      },
      fontFamily: guessFamily(fontName),
      bold: guessBold(fontName),
      italic: guessItalic(fontName),
    });
  });

  return items;
}

/** Wieviel echter Text steckt auf der Seite? Grundlage für die Scan-Erkennung. */
export function textVolume(items: EditableItem[]): number {
  return items.reduce((sum, item) => sum + item.original.trim().length, 0);
}
