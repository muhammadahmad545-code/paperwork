# Paperwork

Scan bills, receipts, ID cards, warranties and prescriptions. Paperwork reads them on the phone, finds the dates that matter, and reminds you before anything expires or falls due. Every page is encrypted; nothing is uploaded.

**[Download the latest APK](https://github.com/muhammadahmad545-code/paperwork/releases/latest)**

Pick the file ending in **`-arm64-v8a.apk`**: that is the right one for almost every phone from the last several years. `-armeabi-v7a.apk` is for older 32-bit phones and `-x86_64.apk` for emulators and Chromebooks. Installed apps update themselves to the matching file.

## What's new in 1.1

- **Saving works reliably.** Version 1.0 opened write transactions on a second database connection that SQLCipher had no key for; all writes now run on the keyed connection.
- **Redesigned** with tab navigation (Library, Upcoming, Insights, Settings), a capture hero, progress ring while reading, and a first-run introduction.
- **Safer pages:** every page is decoded at a bounded size (no out-of-memory on 100 MP photos), stored as an encrypted JPEG plus a thumbnail, and the plaintext scanner and picker copies are deleted. Leftover files are swept on launch.
- **Scans survive Android killing the app** while the camera is open, and can be finished on the next launch.
- **New:** pin documents, add or remove dates by hand, full-screen page viewer, share a single page, spending insights by month and type, coverage ring for reminders.
- **Privacy:** with the lock on, documents are hidden from screenshots and the recent-apps view; reminders are only scheduled after a document is saved, and follow title changes.
- **Smarter reading:** dates of birth no longer hide an expiry on the same line; item counts, savings and dates are no longer mistaken for totals.

## What it does

- **Scan** with automatic edge detection, perspective correction and cleanup, or **import** photos you already have.
- **Reads every page on the device** with a text-recognition model bundled in the APK. Works in airplane mode.
- **Understands the text:**
  - finds dates in many formats (`12/03/2027`, `2027-03-12`, `12 Mar 2027`, `March 12, 2027`, card-style `EXP 08/27`);
  - labels each as expiry, due, issue or other from the nearest keyword, and skips dates of birth;
  - turns “1 year warranty” plus the purchase date into a warranty end date;
  - picks the final total over subtotals, with currency;
  - classifies the document (bill, receipt, invoice, ID card, warranty, prescription) and suggests a title.
- **Reminders** a chosen number of days before each expiry, due or warranty date, and on the day. Tapping one opens the document.
- **Full-text search** across everything you have scanned, by word prefix.
- **Upcoming** view of every date: overdue, next 30 days, later.
- **Export** any document as a multi-page PDF and share it.
- **App lock** with fingerprint or the phone's screen lock. **Self-updating** from this repository's releases.

## Security

| Data | Protection |
|---|---|
| Page images | AES-256-GCM, with a key generated inside the Android Keystore (hardware-backed on most phones) that cannot be exported |
| Text, titles, dates | SQLCipher-encrypted database; its random key is stored with `expo-secure-store` (Keystore-wrapped) |
| Decrypted previews | Written to the cache only for display, and wiped whenever the app goes to the background |
| Search input | Quoted before reaching the full-text index, so typed text can never be interpreted as query syntax |
| Unsaved scans | Removed if you leave the review screen without saving |

Backups are disabled so the encrypted data never leaves the phone. The only network request Paperwork makes is the update check against GitHub.

**One dependency stated plainly:** the scanner screen is Google's ML Kit document scanner, which ships with Google Play services and is downloaded by Play services the first time it is used. On a phone without Play services, use **Import** instead; text recognition is bundled in the app and needs nothing extra.

## Built with

- React Native 0.88 + Expo SDK 58, TypeScript, Expo Router
- Kotlin Expo module: ML Kit document scanner and on-device text recognition, Keystore-backed file encryption, PDF generation with `PdfDocument`
- `expo-sqlite` with SQLCipher and FTS5, `expo-notifications` for scheduled reminders
- [Basalt Core](https://github.com/muhammadahmad545-code/basalt-core) for the shared theme, UI kit, settings and updater
- Tests for date parsing in every supported format, kind detection, warranty arithmetic, totals, document classification, reminder timing and search-query sanitising

## Development

```bash
npm install
npm test
npm run typecheck
npm run prebuild
npx expo run:android
```

Pushing a tag `vX.Y.Z` that matches `package.json` builds a signed APK in GitHub Actions and publishes it as a release.

## License

MIT
