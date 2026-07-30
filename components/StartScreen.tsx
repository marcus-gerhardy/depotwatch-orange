"use client";

import { useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { useAppStore, deserializePortfolio } from "@/lib/store";
import { isEncryptedEnvelope, WrongPasswordError } from "@/lib/crypto";
import { pickFileForOpen } from "@/lib/fileStorage";
import { staticPagePath } from "@/lib/routes";
import { Button, Card, inputCls } from "./ui";
import NewFileWizard from "./NewFileWizard";
import LanguageSwitch from "./LanguageSwitch";

type Stage =
  | { kind: "home" }
  | {
      kind: "unlock";
      fileName: string;
      text: string;
      handle: FileSystemFileHandle | null;
    }
  | { kind: "wizard" };

export default function StartScreen() {
  const { t, locale } = useI18n();
  const openPortfolio = useAppStore((s) => s.openPortfolio);

  const [stage, setStage] = useState<Stage>({ kind: "home" });
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function backHome() {
    setPassword("");
    setError(null);
    setStage({ kind: "home" });
  }

  async function handleOpen() {
    setError(null);
    const picked = await pickFileForOpen().catch(() => null);
    if (!picked) return;
    const text = await picked.file.text();
    if (isEncryptedEnvelope(text)) {
      setPassword("");
      setError(null);
      setStage({
        kind: "unlock",
        fileName: picked.file.name,
        text,
        handle: picked.handle,
      });
      return;
    }
    // Unencrypted file: open directly.
    try {
      const { portfolio } = await deserializePortfolio(text, null);
      openPortfolio({
        portfolio,
        handle: picked.handle,
        fileName: picked.file.name,
        password: null,
      });
    } catch {
      setError(t("start.invalidFile"));
    }
  }

  async function handleLoadDemo() {
    setError(null);
    setBusy(true);
    try {
      // One demo file per language — the sample notes and labels are content
      // the user reads, so they follow the interface language.
      const res = await fetch(
        locale === "en" ? "/demo-portfolio.en.json" : "/demo-portfolio.json",
      );
      if (!res.ok) throw new Error("fetch failed");
      const text = await res.text();
      const { portfolio } = await deserializePortfolio(text, null);
      openPortfolio({
        portfolio,
        handle: null,
        fileName: t("start.demoFileName"),
        password: null,
        isDemo: true,
      });
    } catch {
      setError(t("start.demoLoadError"));
    } finally {
      setBusy(false);
    }
  }

  async function handleUnlock(stage: Extract<Stage, { kind: "unlock" }>) {
    setBusy(true);
    setError(null);
    try {
      const { portfolio } = await deserializePortfolio(stage.text, password);
      openPortfolio({
        portfolio,
        handle: stage.handle,
        fileName: stage.fileName,
        password,
      });
    } catch (e) {
      setError(
        e instanceof WrongPasswordError
          ? t("start.wrongPassword")
          : t("start.invalidFile"),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* Slim header, same as on the static pages: the language choice stays
          visible at the top instead of floating above the centered card. */}
      <header className="sticky top-0 z-40 border-b border-border-c/60 bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-end px-4 py-2">
          <LanguageSwitch />
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            {/* Same lockup as the app header: the ₿ sits in front of the name. */}
            <h1 className="flex items-center justify-center gap-2 text-2xl font-bold">
              <span className="text-accent">₿</span>
              <span>
                DepotWatch <span className="text-accent">Orange</span>
              </span>
            </h1>
            <p className="mt-1 text-sm text-muted">{t("app.tagline")}</p>
            <Link
              href={staticPagePath("howItWorks", locale)}
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-sm text-accent transition-colors hover:border-accent hover:bg-accent/20"
            >
              <svg
                aria-hidden
                viewBox="0 0 16 16"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M8 1.5 2.5 4v4c0 3.2 2.3 5.4 5.5 6.5 3.2-1.1 5.5-3.3 5.5-6.5V4L8 1.5Z" />
                <path d="M5.9 6.4a2.1 2.1 0 1 1 3 2l-.9.7v1" />
                <path d="M8 11.4h.01" />
              </svg>
              {t("start.howItWorks")}
            </Link>
          </div>

          {stage.kind === "home" && (
            <Card className="space-y-4">
              <p className="text-xs leading-relaxed text-muted">
                {t("start.localFirst")}
              </p>
              <div className="flex flex-col gap-2">
                <Button variant="primary" onClick={handleOpen} className="py-2">
                  {t("start.openFile")}
                </Button>
                <Button
                  onClick={() => setStage({ kind: "wizard" })}
                  className="py-2"
                >
                  {t("start.createFile")}
                </Button>
                {/* What the demo does is explained on hover instead of taking
                    up a paragraph; file access is covered on "how it works". */}
                <Button
                  onClick={handleLoadDemo}
                  disabled={busy}
                  className="py-2"
                  title={t("start.demoHint")}
                >
                  {t("start.loadDemo")}
                </Button>
              </div>
              {error && <p className="text-sm text-loss">{error}</p>}
            </Card>
          )}

          {stage.kind === "unlock" && (
            <Card className="space-y-4">
              <h2 className="font-semibold">
                {t("start.passwordFor", { name: stage.fileName })}
              </h2>
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleUnlock(stage);
                }}
              >
                <input
                  type="password"
                  autoFocus
                  className={inputCls}
                  placeholder={t("start.passwordPlaceholder")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                {error && <p className="text-sm text-loss">{error}</p>}
                <div className="flex gap-2">
                  <Button type="submit" variant="primary" disabled={busy}>
                    {t("start.unlock")}
                  </Button>
                  <Button variant="ghost" onClick={backHome}>
                    {t("common.cancel")}
                  </Button>
                </div>
              </form>
            </Card>
          )}

          {stage.kind === "wizard" && <NewFileWizard onCancel={backHome} />}
        </div>
      </main>
    </>
  );
}
