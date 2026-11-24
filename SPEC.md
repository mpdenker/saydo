# SPEC — Voice task manager (home-screen web app)

Working name: **Saydo** (name, colors and icon live in one file, `src/config.js`).
Status: step 0 draft, written 2026-11-24. No app code yet.

---

## 0. What step 0 found (fact check)

Each "Fact" from the brief, checked against WebKit/Apple/MDN sources (links at the bottom).

| # | Claim in the brief | Verdict | What's actually true now |
|---|---|---|---|
| 1 | Web Speech works in Safari since iOS 14.5, but is buggy or missing in home-screen mode | **True, and worse than "buggy" on current iOS** | See 0.1 below. This is the finding that matters. |
| 2 | Web Speech may go to Apple's servers; keyboard dictation can be on-device | **True** | Web Speech in Safari behaves server-based (fails with Wi-Fi off; Safari asks about sending data to Apple). Apple doesn't document it. Keyboard dictation is on-device for "many languages", no internet needed, **except in search fields**, which go to a server. |
| 3 | Mic and service workers need HTTPS; GitHub Pages provides it | **True** | MDN: service workers and `getUserMedia` are secure-context only (HTTPS, or `localhost` for dev). `*.github.io` is served over HTTPS. |
| 4 | Safari deletes site data after 7 days unused; home-screen apps are exempt; deleting the icon deletes the data | **Mostly true** | WebKit says the home-screen app's domain is exempt from the 7-day cap, and its data is **kept separate from Safari**. It can still be evicted under storage pressure (least-recently-used first) unless the app has persistent storage, which WebKit grants by heuristics that favor home-screen apps. Deleting the icon deleting data: widely reported, not in Apple's docs. Export/import covers it either way. |
| 5 | `navigator.vibrate` isn't supported on iOS | **True** | caniuse: unsupported on iOS Safari through 27.2. No haptics in v1. |

Two more facts that change the design:

- **iOS 26+ opens every Add-to-Home-Screen site as a web app by default** (an "Open as Web App" toggle in the dialog). The manifest still supplies the name, icon and theme color.
- **Safari and the home-screen app don't share storage.** Tasks added while testing in a Safari tab will *not* appear in the installed app. That's expected, not a bug, and the README will say so.

### 0.1 Web Speech in home-screen mode on current iOS

The history, in short:

1. **2021 (iOS 14.5):** a WebKit engineer said on bug 225298 that SpeechRecognition is "not available in … web apps added to Home Screen for now." That bug was closed as RESOLVED LATER.
2. **iOS 26.x:** by 2026 it does start in home-screen apps. Reporters on bug 321436 say it worked on iOS 26.6.
3. **iOS 27.x (current):** bug 321436 (open, unassigned, no Apple reply, last updated 2026-11-18) collects reports from iOS 27.0 through 27.3 beta, in both Safari tabs and home-screen apps. The **first** recognition session works. **Later sessions go "deaf":** the orange mic indicator turns on and `audiostart` fires, but no `result` arrives, and `stop()` ends with `aborted` / "No speech detected." It can recover after 45–90 s or a force-quit. The workarounds people posted (speak a `speechSynthesis` phrase before every `start()`, never call `stop()`) are fragile, and the second one conflicts with "tap again to stop."

It also needs **Siri/Dictation turned on** in iOS Settings (otherwise start fails), and it **doesn't work offline**.

**What this means:** on today's iOS the keyboard-dictation fallback will be the path you use most, and Web Speech is a bonus when it behaves. This doesn't contradict anything under "Decided": the brief already says to detect which path works and use it automatically. But auto-detect has to be **ongoing, not one-time**, because Web Speech can pass the first check and then go deaf. Section 4 shows how.

The privacy bonus: the fallback (keyboard dictation) is the on-device one.

### 0.2 Other things found that the plan needs

- **GitHub Pages on a free account needs a public repo.** GitHub's docs: Pages is available "in public repositories with GitHub Free" and in private ones only on paid plans. This is on your "Ask me first" list, so I'm asking now, before step 2 needs it. Your tasks never go in the repo, so a public repo only exposes the app's code.
- **Downloading a file from a home-screen app is unreliable** (`<a download>` has failed silently in installed apps). Export will use the **share sheet** (`navigator.share` with a file) and fall back to a download link. From the share sheet you pick "Save to Files", AirDrop, etc.

---

## 1. Screens

One page, no router. A segmented control at the top switches between the two lists; everything else is a sheet over the list.

