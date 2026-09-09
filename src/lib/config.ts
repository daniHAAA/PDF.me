/**
 * Zentrale Konfiguration aus Umgebungsvariablen.
 *
 * Bewusst "fail fast": fehlt ein Pflichtwert, bricht die App beim ersten
 * Zugriff mit einer klaren Meldung ab, statt still unsicher weiterzulaufen.
 */

function required(name: string, minLength = 1): string {
  const value = process.env[name];
  if (!value || value.length < minLength) {
    throw new Error(
      `Umgebungsvariable ${name} fehlt oder ist zu kurz (mindestens ${minLength} Zeichen). ` +
        `Lege eine .env.local nach dem Vorbild von .env.example an.`,
    );
  }
  return value;
}

function optionalNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const config = {
  get password(): string {
    return required("APP_PASSWORD");
  },
  get authSecret(): Uint8Array {
    return new TextEncoder().encode(required("AUTH_SECRET", 32));
  },
  get sessionHours(): number {
    return optionalNumber("SESSION_HOURS", 12);
  },
  get maxUploadBytes(): number {
    return optionalNumber("MAX_UPLOAD_MB", 100) * 1024 * 1024;
  },
};

export const SESSION_COOKIE = "pdfme_session";
