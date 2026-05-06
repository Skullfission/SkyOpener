# EyeOpener

A behind-the-ship rail shooter that captures the feel and controls of classic
SNES/N64-era space combat — built from scratch with original artwork (no
copyrighted assets) and your own original soundtrack.

## Run it

It's pure HTML + ES modules + Three.js (CDN). No build step.

```
# from the repo root, start any static server, e.g.:
npx serve .
# or
python -m http.server 8080
```

Then open the URL it prints (e.g. http://localhost:8080) in a modern browser.
You can also just open `index.html` directly in some browsers, but a local
server is recommended so ES module imports and music files load reliably.

## Controls

| Action            | Keyboard                          | Mouse           | Gamepad           |
|-------------------|-----------------------------------|-----------------|-------------------|
| Steer             | `W` `A` `S` `D` / arrow keys      | Move reticle    | Left stick        |
| Fire              | `Space`                           | Left click      | `A` / Right trig. |
| Barrel roll left  | `Q`, double-tap `A` / `←`         | —               | Left bumper       |
| Barrel roll right | `E`, double-tap `D` / `→`         | —               | Right bumper      |
| Boost             | `Shift`                           | —               | Right trigger     |
| Brake             | `Ctrl`                            | —               | Left trigger      |

A barrel roll grants brief invulnerability and deflects incoming projectiles —
use it to dodge enemy fire or shave past pillars.

## Music

This is intentionally plug-and-play for original tracks. See
[`assets/music/README.md`](assets/music/README.md). Either drop a file named
`track1.mp3` (or `.ogg`/`.wav`) into `assets/music/`, or pick any audio file
from the start screen.

## Project layout

```
index.html        Page shell, HUD, start overlay
src/main.js       Boot + music
src/game.js       Game loop, world, enemies, obstacles, collisions
src/ship.js       Original procedural ship + enemy meshes
src/input.js      Unified keyboard / mouse / gamepad
assets/music/     Drop your original soundtrack here
```

## Notes

- All ship and enemy geometry is procedurally built from primitives — no
  copyrighted designs are used or referenced.
- The soundtrack is provided by the player; nothing copyrighted is bundled.
