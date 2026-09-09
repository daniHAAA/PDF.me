"use client";

import { useCallback, useRef, useState } from "react";
import { ConvertPanel } from "./ConvertPanel";
import { EditPanel } from "./EditPanel";
import { FileDropzone } from "./FileDropzone";
import { MergePanel } from "./MergePanel";
import { OrganizePanel } from "./OrganizePanel";
import { Panel, Notice } from "./ui";
import { SplitPanel } from "./SplitPanel";
import { clearThumbnailCache } from "./PageThumbnail";
import { loadDocument } from "@/lib/client/pdfjs";
import type { LoadedDoc } from "@/lib/client/types";

type Tool = "edit" | "organize" | "merge" | "split" | "convert";

const TOOLS: Array<{ id: Tool; label: string; description: string; needsDoc: boolean }> = [
  {
    id: "edit",
    label: "Text bearbeiten",
    description:
      "Text im PDF anklicken und überschreiben. Bei eingescannten Seiten erkennt die Texterkennung die Wörter zuerst.",
    needsDoc: true,
  },
  {
    id: "organize",
    label: "Seiten",
    description: "Seiten per Ziehen neu anordnen, drehen, löschen oder aus anderen PDFs einfügen.",
    needsDoc: true,
  },
  {
    id: "merge",
    label: "Zusammenführen",
    description: "Mehrere PDF-Dateien in frei wählbarer Reihenfolge zu einem Dokument verbinden.",
    needsDoc: false,
  },
  {
    id: "split",
    label: "Teilen",
    description: "Ein PDF nach Seitenbereichen oder in Einzelseiten zerlegen.",
    needsDoc: true,
  },
  {
    id: "convert",
    label: "Konvertieren",
    description: "Word in PDF umwandeln und PDF zurück in ein bearbeitbares Word-Dokument.",
    needsDoc: false,
  },
];

export function Workspace() {
  const [tool, setTool] = useState<Tool>("edit");
  const [docs, setDocs] = useState<LoadedDoc[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const counter = useRef(0);

  const openFiles = useCallback(async (files: File[]): Promise<LoadedDoc[]> => {
    setError(null);
    const loaded: LoadedDoc[] = [];

    for (const file of files) {
      try {
        const bytes = await file.arrayBuffer();
        const { pdf, destroy } = await loadDocument(bytes);
        loaded.push({
          id: `doc-${counter.current++}`,
          name: file.name,
          bytes,
          pdf,
          pageCount: pdf.numPages,
          destroy,
        });
      } catch {
        setError(
          `„${file.name}“ konnte nicht geöffnet werden. Ist die Datei beschädigt oder passwortgeschützt?`,
        );
      }
    }

    if (loaded.length > 0) {
      setDocs((old) => [...old, ...loaded]);
      setActiveId((current) => current ?? loaded[0].id);
    }
    return loaded;
  }, []);

  const closeDoc = useCallback((id: string) => {
    clearThumbnailCache(`${id}-`);
    setDocs((old) => {
      const target = old.find((doc) => doc.id === id);
      // pdf.js hält Worker-Ressourcen — ohne destroy() bleiben sie am Leben.
      void target?.destroy();
      const next = old.filter((doc) => doc.id !== id);
      setActiveId((current) => (current === id ? (next[0]?.id ?? null) : current));
      return next;
    });
  }, []);

  const activeDoc = docs.find((doc) => doc.id === activeId) ?? null;
  const current = TOOLS.find((entry) => entry.id === tool)!;

  return (
    <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col">
      <header className="flex flex-wrap items-center gap-4 border-b border-line bg-surface px-6 py-3">
        <span className="text-sm font-semibold tracking-tight">PDF.me</span>

        <nav className="flex flex-wrap gap-1">
          {TOOLS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setTool(entry.id)}
              className={`rounded-lg px-3 py-1.5 text-sm transition ${
                tool === entry.id
                  ? "bg-accent-soft font-medium text-accent"
                  : "text-muted hover:bg-canvas hover:text-ink"
              }`}
            >
              {entry.label}
            </button>
          ))}
        </nav>

        <form action="/api/auth/logout" method="post" className="ml-auto">
          <button
            type="button"
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              window.location.href = "/login";
            }}
            className="text-xs text-muted transition hover:text-ink"
          >
            Abmelden
          </button>
        </form>
      </header>

      {docs.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-6 py-2">
          <span className="text-[11px] uppercase tracking-wide text-muted">Geöffnet</span>
          {docs.map((doc) => (
            <span
              key={doc.id}
              className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 text-xs transition ${
                doc.id === activeId ? "border-accent bg-accent-soft text-accent" : "border-line text-muted"
              }`}
            >
              <button type="button" onClick={() => setActiveId(doc.id)} className="max-w-[220px] truncate">
                {doc.name}
                <span className="ml-1.5 opacity-60">{doc.pageCount} S.</span>
              </button>
              <button
                type="button"
                title="Schliessen"
                onClick={() => closeDoc(doc.id)}
                className="opacity-50 transition hover:opacity-100"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      <main className="flex-1 space-y-4 p-6">
        {error && <Notice tone="error">{error}</Notice>}

        <Panel title={current.label} description={current.description}>
          {current.needsDoc && !activeDoc ? (
            <FileDropzone
              accept=".pdf"
              multiple
              label="PDF hierher ziehen oder auswählen"
              hint="Die Datei bleibt im Browser. Erst beim Speichern geht sie kurz zum Server und wird dort nicht abgelegt."
              onFiles={(files) => void openFiles(files)}
            />
          ) : (
            <>
              {tool === "edit" && activeDoc && <EditPanel key={activeDoc.id} doc={activeDoc} />}
              {tool === "organize" && activeDoc && (
                <OrganizePanel key={activeDoc.id} doc={activeDoc} onOpenFiles={openFiles} />
              )}
              {tool === "split" && activeDoc && <SplitPanel key={activeDoc.id} doc={activeDoc} />}
              {tool === "merge" && <MergePanel />}
              {tool === "convert" && <ConvertPanel />}
            </>
          )}
        </Panel>
      </main>

      <footer className="border-t border-line px-6 py-3 text-[11px] text-muted">
        Dateien werden nicht gespeichert: Verarbeitung im Arbeitsspeicher, Ergebnis direkt als Download.
      </footer>
    </div>
  );
}
