"use client";

import { useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { useAppStore, deserializePortfolio } from "@/lib/store";
import { isEncryptedEnvelope, WrongPasswordError } from "@/lib/crypto";
import { pickFileForOpen } from "@/lib/fileStorage";
import { Button, Card, inputCls } from "./ui";
import NewFileWizard from "./NewFileWizard";

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
  const { t } = useI18n();
  const fileMode = useAppStore((s) => s.fileMode);
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
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="mb-2 text-4xl">₿</div>
          <h1 className="text-2xl font-bold">
            DepotWatch <span className="text-accent">Orange</span>
          </h1>
          <p className="mt-1 text-sm text-muted">{t("app.tagline")}</p>
          <Link
            href="/so-funktionierts"
            className="mt-2 inline-block text-sm text-accent hover:underline"
          >
            {t("start.howItWorks")} →
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
              <Button onClick={() => setStage({ kind: "wizard" })} className="py-2">
                {t("start.createFile")}
              </Button>
            </div>
            <p className="text-xs text-muted">
              {fileMode === "fsa" ? t("start.fsaHint") : t("start.fallbackHint")}
            </p>
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
  );
}
