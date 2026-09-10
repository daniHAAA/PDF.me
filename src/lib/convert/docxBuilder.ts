import {
  AlignmentType,
  Document,
  Packer,
  Paragraph,
  TextRun,
  convertInchesToTwip,
} from "docx";
import type { ExtractedItem, ExtractedPage } from "./types";

/**
 * Baut aus Textfragmenten mit Position ein Word-Dokument.
 *
 * Das ist die schwierigste Richtung der Konvertierung: Ein PDF beschreibt nur,
 * wo Glyphen stehen. Absätze, Überschriften und Tabellen existieren dort gar
 * nicht als Struktur — sie müssen aus den Positionen zurückgerechnet werden.
 *
 * Diese Datei kommt bewusst ohne node-Module aus, damit sie auch im Browser
 * läuft (statischer Betrieb ohne Server).
 */

interface Line {
  items: ExtractedItem[];
  /** Basislinie der Zeile. */
  y: number;
  left: number;
  right: number;
  fontSize: number;
}

/**
 * Fasst Fragmente zu Zeilen zusammen.
 * Kriterium: nahezu gleiche Basislinie (Toleranz relativ zur Schriftgrösse,
 * damit hochgestellte Zeichen nicht jedes Mal eine neue Zeile auslösen).
 */
function groupIntoLines(items: ExtractedItem[]): Line[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Line[] = [];

  for (const item of sorted) {
    const tolerance = Math.max(1.5, item.fontSize * 0.45);
    const current = lines[lines.length - 1];

    if (current && Math.abs(current.y - item.y) <= tolerance) {
      current.items.push(item);
      current.left = Math.min(current.left, item.x);
      current.right = Math.max(current.right, item.x + item.width);
      current.fontSize = Math.max(current.fontSize, item.fontSize);
    } else {
      lines.push({
        items: [item],
        y: item.y,
        left: item.x,
        right: item.x + item.width,
        fontSize: item.fontSize,
      });
    }
  }

  for (const line of lines) line.items.sort((a, b) => a.x - b.x);
  return lines;
}

/**
 * Setzt eine Zeile aus ihren Fragmenten zusammen und ergänzt Leerzeichen dort,
 * wo im PDF eine sichtbare Lücke ist. PDF-Erzeuger zerlegen Wörter oft in viele
 * Fragmente ohne jedes Leerzeichen — ohne diese Korrektur klebt alles aneinander.
 */
function buildRuns(line: Line): TextRun[] {
  const runs: TextRun[] = [];
  let previous: ExtractedItem | null = null;

  for (const item of line.items) {
    let text = item.text;
    if (previous) {
      const gap = item.x - (previous.x + previous.width);
      const spaceWidth = previous.fontSize * 0.25;
      if (gap > spaceWidth && !/\s$/.test(previous.text) && !/^\s/.test(text)) {
        text = ` ${text}`;
      }
    }

    runs.push(
      new TextRun({
        text,
        bold: item.bold,
        italics: item.italic,
        // docx misst in halben Punkten.
        size: Math.round(item.fontSize * 2),
        font:
          item.fontFamily === "serif"
            ? "Times New Roman"
            : item.fontFamily === "mono"
              ? "Courier New"
              : "Calibri",
      }),
    );
    previous = item;
  }

  return runs;
}

function guessAlignment(
  line: Line,
  pageWidth: number,
): (typeof AlignmentType)[keyof typeof AlignmentType] {
  const leftMargin = line.left;
  const rightMargin = pageWidth - line.right;
  const width = line.right - line.left;

  // Zentriert: beide Ränder ähnlich gross und die Zeile füllt nicht die Breite.
  if (Math.abs(leftMargin - rightMargin) < pageWidth * 0.04 && width < pageWidth * 0.75) {
    return AlignmentType.CENTER;
  }
  // Rechtsbündig: deutlich mehr Platz links als rechts.
  if (leftMargin > pageWidth * 0.45 && rightMargin < pageWidth * 0.12) {
    return AlignmentType.RIGHT;
  }
  return AlignmentType.LEFT;
}

function pageToParagraphs(page: ExtractedPage): Paragraph[] {
  const lines = groupIntoLines(page.items);
  const paragraphs: Paragraph[] = [];

  lines.forEach((line, index) => {
    const previous = lines[index - 1];
    // Abstand zur Vorzeile: deutlich mehr als eine Zeilenhöhe deutet auf einen
    // Absatzwechsel hin und wird als Abstand vor dem Absatz übernommen.
    const gap = previous ? previous.y - line.y - line.fontSize : 0;
    const spacingBefore = gap > line.fontSize * 0.6 ? Math.round(gap * 20) : 0;

    paragraphs.push(
      new Paragraph({
        children: buildRuns(line),
        alignment: guessAlignment(line, page.width),
        spacing: { before: spacingBefore, after: 0, line: Math.round(line.fontSize * 1.15 * 20) },
        indent:
          line.left > page.width * 0.1
            ? { left: Math.round((line.left - page.width * 0.08) * 20) }
            : undefined,
      }),
    );
  });

  if (paragraphs.length === 0) {
    paragraphs.push(new Paragraph({ children: [new TextRun({ text: "" })] }));
  }
  return paragraphs;
}

/** Der Hinweis, der zusammen mit dem Ergebnis dieses Konverters angezeigt wird. */
export const FALLBACK_WARNING =
  "Konvertiert mit dem eingebauten Konverter: Text, Schriftgrössen und Ausrichtung " +
  "bleiben erhalten, Tabellen und Bilder werden nicht als solche übernommen.";

export async function buildDocxFromPages(pages: ExtractedPage[]): Promise<Uint8Array> {
  if (pages.length === 0) throw new Error("Das PDF enthält keine Seiten.");

  const document = new Document({
    // Eine Section je Seite: dadurch beginnt jede Seite im Word-Dokument neu
    // und behält ihr eigenes Format.
    sections: pages.map((page) => ({
      properties: {
        page: {
          size: {
            // PDF rechnet in Punkt, docx in Twips (1 pt = 20 Twips).
            width: Math.round(page.width * 20),
            height: Math.round(page.height * 20),
          },
          margin: {
            top: convertInchesToTwip(0.6),
            bottom: convertInchesToTwip(0.6),
            left: convertInchesToTwip(0.6),
            right: convertInchesToTwip(0.6),
          },
        },
      },
      children: pageToParagraphs(page),
    })),
  });

  return new Uint8Array(await Packer.toBuffer(document));
}