| Screen | What's on it |
|---|---|
| **Tasks** (default) | Active tasks, newest first. Each row: circle, title, "Added Tue, Nov 24, 3:41 PM". Big mic button at bottom center; a small keyboard button next to it for typing. |
| **Completed** | Done tasks under date headers ("Today", "Yesterday", "Mon, Nov 23"), newest first. Row: filled check, title (dimmed), "Added … · Done …". |
| **Capture sheet** | Slides up from the mic button. Shows the live transcript (Web Speech) or a large text field (dictation/typing), plus Cancel and Add. |
| **Edit sheet** | Tap a task: edit its title. Shows the timestamps read-only. Has a Delete button. |
| **Settings sheet** (gear icon) | Export, Import, voice mode (Auto / Web Speech / Keyboard dictation), storage status ("Persistent ✓" or "Best-effort"), app version. |
| **Banners** | Bottom toast: "Added · Undo", "Deleted · Undo", "Imported 12, skipped 30", errors. |

Empty states: Tasks shows "Tap the mic and say a task." Completed shows "Finished tasks show up here."

---

## 2. Data model

```js
// One task, as stored in IndexedDB and in export files
{
  id:          "3f1c…",                     // crypto.randomUUID(), never changes
  title:       "Email Prof. Lee about lab", // trimmed, 1–500 chars
  createdAt:   "2026-11-24T23:41:07.512Z",  // UTC ISO 8601, set once, never edited
  completedAt: null                         // or a UTC ISO string
}
```

Rules, enforced in `src/model.js` (pure functions, unit-tested):

- `createTask(title, now)` sets `id` and `createdAt`; `completedAt = null`.
- `renameTask(task, title)` returns a copy with only `title` changed. **There is no function that changes `createdAt`.** Import also never overwrites an existing task's `createdAt` (see §6).
- `completeTask(task, now)` sets `completedAt = now`. Completing an already-completed task is a no-op, so a double tap can't move the timestamp.
- `uncompleteTask(task)` sets `completedAt = null`; `createdAt` is untouched (default from "Open").
- Titles: trim, collapse runs of whitespace, reject empty, cap at 500 characters.
- Timestamps are stored in UTC; everything shown on screen uses the phone's time zone via `Intl.DateTimeFormat`.

**IndexedDB:** database `saydo`, version 1, one object store `tasks` with `keyPath: "id"` and an index on `completedAt`. A few hundred tasks fit in memory, so the app loads everything at start and writes through on every change (`put`/`delete` in a transaction). A tiny promise wrapper; no library.

---

## 3. Date grouping (Completed view)

`groupCompleted(tasks, now, timeZone)` is a pure function, so tests can pin both `now` and the zone.

1. Sort by `completedAt` descending.
2. Turn each `completedAt` into a **local calendar date** (`YYYY-MM-DD` in `timeZone`, via `Intl.DateTimeFormat(…, { timeZone })`).
3. Group by that date. Labels:
   - same local date as `now` → **Today**
   - one local day before → **Yesterday**
   - same year → **Mon, Nov 23**
   - older → **Mon, Nov 23, 2025**
4. "Yesterday" is calendar-based, not "24 hours ago": 11:55 PM yesterday and 12:05 AM today land in different groups even though they're 10 minutes apart.

Tests will cover: tasks either side of midnight, the same UTC instant in two time zones (it can land on different days), DST change days (23- and 25-hour days), and year boundaries. Labels refresh when the app comes back to the foreground, so "Today" doesn't go stale overnight.

---

## 4. Voice capture

### 4.1 Choosing a path (auto-detect, ongoing)

```
tap mic
 ├─ mode = Keyboard (manual) ──────────────────────────────► Dictation path
 ├─ no SpeechRecognition constructor ──────────────────────► Dictation path
 ├─ offline (navigator.onLine === false) ──────────────────► Dictation path
 ├─ Web Speech marked "unhealthy" for this launch ─────────► Dictation path
 └─ otherwise ─────────────────────────────────────────────► Web Speech path
                                     │ fails? (see below)
                                     └─ mark unhealthy, open Dictation path right away
```

"Fails" means any one of these:
- an `error` event: `not-allowed`, `service-not-allowed`, `network`, `audio-capture`, `language-not-supported`
- **the deaf-session check:** `audiostart` fired but no `result` within 4 s **and** no `end`. That's the iOS 27 bug pattern. (Real silence also ends up here, which is fine: silence just shows "Didn't catch that.")

"Unhealthy" lasts until the app is fully relaunched, because the iOS 27 bug only clears on force-quit. After 3 unhealthy launches in a row, Auto stops trying Web Speech until you pick it again in Settings. This keeps the mic button from making you wait 4 s every time on a phone where Web Speech is broken.

Feature detection alone isn't enough: WebKit has shipped the constructor in contexts where it didn't work. That's why the check above runs on every session.

### 4.2 Web Speech path

