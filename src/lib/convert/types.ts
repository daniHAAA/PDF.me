/**
 * Datentypen der Textextraktion.
 *
 * Bewusst in einer eigenen Datei ohne jeden Import: So können sowohl der
 * Server (node-Pfade, eigene pdf.js-Instanz) als auch der Browser sie
 * verwenden, ohne sich gegenseitig Abhängigkeiten einzuschleppen.
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
 * Eine Funktion, die den Text eines PDFs mit Positionen ausliest.
 *
 * Sie wird hereingereicht statt fest verdrahtet, weil pdf.js im Browser und
 * in Node unterschiedlich geladen wird. Der Kern der Anwendung bleibt dadurch
 * von beidem unabhängig.
 */
export type TextExtractor = (bytes: Uint8Array) => Promise<ExtractedPage[]>;

/** Gesamter Textumfang — dient als Heuristik "ist das ein Scan?". */
export function textLength(pages: ExtractedPage[]): number {
  return pages.reduce(
    (sum, page) => sum + page.items.reduce((s, item) => s + item.text.trim().length, 0),
    0,
  );
}

/** Ordnet einen Schriftnamen einer der drei Gattungen zu. */
export function classifyFamily(name: string): "sans" | "serif" | "mono" {
  const n = name.toLowerCase();
  if (/mono|courier|consol/.test(n)) return "mono";
  // "sans-serif" enthält "serif" — sans muss deshalb zuerst geprüft werden.
  if (/sans/.test(n)) return "sans";
  if (/times|serif|georgia|garamond|roman|book|cambria|minion/.test(n)) return "serif";
  return "sans";
}
