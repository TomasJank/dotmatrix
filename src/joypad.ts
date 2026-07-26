import { Bus } from './bus'

export type Button = 'a' | 'b' | 'start' | 'select' | 'up' | 'down' | 'left' | 'right'

const DPAD_BITS: Record<string, number> = { right: 0x01, left: 0x02, up: 0x04, down: 0x08 }
const BUTTON_BITS: Record<string, number> = { a: 0x01, b: 0x02, select: 0x04, start: 0x08 }

export class Joypad {
  private select = 0x30
  private dpad = 0x0F
  private buttons = 0x0F

  constructor(private bus: Bus) {
    bus.ioHooks.set(0xFF00, {
      read: () => this.read(),
      write: (v) => { this.select = v & 0x30 },
    })
  }

  press(b: Button): void {
    this.set(b, 0)
    this.bus.if_ |= 0x10
  }

  release(b: Button): void {
    this.set(b, 1)
  }

  private set(b: Button, bit: number): void {
    const dpadBit = DPAD_BITS[b]
    if (dpadBit !== undefined) {
      this.dpad = bit ? (this.dpad | dpadBit) : (this.dpad & ~dpadBit)
      return
    }
    const buttonBit = BUTTON_BITS[b]
    this.buttons = bit ? (this.buttons | buttonBit) : (this.buttons & ~buttonBit)
  }

  private read(): number {
    let nibble = 0x0F
    if (!(this.select & 0x10)) nibble &= this.dpad
    if (!(this.select & 0x20)) nibble &= this.buttons
    return 0xC0 | this.select | nibble
  }
}
