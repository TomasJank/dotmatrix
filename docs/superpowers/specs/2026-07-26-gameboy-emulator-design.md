# Dotmatrix — Game Boy emulator in the browser

Original Game Boy (DMG) emulator in TypeScript, rendering to a canvas, deployed
to GitHub Pages. v1 finish line: Tetris playable at 60fps with keyboard input.
No sound, no MBC mappers, no Game Boy Color.

## Goals

- Tetris (ROM-only cartridge) boots and plays at full speed in the browser.
- CPU correctness proven by blargg's `cpu_instrs` test ROMs, run headlessly in CI.
- Zero-install demo: drag a ROM onto the page. ROMs are never bundled or
  committed, except the freely redistributable blargg test ROMs in `tests/roms/`.

## Non-goals (v1)

Sound (APU), MBC1/MBC3 mappers, battery saves, save states, Game Boy Color,
cycle-accurate timing, debugger UI.

## Stack

Vite + vanilla TypeScript. One `<canvas>`, no UI framework. vitest for tests.

## Architecture

Modules communicate through the bus; each is one file with one job.

| Module | Responsibility |
|--------|----------------|
| `cpu.ts` | SM83 core: registers, flags, all opcodes (incl. CB prefix), interrupt handling. The bulk of the work. |
| `bus.ts` | Memory map — routes reads/writes to ROM, VRAM, WRAM, OAM, IO registers, HRAM. Owns the serial port stub (captures output for tests). |
| `ppu.ts` | Scanline renderer: LCDC modes, background, window, sprites → 160×144 RGBA framebuffer. |
| `timer.ts` | DIV/TIMA/TMA/TAC registers, timer interrupt. |
| `joypad.ts` | JOYP register, button state. |
| `cart.ts` | ROM-only cartridge (32KB, no banking). |
| `gb.ts` | Glue: step CPU, tick PPU/timer by elapsed cycles; `runFrame()` executes one frame (70,224 cycles). |
| `main.ts` | Browser shell: ROM file input, canvas blit via `requestAnimationFrame`, keyboard → joypad. |

**Timing model:** instruction-stepped with cycle counting. After each
instruction, tick PPU and timer by that instruction's cycle cost. Not
cycle-accurate; sufficient for Tetris and blargg `cpu_instrs`.

**Boot:** skip the boot ROM — initialize registers/IO to post-boot values and
jump to 0x0100.

## Testing

One safety net: vitest executes blargg's `cpu_instrs` ROMs headlessly (no PPU
needed), captures serial output, asserts it ends with "Passed". Covers the
entire CPU; no per-opcode unit tests. Runs in CI via GitHub Actions.

Everything past the CPU (PPU, joypad) is verified by playing Tetris.

## Build order

1. CPU + bus + serial stub → blargg `cpu_instrs` green
2. Timer + interrupts (blargg exercises these too)
3. PPU scanline renderer
4. Joypad + browser shell → Tetris boots and plays
5. Polish: DMG-green palette page styling, GitHub Pages deploy

## Error handling

Unknown opcode or unsupported cartridge type → throw with address/type in the
message, surfaced as a banner on the page. No recovery — an emulator in a bad
state should die loudly.

## Later (explicitly deferred)

Sound via Web Audio, MBC1 (unlocks Mario Land, Zelda), battery saves via
localStorage, GBC support.
