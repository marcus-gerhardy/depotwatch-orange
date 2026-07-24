import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Datenschutz — DepotWatch Orange",
};

export default function DatenschutzPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <Link href="/" className="text-sm text-muted hover:text-accent">
        ← DepotWatch Orange
      </Link>
      <h1 className="mt-4 text-2xl font-bold">Datenschutzerklärung</h1>

      <div className="mt-4 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm text-warning">
        Platzhalter — vor Veröffentlichung rechtlich prüfen und vervollständigen.
      </div>

      <section className="mt-6 space-y-4 text-sm leading-relaxed text-muted">
        <div>
          <h2 className="mb-1 font-semibold text-foreground">
            Keine Speicherung von Nutzerdaten
          </h2>
          <p>
            DepotWatch Orange ist eine reine Client-Anwendung. Alle
            Portfoliodaten liegen ausschließlich in einer lokalen,
            passwortverschlüsselten Datei auf deinem Gerät. Es gibt keinen
            Server, der Nutzerdaten speichert, kein Konto und kein Tracking
            (keine Cookies, keine Analyse-Tools).
          </p>
        </div>
        <div>
          <h2 className="mb-1 font-semibold text-foreground">
            Abfragen an externe Dienste
          </h2>
          <p>
            Bei Nutzung der App werden zur Laufzeit Daten von externen
            Schnittstellen abgerufen. Dabei erhält der jeweilige Anbieter
            technisch bedingt deine IP-Adresse und die Anfragedaten:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              Binance (Kursdaten): Es werden keine Portfoliodaten übermittelt.
            </li>
            <li>
              mempool.space / blockstream.info (On-Chain-Daten): Übermittelt
              werden die von dir zur Beobachtung eingetragenen
              Bitcoin-Adressen. In den Einstellungen kann stattdessen ein
              eigener Server konfiguriert werden.
            </li>
          </ul>
        </div>
        <div>
          <h2 className="mb-1 font-semibold text-foreground">Hosting</h2>
          <p>
            [Angaben zum Hosting-Anbieter und ggf. Server-Logs ergänzen.]
          </p>
        </div>
        <div>
          <h2 className="mb-1 font-semibold text-foreground">Verantwortlicher</h2>
          <p>[Siehe Impressum — Angaben ergänzen.]</p>
        </div>
      </section>
    </main>
  );
}
