import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "So funktioniert's — DepotWatch Orange",
  description:
    "Wie DepotWatch Orange funktioniert: Local-First, eine verschlüsselte Datei, kein Server. Die Sicherheitsarchitektur im Detail.",
};

const GITHUB_URL = "https://github.com/depotwatch-orange/depotwatch-orange";

export default function SoFunktioniertsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <Link href="/" className="text-sm text-muted hover:text-accent">
        ← DepotWatch Orange
      </Link>
      <h1 className="mt-4 text-2xl font-bold">So funktioniert&rsquo;s</h1>
      <p className="mt-2 text-sm text-muted">
        DepotWatch Orange ist bewusst anders gebaut als typische
        Portfolio-Tracker. Diese Seite erklärt die Architektur — mit Schwerpunkt
        darauf, warum deine Daten sicher sind.
      </p>

      <section className="mt-8 space-y-8 text-sm leading-relaxed text-muted">
        <div>
          <h2 className="mb-2 text-base font-semibold text-foreground">
            Local-First: kein Server, keine Cloud, kein Konto
          </h2>
          <p>
            Alle deine Daten — Wallets, Konten, Transaktionen, Einstellungen —
            liegen in einer einzigen Datei auf <em>deinem</em> Gerät. Es gibt
            keine Serverdatenbank, keine Registrierung und kein Tracking. Die
            App läuft vollständig in deinem Browser: Was du erfasst oder per
            CSV importierst, verlässt deinen Rechner zu keinem Zeitpunkt.
            Niemand außer dir kann deine Bestände einsehen — auch wir nicht,
            denn es existiert schlicht kein Ort, an dem sie gespeichert wären.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-base font-semibold text-foreground">
            Öffnen &amp; Speichern: direkte Dateizugriffe im Browser
          </h2>
          <p>
            In Browsern mit File System Access API (z.&nbsp;B. Chrome, Edge)
            wählst du deine Portfolio-Datei einmal aus; danach schreibt die App
            Änderungen nach kurzer Verzögerung automatisch dorthin zurück
            (Autosave). In Browsern ohne diese API (z.&nbsp;B. Firefox, Safari)
            öffnest du die Datei per Upload-Dialog und speicherst Änderungen
            über den Speichern-Button als Download. In beiden Fällen gilt: Die
            Datei bewegt sich nur zwischen deinem Browser und deiner Festplatte
            — nie über das Netz.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-base font-semibold text-foreground">
            Verschlüsselung: dein Passwort, dein Schlüssel
          </h2>
          <p>
            Deine Datei wird standardmäßig mit AES-256-GCM verschlüsselt. Der
            Schlüssel wird per PBKDF2-SHA256 mit 600.000 Iterationen aus deinem
            Passwort abgeleitet — direkt im Browser über die WebCrypto-API des
            Browsers. Das Passwort selbst wird nirgends gespeichert, es
            existiert nur im Arbeitsspeicher, solange die Datei geöffnet ist.
          </p>
          <p className="mt-3 rounded-lg border border-warning/40 bg-warning/5 p-3 text-warning">
            Wichtig: Es gibt keinen Passwort-Reset. Da nichts auf einem Server
            liegt, kann dir niemand ein neues Passwort schicken oder die Datei
            entschlüsseln — auch wir nicht. Verlierst du Passwort oder Datei,
            sind die Daten unwiederbringlich verloren. Verwahre beides sicher
            und lege regelmäßig Backups der Datei an (die Datei ist
            verschlüsselt, du kannst sie also bedenkenlos z.&nbsp;B. auf einem
            USB-Stick sichern).
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-base font-semibold text-foreground">
            Watchlist: bewusst getrennt vom Portfolio
          </h2>
          <p>
            Die Adress-Watchlist (Salden, UTXOs, Privacy-Checks) ist watch-only
            und vom Portfolio-Ledger getrennt: Beobachtete Adressen sind
            niemals automatisch Teil deiner Bestände, und deine erfassten
            Transaktionen werden nie mit On-Chain-Abfragen verknüpft. Das hat
            einen Sicherheits- und einen Privacy-Grund: Live-Daten kommen von
            einer konfigurierbaren Explorer-Quelle (auf Wunsch dein eigener
            Node) — bei öffentlichen APIs sieht der Anbieter die abgefragten
            Adressen. Dein Ledger dagegen braucht überhaupt keine
            Netzwerkzugriffe. So entscheidest du pro Adresse, was du abfragst,
            und dein Portfolio bleibt auch dann vollständig privat, wenn du die
            Watchlist gar nicht nutzt.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-base font-semibold text-foreground">
            Open Source: Don&rsquo;t trust, verify
          </h2>
          <p>
            All das musst du uns nicht glauben. DepotWatch Orange ist Open
            Source (MIT-Lizenz) — jeder kann den Code prüfen: ob wirklich
            nichts hochgeladen wird, wie die Verschlüsselung implementiert ist
            und was die App sonst tut.{" "}
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              Don&rsquo;t trust, verify on GitHub&nbsp;↗
            </a>
          </p>
        </div>
      </section>
    </main>
  );
}
