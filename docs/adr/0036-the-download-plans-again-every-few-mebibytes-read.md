# ADR 0036: The download plans again every few mebibytes its readers take

Status: accepted (2026-10-02)

## Context

A file's download planned anew whenever one of its readers moved on by a sample (ADR 0029), once a
turn. Each plan walks every sample in the window, about 1700 on the X5's 5.7K60 recording, and
the readers move on about 170 times a second there: two lenses at 60 frames and the sound. In a
CPU profile of that recording playing on the developer machine, planning took 2.3 % of the main
thread, more than drawing the frames; a phone five to ten times slower would spend a sixth of
its main thread on it. Most of those plans decided nothing: a top-up is due once a quarter of the
budget is missing, about 300 samples later, and the sound, which reads up to where the download
has come, waited on bytes a transfer was already bringing.

## Decision

- After a reader moves on, the download plans again only once its readers have taken
  `replanBytes` since the last plan: a sixteenth of the refill, 2 MiB on the X5's recordings.
- A reader that waits plans at once, unless a transfer streaming now brings the bytes it waits
  for. Opening or closing a reader, a range coming whole or failing, and starting to read ahead
  plan at once, as before.

## Consequences

- On the 5.7K60 recording, plans fell from 388 to 232 over a ten-second session, and planning's
  share of the main thread from 2.3 % to 0.3 % while playing.
- A top-up comes at most a sixteenth of a refill late, and bytes behind the picture are let go
  of at most `replanBytes` late.
- A reader never waits on a plan: either bytes it waits for are coming, or it plans.
