# Backups and restoring
One file is one point of failure. So the app writes encrypted copies — and reads every one of them back immediately.

## Setting up a backup folder {#backup-folder}
Backups go into a folder you **choose once**: **Settings → Backups → Choose a backup folder**.

Why a folder of its own is needed: access to your portfolio file technically covers that one file only, not its neighbours. For additional copies the browser therefore needs permission for a directory.

After a browser restart the browser asks for that permission again — which is what the **Grant access again** button is for.

> Browsers without the File System Access API (Firefox, Safari) cannot open a folder. There, backups exist only as a **download you trigger yourself**. The app says so in that spot rather than implying automatic backups.

## When backups are written {#backup-trigger}
Configurable under **Settings → Backups**:

- **On every save** — the most thorough option, and the one that produces the most files.
- **Once a day** (default) — on the first save of the day.
- **Manually only** — exclusively via the *Back up now* button.

The file name carries the timestamp, e.g. `portfolio-2026-08-12T14-32-05.dwp`. Backups are complete portfolio files, encrypted with the same password as the original.

## Every backup is verified {#backup-verify}
After writing, the app **reads the file back immediately**, decrypts it, checks the checksum and compares the transaction count against the original. Only then does it count as verified.

The status is shown in the settings and in the *Data quality* widget. If the check fails, that is said plainly — a backup you cannot rely on is more dangerous than none.

## Retention {#backup-retention}
Old backups are thinned out automatically: the most recent ten, plus one per day of the last week, one per week of the last month and one per month of the last year.

Two safeties outrank the policy: the **newest backup is never deleted**, and nothing is deleted at all unless at least one **verified** backup remains.

## Restoring {#backup-restore}
Under **Settings → Backups** you see every backup found, with time and size. After entering the password, *Inspect* shows how many transactions it holds and how recent they are.

![The backup list with time, size and the buttons to inspect and restore](/help/screenshots/settings-backups.png)

1. Select a backup and click **Restore**.
2. The dialog puts both sides next to each other: the file currently open and the backup, each with its transaction count and how current it is.
3. Before replacing anything the app **writes a backup of the current state automatically** and verifies it. That way the restore itself can be undone.

> Older backups may carry an **earlier password** if you changed it in the meantime.
