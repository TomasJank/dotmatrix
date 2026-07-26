import { Cart } from './cart'
import { Bus } from './bus'
import { CPU } from './cpu'
import { Timer } from './timer'
import { PPU } from './ppu'
import { Joypad } from './joypad'

const CYCLES_PER_FRAME = 70224

export class GameBoy {
  bus: Bus
  cpu: CPU
  timer: Timer
  ppu: PPU
  joypad: Joypad
  private carryCycles = 0

  constructor(rom: Uint8Array) {
    this.bus = new Bus(new Cart(rom))
    this.cpu = new CPU(this.bus)
    this.timer = new Timer(this.bus)
    this.ppu = new PPU(this.bus)
    this.joypad = new Joypad(this.bus)
  }

  get framebuffer(): Uint8ClampedArray {
    return this.ppu.framebuffer
  }

  runFrame(): void {
    let cycles = this.carryCycles
    while (cycles < CYCLES_PER_FRAME) {
      const c = this.cpu.step()
      this.ppu.tick(c)
      this.timer.tick(c)
      cycles += c
    }
    this.carryCycles = cycles - CYCLES_PER_FRAME
  }
}
