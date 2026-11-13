# Timer (POMO-9)

Design: the timer is a pure function of the event log and the clock (`src/timer/cycle.ts`, `deriveTimer`).
`pomodoro.started` fixes the start and the length; `pomodoro.paused` / `resumed` (flexible mode only) shift the
end; `pomodoro.completed` is written by `createTimer` (`controller.ts`) at the computed end time with the
deterministic id `completed:<pomodoroId>`, so two tabs merge to one event. Breaks need no start event: they begin
at the completion time (5 min, 15 min after every 4th completed round; aborted rounds do not count).
`break.skipped` ends a break early. Reload, tab switch and sleep cannot drift the time because nothing is counted.

A worker-driven ticker (`ticker.ts`) refreshes once a second and is not throttled in background tabs; the tab
title (`mm:ss · task`), sound and Notification API run from the same refresh.

## Manual check: notification in a background tab (FR-104, Chrome)

1. `npm run dev`, open the page in Chrome, click Start round once and allow notifications.
2. Switch to another tab and wait for the end of the 25 min round (for a short run set
   `focusMinutes` to 1 by appending a `settings.changed` event in the console).
3. Expected: sound and system notification at most 3 s after the end; title shows the break countdown.
4. Repeat in Safari.

Status of this check: not run by the autonomous build (needs a human in a real Chrome/Safari); to be recorded
here with date and measured delay.
