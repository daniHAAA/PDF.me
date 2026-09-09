import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs wird serverseitig (PDF→Word) direkt aus node_modules geladen; es
  // bringt eigene WASM-/Font-Assets mit, die relativ zum Paketpfad liegen.
  serverExternalPackages: ["pdfjs-dist"],
  experimental: {
    serverActions: {
      // Grosszügiges Limit, damit auch mehrseitige Scans durchgehen.
      bodySizeLimit: "100mb",
    },
  },
};

export default nextConfig;
