/**
 * Fehler, die auf eine fehlerhafte Eingabe zurückgehen — nicht auf ein Problem
 * des Servers.
 *
 * Die Unterscheidung ist mehr als Kosmetik: Solche Fälle beantwortet die API
 * mit 400 statt 500, der Text geht unverändert an den Nutzer, und im
 * Server-Log taucht kein Eintrag auf, der ein Problem vortäuscht.
 *
 * Der Typ liegt bewusst ausserhalb der HTTP-Schicht, damit ihn auch die
 * PDF-Verarbeitung nutzen kann, ohne etwas über HTTP zu wissen.
 */
export class InputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InputError";
  }
}
