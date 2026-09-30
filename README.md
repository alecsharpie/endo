# ENDO!

A front-brake BMX freestyle game. Hand-rolled WebGL, no libraries, no build step —
the whole game is one file: [`index.html`](index.html).

**Play it: https://alecsharpie.github.io/endo/**

## Controls

| | |
|---|---|
| `↑` / `W` | pedal — mash it for a power **wheelie** |
| `SPACE` | front brake, your only brake — grab it at speed to **endo**, steer to **pivot** |
| `←` `→` | steer · pivot · spin in the air |
| `↓` / `S` | lean back — pull the nose up, bail out of a deep endo |
| `SHIFT` / `X` | bunny hop — mid-endo it's a **pogo** |
| `R` reset · `M` mute · `P` pause | |

Hold pedal or brake to auto-balance a trick. Land a 180 and you ride away **switch**,
and stay switch until the next one. Chain lines like 180 → pogo → pivot for ★ signature
bonuses. 2:00 on the clock; ride out clean to bank the combo.

Pick a bike with `←` `→` on the title screen or between runs — six of them, each with its
own speed, spin, pop and balance.

## The map

Four runs that each chain three or more features and spit you back into the open hub:

- **The boulevard** (south → north) — terrace stairs, rollers, kicker gap, the walkway,
  the north bank, and out over the kiosk onto the depot roof.
- **The west run** — funbox, roll-in, halfpipe.
- **The east wall** — pyramid, spine, and the quarter pipe running alongside the lane.
- **The south run** — bank up onto the terrace, across, and off the stairs.

## Development

Open `index.html` in a browser — that's it.

The test suites drive the real game in Chrome via Playwright:

```sh
cd tests
npm install playwright        # not committed
node server.js &              # serves the game on :8931
node test.js                  # secondary motion
node test3.js                 # controls
node test4.js                 # map + goals
node test5.js                 # switch stance
node test6.js                 # the garage
node soak.js                  # 90s of random input, NaN/error guard
```

`window.__endo` exposes the bike state, inputs, the height field and the map constants
so the suites can teleport, drive and assert against the live simulation.
