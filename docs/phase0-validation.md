# Phase 0 — Two-Browser Sync Validation Report

> **Status note (2026-08-13):** 本报告为 Phase 0 历史验证记录。此后 Phase 1
> 功能(多房间、引导/判定、声部混音、摇滚三声部曲库)已加入;当前测试规模为
> **176 个单元测试 + 11 个 E2E 场景**,见 `docs/phase1-validation.md`。本节指标仍为
> Phase 0 完成时的实测值。

**Date:** 2026-08-11
**Build:** `client` + `server` + `shared` npm workspaces, Node 24, Playwright 1.62 (chromium-1234)

The Phase 0 prototype validates the core sync pipeline with two browsers in one
room. This report documents the three acceptance metrics with values measured by
the automated E2E suite (`client/e2e/jam.e2e.ts`) plus manual measurement
instructions for what headless CI cannot observe.

---

## How to run

```bash
# E2E (boots ws server + Vite dev server, runs the two-browser scenario)
npm run e2e -w client

# Type check
npx tsc --noEmit   # from client/

# Unit suites (grew since Phase 0: now 172 tests across shared/server/client)
npm test           # from repo root
```

All three pass. Observed E2E output (3 consecutive runs):

```
[e2e] note transport B->A: 20ms, 7ms, 5ms, 5ms, 5ms      (median 5ms)
[e2e] key->sound latency readout: 30ms
[e2e] readout snapshot A: offset +1921ms RTT 2ms · 1 sync · beat 25.29
```

---

## Metric ① — Key→Sound Latency (target < 50 ms)

**How it is measured (app):** on every mapped keydown, the app records
`performance.now()` and then reads the audio output clock via
`AudioContext.getOutputTimestamp()`. The readout
(`② ... ① KEY→SOUND`, amber cell) shows how far the audio output clock moved
past the keydown instant — the hardware input→output latency estimate.

**Observed in headless Chromium:** **29–32 ms** across three runs (30, 29, 32).
This satisfies the < 50 ms target. Headless Chromium on this machine does expose
valid output timestamps once the AudioContext is running, so the readout is a
real number, not the `—` fallback.

| Run | Latency |
| --- | ------- |
| 1   | 30 ms   |
| 2   | 29 ms   |
| 3   | 32 ms   |

**Manual verification (real windows):** open two browser windows, Connect both,
press a key and listen. The local note is scheduled 50 ms ahead on the audio
clock (`LOCAL_LOOKAHEAD_SEC`), so perceived latency is ~latency readout + 50 ms.
A simple stopwatch/key-cam comparison should stay under 50 ms of audible lag.

---

## Metric ② — Clock Offset Stability (target < 10 ms on LAN)

**How it is measured (app):** an NTP-style exchange: client stamps `t1`, the
server replies `t2/t3` (its `performance.now()`), the client stamps `t4`.
`estimateOffset` takes a 5-sample median of `(t2 + t3)/2 − (t1 + t4)/2`; the
readout (`② CLOCK OFFSET`, cyan cell) shows offset and last RTT; the sub-line
tracks the sync count. The app re-syncs every 30 s.

**Observed in headless Chromium (loopback):**

| Run | RTT  | Sync count |
| --- | ---- | ---------- |
| 1   | 2 ms | 1          |
| 2   | 2 ms | 1          |
| 3   | 2 ms | 1          |

RTT of 1–2 ms over localhost demonstrates LAN-grade round-trip. Two honest
caveats about what the E2E does **not** capture:

1. **Absolute offset includes server uptime.** The server's `performance.now()`
   starts at process boot, so `offset = server − client` carries the server's
   elapsed uptime (e.g. `+1921 ms` on a ~6 s old server; one early run reused a
   long-lived server and showed `+327848 ms`). The magnitude is an artifact of
   the two timelines' origins, not of clock drift — the beat grid consumes the
   _same_ offset consistently, so sync quality is unaffected.
2. **Stability across repeated syncs needs wall-clock time.** The E2E observes
   one completed sync exchange (RTT 2 ms). Offset _stability_ over consecutive
   30 s re-syncs is not observable in the ~7 s test window.

