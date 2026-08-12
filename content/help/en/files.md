# Opening, saving, locking
How the portfolio file is opened, saved and encrypted — and what happens when you step away.

## Opening and saving {#files-open}
To open, you pick your portfolio file and enter the password. What saving looks like after that depends on your browser:

- **Chrome, Edge, Opera** support the File System Access API. The app keeps access to the file and writes changes straight back. There is nothing to save.
- **Firefox and Safari** cannot do this. There you open the file through a file picker and save with the **Save file** button, which hands the file over as a download. The button is orange while there are unsaved changes.

Which mode is active is shown in the settings under *Security*.

## Encryption and changing the password {#files-encryption}
Encryption happens before writing: with a password set, plaintext never touches the disk.

Change the password under **Settings → Security → Change password**. One thing to know: existing **backups keep the old password**, because that is what they were encrypted with. Write a fresh backup right after a change — the app offers exactly that.

## Automatic locking {#files-autolock}
After a configurable time without input the app locks itself: pending changes are written first, then the decrypted data **and the password are removed from memory**. Unlocking decrypts the file again, so the password is needed once more.

- Configurable under **Settings → Security**: 1, 5, 15 or 30 minutes, or "never".
- Optionally on top: lock as soon as the tab goes into the background.
- Locking by hand: the padlock button in the header, or **Ctrl/Cmd + L**.
- 30 seconds beforehand a note with a countdown appears, with a **Stay unlocked** button.

> An **unencrypted file cannot be locked**. Without a password there would be nothing to lock it with, and merely hiding the window would be no protection at all. Set a password and the lock takes effect.

## When the file is damaged {#files-damaged}
Every save writes a checksum into the file, and opening verifies it. If it does not match, the file is **not** opened silently: you get a message saying what is wrong, and a direct route to a backup.

The same applies to truncated files (an interrupted write) and to files that are not portfolio files at all.
