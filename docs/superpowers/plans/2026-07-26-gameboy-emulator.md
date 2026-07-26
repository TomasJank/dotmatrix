# Dotmatrix Game Boy Emulator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Original Game Boy (DMG) emulator in TypeScript that plays Tetris at 60fps in the browser, with the CPU proven by blargg's cpu_instrs test ROMs.

**Architecture:** Instruction-stepped emulation — CPU executes one instruction, returns its cycle cost, then PPU and timer tick by that many cycles. All devices hang off a `Bus` that routes the 16-bit address space. Rendering is per-scanline into an RGBA framebuffer blitted to a canvas.

**Tech Stack:** Vite (vanilla-ts template), vitest, no runtime dependencies, no UI framework.

## Global Constraints

- No runtime npm dependencies. Dev deps: vite, vitest, typescript only.
- Game ROMs are never committed. Only blargg test ROMs (freely redistributable) live in `tests/roms/`.
- ROM-only + no-banking external RAM cartridges only (v1). Unknown cart type (byte 0x0147 ≠ 0x00) → throw.
- Unknown opcode → throw `Error` with opcode and PC in hex. No silent recovery.
- All memory reads of unmapped regions return 0xFF.
- No sound, no MBC banking, no save states, no Game Boy Color (deferred per spec).
- Commit messages: plain conventional style, no AI attribution.

## Reference documents

- Opcode table: https://gbdev.io/gb-opcodes/optables/ (cycle counts and flag effects per opcode)
- Pan Docs (memory map, PPU, timer, joypad registers): https://gbdev.io/pandocs/

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.ts` (via Vite template)
- Create: `.gitignore`, `vitest` config inside `vite.config.ts`

**Interfaces:**
- Produces: a `npm run dev` page with `<canvas id="screen" width="160" height="144">` and `<div id="error" hidden>`; `npm test` runs vitest.

- [ ] **Step 1: Scaffold Vite app**

```bash
cd /Users/tomasjankauskas/Desktop/Projects/dotmatrix
npm create vite@latest . -- --template vanilla-ts
npm i && npm i -D vitest
```

If the scaffolder balks at the non-empty dir (docs/, .git), let it scaffold into `tmp/` and move the files up.

- [ ] **Step 2: Replace index.html body and main.ts**

`index.html` body:

```html
<body>
  <main>
    <h1>dotmatrix</h1>
    <p id="hint">Drop a Game Boy ROM (.gb) anywhere, or <label>choose a file<input type="file" id="rom" accept=".gb" hidden></label></p>
    <div id="error" hidden></div>
    <canvas id="screen" width="160" height="144"></canvas>
  </main>
  <script type="module" src="/src/main.ts"></script>
</body>
```

`src/main.ts`: empty file for now (Task 8 fills it). Delete the template's `counter.ts`, `style.css` demo content; keep a minimal `style.css` (dark page, centered column, `canvas { width: 480px; image-rendering: pixelated; }`).

- [ ] **Step 3: Add test script and vitest config**

`package.json` scripts: `"test": "vitest run"`. In `vite.config.ts`:

```ts
import { defineConfig } from 'vite'
export default defineConfig({ base: './', test: { include: ['tests/**/*.test.ts'] } } as any)
```

- [ ] **Step 4: Verify**

Run: `npm run dev &` → curl the page, confirm canvas present, kill it. Run `npm test` → "no test files found" is acceptable at this point (exit code may be 1; confirm vitest itself runs).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: scaffold vite + vitest"
```

---

### Task 2: Cartridge and Bus

**Files:**
- Create: `src/cart.ts`, `src/bus.ts`
- Test: `tests/bus.test.ts`

**Interfaces:**
- Produces:
  - `class Cart { constructor(rom: Uint8Array); read(addr: number): number }` — throws `Error("unsupported cart type 0xNN")` unless `rom[0x147] === 0`.
  - `class Bus { read(addr: number): number; write(addr: number, val: number): void; serialOut: string; if_: number; ie: number; constructor(cart: Cart) }`
  - Bus routes: `0x0000-7FFF` cart, `0x8000-9FFF` VRAM (plain `Uint8Array` until Task 7 rewires to PPU), `0xA000-BFFF` external RAM, `0xC000-DFFF` WRAM, `0xE000-FDFF` echo of WRAM, `0xFE00-FE9F` OAM (plain array until Task 7), `0xFF80-FFFE` HRAM, `0xFF0F` → `if_`, `0xFFFF` → `ie`. Serial: writing `0xFF01` stores a byte; writing `0x81` to `0xFF02` appends `String.fromCharCode(byte)` to `serialOut`. Everything else unmapped: reads 0xFF, writes ignored.
  - Bus exposes `ioHooks: Map<number, {read?: () => number, write?: (v: number) => void}>` — Tasks 5/7/8 register timer/PPU/joypad registers here instead of editing bus routing.

- [ ] **Step 1: Write failing tests**

