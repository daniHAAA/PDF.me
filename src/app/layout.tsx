import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PDF.me",
  description: "Lokales Werkzeug zum Bearbeiten, Zusammenführen, Teilen und Konvertieren von PDFs",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
