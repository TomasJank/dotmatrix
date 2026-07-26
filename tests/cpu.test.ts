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
