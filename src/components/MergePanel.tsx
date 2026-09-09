"use client";

import { useCallback, useState } from "react";
import { Button, EmptyState, Notice } from "./ui";
import { FileDropzone } from "./FileDropzone";
import { ApiError, postAndDownload } from "@/lib/client/download";

interface Entry {
  key: string;
  file: File;
}

/**
 * Zusammenführen arbeitet direkt auf den File-Objekten, ohne sie vorher mit
 * pdf.js zu öffnen: für das Aneinanderhängen braucht es keine Vorschau, und
 * bei einem Dutzend grosser Dateien spart das spürbar Zeit und Speicher.
 */
export function MergePanel({ initialFiles = [] }: { initialFiles?: File[] }) {
  const [entries, setEntries] = useState<Entry[]>(() =>
    initialFiles.map((file, index) => ({ key: `${index}-${file.name}-${file.size}`, file })),
  );
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = useCallback((files: File[]) => {
    setEntries((old) => [
      ...old,
      ...files.map((file) => ({
        key: `${Date.now()}-${Math.random().toString(36).slice(2)}-${file.name}`,
        file,
      })),
    ]);
  }, []);

  const move = useCallback((from: number, to: number) => {
    setEntries((old) => {
      if (from === to || to < 0 || to >= old.length) return old;
      const next = [...old];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  const merge = useCallback(async () => {
    if (entries.length < 2) {
      setError("Mindestens zwei Dateien auswählen.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      for (const entry of entries) form.append("files", entry.file);
      await postAndDownload("/api/merge", form, "zusammengefuehrt.pdf");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Zusammenführen fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }, [entries]);

  return (
    <div className="space-y-4">
      {error && <Notice tone="error">{error}</Notice>}

      {entries.length === 0 ? (
        <EmptyState>Noch keine Dateien ausgewählt.</EmptyState>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
          {entries.map((entry, index) => (
            <li
              key={entry.key}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIndex !== null) move(dragIndex, index);
                setDragIndex(null);
              }}
              onDragEnd={() => setDragIndex(null)}
              className={`flex cursor-grab items-center gap-3 bg-surface px-4 py-2.5 text-sm active:cursor-grabbing ${
                dragIndex === index ? "opacity-40" : ""
              }`}
            >
              <span className="w-6 shrink-0 text-xs text-muted">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate">{entry.file.name}</span>
              <span className="shrink-0 text-xs text-muted">
                {(entry.file.size / 1024 / 1024).toFixed(1)} MB
              </span>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  title="Nach oben"
                  onClick={() => move(index, index - 1)}
                  disabled={index === 0}
                  className="rounded px-1.5 text-xs text-muted hover:text-ink disabled:opacity-25"
                >
                  ↑
                </button>
                <button
                  type="button"
                  title="Nach unten"
                  onClick={() => move(index, index + 1)}
                  disabled={index === entries.length - 1}
                  className="rounded px-1.5 text-xs text-muted hover:text-ink disabled:opacity-25"
                >
                  ↓
                </button>
                <button
                  type="button"
                  title="Entfernen"
                  onClick={() => setEntries((old) => old.filter((e) => e.key !== entry.key))}
                  className="rounded px-1.5 text-xs text-red-600"
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <FileDropzone
        accept=".pdf"
        multiple
        label="PDF-Dateien hierher ziehen oder auswählen"
        hint="Die Reihenfolge in der Liste ist die Reihenfolge im Ergebnis — Einträge lassen sich ziehen."
        onFiles={add}
      />

      <div className="flex justify-end">
        <Button onClick={merge} disabled={busy || entries.length < 2}>
          {busy ? "Führt zusammen …" : `${entries.length || ""} Dateien zusammenführen`.trim()}
        </Button>
      </div>
    </div>
  );
}