```ts
// tests/bus.test.ts
import { describe, it, expect } from 'vitest'
import { Cart } from '../src/cart'
import { Bus } from '../src/bus'

function makeBus() {
  const rom = new Uint8Array(0x8000)
  rom[0x147] = 0x00
  rom[0x1234] = 0xAB
  return new Bus(new Cart(rom))
}

describe('bus', () => {
  it('reads ROM through cart', () => expect(makeBus().read(0x1234)).toBe(0xAB))
  it('rejects banked carts', () => {
    const rom = new Uint8Array(0x8000); rom[0x147] = 0x01
    expect(() => new Cart(rom)).toThrow(/unsupported cart type/)
  })
  it('WRAM roundtrip and echo', () => {
    const b = makeBus()
    b.write(0xC010, 0x42)
    expect(b.read(0xC010)).toBe(0x42)
    expect(b.read(0xE010)).toBe(0x42)
  })
  it('HRAM, ext RAM, VRAM, OAM writable', () => {
    const b = makeBus()
    for (const a of [0xFF80, 0xA000, 0x8000, 0xFE00]) { b.write(a, 7); expect(b.read(a)).toBe(7) }
  })
  it('unmapped reads 0xFF', () => expect(makeBus().read(0xFF7F)).toBe(0xFF))
  it('captures serial output', () => {
    const b = makeBus()
    for (const ch of 'Hi') { b.write(0xFF01, ch.charCodeAt(0)); b.write(0xFF02, 0x81) }
    expect(b.serialOut).toBe('Hi')
  })
  it('ROM writes ignored', () => { const b = makeBus(); b.write(0x1234, 0); expect(b.read(0x1234)).toBe(0xAB) })
})
```

- [ ] **Step 2: Run, verify all fail** — `npm test` → module-not-found failures.

- [ ] **Step 3: Implement `cart.ts` and `bus.ts`**

`cart.ts` is ~8 lines. `bus.ts` sketch:

```ts
export class Bus {
  serialOut = ''
  if_ = 0xE1
  ie = 0
  vram = new Uint8Array(0x2000)
  oam = new Uint8Array(0xA0)
  ioHooks = new Map<number, { read?: () => number; write?: (v: number) => void }>()
  private wram = new Uint8Array(0x2000)
  private extram = new Uint8Array(0x2000)
  private hram = new Uint8Array(0x7F)
  private sb = 0
  constructor(private cart: Cart) {}

  read(addr: number): number {
    if (addr < 0x8000) return this.cart.read(addr)
    if (addr < 0xA000) return this.vram[addr - 0x8000]
    if (addr < 0xC000) return this.extram[addr - 0xA000]
    if (addr < 0xE000) return this.wram[addr - 0xC000]
    if (addr < 0xFE00) return this.wram[addr - 0xE000]
    if (addr < 0xFEA0) return this.oam[addr - 0xFE00]
    if (addr === 0xFF0F) return this.if_ | 0xE0
    if (addr === 0xFFFF) return this.ie
    if (addr >= 0xFF80 && addr < 0xFFFF) return this.hram[addr - 0xFF80]
    const hook = this.ioHooks.get(addr)
    if (hook?.read) return hook.read()
    return 0xFF
  }
  // write(): mirror structure; 0xFF01 stores sb, 0xFF02 val 0x81 appends to serialOut
}
```

- [ ] **Step 4: Run, verify pass** — `npm test`

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: cartridge and memory bus with serial capture"`

---

### Task 3: CPU part 1 — registers, flags, loads, ALU (opcodes 0x00–0xBF)

**Files:**
- Create: `src/cpu.ts`
- Test: `tests/cpu.test.ts`

**Interfaces:**
- Consumes: `Bus.read/write`.
- Produces: `class CPU { a,b,c,d,e,h,l,f,sp,pc: number; ime: boolean; halted: boolean; constructor(bus: Bus); step(): number }` — `step()` executes one instruction at `pc`, returns cycle count (machine cycles × 4, e.g. NOP = 4). Post-boot init inside constructor: `a=0x01 f=0xB0 b=0 c=0x13 d=0 e=0xD8 h=0x01 l=0x4D sp=0xFFFE pc=0x0100`. Flag masks exported: `export const Z=0x80, N=0x40, HC=0x20, CY=0x10`.

**Implementation strategy — decode by bit pattern, not 500 cases.** Register index 0–7 maps to B,C,D,E,H,L,(HL),A via getter/setter helpers:

```ts
private r8get(i: number): number {
  return [this.b, this.c, this.d, this.e, this.h, this.l, this.bus.read(this.hl), this.a][i]
}
private r8set(i: number, v: number) { /* symmetric switch; i===6 writes bus at hl */ }
get hl() { return (this.h << 8) | this.l }
```

