# dotmatrix

A Game Boy emulator that runs in the browser, written in TypeScript.

Live: https://tomasjank.github.io/dotmatrix/

![2048 homebrew running in dotmatrix](docs/screenshot.png)

## Controls

| Key   | Game Boy |
| ----- | -------- |
| Arrows | D-pad |
| X     | A |
| Z     | B |
| Enter | Start |
| Shift | Select |

## Status

CPU, PPU, timer, and joypad are implemented and pass the blargg `cpu_instrs` test suite: 11/11 ROMs passing.

## Running it

```
npm i
npm run dev
```

Open the page and drop a `.gb` ROM file onto it, or use the file picker.

## Testing

```
npm test
```

Runs the unit test suite (CPU, PPU, bus, timer, joypad) plus the blargg `cpu_instrs` ROMs under vitest.

## v1 scope

- ROM-only and no-banking cartridges (MBC1 cartridges up to 32KB, since they behave identically to ROM-only at that size)
- CPU, PPU (background/window/sprites), timer, joypad, serial output capture

## Deferred

- Sound (APU)
- MBC mappers beyond the 32KB case above (MBC1/2/3/5 banking)
- Battery-backed saves
- Save states
- Game Boy Color
