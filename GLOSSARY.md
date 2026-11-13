# pomo.pomo

A local-first focus timer: work in focus rounds bound to tasks, plan the day, earn coins and spend them on own rewards.

## Focus work

**Pomodoro**:
One focus round of fixed length bound to exactly one task; it either completes or is aborted.
_Avoid_: session, round, timer run

**Set**:
A sequence of completed pomodoros (default 4) after which a long break follows and a set bonus is paid.
_Avoid_: cycle, block

**Abort**:
Ending a pomodoro before its time is up; an aborted pomodoro does not count as completed and records whether the interruption was internal or external.
_Avoid_: cancel, stop, fail

**Interruption**:
Something that pulls attention away during a pomodoro, typed as internal (own impulse) or external (someone or something else).
_Avoid_: distraction, disturbance

**Mode**:
The rule set for running pomodoros: strict (no pausing, only abort) or flexible (pausing allowed, partial coins).
_Avoid_: profile (a profile is the set of durations)

## Tasks

**Task**:
A unit of work with title, optional project and an estimate in whole pomodoros.
_Avoid_: todo, item, ticket

**Estimate**:
The number of pomodoros a task is expected to take, a whole number of at least 1.
_Avoid_: points, size

**Actual**:
The number of completed pomodoros credited to a task.
_Avoid_: spent, used

## Rewards

**Coins**:
The reward currency earned by completed pomodoros and set bonuses and spent in the shop.
_Avoid_: points, credits, tokens

**Balance**:
The current number of coins: all coins earned minus all prices of redeemed rewards.
_Avoid_: account, wallet, score

**Reward**:
Something the user grants themselves, with a title and a price in coins.
_Avoid_: prize, treat

**Redemption**:
Spending coins on a reward; every redemption is recorded.
_Avoid_: purchase, buy

## Data

**Event**:
A single recorded fact (e.g. a pomodoro completed, a task created) with a unique id and a point in time; events are never changed once recorded.
_Avoid_: entry, record, action

**Log**:
The full ordered set of events; everything the app knows is derived from it.
_Avoid_: history, journal, database

**Protocol**:
The user-facing listing of the log, available as CSV export.
_Avoid_: report (reports are summaries such as the daily review)
