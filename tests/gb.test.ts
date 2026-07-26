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
