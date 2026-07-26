import { describe, it, expect } from 'vitest'
import { Cart } from '../src/cart'
import { Bus } from '../src/bus'
import { CPU, Z, N, HC, CY } from '../src/cpu'

export function cpuWith(...code: number[]) {
  const rom = new Uint8Array(0x8000)
  rom.set(code, 0x0100)
  return new CPU(new Bus(new Cart(rom)))
}

export function cpuWithPatches(main: number[], patches: { at: number, code: number[] }[]) {
  const rom = new Uint8Array(0x8000)
  rom.set(main, 0x0100)
  for (const p of patches) rom.set(p.code, p.at)
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
    expect(c.bus.read(0xC000)).toBe(0x99)
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

describe('cpu part 2', () => {
  it('PUSH/POP roundtrip', () => {
    const c = cpuWith(0xC5, 0xD1) // PUSH BC; POP DE
    c.b = 0x12; c.c = 0x34; c.step(); c.step()
    expect(c.d).toBe(0x12); expect(c.e).toBe(0x34); expect(c.sp).toBe(0xFFFE)
  })
  it('CALL pushes return address, RET pops it', () => {
    const c = cpuWithPatches([0xCD, 0x00, 0x02], [{ at: 0x0200, code: [0xC9] }]) // CALL 0x0200; ...; RET
    expect(c.step()).toBe(24)
    expect(c.pc).toBe(0x0200)
    expect(c.sp).toBe(0xFFFC)
    expect(c.step()).toBe(16)
    expect(c.pc).toBe(0x0103)
    expect(c.sp).toBe(0xFFFE)
  })
  it('conditional JP not taken costs 12', () => {
    const c = cpuWith(0xC2, 0x00, 0x02) // JP NZ — with Z set
    c.f = Z
    expect(c.step()).toBe(12)
    expect(c.pc).toBe(0x0103)
  })
  it('conditional JP taken costs 16', () => {
    const c = cpuWith(0xC2, 0x00, 0x02) // JP NZ — with Z clear
    c.f = 0
    expect(c.step()).toBe(16)
    expect(c.pc).toBe(0x0200)
  })
  it('conditional CALL/RET taken vs not-taken costs', () => {
    const c = cpuWith(0xC4, 0x00, 0x02) // CALL NZ — Z clear, taken
    c.f = 0
    expect(c.step()).toBe(24)
    const d = cpuWith(0xC0) // RET NZ — Z set, not taken
    d.f = Z
    expect(d.step()).toBe(8)
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
  it('CB RLC (HL) costs 16, BIT (HL) costs 12', () => {
    const c = cpuWith(0xCB, 0x06) // RLC (HL)
    c.h = 0xC0; c.l = 0x00; c.bus.write(0xC000, 0x80)
    expect(c.step()).toBe(16)
    expect(c.bus.read(0xC000)).toBe(0x01)
    expect(c.f & CY).toBeTruthy()

    const d = cpuWith(0xCB, 0x46) // BIT 0,(HL)
    d.h = 0xC0; d.l = 0x00; d.bus.write(0xC000, 0x00)
    expect(d.step()).toBe(12)
    expect(d.f & Z).toBeTruthy()
  })
  it('ADD SP,d8 flags from low byte', () => {
    const c = cpuWith(0xE8, 0x01)
    c.sp = 0xFFFF; c.step()
    expect(c.sp).toBe(0x0000)
    expect(c.f & CY).toBeTruthy(); expect(c.f & HC).toBeTruthy(); expect(c.f & Z).toBeFalsy()
  })
  it('LD HL,SP+d8 flags from low byte, SP unchanged', () => {
    const c = cpuWith(0xF8, 0x01)
    c.sp = 0xFFFF; c.step()
    expect(c.hl).toBe(0x0000)
    expect(c.sp).toBe(0xFFFF)
    expect(c.f & CY).toBeTruthy(); expect(c.f & HC).toBeTruthy()
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
  it('DI clears ime, EI sets pending flag not ime directly', () => {
    const c = cpuWith(0xFB, 0xF3) // EI; DI
    c.ime = false
    c.step()
    expect(c.imeNext).toBe(true)
    expect(c.ime).toBe(false)
    c.step()
    expect(c.ime).toBe(false)
  })
  it('RETI sets ime directly', () => {
    const c = cpuWith(0xD9)
    c.sp = 0xFFFC
    c.bus.write(0xFFFC, 0x00); c.bus.write(0xFFFD, 0x01)
    c.step()
    expect(c.ime).toBe(true)
    expect(c.pc).toBe(0x0100)
  })
})
