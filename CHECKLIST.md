# Checklist

- [x] Step 0: verify Facts (especially Web Speech in home-screen mode on current iOS); SPEC.md; show me
- [x] Step 1: task model + IndexedDB storage
- [x] Step 1: Tasks list, typed add, check-off moves to Completed with date headers; show me in a browser
- [x] Step 1: tests: createdAt never changes, completedAt set and cleared correctly, date grouping across midnight and time zones
- [x] Step 2: manifest, icons, service worker, offline load *(offline load verified in a desktop browser with the server stopped)*
- [ ] Step 2: deploy to GitHub Pages; walk me through Add to Home Screen; show me running full-screen on my phone *(deployed; install on phone is next)*
- [ ] Step 3: mic button with Web Speech + automatic fallback to keyboard dictation
- [ ] Step 3: voice-added task saves with undo banner; show me on my phone
- [ ] Step 4: export/import JSON with no duplicates; tests
- [ ] Step 4: delete with undo, empty states, mic-denied state, dark mode, safe areas
- [ ] README accurate: how to deploy, install on the home screen, back up, and run tests
- [ ] I add 5 tasks by voice, complete 3, restart the phone, open offline, and everything is there with correct timestamps

Notes:
- Empty states, dark mode and safe-area padding are already in from step 1. The step 4 box stays open until delete and the mic-denied state are done and checked on the phone.
- The README box stays open until backup (step 4) exists to document.