Blocks:
- `0x40-0x7F` (except 0x76 HALT): `LD r[y], r[z]` where `y=(op>>3)&7, z=op&7`. 4 cycles, +4 per (HL) access.
- `0x80-0xBF`: ALU op `(op>>3)&7` ∈ [ADD, ADC, SUB, SBC, AND, XOR, OR, CP] applied to `r8get(op&7)`. Implement each as a method taking a value, so Task 4 reuses them for the `d8` immediate variants.
- `0x00-0x3F`: switch on the opcode. Patterns worth exploiting: `LD rr,d16` (0x01/11/21/31), `INC rr`/`DEC rr` (0x03/0B pattern), `INC r`/`DEC r` (`xxxxx100`/`xxxxx101`), `LD r,d8` (`xxxxx110`). Individually: NOP, LD (BC)/(DE)/(HL+)/(HL-) A and reverses, LD (a16),SP (0x08), ADD HL,rr, RLCA/RRCA/RLA/RRA (clear Z!), DAA, CPL, SCF, CCF, JR d8, JR cc,d8 (12 taken / 8 not), STOP (treat as NOP+skip byte), HALT (set `halted`; behavior in Task 5).

Flag rules that cause the classic bugs — get them right the first time:
- Half-carry on ADD: `((a & 0xF) + (v & 0xF)) > 0xF`; on SUB: `(a & 0xF) < (v & 0xF)`. ADC/SBC include the carry bit in the nibble math.
- `ADD HL,rr`: Z unaffected, H from bit 11, C from bit 15.
- `INC r`/`DEC r`: carry unaffected.
- F lower nibble always reads 0 — mask every F assignment with `& 0xF0`.
- DAA (copy this exactly):

```ts
private daa() {
  let a = this.a
  if (!(this.f & N)) {
    if ((this.f & CY) || a > 0x99) { a += 0x60; this.f |= CY }
    if ((this.f & HC) || (a & 0xF) > 0x09) a += 0x06
  } else {
    if (this.f & CY) a -= 0x60
    if (this.f & HC) a -= 0x06
  }
  a &= 0xFF
  this.f &= ~(Z | HC) & 0xF0
  if (a === 0) this.f |= Z
  this.a = a
}
```

Cycle counts: transcribe from the gbdev optable into a `const CYCLES = new Uint8Array(256)` base table; conditional jumps add their extra cycles inline when taken. `step()` on an opcode with no handler throws `` `unimplemented opcode 0x${op.toString(16)} at 0x${pc.toString(16)}` ``.

- [ ] **Step 1: Write failing tests** — test helper assembles bytes into a ROM at 0x0100:

```ts
// tests/cpu.test.ts
import { describe, it, expect } from 'vitest'
import { Cart } from '../src/cart'
import { Bus } from '../src/bus'
import { CPU, Z, N, HC, CY } from '../src/cpu'

export function cpuWith(...code: number[]) {
  const rom = new Uint8Array(0x8000)
  rom.set(code, 0x0100)
  return new CPU(new Bus(new Cart(rom)))
}

describe('cpu part 1', () => {
  it('NOP costs 4 and advances pc', () => {
    const c = cpuWith(0x00)
    expect(c.step()).toBe(4)
    expect(c.pc).toBe(0x0101)
  })
  it('LD B,d8 / LD C,B', () => {
    const c = cpuWith(0x06, 0x42, 0x48) // LD B,42; LD C,B
    c.step(); c.step()
    expect(c.c).toBe(0x42)
  })
  it('ADD half-carry and carry', () => {
    const c = cpuWith(0x80) // ADD A,B
    c.a = 0x0F; c.b = 0x01; c.step()
    expect(c.a).toBe(0x10)
    expect(c.f & HC).toBeTruthy()
    const d = cpuWith(0x80)
    d.a = 0xFF; d.b = 0x02; d.step()
    expect(d.a).toBe(0x01)
    expect(d.f & CY).toBeTruthy()
    expect(d.f & Z).toBeFalsy()
  })
  it('SUB sets N and Z', () => {
    const c = cpuWith(0x90); c.a = 5; c.b = 5; c.step()
    expect(c.f & Z).toBeTruthy(); expect(c.f & N).toBeTruthy()
  })
  it('INC leaves carry alone', () => {
    const c = cpuWith(0x3C); c.a = 0xFF; c.f = CY; c.step()
    expect(c.a).toBe(0); expect(c.f & CY).toBeTruthy(); expect(c.f & Z).toBeTruthy()
  })
  it('DAA after ADD adjusts BCD', () => {
    const c = cpuWith(0x80, 0x27) // ADD A,B; DAA
    c.a = 0x45; c.b = 0x38; c.step(); c.step()
    expect(c.a).toBe(0x83)
  })
  it('LD (HL+),A writes and bumps HL', () => {
    const c = cpuWith(0x22)
    c.a = 0x99; c.h = 0xC0; c.l = 0x00; c.step()
    expect(c['bus' as any] ?? true).toBeTruthy()
    expect(c.hl).toBe(0xC001)
  })
  it('JR takes signed offset', () => {
    const c = cpuWith(0x18, 0xFE) // JR -2 → back to 0x0100
    expect(c.step()).toBe(12)
    expect(c.pc).toBe(0x0100)
  })
  it('ADD HL,DE leaves Z alone, sets C from bit 15', () => {
    const c = cpuWith(0x19)
    c.h = 0xFF; c.l = 0xFF; c.d = 0x00; c.e = 0x01; c.f = Z; c.step()
    expect(c.hl).toBe(0x0000); expect(c.f & Z).toBeTruthy(); expect(c.f & CY).toBeTruthy()
  })
})
```

