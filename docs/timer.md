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

`npm run build && node scripts/notification-check.mjs` starts a visible Chrome, runs three 15 s rounds with the app
tab in the background (a second tab in front, `visibilityState` hidden) and records when the app raises the
notification relative to the computed end. Result on 2026-11-13: delay 1073 / 1002 / 4 ms, limit 3000 ms: OK.
It measures the app side (the Notification constructor call), not the operating system's banner.

### Safari (open, POMO-52)

Safari value: not yet measured; needs a human in a real Safari. Record date and delay here.
