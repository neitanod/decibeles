# Decibeles

**English** · [Español](README.es.md)

A sound level meter that lives in your phone's browser. Install it as an app,
point it at the room, and it tells you how loud things are — in dB(A), dB(C)
or dB(Z) — with a live gauge, a spectrum, an exposure dose and a history of
every measurement.

**Try it:** https://decibeles.ip1.cc

It works offline, needs no account, and never sends audio anywhere: every
sample is processed on the device.

## Features

- **Live meter** with an analog-style gauge (spring-damped needle, peak-hold
  and Leq markers) and a big digital readout.
- **A, C and Z frequency weightings** (IEC 61672) and **Fast / Slow time
  weightings**, all computed in parallel so switching is instant.
- **Session statistics:** Min, Max, Leq, peak, and the statistical levels
  L10, L50 and L90.
- **History chart** of the last minute or of the whole session, colored by
  noise zone.
- **One-third octave spectrum** (25 Hz – 16 kHz) with peak caps and the
  dominant frequency, shown with its musical note.
- **Waterfall spectrogram** on a logarithmic frequency axis.
- **Exposure dose** following the NIOSH criterion (85 dB(A) for 8 h, 3 dB
  exchange rate), with the safe time at the current level and an 8-hour
  projection.
- **Reference scale** of everyday sounds with a "you are here" marker.
- **Noise traffic light** for classrooms, offices and workshops: full screen,
  configurable thresholds, averaged over a few seconds so one slammed door
  does not flip it to red.
- **Level alert** with vibration and a screen flash.
- **Markers** to tag moments during a measurement ("a bus went by").
- **Session history** saved automatically on the device (IndexedDB), with a
  detail page per session: timeline, level distribution, name and notes.
- **Exports:** a shareable image card, CSV (one row per second) and JSON;
  export and import of the whole history.
- **Calibration** against a reference meter, or by hand.
- **Three skins** (Studio, Phosphor, Paper), **Spanish and English**.
- **Installable PWA:** works offline, updates itself, keeps the screen on
  while measuring, and shows its build stamp.

## How it measures

The microphone is opened with echo cancellation, noise suppression and
automatic gain control turned off, because each of them would bend the
reading. An `AudioWorklet` runs the A and C weighting filters — cascades of
biquads designed with the bilinear transform, with pre-warped poles — and
keeps the Fast (125 ms) and Slow (1 s) exponential averages plus the block
energy that Leq integrates. Twenty times per second it posts mean-square
values to the main thread, which applies the calibration offset and converts
to decibels.

The weighting filters are tested against the nominal values of IEC 61672-1
at 44.1 and 48 kHz (`tests/weighting.test.mjs`).

### About accuracy

Phone microphones differ, and browsers do not expose their sensitivity, so
the default offset (dB SPL = dBFS + 100) is an estimate. For trustworthy
numbers, place a reference meter next to the phone and use **Settings →
Calibration**. Even calibrated, a phone is not a certified class 1 or class 2
sound level meter: treat the readings as indicative.

## Development

No framework and no bundler: plain ES modules under `web/`.

```bash
node --test tests/*.test.mjs   # weighting filters and statistics
./build.sh                     # web/ → dist/, with build stamp and precache list
node tools/serve.mjs           # serves dist/ on http://localhost:8642
./deploy.sh                    # build and publish to decibeles.ip1.cc
python3 tools/icons.py         # redraw the app icons
```

`build.sh` writes the build stamp (`web/js/build.js`), lists every file into
the service worker precache and writes `version.txt`, which the app polls to
detect new versions.

## License

MIT
