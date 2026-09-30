# ADR 0011: Sound follows the picture through a buffering state

Status: accepted (2026-09-20); amended (2026-09-30): after starvation, playback resumes only once
the next 4 s of the picture are downloaded as well (at most the download's budget less a request
or a refill's worth, which the download keeps held, ADR 0029), so a link slower than the recording plays in stretches rather than a frame at a time;
a start and a seek still resume as soon as two pairs are decoded, so a play the viewer asked for
is never held for seconds

## Context

The audio element is the master clock (ADR 0007). Video frames arrive from hardware decoders
that start slowly, restart on every seek and can fall behind on 8K material. Until Phase 6 the
clock ran regardless: sound started while the first frames were still decoding, and after a
seek the picture caught up by skipping frames.

## Decision

The playback session gains a `buffering` state. `play` starts the pipeline and holds the clock
until two pairs are queued (or the run is over), then starts it; a seek while playing resumes
through `buffering` with the clock held at the target; while playing, a shown frame more than
a quarter of a second behind the clock with nothing queued and the run not over means the
decoders have fallen behind, so the clock pauses until they catch up. The queue notifies the
session of every pair, so resuming does not wait for an animation frame. To page listeners
this is `waiting` and `playing`, as a media element reports it; `paused` stays false while
buffering. A `play` call resolves when the clock runs and rejects, back in `paused`, when the
browser refuses to start it; pausing meanwhile resolves it quietly.

Two pairs, not one: a single pair would be consumed by the first tick and starve at once. A
quarter of a second, not a frame: a frame late by jitter must not pause the sound.

## Alternatives considered

- Let the sound lead and drop video frames, as before: simple, but a seek on 8K material
  produced a second of frozen picture under running audio, and starts were out of step.
- Start the clock at `play` and pause it on the first tick without a frame: an audible blip
  at every start.
- Resume from the animation-frame tick only: the session would depend on the host's cadence;
  the queue callback resumes as soon as the pair is there.

## Consequences

`play` now takes as long as the first key frame takes to decode (hundreds of milliseconds on
hardware decoders); the transient user activation that autoplay policies require lasts
seconds, so the clock still starts. Recordings whose decoders cannot keep up play with pauses
in sound rather than a stuttering picture under continuous sound. `preload` decodes the first
frame while `ready`, so `play` from a fresh load is usually primed already.
