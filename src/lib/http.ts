import { NextResponse } from "next/server";
import { config } from "./config";
import { InputError } from "./errors";

/**
 * Kleine Helfer für die Route-Handler.
 *
 * Alle Routen folgen demselben Muster: multipart rein, Binärdatei raus.
 * Es wird nichts auf Platte geschrieben und nichts zwischengespeichert.
 */

// Beibehalten als sprechender Name in den Routen; identisch mit InputError.
export { InputError as BadRequestError };

export async function readUpload(
  form: FormData,
  field: string,
  { required = true }: { required?: boolean } = {},
): Promise<Uint8Array | null> {
  const entry = form.get(field);
  if (!entry || typeof entry === "string") {
    if (required) throw new InputError(`Feld "${field}" fehlt oder ist keine Datei.`);
    return null;
  }
  if (entry.size > config.maxUploadBytes) {
    throw new InputError(
      `"${entry.name}" ist ${(entry.size / 1024 / 1024).toFixed(1)} MB gross. ` +
        `Erlaubt sind ${(config.maxUploadBytes / 1024 / 1024).toFixed(0)} MB.`,
    );
  }
  return new Uint8Array(await entry.arrayBuffer());
}

export async function readUploads(form: FormData, field: string): Promise<Uint8Array[]> {
  const entries = form.getAll(field).filter((e): e is File => typeof e !== "string");
  if (entries.length === 0) throw new InputError(`Keine Dateien im Feld "${field}".`);

  const total = entries.reduce((sum, e) => sum + e.size, 0);
  if (total > config.maxUploadBytes * 4) {
    throw new InputError("Die Dateien sind zusammen zu gross.");
  }
  return Promise.all(entries.map(async (e) => new Uint8Array(await e.arrayBuffer())));
}

export function readJson<T>(form: FormData, field: string, fallback: T): T {
  const raw = form.get(field);
  if (typeof raw !== "string" || !raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new InputError(`Feld "${field}" enthält kein gültiges JSON.`);
  }
}

/** Antwortet mit einer Datei zum Download. */
export function fileResponse(
  bytes: Uint8Array,
  filename: string,
  contentType: string,
  extraHeaders: Record<string, string> = {},
): NextResponse {
  // Uint8Array in einen frischen ArrayBuffer kopieren: das ausgelieferte
  // Objekt darf nicht auf einen geteilten Puffer zeigen.
  const body = new Uint8Array(bytes).buffer as ArrayBuffer;
  return new NextResponse(body, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

/** Einheitliche Fehlerbehandlung: erwartete Fehler mit Klartext, Rest als 500. */
export function errorResponse(error: unknown): NextResponse {
  // Eingabefehler sind erwartbar: klare Meldung, 400, kein Log-Rauschen.
  if (error instanceof InputError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  const message = error instanceof Error ? error.message : "Unbekannter Fehler.";
  console.error("[pdf.me]", error);
  return NextResponse.json({ error: message }, { status: 500 });
}
