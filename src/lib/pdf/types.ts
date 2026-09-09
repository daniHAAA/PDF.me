/** Farbe mit Kanälen von 0..1 (so erwartet es pdf-lib). */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Rechteck in PDF-User-Space: Ursprung unten links, Einheit Punkt (1/72 Zoll). */
export interface PdfRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type FontFamily = "sans" | "serif" | "mono";

/**
 * Eine einzelne Textänderung.
 *
 * Der Client liefert bereits PDF-Koordinaten (nicht Bildschirmpixel), damit der
 * Server nichts über Zoomstufe oder Viewport wissen muss.
 */
export interface TextEdit {
  pageIndex: number;
  /**
   * Fläche des Originaltexts, die übermalt wird. x/y ist der Ankerpunkt unten
   * links IN LESERICHTUNG — bei rotation != 0 also nicht achsenparallel.
   */
  box: PdfRect;
  /** Startpunkt der Basislinie für den neuen Text. */
  baseline: { x: number; y: number };
  /** Neuer Inhalt. Leerstring bedeutet: nur löschen, nichts neu zeichnen. */
  text: string;
  /**
   * Ursprünglicher Inhalt. Dient dazu, nach dem Entfernen aus dem Inhaltsstrom
   * zu prüfen, dass der alte Text wirklich weg ist.
   */
  originalText?: string;
  /**
   * true, wenn die Stelle aus der Texterkennung stammt statt aus dem
   * Textlayer des PDFs. Dann gibt es im Dokument gar keinen Textbefehl, der
   * entfernt werden könnte — die Stelle ist ein Bild, und Übermalen ist hier
   * die vollständige Lösung, nicht eine Notlösung.
   */
  fromOcr?: boolean;
  fontSize: number;
  /** Verfügbare Breite in Leserichtung; darüber wird die Schrift verkleinert. */
  maxWidth?: number;
  fontFamily: FontFamily;
  bold: boolean;
  italic: boolean;
  /** Textfarbe. */
  color: Rgb;
  /** Hintergrundfarbe, aus dem gerenderten Canvas gesampelt. */
  background: Rgb;
  /**
   * Textrichtung in Grad gegen den Uhrzeigersinn, ausgelesen aus der
   * Textmatrix des Originals. Bei normalem Fliesstext 0; bei gedrehten Seiten
   * oder gedrehten Textblöcken entsprechend. Gilt für Abdeckung und neuen Text.
   */
  rotation?: number;
}

/** Ein Wort mit Position, wie es OCR oder der PDF-Textlayer liefert. */
export interface WordBox {
  text: string;
  /** Position im Bildraum des gerenderten Canvas (Ursprung oben links). */
  left: number;
  top: number;
  width: number;
  height: number;
  confidence?: number;
}
