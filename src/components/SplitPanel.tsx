"use client";

import { useCallback, useMemo, useState } from "react";
import { Button, Notice } from "./ui";
import { ApiError, postAndDownload } from "@/lib/client/download";
import { toFile, type LoadedDoc } from "@/lib/client/types";

/**
 * Wandelt eine Eingabe wie "1-3, 5, 8-12" in Seitenbereiche um.
 * Gibt zusätzlich eine Fehlermeldung zurück, damit die Eingabe direkt beim
 * Tippen bewertet werden kann statt erst beim Absenden.
 */
export function parseRanges(
  input: string,
  pageCount: number,
): { ranges: Array<{ from: number; to: number }>; error: string | null } {
  const parts = input
    .split(/[,;\n]/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return { ranges: [], error: "Keine Bereiche angegeben." };

  const ranges: Array<{ from: number; to: number }> = [];
  for (const part of parts) {
    const match = part.match(/^(\d+)\s*(?:-\s*(\d+))?$/);
    if (!match) return { ranges: [], error: `"${part}" ist kein gültiger Bereich.` };

    const from = Number(match[1]);
    const to = match[2] ? Number(match[2]) : from;
    if (from < 1 || to < from) return { ranges: [], error: `"${part}" ergibt keinen Sinn.` };
    if (to > pageCount) {
      return { ranges: [], error: `"${part}" liegt hinter Seite ${pageCount}.` };
    }
    ranges.push({ from, to });
  }
  return { ranges, error: null };
}

export function SplitPanel({ doc }: { doc: LoadedDoc }) {
  const [mode, setMode] = useState<"ranges" | "single">("ranges");
  const [input, setInput] = useState(`1-${Math.min(doc.pageCount, 1)}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(() => parseRanges(input, doc.pageCount), [input, doc.pageCount]);

  const split = useCallback(async () => {
    if (mode === "ranges" && parsed.error) {
      setError(parsed.error);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", toFile(doc));
      form.append("mode", mode);
      if (mode === "ranges") form.append("ranges", JSON.stringify(parsed.ranges));
      await postAndDownload("/api/split", form, mode === "single" ? "geteilt.zip" : "teil.pdf");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Teilen fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }, [doc, mode, parsed]);

  return (
    <div className="space-y-4">
      {error && <Notice tone="error">{error}</Notice>}

      <div className="flex flex-wrap gap-2">
        <ModeButton active={mode === "ranges"} onClick={() => setMode("ranges")}>
          Nach Seitenbereichen
        </ModeButton>
        <ModeButton active={mode === "single"} onClick={() => setMode("single")}>
          In Einzelseiten
        </ModeButton>
      </div>

      {mode === "ranges" ? (
        <div className="space-y-2">
          <label className="block text-xs font-medium text-muted" htmlFor="ranges">
            Seitenbereiche ({doc.pageCount} Seiten verfügbar)
          </label>
          <input
            id="ranges"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="z.B. 1-3, 5, 8-12"
            className="w-full rounded-lg border border-line px-3 py-2 font-mono text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
          />
          {parsed.error ? (
            <p className="text-xs text-red-600">{parsed.error}</p>
          ) : (
            <p className="text-xs text-muted">
              Ergibt {parsed.ranges.length} Datei{parsed.ranges.length === 1 ? "" : "en"}
              {parsed.ranges.length > 1 && " (als ZIP)"}.
            </p>
          )}
        </div>
      ) : (
        <Notice>
          Erzeugt {doc.pageCount} einzelne PDF-Dateien, gebündelt in einem ZIP-Archiv.
        </Notice>
      )}

      <div className="flex justify-end">
        <Button onClick={split} disabled={busy || (mode === "ranges" && Boolean(parsed.error))}>
          {busy ? "Teilt …" : "Teilen und herunterladen"}
        </Button>
      </div>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-3.5 py-2 text-sm transition ${
        active ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