(Make `hl` a public getter so tests can read it; the `(HL+)` test asserts via HL and a follow-up `LD A,(0xC000)` if you prefer bus-level assertion — either is fine, but assert the written byte somehow.)

- [ ] **Step 2: Run, verify fail** — `npm test`
- [ ] **Step 3: Implement per the strategy above** — all of 0x00–0xBF plus the getter/setter machinery and cycle table for that range.
- [ ] **Step 4: Run, verify pass** — `npm test`
- [ ] **Step 5: Commit** — `git commit -am "feat: cpu loads and alu (0x00-0xbf)"`

---

### Task 4: CPU part 2 — control flow, stack, CB prefix (0xC0–0xFF)

**Files:**
- Modify: `src/cpu.ts`
- Test: append to `tests/cpu.test.ts`

**Interfaces:**
- Consumes: ALU methods from Task 3 (reused for `ADD A,d8` etc.).
- Produces: complete opcode coverage; `step()` never throws on any documented SM83 opcode.

Block contents:
- `RET` / `RET cc` (20/8) / `RETI` (sets `ime`), `JP a16` / `JP cc` (16/12) / `JP HL` (4), `CALL a16` / `CALL cc` (24/12), `RST n` (16).
- `PUSH/POP rr` for BC/DE/HL/AF — POP AF masks F with 0xF0.
- ALU `d8` variants 0xC6..0xFE reuse Task 3 methods.
- `LDH (a8),A` / `LDH A,(a8)` / `LD (C),A` / `LD A,(C)` / `LD (a16),A` / `LD A,(a16)`.
- `ADD SP,d8` and `LD HL,SP+d8` — signed operand; flags: Z=0, N=0, H/C from the *unsigned low byte* addition (`(sp&0xF)+(d8&0xF)>0xF`, `(sp&0xFF)+(d8&0xFF)>0xFF`). This is the single most-failed blargg case.
- `DI` clears `ime`; `EI` sets it *after the following instruction* (use a pending flag; wire fully in Task 5).
- CB prefix: read next byte `cb`; `z=cb&7` selects register via `r8get/r8set`; `cb>>6`: 0 → rot/shift by `(cb>>3)&7` ∈ [RLC,RRC,RL,RR,SLA,SRA,SWAP,SRL] (all set Z from result, unlike the A-register rotates), 1 → BIT (Z from bit, N=0, H=1, C unchanged), 2 → RES, 3 → SET. Cycles: 8, or 16 with (HL) (12 for BIT (HL)).

- [ ] **Step 1: Write failing tests**

```ts
describe('cpu part 2', () => {
  it('PUSH/POP roundtrip', () => {
    const c = cpuWith(0xC5, 0xD1) // PUSH BC; POP DE
    c.b = 0x12; c.c = 0x34; c.step(); c.step()
    expect(c.d).toBe(0x12); expect(c.e).toBe(0x34); expect(c.sp).toBe(0xFFFE)
  })
  it('CALL pushes return address, RET pops it', () => {
    const c = cpuWith(0xCD, 0x00, 0x02) // CALL 0x0200
    const rom = (c as any).bus.cart.rom ?? null
    c.step()
    expect(c.pc).toBe(0x0200)
    // plant RET at 0x0200 instead: build via cpuWith code array padded to 0x0200
  })
  it('conditional JP not taken costs 12', () => {
    const c = cpuWith(0xC2, 0x00, 0x02) // JP NZ — with Z set
    c.f = Z
    expect(c.step()).toBe(12)
    expect(c.pc).toBe(0x0103)
  })
  it('CB BIT sets Z when bit clear, preserves C', () => {
    const c = cpuWith(0xCB, 0x40) // BIT 0,B
    c.b = 0; c.f = CY; c.step()
    expect(c.f & Z).toBeTruthy(); expect(c.f & CY).toBeTruthy(); expect(c.f & HC).toBeTruthy()
  })
  it('CB SWAP swaps nibbles and sets Z on zero', () => {
    const c = cpuWith(0xCB, 0x37) // SWAP A
    c.a = 0xF0; c.step()
    expect(c.a).toBe(0x0F); expect(c.f & Z).toBeFalsy()
  })
  it('ADD SP,d8 flags from low byte', () => {
    const c = cpuWith(0xE8, 0x01)
    c.sp = 0xFFFF; c.step()
    expect(c.sp).toBe(0x0000)
    expect(c.f & CY).toBeTruthy(); expect(c.f & HC).toBeTruthy(); expect(c.f & Z).toBeFalsy()
  })
  it('RST 0x38 jumps to vector', () => {
    const c = cpuWith(0xFF)
    c.step()
    expect(c.pc).toBe(0x0038)
  })
  it('POP AF masks flag low nibble', () => {
    const c = cpuWith(0x01, 0xFF, 0x12, 0xC5, 0xF1) // LD BC,0x12FF; PUSH BC; POP AF
    c.step(); c.step(); c.step()
    expect(c.f).toBe(0xF0)
  })
})
```