1. `start()` is called **inside the tap handler** (`click`, not `pointerdown`). WebKit only counts some events as user activation, and starting from the wrong one fails with `not-allowed`.
2. Settings: `lang = navigator.language`, `interimResults = true`, `continuous = true`.
3. The capture sheet shows the live transcript as it arrives.
4. **Stop** on: tap the mic again, **2 s with no new result**, or a 60 s hard cap.
5. On stop, take the final transcript (or the last interim one if `stop()` never produced a final). If it's non-empty → save the task right away and show "Added · Undo" for 5 s. If it's empty → "Didn't catch that" and nothing is saved.
6. Tap the new row to fix its wording.

### 4.3 Dictation path (fallback, likely the everyday path)

Web pages can't start iOS dictation themselves. The app can only put you one tap away from it.

1. The mic tap opens the capture sheet and calls `focus()` on a large `<textarea>` in the same tap handler, which is what makes iOS raise the keyboard.
2. A hint above the field: "Tap 🎙 on the keyboard and speak, then tap Add."
3. The field is a `<textarea>`, **not** `type="search"`, since dictation in search fields is sent to a server.
4. **Add** (button or keyboard Return) saves the task and shows "Added · Undo." Typing works in the same field.

Your sequence: tap mic, tap keyboard mic, speak, tap Add. That's no typing, but two more taps than Web Speech. There's no reliable auto-save here: a page can't tell dictated text from typed text, so auto-saving after a pause would also cut off people who are typing.

### 4.4 Typing

The keyboard button next to the mic opens the same sheet without the dictation hint.

---

## 5. Check off, un-complete, delete

- **Check off:** tap the circle. The row's check fills, then the row slides out about 300 ms later and appears under "Today" in Completed with `completedAt = now`. No haptics (see Fact 5).
- **Un-complete:** tap the filled check in Completed. The task goes back to Tasks with `completedAt = null`, and it sorts by its original `createdAt`.
- **Delete:** swipe left on a row (shows a red Delete button) or long-press, then Delete. The row disappears and "Deleted · Undo" shows for 5 s. The task is removed from IndexedDB when the banner ends; Undo cancels that. If the app is closed during those 5 s, the task is already gone.
- `prefers-reduced-motion` turns off the slide animations.

---

## 6. Storage, offline, backup

**Offline.** `sw.js` pre-caches the app shell on install (HTML, CSS, JS modules, manifest, icons) under a versioned cache name (`saydo-v1`). Requests are cache-first; the network is used only to fetch a new version. Bumping the version in `src/config.js` deploys an update. The new service worker installs in the background, a banner says "Update ready · Reload", and old caches are deleted on activate. The only network requests are for the app's own files on `*.github.io`.

**Durability.** On first launch in standalone mode the app calls `navigator.storage.persist()`. Settings shows whether it was granted. Persisted storage isn't evicted under storage pressure.

**Export.** Settings → Export builds a file named `saydo-backup-2026-11-24.json`:

```json
{ "app": "saydo", "format": 1, "exportedAt": "2026-11-24T23:50:00.000Z",
  "tasks": [ { "id": "…", "title": "…", "createdAt": "…", "completedAt": null } ] }
```

It opens the iOS share sheet (`navigator.share({ files })`), where you can pick "Save to Files", AirDrop, etc. If file sharing isn't supported, it falls back to a download link.

**Import.** Settings → Import opens a file picker (`<input type="file" accept="application/json,.json">`).
- The whole file is checked first: right `app`/`format`, and every task has a UUID `id`, a non-empty `title`, a valid ISO `createdAt`, and `completedAt` that's null or a valid ISO string. If anything is wrong, **nothing is imported** and the error says which task and which field.
- Merging matches on `id`. An id that isn't on the phone is added. **An id that's already on the phone is skipped; the phone's copy wins.** That means no duplicates, and an import never rewrites `createdAt` or undoes something you did after the backup.
- Result banner: "Imported 12 · Skipped 30 already here."
- Tests: importing the same file twice adds nothing; import into an empty database restores everything exactly; malformed files change nothing.

---

## 7. Edge cases

