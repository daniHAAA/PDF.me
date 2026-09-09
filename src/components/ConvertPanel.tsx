"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Notice, Spinner } from "./ui";
import { FileDropzone } from "./FileDropzone";
import { ApiError, postAndDownload } from "@/lib/client/download";

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

  // Einmal beim Öffnen abfragen, welche externen Werkzeuge vorhanden sind.
  // So zeigt die Oberfläche den Installationshinweis, bevor jemand in einen
  // Fehler läuft.
  useEffect(() => {
    fetch("/api/capabilities")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setCapabilities(data))
      .catch(() => setCapabilities({ libreOffice: false, pdf2docx: false }));
  }, []);

  const convert = useCallback(
    async (direction: "docx" | "pdf", file: File) => {
      setBusy(direction);
      setError(null);
      setInfo(null);
      try {
        const form = new FormData();
        form.append("file", file);
        form.append("filename", file.name);

        const url =
          direction === "docx" ? "/api/convert/docx-to-pdf" : "/api/convert/pdf-to-docx";
        const { warning } = await postAndDownload(
          url,
          form,
          direction === "docx" ? "dokument.pdf" : "dokument.docx",
        );
        if (warning) setInfo(warning);
      } catch (caught) {
        setError(caught instanceof ApiError ? caught.message : "Konvertierung fehlgeschlagen.");
      } finally {
        setBusy(null);
      }
    },
    [],
  );

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

          {capabilities && !capabilities.libreOffice && (
            <Notice tone="warn">
              {capabilities.libreOfficeReason ??
                "LibreOffice ist auf diesem Rechner nicht einsatzbereit."}
            </Notice>
          )}

          <FileDropzone
            accept=".docx,.doc"
            label="Word-Datei auswählen"
            hint=".docx oder .doc"
            onFiles={(files) => void convert("docx", files[0])}
          />
          {busy === "docx" && <Spinner label="konvertiert …" />}
        </div>

        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold">PDF → Word</h3>
            <p className="mt-0.5 text-xs text-muted">
              Rekonstruiert Absätze, Schriftgrössen und Ausrichtung aus den Textpositionen.
            </p>
          </div>

          {capabilities && !capabilities.pdf2docx && (
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
            onFiles={(files) => void convert("pdf", files[0])}
          />
          {busy === "pdf" && <Spinner label="konvertiert …" />}
        </div>
      </div>
    </div>
  );
}
