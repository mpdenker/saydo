# Saydo

A task manager you install on your iPhone home screen from Safari. You add tasks by voice, check them off, and finished tasks move to a Completed list grouped by day. Every task shows when it was added, and completed tasks also show when they were finished.

It's a plain HTML/CSS/JavaScript web app with no framework, no build step, no runtime dependencies, and no backend. Your tasks live in IndexedDB on your phone and never leave it.

**Live app:** https://mpdenker.github.io/saydo/

## Status

| Step | What | State |
|---|---|---|
| 1 | Task model, IndexedDB, Tasks + Completed lists, typed add, check-off, tests | ✅ done |
| 2 | Manifest, icons, service worker (offline), GitHub Pages | ✅ deployed · install on phone pending |
| 3 | Voice add (Web Speech + keyboard-dictation fallback) | not started |
| 4 | Export/import, delete with undo, settings, polish | not started |

Right now you add tasks with the **+** button and type (or use the keyboard's dictation mic). The design is in [SPEC.md](SPEC.md) and progress is tracked in [CHECKLIST.md](CHECKLIST.md).

## Install on your iPhone

1. Open **https://mpdenker.github.io/saydo/** in **Safari**.
2. Tap the **Share** button (the square with an up arrow). On iOS 26 and later, it's in the **⋯** menu at the bottom right.
3. Scroll down and tap **Add to Home Screen**.
4. Leave **Open as Web App** on (iOS 26+), then tap **Add**.
5. Open **Saydo** from the home screen. It runs full-screen with no Safari bars.

Things to know:
- **The home-screen app and Safari keep separate data.** Tasks you add in a Safari tab won't show up in the installed app. Use the installed app.
- **Deleting the home-screen icon deletes your tasks.** Export/import (step 4) is the backup.
- After the first open, it works with no internet.

## Run it locally

```bash
npm run serve
```

Then open http://localhost:8080. Any static server works; `localhost` counts as secure, so the service worker runs there too.

## Tests

```bash
npm test
```

This uses Node's built-in test runner (Node 18 or newer) with no packages to install. The suite runs three times: in your time zone, `Asia/Tokyo` and `America/Los_Angeles`. It covers:
- `tests/model.test.js`: createdAt never changes; completedAt is set and cleared correctly; ordering; validation.
- `tests/dates.test.js`: Today/Yesterday grouping across midnight, time zones, DST days and year boundaries.
- `tests/pwa.test.js`: every app file is in the service worker's cache list, versions match, and the app name is consistent.

## Deploy

GitHub Pages serves the `main` branch root, so deploying is just a push:

```bash
git push
```

Pages rebuilds in about a minute. **When you change any app file**, bump the version in both `src/config.js` (`APP.version`) and `sw.js` (`VERSION`); `npm test` fails if they differ. That's how installed copies find out there's an update: the app shows "Update ready · Reload" the next time it's opened online.

## Rename or restyle

- **Name:** change it in `src/config.js`, `manifest.webmanifest` (`name`, `short_name`) and `index.html` (`<title>`, `apple-mobile-web-app-title`). `npm test` lists any file you missed.
- **Icon:** edit the colors or shapes at the top of `tools/make_icons.py`, then run `python3 tools/make_icons.py`. It uses only the standard library.
- After either change, bump the version (see Deploy).

## Files

```
index.html, styles.css     the page
src/config.js              name + version
src/model.js               task rules (pure, tested)
src/dates.js               date labels + grouping (pure, tested)
src/db.js                  IndexedDB wrapper
src/ui.js                  rendering + events, service worker registration
sw.js                      offline cache
manifest.webmanifest       home-screen name, icon, colors
icons/                     generated PNGs
tools/make_icons.py        icon generator
tests/                     node --test suites
```

## Privacy

The app makes no network requests except to load its own files from GitHub Pages. It has no analytics, no accounts and no server. Task data is stored only on the device.
