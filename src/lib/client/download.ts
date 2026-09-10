"use client";

/** Löst einen Datei-Download aus und gibt die Objekt-URL sofort wieder frei. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Kurz warten: manche Browser brechen den Download ab, wenn die URL im
  // selben Tick ungültig wird.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Liest den Dateinamen aus dem Content-Disposition-Header. */
export function filenameFromResponse(response: Response, fallback: string): string {
  const header = response.headers.get("Content-Disposition");
  const match = header?.match(/filename="([^"]+)"/);
  if (!match) return fallback;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export class ApiError extends Error {}

/** Startet den Download eines im Browser erzeugten Ergebnisses. */
export function downloadResult(result: { blob: Blob; filename: string }): void {
  downloadBlob(result.blob, result.filename);
}

/**
 * Schickt ein FormData an eine Route und startet den Download der Antwort.
 * Gibt optionale Hinweise des Servers zurück (etwa zur Konvertierungsqualität).
 */
export async function postAndDownload(
  url: string,
  form: FormData,
  fallbackName: string,
): Promise<{ warning?: string; headers: Headers }> {
  const response = await fetch(url, { method: "POST", body: form });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(body?.error ?? `Fehler ${response.status}`);
  }

  downloadBlob(await response.blob(), filenameFromResponse(response, fallbackName));

  const warning = response.headers.get("X-Convert-Warning");
  return {
    headers: response.headers,
    ...(warning ? { warning: decodeURIComponent(warning) } : {}),
  };
}
