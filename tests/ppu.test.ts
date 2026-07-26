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
  it('renders line 0 after LCD off then on again', () => {
    const { bus, ppu } = setup()
    for (let i = 0; i < 16; i++) bus.vram[i] = 0xFF   // tile 0 = all color 3
    ppu.tick(100)
    bus.write(0xFF40, 0x00)  // LCD off
    bus.write(0xFF40, 0x91)  // LCD on again
    ppu.tick(456)             // render line 0
    const [r, g, b, a] = ppu.framebuffer.slice(0, 4)
    expect([r, g, b, a]).toEqual([8, 24, 32, 255])
  })
})
