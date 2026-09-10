"use client";

/**
 * In welcher Betriebsart läuft die App?
 *
 * "server"   — es gibt einen Node-Prozess: Anmeldung greift, Word → PDF ist
 *              über LibreOffice möglich.
 * "statisch" — reine Dateien ohne Server (GitHub Pages). Alles läuft im
 *              Browser; Word → PDF entfällt, weil LibreOffice fehlt.
 *
 * Der Wert wird beim Bauen gesetzt und ist zur Laufzeit eine Konstante.
 */
export const isStatic = process.env.NEXT_PUBLIC_STATIC === "1";
export const hasServer = !isStatic;
