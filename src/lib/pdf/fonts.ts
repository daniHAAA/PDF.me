import { PDFDocument, PDFFont, StandardFonts } from "pdf-lib";
import type { FontFamily } from "./types";

/**
 * Fonts für neu gezeichneten Text.
 *
 * Warum nicht der Originalfont? Eingebettete Fonts in PDFs sind fast immer
 * "Subsets": sie enthalten nur die Glyphen, die im Dokument vorkommen. Tippt man
 * ein Zeichen, das vorher nicht vorkam, fehlt die Glyphe. Deshalb wird auf die
 * 14 Standard-PDF-Fonts gemappt, die jeder Viewer garantiert kann.
 */

const STANDARD: Record<FontFamily, Record<string, StandardFonts>> = {
  sans: {
    regular: StandardFonts.Helvetica,
    bold: StandardFonts.HelveticaBold,
    italic: StandardFonts.HelveticaOblique,
    boldItalic: StandardFonts.HelveticaBoldOblique,
  },
  serif: {
    regular: StandardFonts.TimesRoman,
    bold: StandardFonts.TimesRomanBold,
    italic: StandardFonts.TimesRomanItalic,
    boldItalic: StandardFonts.TimesRomanBoldItalic,
  },
  mono: {
    regular: StandardFonts.Courier,
    bold: StandardFonts.CourierBold,
    italic: StandardFonts.CourierOblique,
    boldItalic: StandardFonts.CourierBoldOblique,
  },
};

function variantKey(bold: boolean, italic: boolean): string {
  if (bold && italic) return "boldItalic";
  if (bold) return "bold";
  if (italic) return "italic";
  return "regular";
}

/**
 * Cache pro Dokument: jeder embedFont-Aufruf legt ein neues Font-Objekt im PDF
 * an. Ohne Cache bläht ein Dokument mit 200 Änderungen unnötig auf.
 */
export class FontCache {
  private cache = new Map<string, PDFFont>();

  constructor(private doc: PDFDocument) {}

  async get(family: FontFamily, bold: boolean, italic: boolean): Promise<PDFFont> {
    const key = `${family}:${variantKey(bold, italic)}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const standard = STANDARD[family] ?? STANDARD.sans;
    const font = await this.doc.embedFont(standard[variantKey(bold, italic)]);
    this.cache.set(key, font);
    return font;
  }
}

/**
 * Rät aus dem PDF-Fontnamen (z.B. "ABCDEF+Arial-BoldMT") die Familie.
 * Wird im Client benutzt, um beim Anklicken die passende Variante vorzubelegen.
 */
export function guessFamily(fontName: string): FontFamily {
  const name = fontName.toLowerCase();
  if (/mono|courier|consol|menlo/.test(name)) return "mono";
  // Achtung: "sans-serif" enthält "serif". Ohne diese Abfrage zuerst würde
  // jede serifenlose Schrift als Serifenschrift eingestuft — pdf.js meldet
  // genau diesen Namen für Standard-Sans-Fonts.
  if (/sans/.test(name)) return "sans";
  if (/times|serif|georgia|garamond|book|roman|minion|cambria/.test(name)) return "serif";
  return "sans";
}

export function guessBold(fontName: string): boolean {
  return /bold|black|heavy|semibold|demibold|[-_]bd\b/i.test(fontName);
}

export function guessItalic(fontName: string): boolean {
  return /italic|oblique|[-_]it\b/i.test(fontName);
}

/**
 * Die Standard-Fonts nutzen WinAnsi-Encoding. Zeichen ausserhalb davon lassen
 * pdf-lib beim Zeichnen werfen. Statt die ganze Anfrage scheitern zu lassen,
 * werden typografische Sonderzeichen auf ASCII-Äquivalente abgebildet und der
 * Rest verworfen. Umlaute und ß sind in WinAnsi enthalten und bleiben erhalten.
 */
const REPLACEMENTS: Array<[RegExp, string]> = [
  [/[‘’‚‹›]/g, "'"],
  [/[“”„«»]/g, '"'],
  [/[–—−]/g, "-"],
  [/…/g, "..."],
  [/ /g, " "],
  [/[•·]/g, "-"],
  [/™/g, "(TM)"],
  [/\t/g, "    "],
];

export function sanitizeForWinAnsi(input: string): string {
  let out = input;
  for (const [pattern, replacement] of REPLACEMENTS) out = out.replace(pattern, replacement);
  // WinAnsi deckt U+0020..U+00FF ab, plus einige Extras im Bereich 0x80..0x9F,
  // die oben schon ersetzt wurden. Alles andere fliegt raus.
  return out.replace(/[^ -ÿ]/g, "");
}
