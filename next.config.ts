import type { NextConfig } from "next";

/**
 * Zwei Betriebsarten aus einer Quelle.
 *
 * SERVER (Vorgabe)
 *   next dev / next start. Es läuft ein Node-Prozess: Anmeldung greift,
 *   Word → PDF ist über LibreOffice möglich.
 *
 * STATISCH (STATIC_EXPORT=1)
 *   next build erzeugt reine Dateien in out/, die jeder Webserver ausliefern
 *   kann — auch GitHub Pages. Es gibt keinen Server, also auch keine
 *   Route Handler, keinen Proxy und keine Anmeldung. Alle PDF-Vorgänge laufen
 *   ohnehin schon im Browser (siehe lib/client/engine.ts), es fehlt nur
 *   Word → PDF.
 */

const isStatic = process.env.STATIC_EXPORT === "1";

/*
 * Auf GitHub Pages liegt die App unter dem Repository-Namen als Unterpfad
 * (https://<konto>.github.io/PDF.me/). Der Wert wird beim Bauen fest in die
 * Ausgabe geschrieben und kann nachträglich nicht geändert werden.
 */
const basePath = isStatic ? (process.env.BASE_PATH ?? "/PDF.me") : "";

const nextConfig: NextConfig = {
  // pdfjs wird serverseitig (PDF→Word) direkt aus node_modules geladen; es
  // bringt eigene WASM-/Font-Assets mit, die relativ zum Paketpfad liegen.
  serverExternalPackages: ["pdfjs-dist"],

  /*
   * Dateien mit der Endung ".node.ts"/".node.tsx" gelten nur im Server-Betrieb
   * als Route, Proxy oder Seite. Im statischen Build fehlt diese Endung in der
   * Liste, wodurch Next sie schlicht nicht als Routen erkennt — Route Handler
   * mit POST und ein Proxy sind bei "output: export" nicht möglich und würden
   * den Build abbrechen.
   *
   * Der Weg über pageExtensions ist der von Next vorgesehene; Dateien während
   * des Bauens hin- und herzuschieben wäre fehleranfälliger.
   */
  pageExtensions: isStatic ? ["tsx", "ts"] : ["tsx", "ts", "node.tsx", "node.ts"],

  ...(isStatic
    ? {
        output: "export" as const,
        basePath,
        // Ohne Bildoptimierung, weil dafür ein Server nötig wäre.
        images: { unoptimized: true },
        // Verzeichnisse statt .html-Dateien: so funktionieren die Adressen auf
        // GitHub Pages ohne Endung.
        trailingSlash: true,
      }
    : {}),

  env: {
    // Zur Laufzeit im Browser lesbar, damit Code den Unterpfad kennt und weiss,
    // ob ein Server erreichbar ist.
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_STATIC: isStatic ? "1" : "0",
  },

  experimental: {
    serverActions: {
      // Grosszügiges Limit, damit auch mehrseitige Scans durchgehen.
      bodySizeLimit: "100mb",
    },
  },
};

export default nextConfig;