For the CALL/RET test, extend `cpuWith` to accept `{at: number, code: number[]}` patches so RET can be planted at 0x0200. Write it concretely:

```ts
export function cpuWith(code: number[] | number, ...rest: number[]) { /* keep old signature */ }
export function cpuWithPatches(main: number[], patches: {at: number, code: number[]}[]) {
  const rom = new Uint8Array(0x8000)
  rom.set(main, 0x0100)
  for (const p of patches) rom.set(p.code, p.at)
  return new CPU(new Bus(new Cart(rom)))
}
```

- [ ] **Step 2: Run, verify fail**
- [ ] **Step 3: Implement the 0xC0–0xFF block and CB decoder**
- [ ] **Step 4: Run, verify pass** — `npm test`
- [ ] **Step 5: Commit** — `git commit -am "feat: cpu control flow, stack, cb prefix"`

---

### Task 5: Interrupts, HALT, timer

**Files:**
- Modify: `src/cpu.ts`
- Create: `src/timer.ts`
- Test: `tests/interrupts.test.ts`

**Interfaces:**
- Consumes: `Bus.ioHooks`, `bus.if_`, `bus.ie`.
- Produces:
  - `CPU.step()` interrupt dispatch: before fetching, if `ime && (bus.ie & bus.if_ & 0x1F)`, take the lowest set bit (priority: VBlank 0x01→0x40, STAT 0x02→0x48, Timer 0x04→0x50, Serial 0x08→0x58, Joypad 0x10→0x60): clear that `if_` bit, `ime=false`, push `pc`, jump to vector, return 20 cycles. If `halted` and any `(ie & if_)` bit pending, clear `halted` even when `ime` is false. A halted CPU with nothing pending returns 4 cycles doing nothing.
    <!-- ponytail: halt bug (IME=0, pending → pc fails to advance) skipped; add if a game depends on it -->
  - EI delay: `EI` sets `imeNext`; `step()` promotes `imeNext→ime` *after* executing the following instruction.
  - `class Timer { constructor(bus: Bus)  /* registers hooks for 0xFF04-07 */; tick(cycles: number): void }` — DIV (0xFF04) increments every 256 cycles, any write resets it to 0. TIMA (0xFF05) increments every [1024, 16, 64, 256] cycles per `TAC&3` when `TAC&4`; on overflow reload from TMA (0xFF06) and set `bus.if_ |= 0x04`.

- [ ] **Step 1: Write failing tests**

```ts
// tests/interrupts.test.ts
import { describe, it, expect } from 'vitest'
import { Cart } from '../src/cart'
import { Bus } from '../src/bus'
import { CPU } from '../src/cpu'
import { Timer } from '../src/timer'

function setup(code: number[]) {
  const rom = new Uint8Array(0x8000)
  rom.set(code, 0x0100)
  const bus = new Bus(new Cart(rom))
  return { bus, cpu: new CPU(bus), timer: new Timer(bus) }
}

describe('interrupts', () => {
  it('dispatches vblank to 0x40 and clears IF bit', () => {
    const { bus, cpu } = setup([0x00])
    cpu.ime = true; bus.ie = 0x01; bus.if_ = 0x01
    expect(cpu.step()).toBe(20)
    expect(cpu.pc).toBe(0x0040)
    expect(bus.if_ & 0x01).toBe(0)
    expect(cpu.ime).toBe(false)
  })
  it('EI enables only after the next instruction', () => {
    const { bus, cpu } = setup([0xFB, 0x00, 0x00]) // EI; NOP; NOP
    bus.ie = 0x01; bus.if_ = 0x01
    cpu.step() // EI
    cpu.step() // NOP — interrupt must NOT fire before this
    expect(cpu.pc).toBe(0x0102)
    cpu.step() // now it fires
    expect(cpu.pc).toBe(0x0040)
  })
  it('HALT wakes on pending interrupt even with ime off', () => {
    const { bus, cpu } = setup([0x76, 0x00]) // HALT; NOP
    cpu.step()
    expect(cpu.halted).toBe(true)
    cpu.step() // still halted, nothing pending
    expect(cpu.halted).toBe(true)
    bus.ie = 0x04; bus.if_ = 0x04
    cpu.step()
    expect(cpu.halted).toBe(false)
  })
})

describe('timer', () => {
  it('DIV counts every 256 cycles and resets on write', () => {
    const { bus, timer } = setup([])
    timer.tick(512)
    expect(bus.read(0xFF04)).toBe(2)
    bus.write(0xFF04, 0x99)
    expect(bus.read(0xFF04)).toBe(0)
  })
  it('TIMA overflow reloads TMA and raises IF bit 2', () => {
    const { bus, timer } = setup([])
    bus.write(0xFF06, 0x33)       // TMA
    bus.write(0xFF07, 0x05)       // TAC: enabled, 16-cycle period
    bus.write(0xFF05, 0xFF)       // TIMA
    timer.tick(16)
    expect(bus.read(0xFF05)).toBe(0x33)
    expect(bus.if_ & 0x04).toBe(0x04)
  })
})
```

