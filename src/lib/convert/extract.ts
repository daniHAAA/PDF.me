import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Serverseitige Textextraktion mit pdf.js.
 *
 * pdf.js liefert nicht nur Zeichenketten, sondern zu jedem Fragment die
 * Transformationsmatrix — also Position, Grösse und Neigung. Genau daraus lässt
 * sich die Layoutstruktur (Zeilen, Absätze, Ausrichtung) rekonstruieren.
 */

export interface ExtractedItem {
  text: string;
  /** Basislinien-Startpunkt in PDF-Koordinaten (Ursprung unten links). */
  x: number;
  y: number;
  width: number;
  /** Effektive Schriftgrösse in Punkt. */
  fontSize: number;
  bold: boolean;
  italic: boolean;
  fontFamily: "sans" | "serif" | "mono";
}

export interface ExtractedPage {
  width: number;
  height: number;
  items: ExtractedItem[];
}

/**
 * Pfad zu den Metriken der 14 Standard-Fonts.
 *
 * Bewusst NICHT über require.resolve: im gebündelten Next-Server liefert das
 * eine Modul-ID des Bundlers statt eines Dateipfads. Stattdessen wird nach den
 * Dateien gesucht — zuerst in public/pdfjs (dorthin kopiert sie
 * scripts/copy-assets.mjs), danach direkt in node_modules.
 */
function standardFontDataUrl(): string | undefined {
  const candidates = [
    join(process.cwd(), "public", "pdfjs", "standard_fonts"),
    join(process.cwd(), "node_modules", "pdfjs-dist", "standard_fonts"),
  ];
  const found = candidates.find((path) => existsSync(path));
  // Der abschliessende Trenner ist Pflicht — pdf.js hängt die Dateinamen an.
  return found ? `${found}/` : undefined;
}

function classifyFamily(name: string): "sans" | "serif" | "mono" {
  const n = name.toLowerCase();
  if (/mono|courier|consol/.test(n)) return "mono";
  // "sans-serif" enthält "serif" — sans muss deshalb zuerst geprüft werden.
  if (/sans/.test(n)) return "sans";
  if (/times|serif|georgia|garamond|roman|book|cambria|minion/.test(n)) return "serif";
  return "sans";
}

export async function extractPages(bytes: Uint8Array): Promise<ExtractedPage[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  /*
   * Kopie statt Original: pdf.js reicht den Puffer an seinen Worker weiter und
   * übernimmt ihn dabei (transferable). Das Original bleibt als leere Hülle
   * zurück, und jeder spätere Zugriff darauf scheitert mit "detached
   * ArrayBuffer". Wer hier ein PDF prüft, will es danach meist noch ausliefern.
   */
  const task = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    standardFontDataUrl: standardFontDataUrl(),
    useSystemFonts: false,
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

        // Der Name im styles-Objekt ist generisch ("sans-serif"). Der echte
        // Fontname steckt im Font-Objekt und verrät Bold/Italic.
        let realName = "";
        try {
          const font = page.commonObjs.get(raw.fontName) as { name?: string } | undefined;
          realName = font?.name ?? "";
        } catch {
          realName = "";
        }
        const styleFamily = content.styles?.[raw.fontName]?.fontFamily ?? "";
        const nameForClass = realName || styleFamily;

        items.push({
          text: raw.str,
          x,
          y,
          width: raw.width ?? 0,
          // Die vertikale Skalierung der Matrix ist die effektive Schriftgrösse.
          fontSize: Math.abs(scaleY) || Math.abs(scaleX) || 11,
          bold: /bold|black|heavy|semibold/i.test(realName),
          italic: /italic|oblique/i.test(realName),
          fontFamily: classifyFamily(nameForClass),
        });
      }

      pages.push({ width: viewport.width, height: viewport.height, items });
      page.cleanup();
    }

    return pages;
  } finally {
    // destroy() sitzt am LoadingTask, nicht am Dokument — beendet den Worker
    // und gibt den Speicher frei.
    await task.destroy();
  }
}

/** Gesamter Textumfang — dient als Heuristik "ist das ein Scan?". */
export function textLength(pages: ExtractedPage[]): number {
  return pages.reduce(
    (sum, page) => sum + page.items.reduce((s, item) => s + item.text.trim().length, 0),
    0,
  );
}
