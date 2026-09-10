"use client";

/**
 * Unterpfad, unter dem die App ausgeliefert wird.
 *
 * Lokal liegt sie unter der Wurzel ("/"), auf GitHub Pages unter dem
 * Repository-Namen ("/PDF.me"). Alle Dateien, die zur Laufzeit nachgeladen
 * werden — der pdf.js-Worker, die Schriftmetriken, die OCR-Bausteine —
 * müssen diesen Pfad enthalten, sonst laufen sie ins Leere.
 *
 * Next ersetzt NEXT_PUBLIC_BASE_PATH beim Bauen durch den festen Wert; zur
 * Laufzeit ist das also eine Konstante.
 */
export function basePath(): string {
  return process.env.NEXT_PUBLIC_BASE_PATH ?? "";
}

/** Adresse einer Datei aus public/, mit korrektem Unterpfad. */
export function asset(path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${basePath()}${clean}`;
}
