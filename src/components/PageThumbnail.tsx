"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "@/lib/client/pdfjs";

/**
 * Vorschaubild einer einzelnen Seite.
 *
 * Zwei Vorkehrungen für lange Dokumente:
 *  - Gerendert wird erst, wenn die Kachel in Sichtweite kommt (IntersectionObserver).
 *  - Fertige Bilder landen in einem prozessweiten Cache, damit Umsortieren,
 *    Drehen oder Scrollen kein erneutes Rendern auslöst.
 */

const cache = new Map<string, string>();

export function clearThumbnailCache(prefix?: string): void {
  if (!prefix) {
    cache.clear();
    return;
  }
  for (const key of [...cache.keys()]) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

export function PageThumbnail({
  pdf,
  cacheKey,
  pageIndex,
  rotation = 0,
  width = 150,
}: {
  pdf: PDFDocumentProxy;
  cacheKey: string;
  pageIndex: number;
  rotation?: number;
  width?: number;
}) {
  const holderRef = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<string | null>(() => cache.get(cacheKey) ?? null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setSrc(cache.get(cacheKey) ?? null);
  }, [cacheKey]);

  useEffect(() => {
    const element = holderRef.current;
    if (!element || visible) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      // Etwas Vorlauf, damit beim Scrollen keine leeren Kacheln auftauchen.
      { rootMargin: "300px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible || src) return;
    let cancelled = false;

    (async () => {
      const page = await pdf.getPage(pageIndex + 1);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: width / base.width });

      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const context = canvas.getContext("2d");
      if (!context) return;

      await page.render({ canvas, canvasContext: context, viewport }).promise;
      if (cancelled) return;

      const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
      cache.set(cacheKey, dataUrl);
      setSrc(dataUrl);
      page.cleanup();
    })().catch(() => {
      /* Ein fehlgeschlagenes Vorschaubild darf die Seite nicht blockieren. */
    });

    return () => {
      cancelled = true;
    };
  }, [visible, src, pdf, pageIndex, width, cacheKey]);

  return (
    <div
      ref={holderRef}
      className="flex items-center justify-center overflow-hidden rounded bg-white"
      style={{ minHeight: width * 1.3 }}
    >
      {src ? (
        <img
          src={src}
          alt={`Seite ${pageIndex + 1}`}
          className="max-h-full max-w-full transition-transform"
          style={{ transform: rotation ? `rotate(${rotation}deg)` : undefined }}
        />
      ) : (
        <span className="text-[10px] text-muted">lädt …</span>
      )}
    </div>
  );
}
