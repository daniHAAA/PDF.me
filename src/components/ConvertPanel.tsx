"use client";

import { useCallback, useEffect, useState } from "react";
import { Notice, Spinner } from "./ui";
import { FileDropzone } from "./FileDropzone";
import { ApiError, downloadResult, postAndDownload } from "@/lib/client/download";
import { pdfToDocxInBrowser } from "@/lib/client/engine";
import { hasServer } from "@/lib/client/mode";

interface Capabilities {
  libreOffice: boolean;
  /** Klartext-Begründung vom Server, wenn LibreOffice nicht einsatzbereit ist. */
  libreOfficeReason?: string;
  pdf2docx: boolean;
}

export function ConvertPanel() {
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [busy, setBusy] = useState<"docx" | "pdf" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Nur im Server-Betrieb gibt es überhaupt externe Werkzeuge, nach denen sich
  // fragen liesse.
  useEffect(() => {
    if (!hasServer) return;
    fetch("/api/capabilities")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setCapabilities(data))
      .catch(() => setCapabilities({ libreOffice: false, pdf2docx: false }));
  }, []);

  const convertDocxToPdf = useCallback(async (file: File) => {
    setBusy("docx");
    setError(null);
    setInfo(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("filename", file.name);
      await postAndDownload("/api/convert/docx-to-pdf", form, "dokument.pdf");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Konvertierung fehlgeschlagen.");
    } finally {
      setBusy(null);
    }
  }, []);

  const convertPdfToDocx = useCallback(
    async (file: File) => {
      setBusy("pdf");
      setError(null);
      setInfo(null);
      try {
        /*
         * Ohne Server wird im Browser konvertiert. Mit Server und installiertem
         * pdf2docx dort, weil das Layout deutlich besser erhalten bleibt;
         * fehlt pdf2docx, bringt der Umweg über den Server nichts und der
         * Browser erledigt es ohne Upload.
         */
        if (hasServer && capabilities?.pdf2docx) {
          const form = new FormData();
          form.append("file", file);
          form.append("filename", file.name);
          const { warning } = await postAndDownload(
            "/api/convert/pdf-to-docx",
            form,
            "dokument.docx",
          );
          if (warning) setInfo(warning);
        } else {
          const result = await pdfToDocxInBrowser(file);
          downloadResult(result);
          if (result.warning) setInfo(result.warning);
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Konvertierung fehlgeschlagen.");
      } finally {
        setBusy(null);
      }
    },
    [capabilities],
  );

  const wordToPdfAvailable = hasServer && capabilities?.libreOffice !== false;

  return (
    <div className="space-y-5">
      {error && <Notice tone="error">{error}</Notice>}
      {info && <Notice tone="warn">{info}</Notice>}

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold">Word → PDF</h3>
            <p className="mt-0.5 text-xs text-muted">
              Konvertiert über LibreOffice. Layout, Tabellen und Kopfzeilen bleiben erhalten.
            </p>
          </div>

          {!hasServer ? (
            <Notice tone="warn">
              Diese Richtung braucht LibreOffice — ein ausgewachsenes Programm, das es im
              Browser nicht gibt. In dieser Fassung ohne Server ist sie deshalb nicht
              verfügbar.{"\n\n"}
              Dafür die App lokal starten: siehe README, Abschnitt „Zwei Betriebsarten“.
            </Notice>
          ) : (
            capabilities &&
            !capabilities.libreOffice && (
              <Notice tone="warn">
                {capabilities.libreOfficeReason ??
                  "LibreOffice ist auf diesem Rechner nicht einsatzbereit."}
              </Notice>
            )
          )}

          {wordToPdfAvailable && (
            <>
              <FileDropzone
                accept=".docx,.doc"
                label="Word-Datei auswählen"
                hint=".docx oder .doc"
                onFiles={(files) => void convertDocxToPdf(files[0])}
              />
              {busy === "docx" && <Spinner label="konvertiert …" />}
            </>
          )}
        </div>

        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold">PDF → Word</h3>
            <p className="mt-0.5 text-xs text-muted">
              Rekonstruiert Absätze, Schriftgrössen und Ausrichtung aus den Textpositionen.
            </p>
          </div>

          {hasServer && capabilities && !capabilities.pdf2docx && (
            <Notice>
              Läuft mit dem eingebauten Konverter: Text, Schriftgrössen und Ausrichtung bleiben
              erhalten, Tabellen werden zu Text.{"\n"}Für höhere Layouttreue optional:
              pip install pdf2docx
            </Notice>
          )}

          <FileDropzone
            accept=".pdf"
            label="PDF-Datei auswählen"
            hint="Ergebnis ist eine bearbeitbare .docx-Datei"
            onFiles={(files) => void convertPdfToDocx(files[0])}
          />
          {busy === "pdf" && <Spinner label="konvertiert …" />}
        </div>
      </div>
    </div>
  );
}