- [ ] **Step 2: Run, verify fail**
- [ ] **Step 3: Implement** — interrupt dispatch + `imeNext` in `cpu.ts`; `timer.ts` keeps internal cycle accumulators (`divCounter`, `timaCounter`).
- [ ] **Step 4: Run, verify pass** — `npm test` (all suites)
- [ ] **Step 5: Commit** — `git commit -am "feat: interrupts, halt, timer"`

---

### Task 6: Blargg cpu_instrs green

**Files:**
- Create: `tests/roms/` (downloaded ROMs), `tests/blargg.test.ts`, `src/headless.ts`

**Interfaces:**
- Consumes: CPU, Bus, Cart, Timer.
- Produces: `runBlargg(rom: Uint8Array, maxCycles?: number): string` in `src/headless.ts` — steps CPU + timer until `bus.serialOut` contains `"Passed"` or `"Failed"` or `maxCycles` (default 250_000_000) elapse; returns `bus.serialOut`.

- [ ] **Step 1: Download the individual cpu_instrs ROMs** (the combined `cpu_instrs.gb` is MBC1 — do NOT use it; the 11 individual ROMs are ROM-only)

```bash
cd /Users/tomasjankauskas/Desktop/Projects/dotmatrix
mkdir -p tests/roms
curl -sL https://github.com/retrio/gb-test-roms/archive/refs/heads/master.tar.gz | tar xz -C /tmp/gbroms --strip-components=1 || (mkdir -p /tmp/gbroms && curl -sL https://github.com/retrio/gb-test-roms/archive/refs/heads/master.tar.gz | tar xz -C /tmp/gbroms --strip-components=1)
cp /tmp/gbroms/cpu_instrs/individual/*.gb tests/roms/
ls tests/roms   # expect 01-special.gb … 11-op a,(hl).gb
```

- [ ] **Step 2: Write the harness and test**

```ts
// src/headless.ts
import { Cart } from './cart'
import { Bus } from './bus'
import { CPU } from './cpu'
import { Timer } from './timer'

export function runBlargg(rom: Uint8Array, maxCycles = 250_000_000): string {
  const bus = new Bus(new Cart(rom))
  const cpu = new CPU(bus)
  const timer = new Timer(bus)
  let cycles = 0
  while (cycles < maxCycles) {
    cycles += (() => { const c = cpu.step(); timer.tick(c); return c })()
    if (bus.serialOut.includes('Passed') || bus.serialOut.includes('Failed')) break
  }
  return bus.serialOut
}
```

```ts
// tests/blargg.test.ts
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runBlargg } from '../src/headless'

const dir = join(__dirname, 'roms')
describe('blargg cpu_instrs', () => {
  for (const f of readdirSync(dir).filter(f => f.endsWith('.gb'))) {
    it(f, () => {
      const out = runBlargg(new Uint8Array(readFileSync(join(dir, f))))
      expect(out).toContain('Passed')
    }, 120_000)
  }
})
```

- [ ] **Step 3: Run and debug to green** — `npm test tests/blargg.test.ts`. This is the task's real work: each failing ROM prints which instruction group failed over serial. Debug loop: the ROM names the opcode (e.g. "DAA" or "E8"); re-check that opcode's flags/cycles against https://gbdev.io/gb-opcodes/optables/. Usual suspects: ADD SP,d8 / LD HL,SP+d8 half-carry, DAA, POP AF masking, CB (HL) cycle counts, EI delay. Do not move on until all 11 print "Passed".
- [ ] **Step 4: Full suite** — `npm test` (everything green)
- [ ] **Step 5: Commit** — `git add -A && git commit -m "test: blargg cpu_instrs passing"`

---

### Task 7: PPU

**Files:**
- Create: `src/ppu.ts`
- Test: `tests/ppu.test.ts`

**Interfaces:**
- Consumes: `bus.vram`, `bus.oam`, `bus.ioHooks`, `bus.if_`.
- Produces: `class PPU { framebuffer: Uint8ClampedArray /* 160*144*4 RGBA */; constructor(bus: Bus); tick(cycles: number): void }` — registers hooks for 0xFF40–0xFF4B.