| Situation | What happens |
|---|---|
| Mic permission denied (Web Speech `not-allowed`) | Banner: "Microphone blocked for this app. You can still dictate with the keyboard mic." It switches to the dictation path for this capture. Settings explains how to re-allow. Keyboard dictation doesn't need the site's mic permission. |
| Siri & Dictation off (`service-not-allowed`) | Same switch to the dictation path. If keyboard dictation is also off, there's no 🎙 key, so the hint says "Turn on Dictation in Settings → General → Keyboard, or type." |
| Silence (nothing said) | Web Speech: the 2 s / 4 s timers end it; "Didn't catch that"; nothing saved. Dictation: an empty field means Add stays disabled. |
| Background noise | Only stray words get transcribed. They're visible live, and Undo or a tap-to-edit fixes them. Safari's `confidence` values aren't reliable, so the app doesn't filter on them. |
| Long dictation | Web Speech stops at 60 s (Apple's server limits audio length anyway). Titles over 500 characters are cut at a word boundary with a warning banner; the full text isn't kept. Long rows show 3 lines and the edit sheet shows the rest. |
| Offline | Goes straight to dictation; everything else works the same. |
| Two taps on the circle | `completeTask` is a no-op on an already-completed task, so the timestamp stays put. |
| Clock or time zone changes | Stored values are UTC, so nothing changes; labels re-render on foreground. |
| IndexedDB write fails (quota, private mode) | Error banner; the task stays on screen marked "Not saved", with a retry. |

---

## 8. Look and feel

- `display: standalone`, `viewport-fit=cover`, and `env(safe-area-inset-*)` padding so nothing sits under the notch or home bar.
- System font (`-apple-system, system-ui`), tap targets ≥ 44 pt, mic button 72 pt.
- Light and dark via `prefers-color-scheme` and CSS variables; `theme-color` meta for each scheme.
- Icons: 180 px `apple-touch-icon` plus 192/512 manifest icons. A simple original glyph (a speech bubble with a check), drawn as SVG and exported to PNG.

---

## 9. Files and tests

```
index.html  styles.css  manifest.webmanifest  sw.js
src/config.js    name, version, colors (the "one place")
src/model.js     pure task functions
src/dates.js     formatting + groupCompleted
src/backup.js    export envelope, validate, merge
src/db.js        IndexedDB wrapper
src/voice.js     path choice, Web Speech session, health check
src/ui.js        rendering + events
icons/           PNGs + source SVG
tests/*.test.js  node --test
package.json     only a "test" script; no dependencies
```

No framework and no build step: the app is small enough that plain ES modules load directly from GitHub Pages and run as-is.

`npm test` runs `node --test`. The pure modules (model, dates, backup) are fully tested. Some date tests run under `TZ=America/Los_Angeles` and `TZ=Asia/Tokyo` too. Voice and IndexedDB are checked by hand on the phone at each step.

---

## 10. Open items: defaults I'm using

From your brief: un-complete moves a task back (yes); no due-date parsing; one task per recording; the working name and icon above.

New, from step 0:
- **Haptics:** iOS 18+ plays a real system haptic when an `<input type="checkbox" switch>` toggles, and some sites trigger that by clicking a hidden one. It's a hack that could stop working, and you said not to fake haptics, so **default: no haptics.**
- **Voice mode override in Settings** (Auto / Web Speech / Keyboard): one extra control, useful while iOS 27's bug is open. **Default: Auto.**

---

## Sources

- WebKit bug 225298, Web Speech unavailable in home-screen apps (2021, RESOLVED LATER): https://bugs.webkit.org/show_bug.cgi?id=225298
- WebKit bug 321436, recognition goes deaf after the first session, iOS 27 (open, 2026): https://bugs.webkit.org/show_bug.cgi?id=321436
- caniuse, Speech Recognition (iOS 14.5+ partial): https://caniuse.com/speech-recognition
- caniuse, Vibration (unsupported on iOS): https://caniuse.com/vibration
- MDN SpeechRecognition (server-based on some browsers): https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition
- MDN Service Worker API / getUserMedia (secure contexts): https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API, https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
- Addpipe, Safari Web Speech fails offline and prompts about sending data to Apple: https://blog.addpipe.com/apple-speechanalyzer-api/
- Apple iPhone User Guide, Dictate text (on-device, search fields excepted): https://support.apple.com/en-gw/guide/iphone/iph2c0651d2/16.0
- Apple, Siri, Dictation & Privacy: https://www.apple.com/legal/privacy/data/en/ask-siri-dictation/
- WebKit Tracking Prevention (home-screen app domain exempt from the 7-day cap): https://webkit.org/tracking-prevention/
- WebKit, Updates to Storage Policy (quotas, eviction, `persist()`): https://webkit.org/blog/14403/updates-to-storage-policy/
- WebKit, News from WWDC25 (every home-screen site opens as a web app): https://webkit.org/?p=16993
- GitHub, plans (Pages on private repos needs a paid plan): https://docs.github.com/en/get-started/learning-about-github/githubs-plans
- WebKit bug 167341, `download` attribute on iOS: https://bugs.webkit.org/show_bug.cgi?id=167341
- web.dev, Sharing files: https://web.dev/articles/files/share-files
