import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Impressum — DepotWatch Orange",
};

export default function ImpressumPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <Link href="/" className="text-sm text-muted hover:text-accent">
        ← DepotWatch Orange
      </Link>
      <h1 className="mt-4 text-2xl font-bold">Impressum</h1>

      <div className="mt-4 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm text-warning">
        Platzhalter — vor Veröffentlichung der Seite mit den echten Angaben
        ausfüllen.
      </div>

      <section className="mt-6 space-y-4 text-sm leading-relaxed text-muted">
        <div>
          <h2 className="mb-1 font-semibold text-foreground">
            Angaben gemäß § 5 DDG
          </h2>
          <p>
            [Vorname Nachname]
            <br />
            [Straße Hausnummer]
            <br />
            [PLZ Ort]
            <br />
            Deutschland
          </p>
        </div>
        <div>
          <h2 className="mb-1 font-semibold text-foreground">Kontakt</h2>
          <p>E-Mail: [kontakt@depotwatch-orange.com]</p>
        </div>
        <div>
          <h2 className="mb-1 font-semibold text-foreground">
            Verantwortlich für den Inhalt
          </h2>
          <p>[Vorname Nachname, Anschrift wie oben]</p>
        </div>
      </section>
    </main>
  );
}
