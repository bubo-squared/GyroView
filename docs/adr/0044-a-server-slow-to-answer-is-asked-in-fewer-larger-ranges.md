# ADR 0044: A server slow to answer is asked in fewer, larger ranges

Status: accepted (2026-10-08)

## Context

A file downloads as it plays in ranges of at most 8 MiB, two at a time (ADR 0029). Each range
costs its server's wait before the first byte, then the bytes themselves. A CDN or an object
store answers in about 0.05 s, so the waits are lost in the bytes. Google Drive's API answered
each range of a recording after 0.75 to 0.95 s (measured 2026-10-08, from one connection, with
a token), and then sent its bytes at 22 to 43 MiB/s: two ranges of 8 MiB at a time came at
about 13 MiB/s in all, while an X5 plays at 25 MiB/s. The same server sent two ranges of
32 MiB at a time at about 27 MiB/s, each wait now a small part of each range.

## Decision

The player times every request it makes for a file, from asking to the answer's headers, and
keeps the shortest wait (`HttpResource.answerWait`): the first request, slowed by a new
connection, a CORS preflight or a cold cache, counts for nothing. Only the wait is measured,
not the rate the bytes come at, which the player's own ranges share and would bend.

The wait is known once the reads that open the file (its size, its trailer, its movie box) are
answered, before its download starts. `downloadPolicyFor` takes it beside the file's size and
duration, and the file keeps the policy it chose for as long as it plays:

- **A server that waits 0.3 s or more is slow to answer.** A CDN waits about 0.05 s, Drive
  about 0.85 s.
- **From a server slow to answer, each top-up is one range**: the request size is the refill
  (a quarter of the budget ahead), 8 MiB at least. A lone file keeps three ranges coming; each
  file of a split pair keeps two, so a pair stays at four requests, within the six a browser
  opens to an HTTP/1.1 host. An X5 from Drive is then asked for 32 MiB three at a time, about
  42 MiB/s on the measured link, half again what it plays at.
- **Any other server is asked as before**, so a seek's first frames, a slow mobile link and
  every host that answers quickly are read as they were. A local file tells no wait.

## Alternatives considered

- **A pace measured while playing** (the wait and the rate of every transfer, the policy made
  again from them): the rate each range measures is the link shared by the player's own ranges,
  so asking for more ranges would measure each slower and shrink them again; the first seconds,
  before a range has come, would play at the old rate; and two policies in one download would
  disagree on the resume threshold (ADR 0011).
- **Larger and more ranges for every URL**: after a seek on a link already full, a third range
  reading ahead would share the link with the first frames' bytes and slow them.
- **A clock in the core**: the core keeps no time (deadlines come from the host); the adapter
  that makes the requests times them, and the core receives the measured wait as it receives a
  file's size.
- **A priority hint on the ranges read ahead** (Fetch Priority, `priority: 'low'`): it would let
  a seek's bytes go first on any server, but does nothing for a server's wait; left for later.

## Consequences

A recording on a server slow to answer, such as Google Drive's API, plays at the rate of its
link rather than of its waits, and costs that server fewer requests (one a second where there
were three, at an X5's rate). Nothing changes for a server that answers quickly. A server whose
wait first grows while the recording plays is still asked as its opening reads found it.