**Behavior:**
- Registers: LCDC 0xFF40, STAT 0xFF41, SCY/SCX 0xFF42/43, LY 0xFF44 (read-only), LYC 0xFF45, DMA 0xFF46, BGP 0xFF47, OBP0/1 0xFF48/49, WY/WX 0xFF4A/4B.
- Line state machine driven by a cycle accumulator: each line is 456 cycles — mode 2 (OAM scan) 0–79, mode 3 (transfer) 80–251, mode 0 (hblank) 252–455. At cycle 252 of a visible line (LY<144), render that line into the framebuffer. After line 143 → mode 1 (VBlank), set `bus.if_ |= 0x01`. Lines 144–153, then LY wraps to 0.
- STAT: bits 0-1 mode, bit 2 LY==LYC; interrupt (`if_ |= 0x02`) on mode 0/1/2 entry or LYC match when the corresponding STAT enable bit (3/4/5/6) is set.
- LCDC bit 7 off → LY=0, mode 0, framebuffer stays; no ticking.
- `renderLine(ly)`:
  - Background (LCDC bit 0): tilemap base from bit 3 (0x9800/0x9C00), tiledata from bit 4 (0x8000 unsigned / 0x8800 signed indexing from 0x9000). For x in 0..159: `px=(x+SCX)&0xFF, py=(ly+SCY)&0xFF`; tile index from map `[py>>3][px>>3]`; fetch 2 bytes of the tile row `py&7`; 2-bit color; through BGP palette.
  - Window (LCDC bit 5, WY≤ly, WX-7≤x): same fetch from bit-6 map, using an internal window line counter (increments only on lines where the window rendered — Tetris doesn't use the window, but Dr. Mario does).
  - Sprites (LCDC bit 1): scan OAM for up to 10 sprites with `spriteY ≤ ly+16 < spriteY + height` (height 8 or 16 per LCDC bit 2); 8x16 masks tile index low bit. Attributes: palette (bit 4), x/y flip (5/6), bg-over-obj priority (7). Color 0 transparent. Lower X wins ties; earlier OAM index wins equal X.
  - Palette: 2-bit shade through BGP/OBPn → DMG greens `[[224,248,208],[136,192,112],[52,104,86],[8,24,32]]`, alpha 255.
- DMA (write 0xFF46, value `v`): copy 160 bytes from `v<<8` to OAM immediately via `bus.read`.

- [ ] **Step 1: Write failing tests**

```ts
// tests/ppu.test.ts
import { describe, it, expect } from 'vitest'
import { Cart } from '../src/cart'
import { Bus } from '../src/bus'
import { PPU } from '../src/ppu'

function setup() {
  const rom = new Uint8Array(0x8000); rom[0x147] = 0
  const bus = new Bus(new Cart(rom))
  const ppu = new PPU(bus)
  bus.write(0xFF40, 0x91) // LCD on, bg on, tiledata 0x8000
  bus.write(0xFF47, 0xE4) // identity palette
  return { bus, ppu }
}

describe('ppu', () => {
  it('renders a solid tile at top-left', () => {
    const { bus, ppu } = setup()
    for (let i = 0; i < 16; i++) bus.vram[i] = 0xFF   // tile 0 = all color 3
    // tilemap already zero → tile 0 everywhere
    for (let i = 0; i < 70224; i += 4) ppu.tick(4)     // one frame
    const [r, g, b, a] = ppu.framebuffer.slice(0, 4)
    expect([r, g, b, a]).toEqual([8, 24, 32, 255])     // darkest green
  })
  it('LY advances and vblank raises IF bit 0', () => {
    const { bus, ppu } = setup()
    ppu.tick(456 * 144)
    expect(bus.read(0xFF44)).toBe(144)
    expect(bus.if_ & 0x01).toBe(0x01)
  })
  it('LYC match sets STAT bit 2 and fires STAT interrupt when enabled', () => {
    const { bus, ppu } = setup()
    bus.write(0xFF45, 2)          // LYC=2
    bus.write(0xFF41, 0x40)       // LYC interrupt enable
    ppu.tick(456 * 2 + 4)
    expect(bus.read(0xFF41) & 0x04).toBe(0x04)
    expect(bus.if_ & 0x02).toBe(0x02)
  })
  it('sprite draws over background', () => {
    const { bus, ppu } = setup()
    bus.write(0xFF40, 0x93)       // + sprites on
    bus.write(0xFF48, 0xE4)
    for (let i = 16; i < 32; i++) bus.vram[i] = 0xFF   // tile 1 solid
    bus.oam.set([16, 8, 1, 0])    // y=16→line0, x=8→col0, tile 1
    ppu.tick(456)                  // render line 0
    expect(ppu.framebuffer[0]).toBe(8)
  })
  it('DMA copies 160 bytes to OAM', () => {
    const { bus } = setup()
    bus.write(0xC000, 0xAB)
    bus.write(0xFF46, 0xC0)
    expect(bus.oam[0]).toBe(0xAB)
  })
})
```

- [ ] **Step 2: Run, verify fail**
- [ ] **Step 3: Implement `ppu.ts`** per the behavior block. Keep it one file; `renderLine` is the only long function.
- [ ] **Step 4: Run, verify pass** — `npm test`
- [ ] **Step 5: Commit** — `git commit -am "feat: ppu scanline renderer with sprites and dma"`

---

### Task 8: Joypad, GameBoy glue, browser shell — Tetris boots

**Files:**
- Create: `src/joypad.ts`, `src/gb.ts`
- Modify: `src/main.ts`
- Test: `tests/gb.test.ts`

**Interfaces:**
- Consumes: everything prior.
- Produces:
  - `class Joypad { constructor(bus: Bus); press(b: Button): void; release(b: Button): void }` with `type Button = 'a'|'b'|'start'|'select'|'up'|'down'|'left'|'right'`. Hooks 0xFF00: select bits 4/5 choose d-pad vs buttons; pressed = 0. Press raises `bus.if_ |= 0x10`.
  - `class GameBoy { constructor(rom: Uint8Array); runFrame(): void; framebuffer: Uint8ClampedArray; joypad: Joypad }` — `runFrame()` loops `cpu.step()`, ticking ppu + timer, until ≥70224 cycles accumulate (carry the remainder to the next frame).

- [ ] **Step 1: Write failing tests**

```ts
// tests/gb.test.ts
import { describe, it, expect } from 'vitest'
import { GameBoy } from '../src/gb'

function rom() { const r = new Uint8Array(0x8000); r[0x147] = 0; r[0x100] = 0x18; r[0x101] = 0xFE; return r } // JR -2 spin

describe('gameboy', () => {
  it('runFrame advances one frame of LY', () => {
    const gb = new GameBoy(rom())
    gb.runFrame()
    expect(gb.framebuffer.length).toBe(160 * 144 * 4)
  })
  it('joypad reads select-dependent, active low', () => {
    const gb = new GameBoy(rom()) as any
    gb.bus.write(0xFF00, 0x20)          // select d-pad
    gb.joypad.press('down')
    expect(gb.bus.read(0xFF00) & 0x08).toBe(0)   // down = bit 3, pressed = 0
    gb.joypad.release('down')
    expect(gb.bus.read(0xFF00) & 0x08).toBe(0x08)
  })
})
```

- [ ] **Step 2: Run, verify fail**
- [ ] **Step 3: Implement `joypad.ts`, `gb.ts`, then `main.ts`:**

```ts
// src/main.ts
import { GameBoy } from './gb'

const canvas = document.getElementById('screen') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const errBox = document.getElementById('error')!
let gb: GameBoy | null = null

const KEYS: Record<string, import('./joypad').Button> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  KeyX: 'a', KeyZ: 'b', Enter: 'start', ShiftRight: 'select', ShiftLeft: 'select',
}
addEventListener('keydown', e => { const b = KEYS[e.code]; if (b && gb) { gb.joypad.press(b); e.preventDefault() } })
addEventListener('keyup', e => { const b = KEYS[e.code]; if (b && gb) gb.joypad.release(b) })

function start(buf: ArrayBuffer) {
  try { gb = new GameBoy(new Uint8Array(buf)); errBox.hidden = true } catch (e) { showError(e) }
}
function showError(e: unknown) { gb = null; errBox.textContent = String(e); errBox.hidden = false }

document.getElementById('rom')!.addEventListener('change', async e => {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f) start(await f.arrayBuffer())
})
addEventListener('dragover', e => e.preventDefault())
addEventListener('drop', async e => { e.preventDefault(); const f = e.dataTransfer?.files[0]; if (f) start(await f.arrayBuffer()) })

const frame = new ImageData(160, 144)
function loop() {
  if (gb) {
    try { gb.runFrame() } catch (e) { showError(e) }
    if (gb) { frame.data.set(gb.framebuffer); ctx.putImageData(frame, 0, 0) }
  }
  requestAnimationFrame(loop)
}
loop()
```

- [ ] **Step 4: Run tests, verify pass** — `npm test`
- [ ] **Step 5: Manual verification — the point of the whole project.** `npm run dev`, load a Tetris ROM (user supplies it — never commit it). Checklist: copyright/title screen renders → demo plays → Start begins a game → pieces respond to d-pad/rotate → score digits update. Screenshot for the README. If garbage renders, debug order: BGP palette, tile addressing mode (LCDC bit 4 signed/unsigned), SCY.
- [ ] **Step 6: Commit** — `git commit -am "feat: joypad, frame loop, browser shell"`

---

### Task 9: Polish and GitHub Pages deploy

**Files:**
- Modify: `style.css`, `index.html`
- Create: `.github/workflows/deploy.yml`, `README.md`

- [ ] **Step 1: Style the page** — dark background (#1a1a1a), centered column, DMG-green accent (#8bc34a family), canvas in a subtle rounded bezel, control legend under the canvas (arrows / X=A / Z=B / Enter=Start / Shift=Select). Keep it one CSS file, no framework.

- [ ] **Step 2: README** — what it is, live URL, screenshot, controls table, "blargg cpu_instrs: 11/11 pass", build/test instructions, v1 scope + deferred list from the spec.

- [ ] **Step 3: Deploy workflow**

```yaml
# .github/workflows/deploy.yml
name: deploy
on: { push: { branches: [main] } }
permissions: { contents: read, pages: write, id-token: write }
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci && npm test && npm run build
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: { name: github-pages }
    steps:
      - id: d
        uses: actions/deploy-pages@v4
```

- [ ] **Step 4: Verify** — `npm run build` succeeds locally; `npm test` green; check the diff for AI-looking artifacts per user's global rules.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: page styling, readme, pages deploy"`. Creating the GitHub repo + pushing happens only when Tomas says to.
