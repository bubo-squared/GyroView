# ADR 0036: The download plans again every few mebibytes its readers take

Status: accepted (2026-10-02); amends ADR 0029

## Context

A file's download planned anew whenever one of its readers moved on by a sample (ADR 0029), once
a turn. Each plan walks every sample in the window, about 1700 on the X5's 5.7K60 recording,
and the readers move on about 170 times a second there: two lenses at 60 frames and the sound.
On the developer machine, playing that recording, the download made about 160 plans a second,
and planning took 2.3 % of the main thread, more than drawing the frames. Most of those plans
decided nothing: a top-up is due once a quarter of the budget is missing, about 300 samples
later, and the sound, which reads up to where the download has come, waited on bytes a
transfer was already bringing.

## Decision

- After a reader moves on, the download plans again only once its readers have taken
  `replanBytes` since the last plan: a sixteenth of the refill, 2 MiB on the X5's recordings.
- A reader that waits plans at once, unless a transfer streaming now brings all the bytes it
  waits for. Opening or closing a reader, a range coming whole or failing, and starting to read
  ahead plan at once, as before.

## Alternatives considered

- Cheaper plans: taking the samples' ranges in order without sorting them saved 10 to 20 % of
  each plan, since the sort already found them nearly in order; walking the window only to the
  byte budget would halve it on the X5 alone. Neither touches the 170 plans a second.
- An incremental plan, kept up to date as the readers move: the plan is a pure function of
  where the readers stand (ADR 0029), which its tests rely on.
- Planning at most every so many milliseconds: the core has no timers, and the readers' bytes,
  not time, are what makes a top-up due.
- Planning only when the missing bytes cross the refill or the resume threshold: knowing when
  they do is most of a plan.

## Consequences

- While the 5.7K60 recording plays, the download makes about 17 plans a second instead of 160,
  and planning takes 0.3 % of the main thread.
- A top-up due while the readers move on comes at most a sixteenth of a refill late; while a
  reader waits on a range streaming, it comes when that range ends. Bytes behind the picture
  are let go of at most `replanBytes` late.
- A reader never waits on a plan: either the bytes it waits for are coming, or it plans. The
  plans left out for waits on bytes coming changed no decision in the simulated playbacks
  tried (two link speeds, two or three requests at once, the sound reading ahead or not); they
  only cost time.