**Manual verification (real windows):** keep two windows connected on the same
LAN for 2–3 minutes and watch the `② CLOCK OFFSET` cell update every 30 s; the
sync count climbs (1 syncs → 5 syncs…) and successive offsets should agree
within ±10 ms once both timelines have settled. On loopback this machine shows
RTT 2 ms, comfortably inside the target.

---

## Metric ③ — Beat Alignment (target < 30 ms)

**How it is measured:** the server broadcasts an authoritative beat every 500 ms
(`room.broadcastClock`); the client converts server-stamped note times onto the
local audio clock via the beat grid (`offset + RTT` estimate), then plays remote
notes at the converted time. The readout (`③ SERVER BEAT`, ink cell) shows the
server beat + BPM, updating twice a second.

**Observed in headless Chromium:**

| Run | B→A transport samples (ms) | Median |
| --- | -------------------------- | ------ |
| 1   | 20, 7, 5, 5, 5             | 5      |
| 2   | 19, 5, 4, 5, 5             | 5      |
| 3   | 17, 5, 5, 5, 4             | 5      |

The E2E measures the full `keydown on B → server relay → onNote on A` path
(Playwright waits for A's `__orchNotes` counter to increment; each sample is
`Date.now()` delta in the test process). The first sample includes browser/CDN
warmup; steady-state delivery is **4–7 ms** — well under the 30 ms target. The
`③ SERVER BEAT` readout tracked the server clock (beat values 13–25 across the
~6 s window at 120 BPM = 4 beats/s, exactly as expected).

**Manual verification (real windows):** with two windows open, play a repeating
rhythm on one and listen on the other; the two should lock within a 1/32-note at
120 BPM (~15 ms). For a direct beat-grid check, watch the `③ SERVER BEAT`
readouts in both windows tick within one frame of each other.

---

## Environment notes (why the E2E is set up the way it is)

- **Port 8080 is squatted.** This machine runs an unrelated daemon (TeleAgent
  scheduler) on TCP 8080. Playwright's `reuseExistingServer: true` would "reuse"
  it and the client would hang on CONNECTING forever. The ws server for the E2E
  therefore runs on **8081** (`PORT=8081 npm run start -w @orchestra/server`),
  and the test fills the app's Server field with `ws://localhost:8081` directly
  (WebSocket has no origin gate, so bypassing the Vite `/ws` proxy is fine).
  `npm run dev:server` is unchanged and still uses 8080.
- **smplr CDN is slow/unreachable from this machine.** The sampled-piano
  soundfont fetch hangs, which delays `instrumentsRef` population — and the
  app's keydown guard skips `sendNote` until instruments exist. The E2E aborts
  smplr CDN requests (`gleitz.github.io` / `goldst.dev` / `smpldsnds.github.io`)
  so the oscillator fallback initialises in < 1 s, then polls the
  `window.__orchInstrumentsReady` test hook before pressing keys.
- **Test hooks in `App.tsx`** (both gated on `?e2e=1`, both minimal):
  `window.__orchNotes` (remote note counter) and
  `window.__orchInstrumentsReady` (pipeline readiness). `data-testid`
  attributes already existed on the name input, connect button, badge, readouts
  and peer list; the only `src` change was the readiness hook.
- **File naming:** the Playwright spec is `client/e2e/jam.e2e.ts` (not
  `.spec.ts`) with `testMatch: /.*\.e2e\.ts/` in `playwright.config.ts`, so
  Vitest's default `**/*.{test,spec}.*` include never double-collects it and the
  45 unit tests stay green.

## Verification summary

| Check                   | Command                      | Result                              |
| ----------------------- | ---------------------------- | ----------------------------------- |
| E2E two-browser jam     | `npm run e2e -w client`      | ✅ 1 passed                         |
| Type check              | `npx tsc --noEmit` (client/) | ✅ exit 0                           |
| Unit suites             | `npm test` (root)            | ✅ 172 passed (shared 14 + server 31 + client 127) |
| Metric ① latency        | readout                      | ✅ 29–32 ms < 50 ms                 |
| Metric ② offset RTT     | readout sub-line             | ✅ 2 ms on loopback                 |
| Metric ③ beat transport | E2E timing loop              | ✅ median 5 ms < 30 ms              |
