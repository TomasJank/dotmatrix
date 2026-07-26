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
  it('rejects carts that need real bank switching', () => {
    const rom = new Uint8Array(0x10000); rom[0x147] = 0x01
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
