# Timer (POMO-9)

Design: the timer is a pure function of the event log and the clock (`src/timer/cycle.ts`, `deriveTimer`).
`pomodoro.started` fixes the start and the length; `pomodoro.paused` / `resumed` (flexible mode only) shift the
end; `pomodoro.completed` is written by `createTimer` (`controller.ts`) at the computed end time with the
deterministic id `completed:<pomodoroId>`, so two tabs merge to one event. Breaks need no start event: they begin
at the completion time (5 min, 15 min after every 4th completed round; aborted rounds do not count).
`break.skipped` ends a break early. Reload, tab switch and sleep cannot drift the time because nothing is counted.

A worker-driven ticker (`ticker.ts`) refreshes once a second and is not throttled in background tabs; the tab
title (`mm:ss · task`), sound and Notification API run from the same refresh.

## Keyboard (NFR-06, POMO-30)

Space starts the round, N preselects the next open task (wraps around), P focuses the park field. Keys are ignored
while typing in a field and on focused buttons/links/selects (they handle Space themselves). Unit tests in
`view.test.ts`; real-Chrome check with real key events: `npm run build && node scripts/keys-check.mjs`.

## Manual check: notification in a background tab (FR-104, Chrome)

1. `npm run dev`, open the page in Chrome, click Start round once and allow notifications.
2. Switch to another tab and wait for the end of the 25 min round (for a short run set
   `focusMinutes` to 1 by appending a `settings.changed` event in the console).
3. Expected: sound and system notification at most 3 s after the end; title shows the break countdown.
4. Repeat in Safari.

### Chrome, scripted (POMO-52, 2026-11-13)

`npm run build && node scripts/notification-check.mjs [1,1,7]` starts a visible Chrome with notifications granted,
runs rounds of the given minutes with the app tab in the background (a second tab in front, `visibilityState`
hidden) and records when the app raises the notification relative to the round's end. The 7 min run stays hidden
longer than Chrome's 5 min threshold for intensive timer throttling. Result on 2026-11-13 (HEAD 45f1680):
delay 460 / 504 / 509 ms, limit 3000 ms: OK. It measures the app side (the Notification constructor call), not
the operating system's banner.

### Safari, scripted (POMO-52/POMO-53, 2026-11-13)

`npx vite preview --host 127.0.0.1 --port 4191` on the build, then `node scripts/safari-check.mjs [1,1,7]` drives
Safari over AppleScript. One-time setup by a human: Safari > Develop > «Allow JavaScript from Apple Events», and
allow notifications for `http://127.0.0.1:4191` (one real click on «Runde starten»). `node scripts/safari-check.mjs
check` tests the access. Result on 2026-11-13 (HEAD 67dc3ed): delay 1070 / 646 / 791 ms, limit 3000 ms: OK.

Permission and sound are prepared inside the Start click on the Tagesweg and on the timer card (POMO-54); without
that the browser never asks and the end stays silent.

## First start and iOS hint (NFR-15, NFR-12, POMO-32)

`src/onboarding/intro.ts`: three-step dialog (method, planning, keys and notifications) on the first visit, Skip or
Escape ends it at any step, the choice is stored in `localStorage` (`pomo-pomo.intro`) and it never returns.
`src/onboarding/ios-hint.ts`: on iOS Safari that is not installed (iPhone/iPad user agent, iPadOS by touch screen, not
standalone) a persistent hint explains Add to Home Screen, since notifications need the installed app. Real-Chrome
check: `npm run build && node scripts/intro-check.mjs` (the other check scripts pre-set the intro as seen).
