/**
 * Startet die App und zeigt an, unter welcher Adresse sie im Netzwerk
 * erreichbar ist.
 *
 * Gedacht für den Fall, dass die App auf einem Rechner läuft (etwa dem Mac)
 * und von einem anderen genutzt wird (etwa einem Windows-Rechner ohne
 * Administratorrechte). Dort wird nichts installiert — es genügt ein Browser.
 *
 *   npm run share            Port 3000
 *   npm run share -- 8080    anderer Port
 */
import { spawn } from "node:child_process";
import { networkInterfaces } from "node:os";

const port = process.argv[2] ?? process.env.PORT ?? "3000";

/** Alle IPv4-Adressen dieses Rechners ausser der internen Loopback-Adresse. */
function localAddresses() {
  const found = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const entry of list ?? []) {
      if (entry.family === "IPv4" && !entry.internal) found.push(entry.address);
    }
  }
  // Private Netzbereiche zuerst — das sind die Adressen im Büro- oder
  // Heimnetz, die Kollegen tatsächlich erreichen.
  const isPrivate = (ip) =>
    ip.startsWith("192.168.") || ip.startsWith("10.") || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
  return found.sort((a, b) => Number(isPrivate(b)) - Number(isPrivate(a)));
}

const addresses = localAddresses();

console.log(`
──────────────────────────────────────────────────────────
  PDF.me wird gestartet

  Auf diesem Rechner:
    http://localhost:${port}
${
  addresses.length > 0
    ? `
  Von anderen Geräten im selben Netz:
${addresses.map((ip) => `    http://${ip}:${port}`).join("\n")}
`
    : `
  Keine Netzwerkadresse gefunden — dieser Rechner hängt an
  keinem Netzwerk.
`
}
  Auf dem anderen Gerät genügt ein Browser, es muss nichts
  installiert werden. Das Passwort ist dasselbe.

  Zu beachten:
   · Dieser Rechner muss laufen und darf nicht schlafen.
     macOS: Systemeinstellungen → Batterie → "Automatischen
     Ruhezustand deaktivieren", oder im Terminal "caffeinate -i".
   · Beim ersten Start fragt macOS, ob Node eingehende
     Verbindungen annehmen darf — "Erlauben" wählen.
   · Die Verbindung läuft unverschlüsselt (http). Im
     Firmennetz vertretbar, übers Internet nicht.

  Beenden mit Strg+C
──────────────────────────────────────────────────────────
`);

// An next start übergeben. Ohne -H bindet Next zwar schon an alle
// Schnittstellen, hier steht es explizit, damit es nachvollziehbar bleibt.
const child = spawn("npx", ["next", "start", "-H", "0.0.0.0", "-p", String(port)], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
